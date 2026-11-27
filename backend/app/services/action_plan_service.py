"""Action plans: saving them, checking in on them, and what each person may see.

A plan runs from its start date to its end date. It is saved whole (the edit view's Save) and the
family sees it as soon as it is saved. Each line can be ticked, by the clinician or, for tools,
strategies and rewards, by the child or parent in their app; an exposure counts as done once the
child (or the clinician) has recorded it. Check-in notes are the clinician's alone.
Peter, 2026-11-27. docs/plans/action-plans-build.md
"""
import uuid
from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import select, func, or_, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.behavior_types import LADDER_TYPES
from app.models.action_plan import ActionPlan, ActionPlanItem, CHILD_KINDS, ITEM_KINDS
from app.models.tool import Tool, ToolExample
from app.models.experiment import AccommodationBehavior, Experiment
from app.models.treatment import AvoidanceBehavior, TreatmentPlan, TriggerSituation

# A set-up exposure the child hasn't done yet.
PENDING_EXPERIMENT = ("planned", "committed")
# What the child and parent may tick in their apps.
FAMILY_TICKS = ("tool", "reward")
DEFAULT_LENGTH = timedelta(days=7)


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


def state_of(p: ActionPlan, today: date | None = None) -> str:
    today = today or date.today()
    if p.ends_on < today:
        return "closed"
    if p.session_date > today:
        return "upcoming"
    return "current"


async def items_of(db: AsyncSession, plan_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[ActionPlanItem]]:
    out: dict[uuid.UUID, list[ActionPlanItem]] = {pid: [] for pid in plan_ids}
    if not plan_ids:
        return out
    rows = (await db.execute(
        select(ActionPlanItem)
        .where(ActionPlanItem.action_plan_id.in_(plan_ids))
        .order_by(ActionPlanItem.position, ActionPlanItem.created_at)
    )).scalars().all()
    for r in rows:
        out[r.action_plan_id].append(r)
    return out


async def _names(db: AsyncSession, items: list[ActionPlanItem]) -> tuple[dict, dict, dict, dict]:
    rung_ids = {i.avoidance_behavior_id for i in items if i.avoidance_behavior_id}
    acc_ids = {i.accommodation_behavior_id for i in items if i.accommodation_behavior_id}
    tool_ids = {i.tool_id for i in items if i.tool_id}
    rungs = {r.id: r for r in (await db.execute(
        select(AvoidanceBehavior).where(AvoidanceBehavior.id.in_(rung_ids)))).scalars()} if rung_ids else {}
    accs = {a.id: a for a in (await db.execute(
        select(AccommodationBehavior).where(AccommodationBehavior.id.in_(acc_ids)))).scalars()} if acc_ids else {}
    tools = {t.id: t for t in (await db.execute(
        select(Tool).where(Tool.id.in_(tool_ids)))).scalars()} if tool_ids else {}
    ex_ids = {i.tool_example_id for i in items if i.tool_example_id}
    examples = {e.id: e for e in (await db.execute(
        select(ToolExample).where(ToolExample.id.in_(ex_ids)))).scalars()} if ex_ids else {}
    return rungs, accs, tools, examples


async def _recordings(db: AsyncSession, plans: list[ActionPlan]) -> dict[tuple[uuid.UUID, uuid.UUID], list[Experiment]]:
    """Exposures recorded during each plan, keyed by (plan id, rung id)."""
    out: dict[tuple[uuid.UUID, uuid.UUID], list[Experiment]] = {}
    if not plans:
        return out
    start = min(p.session_date for p in plans)
    end = max(p.ends_on for p in plans)
    rows = (await db.execute(
        select(Experiment).where(
            Experiment.patient_id.in_({p.patient_id for p in plans}),
            Experiment.status == "completed",
            Experiment.avoidance_behavior_id.is_not(None),
            Experiment.completed_date >= datetime.combine(start, time.min, tzinfo=timezone.utc),
            Experiment.completed_date < datetime.combine(end + timedelta(days=1), time.min, tzinfo=timezone.utc),
        ).order_by(Experiment.completed_date)
    )).scalars().all()
    for p in plans:
        lo = datetime.combine(p.session_date, time.min, tzinfo=timezone.utc)
        hi = datetime.combine(p.ends_on + timedelta(days=1), time.min, tzinfo=timezone.utc)
        for e in rows:
            if e.patient_id == p.patient_id and lo <= e.completed_date < hi:
                out.setdefault((p.id, e.avoidance_behavior_id), []).append(e)
    return out


def _recording_out(e: Experiment) -> dict:
    return {
        "id": str(e.id),
        "completed_date": e.completed_date.isoformat() if e.completed_date else None,
        "recorded_by": e.recorded_by,
        "fear_expected": float(e.distress_thermometer_expected) if e.distress_thermometer_expected is not None else None,
        "fear_felt": float(e.distress_thermometer_actual) if e.distress_thermometer_actual is not None else None,
        "belief_before": float(e.bip_before) if e.bip_before is not None else None,
        "belief_after": float(e.bip_after) if e.bip_after is not None else None,
        "feared_outcome_occurred": e.feared_outcome_occurred,
    }


def _item_out(i: ActionPlanItem, rungs, accs, tools, examples, recordings, *, audience: str) -> dict:
    """The line as shown. `label` is what to print; the links stay for the clinician's app."""
    rung = rungs.get(i.avoidance_behavior_id)
    tool = tools.get(i.tool_id)
    acc = accs.get(i.accommodation_behavior_id)
    example = examples.get(i.tool_example_id)
    if i.kind == "exposure":
        label = i.text or (rung.name if rung else "")
    elif i.kind == "tool":
        # An example written for this plan, else the one picked, else the page itself.
        label = i.text or (example.name if example else "") or (tool.name if tool else "")
    elif i.kind == "accommodation":
        label = acc.name if acc else ""
    else:
        label = i.text or ""
    recs = recordings if i.kind == "exposure" else []
    out = {
        "id": str(i.id),
        "kind": i.kind,
        "label": label,
        "note": i.note,
        "reward_for": i.reward_for,
        "tool_id": str(i.tool_id) if i.tool_id else None,
        # The page it comes from, when the line is one of its examples ("Mottos").
        "tool_name": tool.name if tool and label != tool.name else None,
        "tool_summary": tool.summary if tool else None,
        "example_how_used": example.how_used if example and not i.text else None,
        # Done: ticked, or for an exposure, recorded at least once during the plan.
        "done": bool(recs) if i.kind == "exposure" else i.done_at is not None,
        "done_by": i.done_by if i.kind != "exposure" else None,
        "done_at": i.done_at.isoformat() if i.done_at and i.kind != "exposure" else None,
    }
    if audience == "child":
        return out
    out.update({
        "position": i.position,
        "text": i.text,
        "avoidance_behavior_id": str(i.avoidance_behavior_id) if i.avoidance_behavior_id else None,
        "rung_name": rung.name if rung else None,
        "fear_level": float(rung.distress_thermometer_when_refraining)
        if rung and rung.distress_thermometer_when_refraining is not None else None,
        "accommodation_behavior_id": str(i.accommodation_behavior_id) if i.accommodation_behavior_id else None,
        "tool_example_id": str(i.tool_example_id) if i.tool_example_id else None,
        "parent_only": i.parent_only,
        "share_with_child": i.share_with_child,
    })
    if audience == "clinician":
        out["check_note"] = i.check_note
        out["recordings"] = [_recording_out(e) for e in recs]
    return out


def _plan_out(p: ActionPlan, items: list[dict]) -> dict:
    return {
        "id": str(p.id),
        "patient_id": str(p.patient_id),
        "session_number": p.session_number,
        "starts_on": p.session_date.isoformat(),
        "ends_on": p.ends_on.isoformat(),
        "state": state_of(p),
        "done_count": sum(1 for i in items if i["done"]),
        "items": items,
    }


async def plans_out(db: AsyncSession, plans: list[ActionPlan], *, audience: str = "clinician") -> list[dict]:
    """audience: clinician (everything, check-in notes and recordings included), parent (every line,
    no check-in notes), child (their own lines and shared parent instructions)."""
    by_plan = await items_of(db, [p.id for p in plans])
    rungs, accs, tools, examples = await _names(db, [i for its in by_plan.values() for i in its])
    recordings = await _recordings(db, plans)
    out = []
    for p in plans:
        its = by_plan[p.id]
        if audience == "child":
            its = [i for i in its if (i.kind in CHILD_KINDS and not (i.kind == "tool" and i.parent_only))
                   or (i.kind == "parent_instruction" and i.share_with_child)]
        rendered = [
            _item_out(i, rungs, accs, tools, examples, recordings.get((p.id, i.avoidance_behavior_id), []), audience=audience)
            for i in its
        ]
        if audience == "clinician":
            for r in rendered:
                if not r["label"]:
                    r["label"] = "(removed)"
        else:
            # The rung, accommodation or tool behind it was deleted: nothing to show the family.
            keep = [bool(r["label"]) for r in rendered]
            its = [i for i, k in zip(its, keep) if k]
            rendered = [r for r, k in zip(rendered, keep) if k]
        if audience == "child":
            for r, i in zip(rendered, its):
                if i.kind == "parent_instruction":
                    r["note"] = None  # a note on a parent instruction is for the parent
        out.append(_plan_out(p, rendered))
    return out


async def list_for_patient(db: AsyncSession, patient_id: uuid.UUID, org_id: uuid.UUID) -> list[ActionPlan]:
    return list((await db.execute(
        select(ActionPlan)
        .where(ActionPlan.patient_id == patient_id, ActionPlan.organization_id == org_id)
        .order_by(ActionPlan.session_date.desc(), ActionPlan.session_number.desc())
    )).scalars().all())


async def current_for_family(db: AsyncSession, patient_id: uuid.UUID) -> ActionPlan | None:
    """The plan running today, else the most recent one that has started."""
    today = date.today()
    return (await db.execute(
        select(ActionPlan)
        .where(ActionPlan.patient_id == patient_id, ActionPlan.session_date <= today,
               ActionPlan.published_at.is_not(None))
        .order_by(ActionPlan.session_date.desc(), ActionPlan.session_number.desc())
        .limit(1)
    )).scalar_one_or_none()


# ── Saving a plan whole ──────────────────────────────────────────────────────

async def _check_item(db: AsyncSession, patient_id: uuid.UUID, kind: str, data: dict, *, new: bool) -> None:
    """A link must point at this child's own rung or accommodation, or a published page."""
    tp_ids = select(TreatmentPlan.id).where(TreatmentPlan.patient_id == patient_id)
    if kind not in ITEM_KINDS:
        raise HTTPException(status_code=422, detail="Unknown kind")
    if kind == "exposure":
        rid = data.get("avoidance_behavior_id")
        if not rid and not new:
            return  # its step was deleted since; the line stays as it was
        if not rid:
            raise HTTPException(status_code=422, detail="Pick a step from the ladder")
        ok = (await db.execute(
            select(AvoidanceBehavior.id)
            .outerjoin(TriggerSituation, TriggerSituation.id == AvoidanceBehavior.trigger_situation_id)
            .where(AvoidanceBehavior.id == rid, AvoidanceBehavior.behavior_type.in_(LADDER_TYPES), or_(
                AvoidanceBehavior.treatment_plan_id.in_(tp_ids),
                TriggerSituation.treatment_plan_id.in_(tp_ids),
            ))
        )).scalar_one_or_none()
        if ok is None:
            raise _404("Step")
        # An exposure goes on the plan only once it is set up with the child's confidence High
        # (Peter, 2026-11-27). Checked when it is added; a line already on the plan keeps its place
        # after the child has done it.
        if new:
            ready = (await db.execute(
                select(Experiment.id).where(
                    Experiment.patient_id == patient_id,
                    Experiment.avoidance_behavior_id == rid,
                    Experiment.status.in_(PENDING_EXPERIMENT),
                    Experiment.confidence_level == "high",
                ).limit(1)
            )).scalar_one_or_none()
            if ready is None:
                raise HTTPException(status_code=422, detail="Set it up with High confidence first")
    elif kind == "accommodation":
        aid = data.get("accommodation_behavior_id")
        if not aid:
            raise HTTPException(status_code=422, detail="Pick an accommodation")
        ok = (await db.execute(
            select(AccommodationBehavior.id).where(
                AccommodationBehavior.id == aid, AccommodationBehavior.treatment_plan_id.in_(tp_ids))
        )).scalar_one_or_none()
        if ok is None:
            raise _404("Accommodation")
    elif kind == "tool":
        tid = data.get("tool_id")
        if not tid:
            if data.get("tool_example_id"):
                raise HTTPException(status_code=422, detail="An example needs its page")
            if not (data.get("text") or "").strip():
                raise HTTPException(status_code=422, detail="Pick one from the list or write one")
            return
        if new:
            ok = (await db.execute(
                select(Tool.id).where(Tool.id == tid, Tool.is_published.is_(True)))).scalar_one_or_none()
            if ok is None:
                raise _404("Tool")
        eid = data.get("tool_example_id")
        if eid:
            if (data.get("text") or "").strip():
                raise HTTPException(status_code=422, detail="Pick an example or write one, not both")
            own = (await db.execute(
                select(ToolExample.id).where(ToolExample.id == eid, ToolExample.tool_id == tid))).scalar_one_or_none()
            if own is None:
                raise _404("Example")
    elif kind in ("parent_instruction", "reward"):
        if not (data.get("text") or "").strip():
            raise HTTPException(status_code=422, detail="Write what it is")


def _clean(v) -> str | None:
    v = (v or "").strip() if isinstance(v, str) else v
    return v or None


async def _apply_items(db: AsyncSession, plan: ActionPlan, items: list[dict]) -> None:
    """The plan's lines become exactly `items`. A line sent with its id keeps its ticks and
    check-in note; the rest of the old lines go."""
    current = {i.id: i for i in (await items_of(db, [plan.id]))[plan.id]}
    keep: set[uuid.UUID] = set()
    for pos, data in enumerate(items):
        kind = data.get("kind")
        iid = uuid.UUID(str(data["id"])) if data.get("id") else None
        row = current.get(iid) if iid else None
        if iid and row is None:
            raise _404("Line")
        if row is not None and row.kind != kind:
            raise HTTPException(status_code=422, detail="A line cannot change kind")
        same_link = row is not None and str(row.avoidance_behavior_id or "") == str(data.get("avoidance_behavior_id") or "") \
            and str(row.tool_id or "") == str(data.get("tool_id") or "")
        await _check_item(db, plan.patient_id, kind, data, new=not same_link)
        if row is None:
            row = ActionPlanItem(action_plan_id=plan.id, kind=kind)
            db.add(row)
        else:
            keep.add(row.id)
        row.position = pos
        row.avoidance_behavior_id = data.get("avoidance_behavior_id") if kind == "exposure" else None
        row.accommodation_behavior_id = data.get("accommodation_behavior_id") if kind == "accommodation" else None
        row.tool_id = data.get("tool_id") if kind == "tool" else None
        row.tool_example_id = data.get("tool_example_id") if kind == "tool" and not _clean(data.get("text")) else None
        row.parent_only = await _tool_is_parent_only(db, data) if kind == "tool" else False
        row.text = _clean(data.get("text")) if kind in ("exposure", "tool", "parent_instruction", "reward") else None
        row.reward_for = _clean(data.get("reward_for")) if kind == "reward" else None
        row.note = _clean(data.get("note"))
        row.share_with_child = bool(data.get("share_with_child")) if kind == "parent_instruction" else False
    gone = [i for i in current if i not in keep]
    if gone:
        await db.execute(delete(ActionPlanItem).where(ActionPlanItem.id.in_(gone)))


async def _tool_is_parent_only(db: AsyncSession, data: dict) -> bool:
    tid = data.get("tool_id")
    if not tid:
        return bool(data.get("parent_only"))  # written in under the parent's section
    tool = await db.get(Tool, tid)
    return tool is not None and tool.audience == "parent"


def _dates(starts_on: date | None, ends_on: date | None) -> tuple[date, date]:
    start = starts_on or date.today()
    end = ends_on or start + DEFAULT_LENGTH
    if end < start:
        raise HTTPException(status_code=422, detail="The plan has to end after it starts")
    return start, end


async def create_plan(db: AsyncSession, patient_id: uuid.UUID, org_id: uuid.UUID, practitioner_id: uuid.UUID,
                      starts_on: date | None, ends_on: date | None, items: list[dict]) -> ActionPlan:
    """A new plan, shared on save. A plan still running when this one starts ends that same day, so
    what is recorded at the session that ends it still counts for it."""
    if not items:
        raise HTTPException(status_code=422, detail="The plan has nothing on it")
    start, end = _dates(starts_on, ends_on)
    number = (await db.execute(
        select(func.coalesce(func.max(ActionPlan.session_number), 0)).where(ActionPlan.patient_id == patient_id)
    )).scalar() + 1
    for older in (await db.execute(select(ActionPlan).where(
            ActionPlan.patient_id == patient_id, ActionPlan.ends_on > start, ActionPlan.session_date <= start))).scalars():
        older.ends_on = start
    plan = ActionPlan(patient_id=patient_id, organization_id=org_id, practitioner_id=practitioner_id,
                      session_number=number, session_date=start, ends_on=end,
                      published_at=datetime.now(timezone.utc))
    db.add(plan)
    await db.flush()
    await _apply_items(db, plan, items)
    await db.commit()
    await db.refresh(plan)
    return plan


async def save_plan(db: AsyncSession, plan: ActionPlan, starts_on: date | None, ends_on: date | None,
                    items: list[dict]) -> ActionPlan:
    if state_of(plan) == "closed":
        raise HTTPException(status_code=409, detail="A closed plan can't be changed")
    if not items:
        raise HTTPException(status_code=422, detail="The plan has nothing on it")
    plan.session_date, plan.ends_on = _dates(starts_on or plan.session_date, ends_on or plan.ends_on)
    await _apply_items(db, plan, items)
    await db.commit()
    await db.refresh(plan)
    return plan


# ── Checking in ──────────────────────────────────────────────────────────────

def tick(item: ActionPlanItem, done: bool, by: str) -> None:
    """by: clinician, child or parent. An exposure is done by recording it, not by a tick."""
    if item.kind == "exposure":
        raise HTTPException(status_code=422, detail="Record the exposure instead")
    item.done_at = datetime.now(timezone.utc) if done else None
    item.done_by = by if done else None
