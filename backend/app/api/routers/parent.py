"""Parent-facing read/write endpoints.

All routes are gated by `get_parent_context` (the logged-in parent → their linked
child). MVP is single-child, so every endpoint targets the first linked child.
The parent's job is child-support-forward: see the child's upcoming exposures,
work the assigned accommodation, log moments, get situational tips, and chat with
the clinician.
"""
import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.patient import PatientProfile, PractitionerProfile
from app.models.treatment import TreatmentPlan, TriggerSituation, AvoidanceBehavior
from app.models.experiment import Experiment, AccommodationMoment
from app.models.message import Message
from app.models.jit_content import JitTip, JitTipTag, TriggerSituationTag
from app.api.routers.patients import get_parent_context
from app.services.accommodation_service import get_accommodations_for_plan
from app.schemas.accommodation import AccommodationResponse

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
    horizon = datetime.now(timezone.utc) + timedelta(days=7)

    rows = (await db.execute(
        select(Experiment, AvoidanceBehavior, TriggerSituation)
        .outerjoin(AvoidanceBehavior, AvoidanceBehavior.id == Experiment.avoidance_behavior_id)
        .outerjoin(TriggerSituation, TriggerSituation.id == AvoidanceBehavior.trigger_situation_id)
        .where(
            Experiment.patient_id == child.id,
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
            "behavior_name": exp.plan_description or (beh.name if beh else None),
            "scheduled_date": exp.scheduled_date.isoformat() if exp.scheduled_date else None,
            "scheduled_time_bucket": exp.scheduled_time_bucket,
            "status": exp.status,
        }
        for exp, beh, sit in rows
    ]


# ── The parent's accommodations (the child's ladder, read-only for parent) ────

@parent_router.get("/accommodations", response_model=list[AccommodationResponse])
async def parent_accommodations(
    context: tuple = Depends(get_parent_context),
    db: AsyncSession = Depends(get_db),
):
    """The child's accommodation ladder, ordered by display_order, each carrying
    `is_weekly_focus`. The parent sees the focus + the others for awareness."""
    _, children = context
    child = _first_child(children)
    plan = await _child_plan(db, child)
    if not plan:
        return []
    return await get_accommodations_for_plan(db, plan.id, child.organization_id)


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


# ── Log a moment ─────────────────────────────────────────────────────────────

class MomentCreate(BaseModel):
    accommodation_id: uuid.UUID | None = None
    held: bool
    note: str | None = None


def _moment_out(m: AccommodationMoment) -> dict:
    return {
        "id": str(m.id),
        "accommodation_id": str(m.accommodation_id) if m.accommodation_id else None,
        "held": m.held,
        "note": m.note,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


@parent_router.post("/moments", status_code=status.HTTP_201_CREATED)
async def log_moment(
    data: MomentCreate,
    context: tuple = Depends(get_parent_context),
    db: AsyncSession = Depends(get_db),
):
    current_user, children = context
    child = _first_child(children)
    plan = await _child_plan(db, child)
    if not plan:
        raise HTTPException(status_code=400, detail="No active plan for this child")
    moment = AccommodationMoment(
        treatment_plan_id=plan.id,
        accommodation_id=data.accommodation_id,
        parent_user_id=current_user.id,
        organization_id=child.organization_id,
        held=data.held,
        note=data.note,
    )
    db.add(moment)
    await db.commit()
    await db.refresh(moment)
    return _moment_out(moment)


@parent_router.get("/moments")
async def my_moments(
    context: tuple = Depends(get_parent_context),
    db: AsyncSession = Depends(get_db),
):
    _, children = context
    child = _first_child(children)
    plan = await _child_plan(db, child)
    if not plan:
        return []
    rows = (await db.execute(
        select(AccommodationMoment)
        .where(AccommodationMoment.treatment_plan_id == plan.id)
        .order_by(AccommodationMoment.created_at.desc())
    )).scalars().all()
    return [_moment_out(m) for m in rows]


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
