"""Drafting the sentence for a combination: a situation without one safety behaviour.

The situation and the behaviour are free text written by different people at different times, so
joining them reads badly: "Participating in class verbally — without sits at the back to avoid
getting called on". This drafts one sentence the clinician can edit before saving. The child reads
the saved sentence, so the clinician reading it first is the check (Peter, 2026-10-15).

Nothing is written here. If the AI call fails for any reason the template is returned instead, so
the clinician always has something to edit.

**Not yet checked against real pairs.** The rules in the prompt are a starting point from one
example, not a tested set. The wording check is in `AI-dev/Combination Wording/`; read
docs/plans/ladder-combinations.md before changing the prompt, and keep the check's pairs out of it.
"""
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

MODEL = "claude-opus-5-5"

SYSTEM_PROMPT = """You help a clinician write one step of a child's exposure ladder.

You are given a situation the child finds hard, and one safety behaviour the child uses to get
through it. The step is: being in that situation WITHOUT that safety behaviour.

Write that step as one short sentence the child will read.

- Keep it short. One clause if you can. Under about fifteen words.
- Write it as something to do, addressed to the child, like "Answer a question in class without
  sitting at the back".
- Keep the child's own words where you can.
- Never add anything that is not in the situation or the behaviour. No new people, places, times
  or details.
- Do not explain, soften or add a reason.

Return the sentence and nothing else. No quotation marks."""


def template_sentence(situation: str, behavior: str) -> str:
    """The plain fallback. Reads awkwardly, and says exactly what was entered."""
    return f"{situation.strip()} — without: {behavior.strip()}"


def _clean(text: str) -> str:
    text = text.strip().strip('"“”').strip()
    # One sentence only. If the model wrote more, the first line is the step.
    return text.splitlines()[0].strip() if text else ""


async def draft_sentence(situation: str, behavior: str) -> tuple[str, str]:
    """(sentence, "ai") on success, (template, "template") on any failure."""
    fallback = (template_sentence(situation, behavior), "template")
    if not settings.ANTHROPIC_API_KEY:
        return fallback

    try:
        import anthropic

        client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
        # The pinned SDK (0.69) predates `output_config` and `fallbacks`, so they go in the body.
        # `fallbacks: "default"` lets the API re-run a refused request on another model.
        message = await client.messages.create(
            model=MODEL,
            max_tokens=2000,
            system=SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": f"Situation: {situation.strip()}\nSafety behaviour: {behavior.strip()}",
            }],
            extra_headers={"anthropic-beta": "server-side-fallback-2026-07-01"},
            extra_body={"fallbacks": "default", "output_config": {"effort": "low"}},
        )
        if message.stop_reason == "refusal":
            logger.warning("combination wording: refused")
            return fallback
        text = "".join(
            getattr(block, "text", "") for block in message.content
            if getattr(block, "type", None) == "text"
        )
        sentence = _clean(text)
        return (sentence, "ai") if sentence else fallback
    except Exception:
        # Never block the clinician on wording. The template is always editable.
        logger.exception("combination wording: draft failed")
        return fallback
