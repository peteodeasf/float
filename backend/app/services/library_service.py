"""Find-or-create for the cross-org situation/behavior library (Tier C).

Every situation/behavior created contributes to the shared vocabulary, deduped
by normalized name (same normalization as the frontend isSimilar helper).
Stores generic name + type only — never patient data.
"""
import re
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.treatment import SituationLibrary, BehaviorLibrary


def normalize(s: str) -> str:
    return re.sub(r'[^a-zA-Z0-9]', '', s or '').lower()


async def upsert_situation_library(db: AsyncSession, name: str) -> Optional[uuid.UUID]:
    norm = normalize(name)
    if not norm:
        return None
    existing = (await db.execute(
        select(SituationLibrary).where(SituationLibrary.normalized_name == norm)
    )).scalar_one_or_none()
    if existing:
        return existing.id
    entry = SituationLibrary(name=name.strip(), normalized_name=norm)
    db.add(entry)
    await db.flush()
    return entry.id


async def upsert_behavior_library(
    db: AsyncSession, name: str, behavior_type: Optional[str]
) -> Optional[uuid.UUID]:
    norm = normalize(name)
    if not norm:
        return None
    existing = (await db.execute(
        select(BehaviorLibrary).where(BehaviorLibrary.normalized_name == norm)
    )).scalar_one_or_none()
    if existing:
        return existing.id
    entry = BehaviorLibrary(name=name.strip(), normalized_name=norm, behavior_type=behavior_type)
    db.add(entry)
    await db.flush()
    return entry.id
