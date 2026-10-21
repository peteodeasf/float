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
3. **You cannot write these without the feared outcome.** Said twice. Until 2026-10-16 the downward
   arrow was a precondition. Peter removed that on 2026-10-16, to test suggestions without it: her
   approach here has changed more than once. The feared outcome is still used when there is one.
   When there is none, the model is told it is not known and not to guess it.
4. **Start far lower than we did.** Her own ladder starts at imagining it and watching videos of
   other people doing it.
5. **As many as the child has actually told you** — two to five, and fewer when the ladder is empty,
   because the fourth would be invented.

The limits — two to five suggestions, no idea twice — are asked for in the prompt and then checked
in code (`within_limits`), because a prompt is a request, not a
guarantee. The numbers are the ones in docs/plans/ladder-generation.md, and `AI-dev/Ladder Eval/
checks.py` imports them from here rather than keeping its own.

**Clinical gate:** what a child is asked to face is clinical. Pre-launch this is Peter's call and it
is logged in the Dr. Walker review queue. She has told us what is wrong with our suggestions; she has
not yet told us what a good set looks like beyond one worked example.
"""
import json
import logging
import re

import anthropic

from app.core.config import settings

logger = logging.getLogger(__name__)

# Read by the AI tests too: their reviewing agents must run on a different model from this one.
SUGGESTION_MODEL = "claude-sonnet-4-6"

# The limits, from docs/plans/ladder-generation.md ("How many suggestions"). The prompt asks for
# them; `within_limits` makes sure of them.
MIN_SUGGESTIONS = 2
MAX_SUGGESTIONS = 5
# No length limit in code. Peter, 2026-10-20: don't drop suggestions for length for now. At twelve
# words, 36 of 282 test runs left the clinician nothing, and the 13- and 14-word ones read as well
# as the rest. The prompt still asks for short phrases.


SYSTEM_PROMPT = """You help a clinician and a child build an exposure ladder.

Given a situation the child finds hard, propose smaller versions of it that the child could
actually try. A smaller version is the SAME feared thing, made easier — not a different thing, and
not the thing with a way out attached.

RULES. These come from the supervising psychologist and they are not negotiable.

1. Never keep a safety behavior, an avoidance, or an escape. If the child copes by carrying a fan,
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
   a target. If the situation already has steps or coping behaviors recorded, those tell you what
   to vary and four comes easily. If almost nothing is recorded, write two — if you cannot write a
   third without inventing a detail nobody mentioned, do not write it.

6. Do not propose a fear rating. The clinician and the child decide those together.

7. Use American spelling and words: "mom", not "mum".

OUTPUT. Return JSON and nothing else:

{"suggestions": ["...", "..."], "variations": "..."}

Each suggestion is a short phrase in the second person, as the child would read it — a few words, not a full sentence. Keep it under about twelve words, and do not add a clause after a dash explaining or softening it. It should fit on two lines.

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
    if feared_outcome.strip():
        lines.append(f"What they are afraid will happen: {feared_outcome}")
    else:
        # No downward arrow yet (Peter, 2026-10-16: suggest anyway). Said outright, so the model
        # does not fill the gap with a fear nobody named.
        lines.append(
            "What they are afraid will happen is not known yet. Do not guess at it or name one. "
            "Vary the situation itself."
        )
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


# Small words that do not make two suggestions different ideas.
_SMALL_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "into", "is", "it", "of",
    "on", "or", "the", "their", "them", "then", "this", "to", "up", "with", "you", "your",
}


def _idea(text: str) -> frozenset[str]:
    return frozenset(w for w in re.findall(r"[a-z0-9']+", text.lower()) if w not in _SMALL_WORDS)


def words_in(text: str) -> int:
    return len(text.split())


def within_limits(suggestions: list[str]) -> tuple[list[str], list[tuple[str, str]]]:
    """What the clinician is shown, and what was dropped and why.

    In this order: empty ones go, then any that is the same idea as one before it, then everything after the first MAX_SUGGESTIONS. The model's order
    is kept.

    "The same idea" means the same words once small words ("the", "a", "with") are left out. That is
    narrow on purpose: "Sit on the bench with the fan" and "...without the fan" differ by one word
    that matters, and must both survive. The looser overlap test in `AI-dev/Ladder Eval/checks.py`
    is only a warning for that reason.

    Fewer than MIN_SUGGESTIONS left is the caller's to decide; this does not raise.
    """
    kept: list[str] = []
    dropped: list[tuple[str, str]] = []
    for s in suggestions:
        s = s.strip()
        if not s:
            continue
        if any(_idea(s) == _idea(k) for k in kept):
            dropped.append((s, "duplicate"))
        elif len(kept) >= MAX_SUGGESTIONS:
            dropped.append((s, "over_max"))
        else:
            kept.append(s)
    return kept, dropped


def read_reply(raw: str) -> tuple[list[str], str]:
    """The suggestions and variations line in the model's reply, before any limit is applied."""
    raw = raw.strip()
    # The model is asked for bare JSON; a fenced block is the usual way that goes wrong.
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.strip()

    data = json.loads(raw)
    suggestions = [str(s).strip() for s in data.get("suggestions", []) if str(s).strip()]
    variations = str(data.get("variations", "") or "").strip()
    return suggestions, variations


def ask_claude(context: str, client=None) -> str:
    # `client` is for the AI test runner (AI-dev/evals/runner/rungs.py), which counts what each call
    # costs. The app always leaves it out.
    client = client or anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = client.messages.create(
        model=SUGGESTION_MODEL,
        max_tokens=800,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": context}],
    )
    return message.content[0].text


async def suggest_steps(
    *,
    situation: str,
    score: float | None,
    feared_outcome: str | None,
    steps: list[str],
    coping: list[str],
) -> tuple[list[str], str]:
    """Smaller versions of a situation, and a line of other ways to vary it.

    Works with or without a feared outcome. Dr. Walker, twice: "What is feared outcome of raising
    hand? That will determine sub situations." So it is used whenever there is one. Peter,
    2026-10-16: suggest without it too, and test whether the suggestions are good enough.

    Raises SuggestionUnavailable when fewer than MIN_SUGGESTIONS are left after the limits.
    """
    raw = ask_claude(_context_block(
        situation=situation,
        score=score,
        feared_outcome=feared_outcome or "",
        steps=steps,
        coping=coping,
    ))
    suggestions, variations = read_reply(raw)
    kept, dropped = within_limits(suggestions)
    if dropped:
        # Reasons and counts only: the wording is about a child.
        logger.info("suggested steps: dropped %s", sorted(reason for _, reason in dropped))
    if not kept:
        raise SuggestionUnavailable("Nothing came back that was worth showing.")
    if len(kept) < MIN_SUGGESTIONS:
        raise SuggestionUnavailable("Not enough came back that was worth showing.")
    return kept, variations
