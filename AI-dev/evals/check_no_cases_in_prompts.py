"""Fail if text from a test case appears in the app's AI prompts.

A case copied into a prompt stops testing anything: the model recites it back and the score goes up
for no reason. It has happened three times
(docs/solutions/eval-cases-burned-by-putting-them-in-the-prompt.md). Plan:
docs/plans/ai-quality-testing.md, "Rules that keep it honest".

How it decides:
- Prompt text is every string written in the Python code under `backend/app/`, docstrings left out.
  That is wider than the prompts, so a prompt built from a constant in another file is still seen.
  The parts of an f-string between its `{...}` slots count as separate strings.
- Case text is every string in the JSON files in the case folders, and the Markdown files in a
  `seed/` folder. Files that are not cases (saved prompt copies, run reports) are in SKIP_PATHS.
- Both are cut into lowercase words. RUN_WORDS words in a row found in both is a match.

What it cannot see: a case reworded on its way into the prompt. It finds copies, not paraphrases.

Needs no API key and nothing installed beyond Python 3.10. Run from anywhere:

    python3 -I AI-dev/evals/check_no_cases_in_prompts.py

Exit code 1 and a list of matches when a case not in ALLOWED is in a prompt; 0 otherwise.
"""
from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

PROMPT_DIRS = ["backend/app"]

CASE_DIRS = [
    "AI-dev/evals",
    "AI-dev/Extraction Loop",
    "AI-dev/Ladder Eval",
    "AI-dev/Arrow Eval",
    "backend/evals",
]

# How many words in a row make a match. Set on the cases and prompts as they were on 2026-10-19.
# 7 is the most that still finds all five known downward arrow cases (draft-08 shares exactly 7).
# At 6, the arrow prompt's own template, "what will happen if you feel", matches real arrow cases
# that were never copied in.
RUN_WORDS = 7

# Files in the case folders that are not test cases.
SKIP_PATHS = [
    # Each extraction run saves the prompt it tried and the model's answers. Prompt copies and
    # model output, not cases.
    "AI-dev/Extraction Loop/float_harness/runs/",
    "AI-dev/Extraction Loop/float_harness/review/outputs_",
    # The preliminary report's empty case: placeholder text only.
    "backend/evals/preliminary_report/cases/_TEMPLATE.json",
]

# Cases known to be in a prompt and allowed to stay there for now. Only these may match. Each is
# `<case file>#<case id>`.
#
# The downward arrow prompt (NEXT_PROBE_SYSTEM_PROMPT, backend/app/api/routers/downward_arrows.py)
# uses five of the made-up arrow cases as its worked examples. docs/plans/ai-quality-testing.md
# records that they no longer test anything. They stay in the prompt until the downward arrow work
# is picked up again. Do not add to this list to make CI pass: take the case out of the prompt, or
# ask Peter.
ALLOWED = {
    "AI-dev/Arrow Eval/cases_draft.json#draft-07",
    "AI-dev/Arrow Eval/cases_draft.json#draft-08",
    "AI-dev/Arrow Eval/cases_draft.json#draft-12",
    "AI-dev/Arrow Eval/cases_draft.json#draft-13",
    "AI-dev/Arrow Eval/cases_draft.json#draft-15",
    # Two real arrow chains supply the same prompt's example of a bad question ("if THEY don't
    # want to hang out with you"). Allowed for the same reason as the five above (Peter,
    # 2026-10-19).
    "AI-dev/Arrow Eval/cases.json#3",
    "AI-dev/Arrow Eval/cases.json#4",
    # The other way round: this made-up family quotes the extraction prompt's definition of
    # avoidance in its notes. A case copying the prompt does not leak the case (Peter, 2026-10-19).
    "AI-dev/evals/pool/families/fam-edge-03.json#fam-edge-03",
}

_WORD = re.compile(r"[a-z0-9]+(?:'[a-z0-9]+)*")


def words(text: str) -> list[str]:
    """Lowercase words, punctuation dropped. Curly apostrophes become straight so "I’ll" = "I'll"."""
    return _WORD.findall(text.lower().replace("’", "'").replace("‘", "'"))


def runs(w: list[str], n: int) -> set[tuple[str, ...]]:
    return {tuple(w[i:i + n]) for i in range(len(w) - n + 1)}


@dataclass(frozen=True)
class Text:
    where: str  # "file#case" for a case, "file:line" for a prompt
    text: str


# ---- Prompt text ----------------------------------------------------------------------------

def _docstrings(tree: ast.AST) -> set[int]:
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            first = node.body[0] if node.body else None
            if isinstance(first, ast.Expr) and isinstance(first.value, ast.Constant) \
                    and isinstance(first.value.value, str):
                found.add(id(first.value))
    return found


def strings_in_python(source: str, label: str) -> list[Text]:
    """Every string literal in the source except docstrings."""
    tree = ast.parse(source)
    skip = _docstrings(tree)
    out = []
    for node in ast.walk(tree):
        if isinstance(node, ast.JoinedStr):
            # Its constant parts are reached again by the walk; mark them so they count once.
            skip.update(id(part) for part in node.values)
            out.extend(Text(f"{label}:{node.lineno}", part.value) for part in node.values
                       if isinstance(part, ast.Constant) and isinstance(part.value, str))
        elif isinstance(node, ast.Constant) and isinstance(node.value, str) and id(node) not in skip:
            out.append(Text(f"{label}:{node.lineno}", node.value))
    return out


def prompt_texts(root: Path, dirs: list[str] = PROMPT_DIRS) -> list[Text]:
    out = []
    for d in dirs:
        for path in sorted((root / d).rglob("*.py")):
            label = path.relative_to(root).as_posix()
            out.extend(strings_in_python(path.read_text(encoding="utf-8"), label))
    return out


# ---- Case text ------------------------------------------------------------------------------

def _case_id(item: dict, index: int) -> str:
    for key in ("id", "case_id", "key", "name"):
        if isinstance(item.get(key), (str, int)):
            return str(item[key])
    return str(index)


def _strings(value):
    if isinstance(value, str):
        yield value
    elif isinstance(value, list):
        for v in value:
            yield from _strings(v)
    elif isinstance(value, dict):
        for v in value.values():
            yield from _strings(v)


def strings_in_json(data, label: str) -> list[Text]:
    """Each case's strings, labelled with the case's id so a match names the case."""
    if isinstance(data, dict):
        # A file is one case, or holds its cases in a list under "cases" or "items".
        listed = next((data[k] for k in ("cases", "items") if isinstance(data.get(k), list)), None)
        if listed is None:
            return [Text(f"{label}#{_case_id(data, 0)}", s) for s in _strings(data)]
        data = listed
    if not isinstance(data, list):
        return []
    out = []
    for i, item in enumerate(data):
        where = f"{label}#{_case_id(item, i) if isinstance(item, dict) else i}"
        out.extend(Text(where, s) for s in _strings(item))
    return out


def case_texts(root: Path, dirs: list[str] = CASE_DIRS,
               skip_paths: list[str] = SKIP_PATHS) -> list[Text]:
    out = []
    for d in dirs:
        base = root / d
        if not base.exists():
            continue
        for path in sorted(base.rglob("*")):
            label = path.relative_to(root).as_posix()
            if not path.is_file() or any(label.startswith(p) for p in skip_paths):
                continue
            if path.suffix == ".json":
                out.extend(strings_in_json(json.loads(path.read_text(encoding="utf-8")), label))
            elif path.suffix == ".md" and "/seed/" in label:
                # Dr. Walker's ladders, and the drafts written against them: rung cases.
                out.append(Text(label, path.read_text(encoding="utf-8")))
    return out


# ---- The check ------------------------------------------------------------------------------

@dataclass(frozen=True, order=True)
class Match:
    case: str
    prompt: str
    words: str  # the longest stretch of words the two share


def find_matches(prompts: list[Text], cases: list[Text], n: int = RUN_WORDS) -> list[Match]:
    """One match per (case, prompt string) pair that shares n words in a row."""
    prompt_words = [words(p.text) for p in prompts]
    index: dict[tuple[str, ...], set[int]] = {}
    for i, w in enumerate(prompt_words):
        for r in runs(w, n):
            index.setdefault(r, set()).add(i)

    best: dict[tuple[str, str], str] = {}
    for c in cases:
        cw = words(c.text)
        hits = set().union(*(index.get(r, set()) for r in runs(cw, n)))
        for i in hits:
            pw = prompt_words[i]
            m = SequenceMatcher(None, cw, pw, autojunk=False).find_longest_match(0, len(cw), 0, len(pw))
            shared = " ".join(cw[m.a:m.a + m.size])
            key = (c.where, prompts[i].where)
            if len(shared) > len(best.get(key, "")):
                best[key] = shared
    return sorted(Match(case, prompt, shared) for (case, prompt), shared in best.items())


def _print(matches: list[Match]) -> None:
    for m in matches:
        print(f"  {m.case}\n      in {m.prompt}: \"{m.words}\"")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--root", type=Path, default=REPO, help="repository root")
    args = parser.parse_args(argv)

    cases = case_texts(args.root)
    matches = find_matches(prompt_texts(args.root), cases)
    allowed = [m for m in matches if m.case in ALLOWED]
    bad = [m for m in matches if m.case not in ALLOWED]

    print(f"Checked {len({c.where for c in cases})} cases against the strings in "
          f"{', '.join(PROMPT_DIRS)}, {RUN_WORDS} words in a row.")
    if allowed:
        print(f"\nKnown and allowed for now ({len({m.case for m in allowed})} cases, see ALLOWED):")
        _print(allowed)
    if bad:
        print(f"\nFAIL: {len({m.case for m in bad})} case(s) found in a prompt:")
        _print(bad)
        print("\nA case in a prompt no longer tests anything. Write the rule the case teaches into "
              "the prompt, not the case.\nSee docs/solutions/"
              "eval-cases-burned-by-putting-them-in-the-prompt.md.")
        return 1
    print("\nOK: no other case is in a prompt.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
