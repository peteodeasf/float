import uuid
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.routers.patients import get_practitioner_context
from app.services.accommodation_service import (
    get_accommodations_for_plan,
    create_accommodation,
    update_accommodation,
    delete_accommodation,
    reorder_accommodations,
    reseed_by_distress,
)
from app.schemas.accommodation import (
    AccommodationCreate,
    AccommodationUpdate,
    AccommodationResponse,
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
):
    _, practitioner = context
    return await get_accommodations_for_plan(db, plan_id, practitioner.organization_id)


@router.post("", response_model=AccommodationResponse, status_code=status.HTTP_201_CREATED)
async def create_accommodation_behavior(
    plan_id: uuid.UUID,
    data: AccommodationCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
):
    _, practitioner = context
    return await create_accommodation(db, plan_id, practitioner.organization_id, data)


@router.put("/reorder", response_model=list[AccommodationResponse])
async def reorder_accommodation_behaviors(
    plan_id: uuid.UUID,
    data: ReorderRequest,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
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
):
    _, practitioner = context
    return await update_accommodation(
        db, accommodation_id, practitioner.organization_id, data
    )


@router.delete("/{accommodation_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_accommodation_behavior(
    plan_id: uuid.UUID,
    accommodation_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
):
    _, practitioner = context
    await delete_accommodation(db, accommodation_id, practitioner.organization_id)
