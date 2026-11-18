"""Recording what the AI proposed for a patient. docs/plans/ai-foundation-and-features.md

Every place that asks the AI to draft something for a patient calls `record` with what came back.
It is written in the same transaction as the work it describes, so the record cannot say something
was drafted that was then rolled back, or miss something that was kept.
"""
import hashlib
import uuid
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_suggestion import PENDING, AiSuggestion


def fingerprint(prompt: str) -> str:
    """A short, stable stand-in for the instructions the model was given."""
    return hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:12]


async def record(
    db: AsyncSession,
    *,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID,
    job: str,
    model: str,
    prompt: str,
    output: dict,
    source: Optional[dict] = None,
    triggered_by_user_id: Optional[uuid.UUID] = None,
    status: str = PENDING,
) -> AiSuggestion:
    """Add one row. Flushed, not committed: it goes in with the caller's own commit."""
    row = AiSuggestion(
        patient_id=patient_id,
        organization_id=organization_id,
        job=job,
        model=model,
        prompt_fingerprint=fingerprint(prompt),
        source=source,
        output=output,
        triggered_by_user_id=triggered_by_user_id,
        status=status,
    )
    db.add(row)
    await db.flush()
    return row


async def for_patient(db: AsyncSession, patient_id: uuid.UUID, organization_id: uuid.UUID,
                      limit: int = 200) -> list[AiSuggestion]:
    """Newest first."""
    return list((await db.execute(
        select(AiSuggestion).where(
            AiSuggestion.patient_id == patient_id,
            AiSuggestion.organization_id == organization_id,
        ).order_by(AiSuggestion.created_at.desc()).limit(limit)
    )).scalars().all())
