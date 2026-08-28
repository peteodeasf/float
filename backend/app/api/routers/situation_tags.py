import uuid
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.api.routers.patients import get_practitioner_context, get_permitted_situation
from app.models.treatment import TriggerSituation
from app.models.jit_content import Tag, TriggerSituationTag

router = APIRouter(tags=["situation-tags"])


class SituationTagsUpdate(BaseModel):
    tag_ids: list[str]


@router.get("/tags")
async def list_active_tags(
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
):
    """The active tag vocabulary, for tagging situations."""
    rows = (
        await db.execute(select(Tag).where(Tag.is_active.is_(True)).order_by(Tag.label))
    ).scalars().all()
    return [{"id": str(t.id), "slug": t.slug, "label": t.label} for t in rows]


async def _owned_situation(
    situation_id: uuid.UUID, practitioner, db: AsyncSession
) -> TriggerSituation:
    sit = (
        await db.execute(
            select(TriggerSituation).where(
                TriggerSituation.id == situation_id,
                TriggerSituation.organization_id == practitioner.organization_id,
            )
        )
    ).scalar_one_or_none()
    if not sit:
        raise HTTPException(status_code=404, detail="Situation not found")
    return sit


@router.get("/situations/{situation_id}/tags")
async def get_situation_tags(
    situation_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: None = Depends(get_permitted_situation),
):
    _, practitioner = context
    await _owned_situation(situation_id, practitioner, db)
    ids = (
        await db.execute(
            select(TriggerSituationTag.tag_id).where(
                TriggerSituationTag.trigger_situation_id == situation_id
            )
        )
    ).scalars().all()
    return {"tag_ids": [str(i) for i in ids]}


@router.put("/situations/{situation_id}/tags")
async def set_situation_tags(
    situation_id: uuid.UUID,
    data: SituationTagsUpdate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
    _access: None = Depends(get_permitted_situation),
):
    _, practitioner = context
    await _owned_situation(situation_id, practitioner, db)
    await db.execute(
        delete(TriggerSituationTag).where(
            TriggerSituationTag.trigger_situation_id == situation_id
        )
    )
    for tid in data.tag_ids:
        db.add(TriggerSituationTag(trigger_situation_id=situation_id, tag_id=uuid.UUID(tid)))
    await db.commit()
    return {"tag_ids": data.tag_ids}
