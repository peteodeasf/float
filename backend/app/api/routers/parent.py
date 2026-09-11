"""Parent-facing read/write endpoints.

All routes are gated by `get_parent_context` (the logged-in parent → their linked
child). MVP is single-child, so every endpoint targets the first linked child.
The parent's job is child-support-forward: see the child's upcoming exposures,
work the assigned accommodation, check in on it weekly, get situational tips, and chat with
the clinician.
"""
import uuid
from datetime import date, datetime, timezone, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select, or_, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.patient import PatientProfile, PractitionerProfile
from app.models.treatment import TreatmentPlan, TriggerSituation, AvoidanceBehavior
from app.models.experiment import Experiment, AccommodationBehavior, AccommodationCheckin
from app.models.message import Message
from app.models.jit_content import JitTip, JitTipTag, TriggerSituationTag
from app.api.routers.patients import get_parent_context, step_status
from app.services.accommodation_conversation import answer, conversation, name_one, suggestion_out
from app.services.parent_experiment_service import list_for_plan, record, set_up
from app.schemas.parent_experiment import ParentExperimentAfter, ParentExperimentCreate
from app.core.behavior_types import LADDER_TYPES
from app.services.accommodation_service import get_accommodations_for_plan
from app.schemas.accommodation import ParentAccommodationResponse, SuggestionCreate, SuggestionUpdate

parent_router = APIRouter(prefix="/parent", tags=["parent"])


def _first_child(children: list[PatientProfile]) -> PatientProfile:
    # MVP is single-child; the parent app targets the first linked child.
    return children[0]


async def _child_plan(db: AsyncSession, child: PatientProfile) -> TreatmentPlan | None:
    return (await db.execute(
        select(TreatmentPlan).where(
            TreatmentPlan.patient_id == child.id,
            TreatmentPlan.status.in_(["setup", "active"]),
        )
    )).scalar_one_or_none()


def _message_out(m: Message) -> dict:
    return {
        "id": str(m.id),
        "content": m.content,
        "message_type": m.message_type,
        "sender_user_id": str(m.sender_user_id),
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "read_at": m.read_at.isoformat() if m.read_at else None,
    }


def _progress_shared(child: PatientProfile) -> bool:
    """The clinician's switch, set once the child has agreed. Off, nothing about the child's
    exposures reaches the parent. docs/plans/parent-sees-child-progress.md"""
    return child.progress_shared_with_parent_at is not None


# ── Child's plan (read-only context for the parent) ──────────────────────────

@parent_router.get("/child/experiments/upcoming")
async def upcoming_child_experiments(
    context: tuple = Depends(get_parent_context),
    db: AsyncSession = Depends(get_db),
):
    """The child's committed exposures with a scheduled moment in the next 7 days
    (what + when). Read-only — the parent has a role in every one of them."""
    _, children = context
    child = _first_child(children)
    # This is "what's planned", so it waits for the same switch as the rest. Until 2026-09-10 it
    # was shown to every parent without anyone agreeing to it.
    if not _progress_shared(child):
        return []
    # And the same limits as the progress view: only while the child's ladder is on, and only
    # exposures on a step, since one with no step has nothing safe to name it by.
    plan = await _child_plan(db, child)
    if not plan or not plan.ladder_active:
        return []
    horizon = datetime.now(timezone.utc) + timedelta(days=7)

    rows = (await db.execute(
        select(Experiment, AvoidanceBehavior, TriggerSituation)
        .outerjoin(AvoidanceBehavior, AvoidanceBehavior.id == Experiment.avoidance_behavior_id)
        .outerjoin(TriggerSituation, TriggerSituation.id == AvoidanceBehavior.trigger_situation_id)
        .where(
            Experiment.patient_id == child.id,
            Experiment.avoidance_behavior_id.is_not(None),
            Experiment.status == "committed",
            Experiment.scheduled_date.is_not(None),
            Experiment.scheduled_date <= horizon,
        )
        .order_by(Experiment.scheduled_date.asc())
    )).all()

    return [
        {
            "id": str(exp.id),
            "situation_id": str(sit.id) if sit else None,
            "situation_name": sit.name if sit else None,
            # The step's name, never plan_description: the child's older setup wrote their fear
            # into that field as well as into the prediction.
            "behavior_name": beh.name if beh else None,
            "scheduled_date": exp.scheduled_date.isoformat() if exp.scheduled_date else None,
            "scheduled_time_bucket": exp.scheduled_time_bucket,
            "status": exp.status,
        }
        for exp, beh, sit in rows
    ]


@parent_router.get("/child/progress")
async def child_progress(
    context: tuple = Depends(get_parent_context),
    db: AsyncSession = Depends(get_db),
):
    """The child's ladder, what's planned and what they've done, once the clinician has switched
    it on.

    What a parent needs to support the child, and no more (Peter, 2026-09-10). Built field by field
    on purpose. The child's own words (what they feared, what happened, what they learned, and the
    older plan_description, which could hold the fear) and their ratings of each exposure are never
    put into this reply, so they cannot leak out of it.
    """
    _, children = context
    child = _first_child(children)
    if not _progress_shared(child):
        return {"shared": False}
    empty = {"shared": True, "steps": [], "planned": [], "done": []}
    plan = await _child_plan(db, child)
    # The parent sees what the child sees: a ladder not switched on for the child is not shown here.
    if not plan or not plan.ladder_active:
        return empty

    steps = (await db.execute(
        select(AvoidanceBehavior, TriggerSituation)
        .outerjoin(TriggerSituation, TriggerSituation.id == AvoidanceBehavior.trigger_situation_id)
        .where(
            AvoidanceBehavior.behavior_type.in_(LADDER_TYPES),
            or_(
                and_(AvoidanceBehavior.trigger_situation_id.is_(None),
                     AvoidanceBehavior.treatment_plan_id == plan.id),
                and_(TriggerSituation.treatment_plan_id == plan.id,
                     TriggerSituation.is_placeholder.is_(False)),
            ),
        )
    )).all()
    names = {b.id: b.name for b, _ in steps}

    # Only exposures on a step of this ladder. One with no step has nothing to name it by except
    # plan_description, which is not safe to show.
    exps = [e for e in (await db.execute(
        select(Experiment).where(Experiment.patient_id == child.id).order_by(Experiment.created_at)
    )).scalars().all() if e.avoidance_behavior_id in names]

    def completed_on(step_id):
        return [e for e in exps if e.avoidance_behavior_id == step_id and e.status == "completed"]

    def fear_level(b):
        v = b.distress_thermometer_when_refraining
        return float(v) if v is not None else None

    ladder = [{
        "id": str(b.id),
        "name": b.name,
        "fear_level": fear_level(b),
        "situation_name": sit.name if sit else None,
        "status": step_status(completed_on(b.id)),
        "times_done": len(completed_on(b.id)),
    } for b, sit in steps]
    # Easiest first, unscored at the end — the order the child sees.
    ladder.sort(key=lambda s: (s["fear_level"] is None, s["fear_level"] or 0))

    planned = [{
        "id": str(e.id),
        "step_name": names[e.avoidance_behavior_id],
        "scheduled_date": e.scheduled_date.isoformat() if e.scheduled_date else None,
        "scheduled_time_bucket": e.scheduled_time_bucket,
        "status": e.status,
    } for e in exps if e.status in ("planned", "committed")]
    planned.sort(key=lambda p: (p["scheduled_date"] is None, p["scheduled_date"] or ""))

    done = []
    for e in exps:
        if e.status not in ("completed", "too_hard"):
            continue
        when = e.completed_date or e.updated_at
        done.append({
            "id": str(e.id),
            "step_name": names[e.avoidance_behavior_id],
            "done_on": when.isoformat() if when else None,
            "outcome": "did_it" if e.status == "completed" else "too_hard",
        })
    done.sort(key=lambda d: d["done_on"] or "", reverse=True)

    return {"shared": True, "steps": ladder, "planned": planned, "done": done}


# ── The parent's accommodations (the child's ladder, read-only for parent) ────

@parent_router.get("/accommodations", response_model=list[ParentAccommodationResponse])
async def parent_accommodations(
    context: tuple = Depends(get_parent_context),
    db: AsyncSession = Depends(get_db),
):
    """The child's accommodation ladder, ordered by display_order, each carrying
    `is_weekly_focus`. The parent sees the focus accommodations (there can be more than one) and the
    others for awareness."""
    _, children = context
    child = _first_child(children)
    plan = await _child_plan(db, child)
    if not plan:
        return []
    rows = await get_accommodations_for_plan(db, plan.id, child.organization_id)
    # The child's own rating only when the clinician has chosen to show it (Peter, 2026-09-10), and
    # only once the child has given it — until then the number is the clinician's guess.
    show = child.accommodation_ratings_shared_at is not None
    out = []
    for a in rows:
        r = ParentAccommodationResponse.model_validate(a)
        if show and a.child_rated_at is not None:
            r.child_rating_min = float(a.distress_min) if a.distress_min is not None else None
            r.child_rating_max = float(a.distress_max) if a.distress_max is not None else None
        out.append(r)
    return out


# ── Situational tips (parent audience) ───────────────────────────────────────

@parent_router.get("/situations/{situation_id}/tips")
async def parent_situation_tips(
    situation_id: uuid.UUID,
    context: tuple = Depends(get_parent_context),
    db: AsyncSession = Depends(get_db),
):
    """Parent-audience JIT tips for a situation: every always_show parent tip, plus
    any parent tip whose tags overlap the situation's tags."""
    _, _children = context  # auth gate; tips aren't child-specific data

    situation_tag_ids = set((await db.execute(
        select(TriggerSituationTag.tag_id).where(
            TriggerSituationTag.trigger_situation_id == situation_id
        )
    )).scalars().all())

    tips = (await db.execute(
        select(JitTip)
        .where(JitTip.is_active.is_(True), JitTip.audience == "parent")
        .order_by(JitTip.display_order, JitTip.created_at)
    )).scalars().all()

    out = []
    for tip in tips:
        if tip.always_show:
            out.append({"id": str(tip.id), "title": tip.title, "body": tip.body})
            continue
        if not situation_tag_ids:
            continue
        tip_tag_ids = set((await db.execute(
            select(JitTipTag.tag_id).where(JitTipTag.jit_tip_id == tip.id)
        )).scalars().all())
        if tip_tag_ids & situation_tag_ids:
            out.append({"id": str(tip.id), "title": tip.title, "body": tip.body})
    return out


# ── The weekly check-in ──────────────────────────────────────────────────────
# Once a week the parent answers one question about their focus accommodation. It replaced logging
# each moment (Peter, 2026-09-10): per-moment logging is what parents stop keeping up, and the weekly
# answer is what the clinician decides moving on from. docs/plans/weekly-checkin.md

class CheckinCreate(BaseModel):
    accommodation_id: uuid.UUID
    answer: Literal["every_time", "mostly", "gave_in"]
    # The Monday of the week, in the parent's own time. The app works it out, since the server does
    # not know their timezone.
    week_start: date


def _checkin_out(c: AccommodationCheckin, name: str | None) -> dict:
    return {
        "id": str(c.id),
        "accommodation_id": str(c.accommodation_id),
        "accommodation_name": name,
        "week_start": c.week_start.isoformat(),
        "answer": c.answer,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }


@parent_router.post("/checkins")
async def save_checkin(
    data: CheckinCreate,
    context: tuple = Depends(get_parent_context),
    db: AsyncSession = Depends(get_db),
):
    """This week's answer, or a change to it. One per parent, accommodation and week."""
    current_user, children = context
    child = _first_child(children)
    plan = await _child_plan(db, child)
    if not plan:
        raise HTTPException(status_code=400, detail="No active plan for this child")
    # Only an accommodation on this family's own plan.
    acc = (await db.execute(
        select(AccommodationBehavior).where(
            AccommodationBehavior.id == data.accommodation_id,
            AccommodationBehavior.treatment_plan_id == plan.id,
        )
    )).scalar_one_or_none()
    if not acc:
        raise HTTPException(status_code=404, detail="Accommodation not found")

    # This week's Monday or last week's, allowing a day either way for the parent's timezone. Last
    # week's so that a parent answering on Monday morning about the week before is not refused.
    today = datetime.now(timezone.utc).date()
    if data.week_start.weekday() != 0 or not (
        today - timedelta(days=14) < data.week_start <= today + timedelta(days=1)
    ):
        raise HTTPException(status_code=422, detail="Check in for this week or last week")

    checkin = (await db.execute(
        select(AccommodationCheckin).where(
            AccommodationCheckin.accommodation_id == acc.id,
            AccommodationCheckin.parent_user_id == current_user.id,
            AccommodationCheckin.week_start == data.week_start,
        )
    )).scalar_one_or_none()
    if checkin:
        checkin.answer = data.answer
        checkin.updated_at = datetime.now(timezone.utc)
    else:
        checkin = AccommodationCheckin(
            treatment_plan_id=plan.id,
            accommodation_id=acc.id,
            parent_user_id=current_user.id,
            organization_id=child.organization_id,
            week_start=data.week_start,
            answer=data.answer,
        )
        db.add(checkin)
    await db.commit()
    await db.refresh(checkin)
    return _checkin_out(checkin, acc.name)


@parent_router.get("/checkins")
async def my_checkins(
    context: tuple = Depends(get_parent_context),
    db: AsyncSession = Depends(get_db),
):
    """This parent's own check-ins on the child's current plan, latest week first."""
    current_user, children = context
    child = _first_child(children)
    plan = await _child_plan(db, child)
    if not plan:
        return []
    rows = (await db.execute(
        select(AccommodationCheckin, AccommodationBehavior.name)
        .join(AccommodationBehavior, AccommodationBehavior.id == AccommodationCheckin.accommodation_id)
        .where(
            AccommodationCheckin.treatment_plan_id == plan.id,
            AccommodationCheckin.parent_user_id == current_user.id,
        )
        .order_by(AccommodationCheckin.week_start.desc())
    )).all()
    return [_checkin_out(c, name) for c, name in rows]


# ── Naming the accommodations ────────────────────────────────────────────────
# The parent's half of the accommodation conversation, at home. The same logic serves the clinician
# going through it in session (app/services/accommodation_conversation.py). Nothing here reaches
# the treatment plan. docs/plans/accommodation-conversation.md

@parent_router.get("/accommodation-conversation")
async def accommodation_conversation(
    context: tuple = Depends(get_parent_context),
    db: AsyncSession = Depends(get_db),
):
    _, children = context
    child = _first_child(children)
    return await conversation(db, child, await _child_plan(db, child))


@parent_router.put("/accommodation-suggestions/{insight_id}")
async def answer_about_suggestion(
    insight_id: uuid.UUID,
    data: SuggestionUpdate,
    context: tuple = Depends(get_parent_context),
    db: AsyncSession = Depends(get_db),
):
    _, children = context
    row = await answer(db, _first_child(children), insight_id, data.model_dump(exclude_unset=True))
    await db.commit()
    await db.refresh(row)
    return suggestion_out(row)


@parent_router.post("/accommodation-suggestions")
async def name_an_accommodation(
    data: SuggestionCreate,
    context: tuple = Depends(get_parent_context),
    db: AsyncSession = Depends(get_db),
):
    current_user, children = context
    child = _first_child(children)
    row = await name_one(db, child, await _child_plan(db, child), data.trigger_situation_id,
                         data.name, data.estimate_min, data.estimate_max, current_user.id)
    await db.commit()
    await db.refresh(row)
    return suggestion_out(row)


# ── The parent's accommodation experiments ───────────────────────────────────
# One planned attempt at not doing an accommodation, with a prediction before and how it went after.
# Shared by every parent linked to the child. docs/plans/parent-accommodation-experiments.md

@parent_router.get("/experiments")
async def my_family_experiments(
    context: tuple = Depends(get_parent_context),
    db: AsyncSession = Depends(get_db),
):
    _, children = context
    plan = await _child_plan(db, _first_child(children))
    return await list_for_plan(db, plan.id) if plan else []


@parent_router.post("/experiments", status_code=status.HTTP_201_CREATED)
async def set_up_experiment(
    data: ParentExperimentCreate,
    context: tuple = Depends(get_parent_context),
    db: AsyncSession = Depends(get_db),
):
    current_user, children = context
    child = _first_child(children)
    plan = await _child_plan(db, child)
    if not plan:
        raise HTTPException(status_code=400, detail="No active plan for this child")
    return await set_up(db, plan.id, child.organization_id, data, current_user.id)


@parent_router.put("/experiments/{experiment_id}/after")
async def record_experiment(
    experiment_id: uuid.UUID,
    data: ParentExperimentAfter,
    context: tuple = Depends(get_parent_context),
    db: AsyncSession = Depends(get_db),
):
    _, children = context
    plan = await _child_plan(db, _first_child(children))
    if not plan:
        raise HTTPException(status_code=404, detail="Not found")
    return await record(db, plan.id, experiment_id, data)


# ── Parent ↔ clinician chat (audience='parent') ──────────────────────────────

class ParentMessageCreate(BaseModel):
    content: str
    message_type: str = "general"


@parent_router.get("/messages")
async def parent_messages(
    context: tuple = Depends(get_parent_context),
    db: AsyncSession = Depends(get_db),
):
    # The parent thread is child-scoped (audience='parent'), so co-parents linked
    # to the same child share one conversation with the clinician.
    _, children = context
    child = _first_child(children)
    rows = (await db.execute(
        select(Message)
        .where(
            Message.patient_id == child.id,
            Message.audience == "parent",
        )
        .order_by(Message.created_at.asc())
    )).scalars().all()
    return [_message_out(m) for m in rows]


@parent_router.post("/messages", status_code=status.HTTP_201_CREATED)
async def send_parent_message(
    data: ParentMessageCreate,
    context: tuple = Depends(get_parent_context),
    db: AsyncSession = Depends(get_db),
):
    current_user, children = context
    child = _first_child(children)
    if not child.primary_practitioner_id:
        raise HTTPException(status_code=400, detail="No primary practitioner assigned")
    practitioner = (await db.execute(
        select(PractitionerProfile).where(
            PractitionerProfile.id == child.primary_practitioner_id
        )
    )).scalar_one_or_none()
    if not practitioner:
        raise HTTPException(status_code=404, detail="Primary practitioner not found")

    message = Message(
        organization_id=child.organization_id,
        sender_user_id=current_user.id,
        recipient_user_id=practitioner.user_id,
        patient_id=child.id,
        content=data.content,
        message_type=data.message_type,
        sender_type="parent",
        audience="parent",
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return _message_out(message)


@parent_router.put("/messages/{message_id}/read")
async def mark_parent_message_read(
    message_id: uuid.UUID,
    context: tuple = Depends(get_parent_context),
    db: AsyncSession = Depends(get_db),
):
    current_user, _ = context
    message = (await db.execute(
        select(Message).where(Message.id == message_id)
    )).scalar_one_or_none()
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.recipient_user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    if message.read_at is None:
        message.read_at = datetime.now(timezone.utc)
        await db.commit()
    return {"ok": True}
