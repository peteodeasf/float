"""The reviewing agents, for the two AI features with no single right answer: suggested rungs and
step sentences. Plan: docs/plans/ai-quality-testing.md, "Reviewing agents".

One reviewer per concern, each a file in `reviewers/`:
  her_rules     -- Dr. Walker's written rules, from docs/plans/ladder-generation.md
  child_safety  -- no way out, no new fear, nothing invented
  age           -- reads right for the child's age

`reviewers/frame.md` is what every reviewer is told about how to answer. A concern file's rules are
its `## <id>` headings. Only those ids count.

**An objection must name its rule.** That is decided here, in code, not left to the reviewer:
  * an objection naming one of the reviewer's rules is a broken rule;
  * one naming "none", no rule, or a rule the reviewer does not have is the reviewer's own opinion;
  * an item is "dont_show" only when it has at least one broken rule. A "dont_show" backed by
    opinions alone is counted as "show", and reported apart as opinion-only.

**Each reviewer runs on a different model from the feature it reviews,** so the feature's own
habits are not marked by the same habits. `check_models()` fails if they match.

Step-sentence verdicts are unchecked: Dr. Walker has marked no step sentences, so nothing says
whether that reviewer agrees with her. Every step-sentence review says so (`checked=False`).
"""
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
FOLDER = HERE / "reviewers"
CONCERNS = ("her_rules", "child_safety", "age")
FEATURES = ("rungs", "step_sentences")

SHOW, DONT_SHOW = "show", "dont_show"

# The reviewer's model for each feature. The feature's own model is read from the app
# (`feature_model`), and `check_models` keeps them apart.
REVIEWER_MODEL = {
    "rungs": "claude-opus-5-5",
    "step_sentences": "claude-sonnet-5-5",
}
MAX_TOKENS = 8000
EFFORT = "medium"

WHAT = {
    "rungs": "suggested smaller steps for one situation on a child's exposure ladder",
    "step_sentences": ("the sentence for one step of a child's exposure ladder: being in a situation "
                       "without one safety behavior"),
}

# Whether a reviewer's verdicts for the feature have been checked against Dr. Walker's own marks.
# Rungs: not yet. `check_rung_reviewer.py` measures it against her 2026-08-29 marks, but they are
# only in the production database, which is not reachable (Peter, 2026-10-20: skip the check for
# now). Set this to True once that check has been run and the agreement is known. Step sentences:
# she has marked none.
CHECKED = {"rungs": False, "step_sentences": False}

_RULE = re.compile(r"^## ([a-z0-9-]+)\s*$", re.M)


def feature_model(feature: str) -> str:
    """The model the app's feature runs on, imported from the app."""
    if feature == "rungs":
        from app.services.step_suggestion_service import SUGGESTION_MODEL as MODEL
    elif feature == "step_sentences":
        from app.services.combination_wording import MODEL
    else:
        raise ValueError(f"no feature {feature!r}; known: {FEATURES}")
    return MODEL


def check_models() -> None:
    for feature in FEATURES:
        if REVIEWER_MODEL[feature] == feature_model(feature):
            raise ValueError(f"the {feature} reviewers run on {REVIEWER_MODEL[feature]}, the same "
                             f"model as the feature they review")


@dataclass(frozen=True)
class Reviewer:
    concern: str
    feature: str
    rules: tuple[str, ...]
    system: str

    @property
    def model(self) -> str:
        return REVIEWER_MODEL[self.feature]

    @property
    def checked(self) -> bool:
        return CHECKED[self.feature]


def _concern_parts(text: str) -> tuple[str, str, str]:
    """(concern, about, rules text) from a concern file."""
    concern = re.search(r"^concern: (.+)$", text, re.M).group(1).strip()
    about = re.search(r"^about: (.+?)(?=\n\n)", text, re.M | re.S).group(1).strip()
    first = _RULE.search(text)
    return concern, about, text[first.start():].strip()


def load(concern: str, feature: str, folder: Path = FOLDER) -> Reviewer:
    if concern not in CONCERNS:
        raise ValueError(f"no reviewer {concern!r}; known: {CONCERNS}")
    if feature not in FEATURES:
        raise ValueError(f"no feature {feature!r}; known: {FEATURES}")
    text = (folder / f"{concern}.md").read_text()
    name, about, rules = _concern_parts(text)
    system = (folder / "frame.md").read_text()
    for key, value in (("what", WHAT[feature]), ("concern", name), ("about", about),
                       ("rules", rules)):
        system = system.replace("{" + key + "}", value)
    return Reviewer(concern, feature, tuple(_RULE.findall(text)), system)


def load_all(feature: str, folder: Path = FOLDER) -> list[Reviewer]:
    return [load(c, feature, folder) for c in CONCERNS]


# --- What a reviewer is shown -------------------------------------------------------------------

def rung_item(situation: str, suggestions: list[str], rating: float | None = None,
              feared_outcome: str | None = None, recorded: list[tuple[str, str | None]] = (),
              age: int | None = None) -> dict:
    """One situation and the suggestions made for it. `recorded` is what is already on the
    ladder for it, as (text, behavior type as stored)."""
    return {"feature": "rungs", "situation": situation, "rating": rating,
            "feared_outcome": feared_outcome, "recorded": list(recorded), "age": age,
            "items": list(suggestions)}


def step_item(situation: str, behavior: str, sentence: str, age: int | None = None) -> dict:
    return {"feature": "step_sentences", "situation": situation, "behavior": behavior, "age": age,
            "items": [sentence]}


def message(item: dict) -> str:
    lines = [f"The child's age: {item['age'] if item.get('age') else 'not given'}"]
    if item["feature"] == "rungs":
        lines.append(f"Situation: {item['situation']}")
        if item.get("rating") is not None:
            lines.append(f"The child rates it {item['rating']:g} out of 10.")
        lines.append(f"What they are afraid will happen: {item.get('feared_outcome') or 'not known'}")
        if item["recorded"]:
            # The stored types are unreliable (docs/plans/ladder-generation.md: 11 different values,
            # a fan stored as avoidance), so they are shown as stored and labelled so.
            lines.append("Already recorded for this situation (type as stored, not always right):")
            lines += [f"  - {t}" + (f" ({kind})" if kind else "") for t, kind in item["recorded"]]
        else:
            lines.append("Nothing recorded for this situation yet.")
        lines.append("")
        lines.append("Suggested steps to review:")
    else:
        lines.append(f"Situation: {item['situation']}")
        lines.append(f"Safety behavior the step goes without: {item['behavior']}")
        lines.append("")
        lines.append("Step sentence to review:")
    lines += [f"{n}. {text}" for n, text in enumerate(item["items"], 1)]
    return "\n".join(lines)


# --- Reading the answer --------------------------------------------------------------------------

@dataclass
class Verdict:
    said: str | None                       # what the reviewer said: show, dont_show, or None
    broken: list[tuple[str, str]] = field(default_factory=list)    # (rule id, reason)
    opinions: list[tuple[str, str]] = field(default_factory=list)  # (what it named, reason)

    @property
    def verdict(self) -> str | None:
        """The verdict that counts: dont_show only with a broken rule. None if unanswered."""
        if self.said is None and not self.broken:
            return None
        return DONT_SHOW if self.broken else SHOW

    @property
    def opinion_only(self) -> bool:
        """The reviewer said dont_show, and had nothing but opinions to back it."""
        return self.said == DONT_SHOW and not self.broken

    @property
    def show_with_broken_rule(self) -> bool:
        """The reviewer said show, and named a broken rule anyway. Counted as dont_show."""
        return self.said == SHOW and bool(self.broken)


@dataclass
class Review:
    concern: str
    feature: str
    checked: bool
    verdicts: list[Verdict] | None   # one per item; None when the answer could not be read
    error: str | None = None


def _json_text(raw: str) -> str:
    raw = raw.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return raw.strip()


def judge(reviewer: Reviewer, raw: str, n_items: int) -> list[Verdict] | None:
    """Turn the reviewer's reply into one Verdict per item, applying the rule-naming rule.

    None when the reply is not the JSON asked for. An item the reply leaves out gets
    Verdict(None), so a skipped item is counted as unanswered rather than shown.
    """
    try:
        data = json.loads(_json_text(raw))
        entries = data["items"]
        if not isinstance(entries, list):
            return None
    except (ValueError, KeyError, TypeError):
        return None
    out = [Verdict(None) for _ in range(n_items)]
    for pos, entry in enumerate(entries):
        if not isinstance(entry, dict):
            continue
        n = entry.get("n", pos + 1)
        if not isinstance(n, int) or not 1 <= n <= n_items:
            continue
        said = entry.get("verdict")
        v = Verdict(said if said in (SHOW, DONT_SHOW) else None)
        for obj in entry.get("objections") or []:
            if not isinstance(obj, dict):
                continue
            rule = str(obj.get("rule") or "").strip().lower()
            reason = str(obj.get("reason") or "").strip()
            (v.broken if rule in reviewer.rules else v.opinions).append((rule or "none", reason))
        out[n - 1] = v
    return out


def _text(message) -> str:
    # Opus 5.5 and Sonnet 5.5 always think, so the first block can be a thinking block.
    return "".join(getattr(b, "text", "") for b in message.content
                   if getattr(b, "type", "text") == "text")


def review(reviewer: Reviewer, client, item: dict) -> Review:
    """Ask one reviewer about one item. `client` is the runner's MeteredClient, which counts
    spending and stops at the limit (a BudgetExceeded is not caught here).

    No temperature: these models take none. No fallback model on a refusal: a fallback could be
    the feature's own model. A refusal is recorded as an error.
    """
    if item["feature"] != reviewer.feature:
        raise ValueError(f"a {reviewer.feature} reviewer was given a {item['feature']} item")
    msg = client.messages.create(
        model=reviewer.model,
        max_tokens=MAX_TOKENS,
        system=reviewer.system,
        messages=[{"role": "user", "content": message(item)}],
        # The pinned SDK (0.69) predates `output_config`, so it goes in the body.
        extra_body={"output_config": {"effort": EFFORT}},
    )
    base = dict(concern=reviewer.concern, feature=reviewer.feature, checked=reviewer.checked)
    if getattr(msg, "stop_reason", None) == "refusal":
        return Review(**base, verdicts=None, error="refusal")
    verdicts = judge(reviewer, _text(msg), len(item["items"]))
    return Review(**base, verdicts=verdicts, error=None if verdicts is not None else "unreadable")


def combined(reviews: list[Review], index: int) -> str | None:
    """All reviewers together, for one item: dont_show if any of them found a broken rule, show if
    all answered and none did, None if any reviewer gave no verdict."""
    verdicts = [r.verdicts[index].verdict if r.verdicts else None for r in reviews]
    if DONT_SHOW in verdicts:
        return DONT_SHOW
    return None if None in verdicts or not verdicts else SHOW


def engine_hook(reviewer: Reviewer, client, to_item):
    """A reviewer in the shape the runner's engine takes (`run_cases(..., reviewers=[...])`):
    a callable on (case, prepared, parsed) returning a dict. `to_item` builds the item from those."""
    def hook(case, prepared, parsed) -> dict:
        r = review(reviewer, client, to_item(case, prepared, parsed))
        return {
            "concern": r.concern, "checked": r.checked, "error": r.error,
            "verdicts": None if r.verdicts is None else [
                {"verdict": v.verdict, "opinion_only": v.opinion_only,
                 "broken": [rule for rule, _ in v.broken],
                 "opinions": len(v.opinions)} for v in r.verdicts
            ],
        }
    return hook
