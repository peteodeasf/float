"""Suggesting smaller versions of a situation.

The prompt below is written from Dr. Walker's review of 60 of our own suggestions on 2026-08-29, in
which she marked 26 and wrote on six. Her rules are in
docs/plans/ladder-generation.md — read that before changing anything here. The short version:

1. **Vary the situation, never keep a safety behaviour.** She rewrote our bee-bench suggestions
   because they varied "how long" and "whether the fan is there". The fan is a safety behaviour and
   an exposure that keeps it is not an exposure. The axis was *where*.
2. **A built-in way out is an escape.** "Stay at the sleepover until bedtime, then get picked up" is
   not a smaller sleepover — it removes the sleeping, and the child knows it. Short is fine; a way
   out is not.
3. **You cannot write these without the feared outcome.** Said twice. So the downward arrow is a
   precondition, and a situation without one gets no suggestions rather than guesses.
4. **Start far lower than we did.** Her own ladder starts at imagining it and watching videos of
   other people doing it.
5. **As many as the child has actually told you** — two to five, and fewer when the ladder is empty,
   because the fourth would be invented.

**Clinical gate:** what a child is asked to face is clinical. Pre-launch this is Peter's call and it
is logged in the Dr. Walker review queue. She has told us what is wrong with our suggestions; she has
not yet told us what a good set looks like beyond one worked example.
"""
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)


SYSTEM_PROMPT = """You help a clinician and a child build an exposure ladder.

Given a situation the child finds hard, propose smaller versions of it that the child could
actually try. A smaller version is the SAME feared thing, made easier — not a different thing, and
not the thing with a way out attached.

RULES. These come from the supervising psychologist and they are not negotiable.

1. Never keep a safety behaviour, an avoidance, or an escape. If the child copes by carrying a fan,
   sitting with one friend, having a parent watch, or leaving early, a suggestion must not contain
   it. An exposure that keeps the thing they use to cope is not an exposure. Vary the situation
   itself instead — where it happens, who else is there because they happen to be, how much of it,
   which part of it.

2. Short is fine. A way out is not. "Play the first ten minutes" is a real exposure. "Stay until
   bedtime then get picked up" is not, because the sleeping was the feared part and the child knows
   they are leaving.

3. Start far lower than feels natural. Imagining the situation in detail, and watching other people
   do it, are real rungs and usually the first ones.

4. Use the child's own words and the detail you have been given. Do not invent a person, a place, or
   a circumstance that is not in the information below.

5. Write between two and five suggestions. The number follows from what you actually know, not from
   a target. If the situation already has steps or coping behaviours recorded, those tell you what
   to vary and four comes easily. If almost nothing is recorded, write two — if you cannot write a
   third without inventing a detail nobody mentioned, do not write it.

6. Do not propose a fear rating. The clinician and the child decide those together.

OUTPUT. Return JSON and nothing else:

{"suggestions": ["...", "..."], "variations": "..."}

Each suggestion is one plain sentence in the second person, as the child would read it.

`variations` is a single short line naming ways to vary this situation that your suggestions did NOT
already use, separated by commas — for example "where you sit, how busy it is, whether you buy lunch
or bring it". Its job is to open options the clinician and child fill in themselves. If you have
nothing to add beyond the suggestions, use an empty string."""


def _context_block(
    *,
    situation: str,
    score: float | None,
    feared_outcome: str,
    steps: list[str],
    coping: list[str],
) -> str:
    lines = [f"Situation: {situation}"]
    if score is not None:
        lines.append(f"The child rates it {score:g} out of 10.")
    lines.append(f"What they are afraid will happen: {feared_outcome}")
    if steps:
        lines.append("Steps already on the ladder for this situation:")
        lines += [f"  - {s}" for s in steps]
    else:
        lines.append("No steps on the ladder for this situation yet.")
    if coping:
        # These are what must NOT appear in a suggestion — naming them is how the model avoids
        # them, and they are usually also the dimension worth varying.
        lines.append("What the child does to cope in this situation (never keep these):")
        lines += [f"  - {c}" for c in coping]
    return "\n".join(lines)


class SuggestionUnavailable(Exception):
    """No suggestions, and the reason is worth showing the clinician rather than swallowing."""


async def suggest_steps(
    *,
    situation: str,
    score: float | None,
    feared_outcome: str | None,
    steps: list[str],
    coping: list[str],
) -> tuple[list[str], str]:
    """Smaller versions of a situation, and a line of other ways to vary it.

    Raises SuggestionUnavailable when the downward arrow has not been done. Dr. Walker, twice:
    "What is feared outcome of raising hand? That will determine sub situations." Offering
    suggestions without it is guessing at the fear.
    """
    if not (feared_outcome or "").strip():
        raise SuggestionUnavailable(
            "Do the downward arrow on this situation first — what they are afraid will happen is "
            "what decides the smaller versions."
        )

    import json
    import anthropic

    client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=800,
        system=SYSTEM_PROMPT,
        messages=[{
            "role": "user",
            "content": _context_block(
                situation=situation,
                score=score,
                feared_outcome=feared_outcome,
                steps=steps,
                coping=coping,
            ),
        }],
    )
    raw = message.content[0].text.strip()
    # The model is asked for bare JSON; a fenced block is the usual way that goes wrong.
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    data = json.loads(raw)
    suggestions = [str(s).strip() for s in data.get("suggestions", []) if str(s).strip()]
    variations = str(data.get("variations", "") or "").strip()
    if not suggestions:
        raise SuggestionUnavailable("Nothing came back that was worth showing.")
    return suggestions, variations
