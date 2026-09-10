"""The one saved list per patient, and putting an item from it on the plan.

Nothing here is on the treatment plan. Peter, 2026-09-05: *"it's not part of the plan until
explicitly added. That's true of situations, behaviors, sub-situations, accommodations, etc."*
Adding is a separate, explicit act, and it is what records the link between a plan row and the
monitoring entries it came from.

See docs/plans/patient-specific-suggestions.md.
"""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.patients import get_permitted_patient, get_practitioner_context
from app.core.database import get_db
from app.models.experiment import AccommodationBehavior
from app.models.insight import (
    KIND_ACCOMMODATION, KIND_BEHAVIOR, KIND_SITUATION, SOURCE_PARENT, PatientInsight,
)
from app.models.patient import PatientProfile
from app.models.treatment import TriggerSituation
from app.schemas.accommodation import SuggestionCreate, SuggestionUpdate
from app.services.accommodation_conversation import answer, conversation, name_one, suggestion_out
from app.services.insight_service import get_insights
from app.services.treatment_plan_service import get_active_plan

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/patients/{patient_id}/insights", tags=["insights"])


class InsightResponse(BaseModel):
    id: uuid.UUID
    kind: str
    name: str
    fear_rating: float | None = None
    #: How many monitoring entries mention it. The closest thing we have to how much it matters,
    #: and the clinician should see it before deciding to work on something.
    evidence_count: int
    sources: list[str]
    #: Set once a clinician has put it on the plan.
    added: bool
    parent_name: str | None = None
    # From the accommodation conversation: the parent's estimate, whether they still do it, and
    # whether they named it themselves. docs/plans/accommodation-conversation.md
    parent_estimate_min: float | None = None
    parent_estimate_max: float | None = None
    still_does: bool | None = None
    named_by_parent: bool = False


def _to_response(row: PatientInsight, parent_name: str | None = None) -> InsightResponse:
    return InsightResponse(
        id=row.id,
        kind=row.kind,
        name=row.name,
        fear_rating=float(row.fear_rating) if row.fear_rating is not None else None,
        evidence_count=len(row.monitoring_entry_ids) + len(row.session_note_ids),
        sources=list(row.sources or []),
        added=bool(
            row.trigger_situation_id
            or row.avoidance_behavior_id
            or row.accommodation_behavior_id
        ),
        parent_name=parent_name,
        parent_estimate_min=_num(row.parent_estimate_min),
        parent_estimate_max=_num(row.parent_estimate_max),
        still_does=row.still_does,
        # The parent named it — at home or in session — rather than it coming from their log.
        named_by_parent=SOURCE_PARENT in (row.sources or [])
        and not (row.monitoring_entry_ids or row.session_note_ids),
    )


def _num(v) -> float | None:
    return float(v) if v is not None else None


@router.get("", response_model=list[InsightResponse])
async def list_insights(
    patient_id: uuid.UUID,
    kind: str | None = None,
    include_added: bool = False,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    """What we know about this patient. `include_added=false` hides what is already on the plan,
    which is what the add panels want — they are offering what you have not taken yet."""
    _, practitioner = context
    rows = await get_insights(
        db, patient_id=patient_id, organization_id=practitioner.organization_id, kind=kind
    )
    names = {r.id: r.name for r in await get_insights(
        db, patient_id=patient_id, organization_id=practitioner.organization_id,
        include_removed=True,
    )}
    out = [_to_response(r, names.get(r.parent_insight_id)) for r in rows]
    if not include_added:
        out = [r for r in out if not r.added]
    return out


async def _get_item(db, patient_id, organization_id, insight_id) -> PatientInsight:
    row = (await db.execute(
        select(PatientInsight).where(
            PatientInsight.id == insight_id,
            PatientInsight.patient_id == patient_id,
            PatientInsight.organization_id == organization_id,
        )
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return row


@router.post("/{insight_id}/add", response_model=InsightResponse)
async def add_to_plan(
    patient_id: uuid.UUID,
    insight_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    """Make an item real: create the plan row and point the item at it.

    Adding twice is not an error — it returns what is already there rather than making a second
    copy, because a double click should not put two of anything on a ladder.
    """
    _, practitioner = context
    org_id = practitioner.organization_id
    row = await _get_item(db, patient_id, org_id, insight_id)

    if row.trigger_situation_id or row.accommodation_behavior_id or row.avoidance_behavior_id:
        return _to_response(row)

    plan = await get_active_plan(db, patient_id, org_id)
    if plan is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This patient has no treatment plan yet.",
        )

    if row.kind == KIND_SITUATION:
        existing = (await db.execute(
            select(TriggerSituation).where(TriggerSituation.treatment_plan_id == plan.id)
        )).scalars().all()
        created = TriggerSituation(
            treatment_plan_id=plan.id,
            organization_id=org_id,
            name=row.name,
            distress_thermometer_rating=row.fear_rating,
            display_order=len(existing),
        )
        db.add(created)
        await db.flush()
        row.trigger_situation_id = created.id

    elif row.kind == KIND_ACCOMMODATION:
        existing = (await db.execute(
            select(AccommodationBehavior).where(
                AccommodationBehavior.treatment_plan_id == plan.id,
                AccommodationBehavior.organization_id == org_id,
            )
        )).scalars().all()
        # The situation it belongs to, if that situation is itself on the plan. Otherwise none —
        # an accommodation does not have to hang off a situation.
        parent_trigger_id = None
        if row.parent_insight_id:
            parent = (await db.execute(
                select(PatientInsight).where(PatientInsight.id == row.parent_insight_id)
            )).scalar_one_or_none()
            parent_trigger_id = parent.trigger_situation_id if parent else None
        created = AccommodationBehavior(
            treatment_plan_id=plan.id,
            organization_id=org_id,
            trigger_situation_id=parent_trigger_id,
            name=row.name,
            display_order=len(existing),
            # The parent's estimate comes across; the child rates it themselves later.
            parent_estimate_min=row.parent_estimate_min,
            parent_estimate_max=row.parent_estimate_max,
        )
        db.add(created)
        await db.flush()
        row.accommodation_behavior_id = created.id

    else:
        # Behaviours and sub-situations belong to a situation on the ladder, and the ladder editor
        # writes those itself. Nothing to do here yet.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot add a {row.kind} to the plan from here.",
        )

    row.added_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return _to_response(row)


@router.post("/{insight_id}/remove", response_model=InsightResponse)
async def remove_from_list(
    patient_id: uuid.UUID,
    insight_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: PatientProfile = Depends(get_permitted_patient),
):
    """Take an item off the list. It stays off when the log is analysed again — otherwise the
    clinician removes the same thing every week."""
    _, practitioner = context
    row = await _get_item(db, patient_id, practitioner.organization_id, insight_id)
    row.removed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return _to_response(row)


# ── Going through it with the parent in session ──────────────────────────────
# The parent's questions from the accommodation conversation, for the clinician to ask in a parent
# session and type the answers (Peter, 2026-09-10: "It can be done in the room with the clinician
# during the parent session, or the parent can do it in the app"). The same logic as the parent
# app's routes, and the same result: suggestions, not plan rows.
# docs/plans/accommodation-conversation.md

@router.get("/accommodation-conversation")
async def accommodation_conversation_in_session(
    patient_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    patient: PatientProfile = Depends(get_permitted_patient),
):
    _, practitioner = context
    return await conversation(db, patient, await get_active_plan(db, patient_id, practitioner.organization_id))


@router.put("/{insight_id}/parent-answer")
async def parent_answer_in_session(
    patient_id: uuid.UUID,
    insight_id: uuid.UUID,
    data: SuggestionUpdate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    patient: PatientProfile = Depends(get_permitted_patient),
):
    row = await answer(db, patient, insight_id, data.model_dump(exclude_unset=True))
    await db.commit()
    await db.refresh(row)
    return suggestion_out(row)


@router.post("/parent-named")
async def parent_named_in_session(
    patient_id: uuid.UUID,
    data: SuggestionCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    patient: PatientProfile = Depends(get_permitted_patient),
):
    _, practitioner = context
    plan = await get_active_plan(db, patient_id, practitioner.organization_id)
    # Said by the parent, typed by the clinician: it is the parent's suggestion.
    row = await name_one(db, patient, plan, data.trigger_situation_id, data.name,
                         data.estimate_min, data.estimate_max, None)
    await db.commit()
    await db.refresh(row)
    return suggestion_out(row)

