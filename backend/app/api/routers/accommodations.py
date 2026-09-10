import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.experiment import AccommodationBehavior
from app.services.patient_access_service import assert_belongs_to
from app.models.treatment import TreatmentPlan
from app.api.routers.patients import get_practitioner_context, get_permitted_plan
from app.services.accommodation_service import (
    get_accommodations_for_plan,
    create_accommodation,
    update_accommodation,
    delete_accommodation,
    reorder_accommodations,
    reseed_by_distress,
    get_checkins_for_plan,
)
from app.schemas.accommodation import (
    AccommodationCreate,
    AccommodationUpdate,
    AccommodationResponse,
    ChildRatingIn,
    ReorderRequest,
)

# Accommodations are the parent's per-child ladder, managed by the therapist.
# Plan-scoped == per-child (a plan belongs to one patient).
router = APIRouter(prefix="/plans/{plan_id}/accommodations", tags=["accommodations"])


@router.get("", response_model=list[AccommodationResponse])
async def list_accommodations(
    plan_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    _, practitioner = context
    return await get_accommodations_for_plan(db, plan_id, practitioner.organization_id)


@router.get("/checkins")
async def list_accommodation_checkins(
    plan_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    """The parent's weekly check-ins for this plan: what the clinician decides moving on from."""
    _, practitioner = context
    return await get_checkins_for_plan(db, plan_id, practitioner.organization_id)


@router.post("", response_model=AccommodationResponse, status_code=status.HTTP_201_CREATED)
async def create_accommodation_behavior(
    plan_id: uuid.UUID,
    data: AccommodationCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    _, practitioner = context
    return await create_accommodation(db, plan_id, practitioner.organization_id, data)


@router.put("/reorder", response_model=list[AccommodationResponse])
async def reorder_accommodation_behaviors(
    plan_id: uuid.UUID,
    data: ReorderRequest,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    _, practitioner = context
    return await reorder_accommodations(
        db, plan_id, practitioner.organization_id, data.ordered_ids
    )


@router.post("/reseed", response_model=list[AccommodationResponse])
async def reseed_accommodation_order(
    plan_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    _, practitioner = context
    return await reseed_by_distress(db, plan_id, practitioner.organization_id)


@router.put("/{accommodation_id}", response_model=AccommodationResponse)
async def update_accommodation_behavior(
    plan_id: uuid.UUID,
    accommodation_id: uuid.UUID,
    data: AccommodationUpdate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    _, practitioner = context
    # The dependency above checked the PARENT id. Nothing tied the child id to it, so a
    # clinician could pair a parent they hold with any child row in the institution -
    # including one whose grant was revoked. See docs/solutions/.
    await assert_belongs_to(db, AccommodationBehavior, accommodation_id, treatment_plan_id=plan_id)
    return await update_accommodation(
        db, accommodation_id, practitioner.organization_id, data
    )


@router.delete("/{accommodation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_accommodation_behavior(
    plan_id: uuid.UUID,
    accommodation_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    _, practitioner = context
    # The dependency above checked the PARENT id. Nothing tied the child id to it, so a
    # clinician could pair a parent they hold with any child row in the institution -
    # including one whose grant was revoked. See docs/solutions/.
    await assert_belongs_to(db, AccommodationBehavior, accommodation_id, treatment_plan_id=plan_id)
    await delete_accommodation(db, accommodation_id, practitioner.organization_id)


# ── The child's ratings ──────────────────────────────────────────────────────
# Peter, 2026-09-10: the accommodations on the plan are "delivered to the child to score", in their
# app or in session. docs/plans/accommodation-conversation.md

@router.post("/ask-child", response_model=list[AccommodationResponse])
async def ask_child_to_rate(
    plan_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    """Send the plan's accommodations the child has not rated to their app. The child sees nothing
    until this is pressed, and one added later waits for the next press."""
    _, practitioner = context
    now = datetime.now(timezone.utc)
    for a in await get_accommodations_for_plan(db, plan_id, practitioner.organization_id):
        if a.child_rated_at is None and a.child_rating_requested_at is None:
            a.child_rating_requested_at = now
    await db.commit()
    return await get_accommodations_for_plan(db, plan_id, practitioner.organization_id)


@router.put("/{accommodation_id}/child-rating", response_model=AccommodationResponse)
async def rate_with_child(
    plan_id: uuid.UUID,
    accommodation_id: uuid.UUID,
    data: ChildRatingIn,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: TreatmentPlan = Depends(get_permitted_plan),
):
    """In session: the child says it, the clinician types it, and it counts as the child's rating."""
    await assert_belongs_to(db, AccommodationBehavior, accommodation_id, treatment_plan_id=plan_id)
    acc = await db.get(AccommodationBehavior, accommodation_id)
    acc.distress_min, acc.distress_max = data.rating_min, data.rating_max
    acc.child_rated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(acc)
    return acc

