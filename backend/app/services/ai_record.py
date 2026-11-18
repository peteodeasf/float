"""Recording what the AI proposed for a patient. docs/plans/ai-foundation-and-features.md

Every place that asks the AI to draft something for a patient calls `record` with what came back.
It is written in the same transaction as the work it describes, so the record cannot say something
was drafted that was then rolled back, or miss something that was kept.
"""
import hashlib
import json
import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.ai_suggestion import ACCEPTED, EDITED, PENDING, REJECTED, REPLACED, AiSuggestion


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
    if status == PENDING and source:
        # A newer draft of the same thing: the older one was never decided on.
        for old in await _pending(db, job, source):
            old.status = REPLACED
    row = AiSuggestion(
        patient_id=patient_id,
        organization_id=organization_id,
        job=job,
        model=model,
        prompt_fingerprint=fingerprint(prompt),
        source=source,
        output=json_safe(output),
        triggered_by_user_id=triggered_by_user_id,
        status=status,
    )
    db.add(row)
    await db.flush()
    return row


def json_safe(value):
    """Dates and ids as text, so any output can be stored."""
    return json.loads(json.dumps(value, default=str))


async def _pending(db: AsyncSession, job: str, source: dict) -> list[AiSuggestion]:
    return list((await db.execute(
        select(AiSuggestion).where(
            AiSuggestion.job == job,
            AiSuggestion.status == PENDING,
            AiSuggestion.source.contains(source),
        ).order_by(AiSuggestion.created_at.desc())
    )).scalars().all())


async def decide(db: AsyncSession, *, job: str, source: dict, user_id: Optional[uuid.UUID],
                 kept: Optional[dict] = None, compare: Optional[str] = None) -> Optional[AiSuggestion]:
    """Settle the newest waiting draft of this job for this source.

    `kept` is what the clinician saved, or None when they turned it down. When `compare` names a
    field, the draft counts as accepted if that field is unchanged (ignoring spaces at the ends),
    and as edited otherwise, with the saved version kept in `final`.
    """
    rows = await _pending(db, job, source)
    if not rows:
        return None
    row = rows[0]
    if kept is None:
        row.status = REJECTED
    else:
        same = compare is not None and (str(row.output.get(compare) or "").strip()
                                         == str(kept.get(compare) or "").strip())
        row.status = ACCEPTED if same else EDITED
        row.final = None if same else json_safe(kept)
    row.decided_by_user_id = user_id
    row.decided_at = datetime.now(timezone.utc)
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
