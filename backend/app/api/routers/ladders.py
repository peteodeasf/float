import uuid
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.services.ladder_review_service import run_ladder_review

from app.core.database import get_db
from app.api.routers.patients import get_practitioner_context
from app.services.ladder_service import (
    get_or_create_ladder,
    get_ladder_with_rungs,
    add_rung,
    update_rung,
    reorder_rungs
)
from app.schemas.ladder import (
    LadderRungCreate,
    LadderRungUpdate,
    LadderRungResponse,
    LadderResponse,
    RungReorderRequest
)

router = APIRouter(tags=["ladders"])


@router.get("/triggers/{trigger_id}/ladder", response_model=LadderResponse)
async def get_ladder(
    trigger_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    ladder = await get_ladder_with_rungs(db, trigger_id, practitioner.organization_id)
    if not ladder:
        ladder = await get_or_create_ladder(db, trigger_id, practitioner.organization_id)
        ladder.rungs = []
    return ladder


@router.post("/ladders/{ladder_id}/rungs", response_model=LadderRungResponse, status_code=status.HTTP_201_CREATED)
async def create_rung(
    ladder_id: uuid.UUID,
    data: LadderRungCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await add_rung(db, ladder_id, practitioner.organization_id, data)


@router.put("/ladders/{ladder_id}/rungs/{rung_id}", response_model=LadderRungResponse)
async def update_ladder_rung(
    ladder_id: uuid.UUID,
    rung_id: uuid.UUID,
    data: LadderRungUpdate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await update_rung(db, rung_id, practitioner.organization_id, data)


@router.put("/ladders/{ladder_id}/rungs/reorder", response_model=list[LadderRungResponse])
async def reorder_ladder_rungs(
    ladder_id: uuid.UUID,
    data: RungReorderRequest,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await reorder_rungs(db, ladder_id, practitioner.organization_id, data.ordered_ids)

@router.post("/ladders/{ladder_id}/review")
async def review_ladder(
    ladder_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await run_ladder_review(db, ladder_id, practitioner.organization_id)
