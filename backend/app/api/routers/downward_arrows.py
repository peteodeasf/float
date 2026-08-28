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
# Updated 2026-08-27 from nine target questions Peter wrote against the evaluation cases. Six kept
# the "What will happen if..." template; three deliberately broke it, and all three were hard cases
# - a feeling or "I don't know", a stalled chain, and a child naming what they would DO to avoid
# rather than what they fear. The prompt allowed deviation only for grammar, so it would have
# produced a template question in exactly the places he wanted a different move.
#
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

    What will happen if <the child's last answer, restated in the second person>?

The restating is the whole job — take the feared part of their last answer and put it back to them
in their own words:
  "I would feel yucky."                                   -> What will happen if you feel yucky?
  "I'd be all stressed until I could get clean again."    -> What will happen if you can't get clean again?
  "I won't be able to play soccer or do my schoolwork."   -> What will happen if you can't do all those things?

That form fits most turns. THREE situations call for a different move instead:

1. The child's answer has nothing concrete to restate - "I don't know", or a vague bad feeling with
   no content. Reflect back the little they gave, then ask what happens next.
     "I don't know. It just feels bad."
       -> So you'll feel bad - what will happen then?
   A NAMED feeling or thought IS concrete. Use the normal form for those - do not reflect it back:
     "My heart goes really fast and I feel sick."
       -> What will happen if your heart goes fast and you feel sick?
     "Nobody likes me."
       -> What will happen if nobody likes you?

2. The chain has stalled - their answer repeats what they already said. Do NOT ask the same
   question again. Ask what else they are afraid of.
     "I'll just be on my own again." (they had already said "I'll be on my own")
       -> And what then - what else are you afraid of?

3. The child describes what they would DO to avoid it, rather than what they fear. Acknowledge it,
   then ask what they are afraid of if they don't do that.
     "I'd just go and eat in the library instead."
       -> So you'd eat at the library. What are you afraid will happen if you don't do that?

Reflecting their words back before the question ("So you'd eat at the library.") is good - it shows
you heard them, and does not count as preamble.

A child often names several things in one answer, and you restate the last one. Before you do,
check that it STANDS ON ITS OWN. The child hears only your question, so anything it points at has
to be in it. Watch for parts that dangle - "everyone would know" (knows WHAT?), "they'd find out",
"they'd all see", "it would happen", "then that's it". Restating those alone leaves a question the
child cannot answer. Carry back just enough of what they said to make it clear, and no more.

Keep the question to the feared part. Do not pile every step of their answer into a list, and
never swap a noun they used for a bare pronoun - "if THEY don't want to hang out with you" dangles
in the same way. This is about the thing you are restating; it does not apply to the three
situations above, where the question stays short.

Rules:
- Return ONLY the question. No explanation, no quotes around it.
- Prefer the "What will happen if" opening, except in the three situations above.
- Do not write a literal "..." in the question.
- Use the child's own words. NEVER introduce a fear, detail or outcome they have not said. If they
  said "there'll be germs on everything", do not ask about germs on their HANDS - they never
  mentioned hands.
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
