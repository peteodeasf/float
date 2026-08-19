import traceback
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.api.routers.patients import get_practitioner_context
from app.services.downward_arrow_service import (
    get_or_create_downward_arrow,
    get_or_create_patient_downward_arrow,
    get_downward_arrow,
    list_patient_downward_arrows,
    update_downward_arrow,
)
from app.services.patient_service import get_patient_by_id
from app.schemas.downward_arrow import (
    DownwardArrowCreate,
    DownwardArrowUpdate,
    DownwardArrowResponse,
    NextProbeRequest,
    NextProbeResponse,
)

router = APIRouter(tags=["downward-arrows"])

# The downward arrow drills from a surface thought to the belief underneath by asking a
# warm "if that were true…" follow-up at each step. This only *phrases* the next question —
# the clinician reads it and can reword before saying it aloud (confirm-first), and the
# clinician (not the model) decides when the chain has reached bottom.
NEXT_PROBE_SYSTEM_PROMPT = """You help a child therapist run a "downward arrow" with a young person (ages ~10-17).

You are given the child's starting thought and the chain of question/answer steps so far. Write ONE short follow-up question that gently drills one level deeper — the classic downward-arrow move: given what the child just said, ask what that would mean, why that would be so bad, or what it would say about them.

Rules:
- Return ONLY the question. No preamble, no quotes, no explanation.
- One sentence. Warm, plain, age-appropriate — talk to the child, not about them.
- Build on the child's own words from their last answer.
- Do not decide the chain is finished or offer a summary — always ask the next question.
- Never diagnose, reassure, or give advice; just ask the next downward-arrow question."""


def _chain_text(req: NextProbeRequest) -> str:
    lines = [f'Starting thought: "{req.starting_thought}"']
    for s in req.steps:
        lines.append(f'Q: {s.question}')
        lines.append(f'A: "{s.response}"')
    lines.append("\nWrite the next question.")
    return "\n".join(lines)


@router.post("/downward-arrows/next-probe", response_model=NextProbeResponse)
async def next_probe(
    data: NextProbeRequest,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
):
    """Phrase the next downward-arrow probe (confirm-first — the clinician edits before use)."""
    _, _practitioner = context
    try:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        message = client.messages.create(
            model="claude-sonnet-4-6",
            max_tokens=256,
            system=NEXT_PROBE_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": _chain_text(data)}],
        )
        probe = message.content[0].text.strip()
        return NextProbeResponse(probe=probe)
    except Exception as e:
        print(f"next_probe failed: {type(e).__name__}: {e}", flush=True)
        print(traceback.format_exc(), flush=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AI probe generation failed: {type(e).__name__}: {str(e)}",
        )


@router.get("/trigger-situations/{situation_id}/downward-arrow",
            response_model=DownwardArrowResponse | None)
async def get_arrow(
    situation_id: uuid.UUID,
    facilitated_by: Optional[str] = None,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await get_downward_arrow(
        db, situation_id, practitioner.organization_id, facilitated_by
    )


@router.post("/trigger-situations/{situation_id}/downward-arrow",
             response_model=DownwardArrowResponse,
             status_code=status.HTTP_201_CREATED)
async def create_arrow(
    situation_id: uuid.UUID,
    data: DownwardArrowCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    return await get_or_create_downward_arrow(
        db, situation_id, practitioner.organization_id, data
    )


@router.get("/patients/{patient_id}/downward-arrows",
            response_model=list[DownwardArrowResponse])
async def list_patient_arrows(
    patient_id: uuid.UUID,
    facilitated_by: Optional[str] = None,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    # Validates the patient belongs to the practitioner's organization.
    await get_patient_by_id(db, patient_id, practitioner.organization_id)
    return await list_patient_downward_arrows(
        db, patient_id, practitioner.organization_id, facilitated_by
    )


@router.post("/patients/{patient_id}/downward-arrows",
             response_model=DownwardArrowResponse,
             status_code=status.HTTP_201_CREATED)
async def create_patient_arrow(
    patient_id: uuid.UUID,
    data: DownwardArrowCreate,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db)
):
    _, practitioner = context
    # Validates the patient belongs to the practitioner's organization.
    await get_patient_by_id(db, patient_id, practitioner.organization_id)
    return await get_or_create_patient_downward_arrow(
        db, patient_id, practitioner.organization_id, data
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
