"""Cross-org situation/behavior library — select-from-list reuse (Tier C).

Read-only search for now (entries are created via the situation/behavior create
flows in C2/C3). Generic vocabulary only; no patient data.
"""
import re
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.treatment import SituationLibrary, BehaviorLibrary
from app.api.routers.patients import get_practitioner_context

router = APIRouter(tags=["library"])


def _norm(s: str) -> str:
    return re.sub(r'[^a-zA-Z0-9]', '', s or '').lower()


class SituationLibraryItem(BaseModel):
    id: uuid.UUID
    name: str

    class Config:
        from_attributes = True


class BehaviorLibraryItem(BaseModel):
    id: uuid.UUID
    name: str
    behavior_type: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/situation-library", response_model=list[SituationLibraryItem])
async def search_situation_library(
    q: Optional[str] = Query(None),
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(SituationLibrary)
    if q and _norm(q):
        stmt = stmt.where(SituationLibrary.normalized_name.contains(_norm(q)))
    stmt = stmt.order_by(SituationLibrary.name).limit(20)
    return (await db.execute(stmt)).scalars().all()


@router.get("/behavior-library", response_model=list[BehaviorLibraryItem])
async def search_behavior_library(
    q: Optional[str] = Query(None),
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(BehaviorLibrary)
    if q and _norm(q):
        stmt = stmt.where(BehaviorLibrary.normalized_name.contains(_norm(q)))
    stmt = stmt.order_by(BehaviorLibrary.name).limit(20)
    return (await db.execute(stmt)).scalars().all()
