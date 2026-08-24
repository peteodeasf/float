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
# This is a FEARED-CONSEQUENCE chain. The earlier version of this prompt asked the model for the
# meaning/core-belief move ("what would that say about you?"), which is a different technique
# entirely — and it was writing that content into `downward_arrows.feared_outcome`. A feared
# outcome is a concrete predicted event, which is what an exposure can disconfirm; "I'm a loser"
# is not. Built to Dr. Walker's worksheet (see docs/plans/session-situation-screen-focus.md).
#
# The model's job here is deliberately narrow: restate the child's last answer inside a fixed
# template. It does not choose the question and it does not invent content.
NEXT_PROBE_SYSTEM_PROMPT = """You help a child therapist run a "downward arrow" with a young person (ages ~10-17).

This is a FEARED-CONSEQUENCE chain. Every question asks what happens NEXT. Never ask what something
would mean about the child, what it says about them, or why it would be so bad — that is a
different technique and it is not what this tool does.

You are given the situation, the child's first answer, and the chain so far. Write ONE short
follow-up question in this form:

    What will happen if... <the child's last answer, restated in the second person>?

The restating is the whole job — take the feared part of their last answer and put it back to them
in their own words:
  "I would feel yucky."                                   -> What will happen if... you feel yucky?
  "I'd be all stressed until I could get clean again."    -> What will happen if... you can't get clean again?
  "I won't be able to play soccer or do my schoolwork."   -> What will happen if... you can't do all those things?

Rules:
- Return ONLY the question. No preamble, no quotes, no explanation.
- Keep the "What will happen if..." opening. Only if that would be ungrammatical, use the closest
  natural consequence question instead ("And then what will happen?").
- Use the child's own words. Never introduce a fear, detail, or outcome they have not said.
- Talk to the child, not about them.
- Do not decide the chain is finished, summarise, reassure, diagnose, or advise. Always ask the
  next question."""


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
