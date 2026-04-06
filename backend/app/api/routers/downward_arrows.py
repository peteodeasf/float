import uuid
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.routers.patients import get_practitioner_context
from app.services.downward_arrow_service import (
    get_or_create_downward_arrow,
    get_downward_arrow,
    update_downward_arrow,
    approve_downward_arrow
)
from app.schemas.downward_arrow import (
    DownwardArrowCreate,
    DownwardArrowUpdate,
    DownwardArrowApprove,
    DownwardArrowResponse
)

router = APIRouter(tags=["downward-arrows"])


@router.get("/rungs/{rung_id}/downward-arrow",
            response_model=DownwardArrowResponse | None)
async def get_arrow(
    rung_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await get_downward_arrow(db, rung_id, practitioner.organization_id)


@router.post("/rungs/{rung_id}/downward-arrow",
             response_model=DownwardArrowResponse,
             status_code=status.HTTP_201_CREATED)
async def create_arrow(
    rung_id: uuid.UUID,
    data: DownwardArrowCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await get_or_create_downward_arrow(
        db, rung_id, practitioner.organization_id, data
    )


@router.put("/downward-arrows/{arrow_id}",
            response_model=DownwardArrowResponse)
async def update_arrow(
    arrow_id: uuid.UUID,
    data: DownwardArrowUpdate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await update_downward_arrow(
        db, arrow_id, practitioner.organization_id, data
    )


@router.put("/downward-arrows/{arrow_id}/approve",
            response_model=DownwardArrowResponse)
async def approve_arrow(
    arrow_id: uuid.UUID,
    data: DownwardArrowApprove,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await approve_downward_arrow(
        db, arrow_id, practitioner.organization_id, data
    )
