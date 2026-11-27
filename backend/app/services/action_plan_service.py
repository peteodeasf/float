"""Action plans: building them, carrying items over, and what each person may see.

docs/plans/action-plans-build.md
"""
import uuid
from datetime import date, datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.behavior_types import LADDER_TYPES
from app.models.action_plan import ActionPlan, ActionPlanItem, CHILD_KINDS
from app.models.tool import Tool, ToolExample
from app.models.experiment import AccommodationBehavior, Experiment
from app.models.treatment import AvoidanceBehavior, TreatmentPlan, TriggerSituation

# A set-up exposure the child hasn't done yet.
PENDING_EXPERIMENT = ("planned", "committed")


def _404(what: str) -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


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


def _parent_only(i: ActionPlanItem, tools: dict) -> bool:
    """A strategy for the parent alone, such as Polite ignoring. The child never sees it. Kept on
    the line when it is added, so it holds after the page is changed or deleted."""
    return i.kind == "tool" and i.parent_only


def _item_out(i: ActionPlanItem, rungs, accs, tools, examples, *, for_child: bool = False) -> dict:
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
    }
    if for_child:
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
        "reward_given": i.reward_given,
        "reward_given_by": i.reward_given_by,
        "outcome": i.outcome,
    })
    return out


def _plan_out(p: ActionPlan, items: list[dict]) -> dict:
    return {
        "id": str(p.id),
        "patient_id": str(p.patient_id),
        "session_number": p.session_number,
        "session_date": p.session_date.isoformat(),
        "confidence": p.confidence,
        "published_at": p.published_at.isoformat() if p.published_at else None,
        "items": items,
    }


async def plans_out(db: AsyncSession, plans: list[ActionPlan], *, audience: str = "clinician") -> list[dict]:
    """audience: clinician (everything), parent (every item, no carry-over marks needed but harmless),
    child (their own items and shared parent instructions, nothing about whether a reward was given)."""
    by_plan = await items_of(db, [p.id for p in plans])
    rungs, accs, tools, examples = await _names(db, [i for its in by_plan.values() for i in its])
    out = []
    for p in plans:
        its = by_plan[p.id]
        if audience == "child":
            its = [i for i in its if (i.kind in CHILD_KINDS and not _parent_only(i, tools))
                   or (i.kind == "parent_instruction" and i.share_with_child)]
        rendered = [_item_out(i, rungs, accs, tools, examples, for_child=audience == "child") for i in its]
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
                # A note on a parent instruction is for the parent.
                if i.kind == "parent_instruction":
                    r["note"] = None
        out.append(_plan_out(p, rendered))
    return out


async def require_latest(db: AsyncSession, plan: ActionPlan) -> None:
    """Only the newest plan can be changed. An older one is the record of what the family was asked
    to do that week, and the next plan carried items over from it."""
    newest = (await db.execute(
        select(func.max(ActionPlan.session_number)).where(ActionPlan.patient_id == plan.patient_id)
    )).scalar()
    if plan.session_number != newest:
        raise HTTPException(status_code=409, detail="Only the latest action plan can be changed")


async def list_for_patient(db: AsyncSession, patient_id: uuid.UUID, org_id: uuid.UUID) -> list[ActionPlan]:
    return list((await db.execute(
        select(ActionPlan)
        .where(ActionPlan.patient_id == patient_id, ActionPlan.organization_id == org_id)
        .order_by(ActionPlan.session_number.desc())
    )).scalars().all())


async def current_published(db: AsyncSession, patient_id: uuid.UUID) -> ActionPlan | None:
    return (await db.execute(
        select(ActionPlan)
        .where(ActionPlan.patient_id == patient_id, ActionPlan.published_at.is_not(None))
        .order_by(ActionPlan.session_number.desc())
        .limit(1)
    )).scalar_one_or_none()


async def create_plan(
    db: AsyncSession, patient_id: uuid.UUID, org_id: uuid.UUID, practitioner_id: uuid.UUID,
    keep_item_ids: list[uuid.UUID], session_date: date | None,
) -> ActionPlan:
    """A new draft. Items on the last plan listed in keep_item_ids are copied over and marked keep;
    the rest of the last plan's items are marked done."""
    plans = await list_for_patient(db, patient_id, org_id)
    if plans and plans[0].published_at is None:
        raise HTTPException(status_code=409, detail="There is already a draft action plan")
    last = plans[0] if plans else None

    plan = ActionPlan(
        patient_id=patient_id, organization_id=org_id, practitioner_id=practitioner_id,
        session_number=(max((p.session_number for p in plans), default=0) + 1),
        session_date=session_date or date.today(),
    )
    db.add(plan)
    await db.flush()

    keep = set(keep_item_ids)
    if last:
        last_items = (await items_of(db, [last.id]))[last.id]
        unknown = keep - {i.id for i in last_items}
        if unknown:
            raise HTTPException(status_code=422, detail="Only items on the last plan can be kept")
        for pos, i in enumerate(last_items):
            i.outcome = "keep" if i.id in keep else "done"
            if i.id in keep:
                db.add(ActionPlanItem(
                    action_plan_id=plan.id, kind=i.kind, position=pos,
                    avoidance_behavior_id=i.avoidance_behavior_id,
                    accommodation_behavior_id=i.accommodation_behavior_id,
                    tool_id=i.tool_id, tool_example_id=i.tool_example_id, parent_only=i.parent_only, text=i.text, reward_for=i.reward_for, note=i.note,
                    share_with_child=i.share_with_child,
                ))
    elif keep:
        raise HTTPException(status_code=422, detail="Only items on the last plan can be kept")
    try:
        await db.commit()
    except IntegrityError:
        # Two requests at once: the other one made this session's plan.
        await db.rollback()
        raise HTTPException(status_code=409, detail="There is already a draft action plan")
    await db.refresh(plan)
    return plan


async def _check_links(db: AsyncSession, plan: ActionPlan, kind: str, data: dict) -> None:
    """A link must point at this child's own rung or accommodation, or an active tool."""
    tp_ids = select(TreatmentPlan.id).where(TreatmentPlan.patient_id == plan.patient_id)
    if kind == "exposure":
        rid = data.get("avoidance_behavior_id")
        if not rid:
            raise HTTPException(status_code=422, detail="Pick a step from the ladder")
        # A step on the ladder (not a safety behaviour), on this child's plan directly or through
        # its situation.
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
        # Peter, 2026-11-27: an exposure goes on the plan only once it is set up (the same setup
        # questions as the Plan tab) with the child's confidence High.
        ready = (await db.execute(
            select(Experiment.id).where(
                Experiment.patient_id == plan.patient_id,
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
            # Written in by the clinician, with no Library page (Peter, 2026-11-27).
            if data.get("tool_example_id"):
                raise HTTPException(status_code=422, detail="An example needs its page")
            if not (data.get("text") or "").strip():
                raise HTTPException(status_code=422, detail="Pick one from the list or write one")
            return
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
    else:
        raise HTTPException(status_code=422, detail="Unknown kind")


async def _tool_is_parent_only(db: AsyncSession, data: dict) -> bool:
    tid = data.get("tool_id")
    if not tid:
        return bool(data.get("parent_only"))  # written in under the parent's section
    tool = await db.get(Tool, tid)
    return tool is not None and tool.audience == "parent"


async def add_item(db: AsyncSession, plan: ActionPlan, kind: str, data: dict) -> ActionPlanItem:
    await _check_links(db, plan, kind, data)
    position = (await db.execute(
        select(func.coalesce(func.max(ActionPlanItem.position), -1))
        .where(ActionPlanItem.action_plan_id == plan.id)
    )).scalar() + 1

    def clean(v):
        v = (v or "").strip()
        return v or None

    item = ActionPlanItem(
        action_plan_id=plan.id, kind=kind, position=position,
        avoidance_behavior_id=data.get("avoidance_behavior_id") if kind == "exposure" else None,
        accommodation_behavior_id=data.get("accommodation_behavior_id") if kind == "accommodation" else None,
        tool_id=data.get("tool_id") if kind == "tool" else None,
        tool_example_id=data.get("tool_example_id") if kind == "tool" else None,
        parent_only=await _tool_is_parent_only(db, data) if kind == "tool" else False,
        text=clean(data.get("text")) if kind in ("exposure", "tool", "parent_instruction", "reward") else None,
        reward_for=clean(data.get("reward_for")) if kind == "reward" else None,
        note=clean(data.get("note")),
        share_with_child=bool(data.get("share_with_child")) if kind == "parent_instruction" else False,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


def update_item(item: ActionPlanItem, data: dict) -> None:
    def clean(v):
        v = (v or "").strip()
        return v or None

    if "text" in data and item.kind in ("exposure", "tool", "parent_instruction", "reward"):
        t = clean(data["text"])
        if t is None and (item.kind in ("parent_instruction", "reward") or (item.kind == "tool" and item.tool_id is None)):
            raise HTTPException(status_code=422, detail="Write what it is")
        item.text = t
        if item.kind == "tool" and t:
            item.tool_example_id = None  # written in now, not the picked example
    if "reward_for" in data and item.kind == "reward":
        item.reward_for = clean(data["reward_for"])
    if "note" in data:
        item.note = clean(data["note"])
    if "share_with_child" in data and item.kind == "parent_instruction":
        item.share_with_child = bool(data["share_with_child"])
    if "position" in data and data["position"] is not None:
        item.position = int(data["position"])


def mark_reward(item: ActionPlanItem, given: bool, by: str) -> None:
    if item.kind != "reward":
        raise HTTPException(status_code=422, detail="Only a reward can be marked given")
    item.reward_given = given
    item.reward_given_by = by
    item.reward_answered_at = datetime.now(timezone.utc)


def publish(plan: ActionPlan, item_count: int) -> None:
    """Confidence is checked per exposure when it is added, not for the whole plan
    (Peter, 2026-11-27)."""
    if item_count == 0:
        raise HTTPException(status_code=422, detail="The plan has nothing on it")
    if plan.published_at is None:
        plan.published_at = datetime.now(timezone.utc)
