"""Pull real downward-arrow chains out of the database and turn them into review candidates.

    python "AI-dev/Arrow Eval/harvest.py"
    python "AI-dev/Arrow Eval/harvest.py" --since=2026-09-01

Reads DATABASE_URL from backend/.env. READ ONLY - it runs one SELECT and writes a local file.

Every arrow is a chain of question/answer pairs. Each pair after the first becomes one candidate
case: everything the child said up to that point, plus the question the shipped prompt actually
asked next. Candidates land in `cases_review.json` with "status": "needs_review". Peter reads them,
writes a `target_question` where he disagrees with what was asked, and moves the good ones into
`cases.json`. Nothing is promoted automatically - a case is only worth something once a human has
said what the right question was.

Only arrows recorded on or after HARVEST_FROM are read. The chains before that were produced by
earlier versions of the prompt and are deliberately ignored. Cases already in `cases.json` are
skipped, matched on the situation and the child's last words.


WRITES A FILE OF PATIENTS' OWN WORDS. That file is gitignored on purpose: once a real child's
situation is committed it is in the repository permanently. Today every patient in the database is
fake, so this is safe. Before the first REAL PATIENT, this script needs a decision about whether it
should run at all, and where its output is allowed to live. See docs/backlog.md, HIPAA item 6.
"""
import asyncio
import json
import pathlib
import sys
from datetime import date

HERE = pathlib.Path(__file__).resolve().parent
ENV_FILE = HERE.parent.parent / "backend" / ".env"
OUT = HERE / "cases_review.json"

# Only arrows created on or after this date are harvested. Everything before it was asked by an
# earlier version of the prompt, so it says nothing about the prompt as it stands. Peter's call
# (2026-08-28): ignore the back catalogue, collect from here on.
HARVEST_FROM = "2026-08-28"

# Situations that are obviously someone testing the form rather than a real chain.
JUNK_SITUATIONS = {"test situation", "test", "asdf"}


def database_url() -> str:
    for line in ENV_FILE.read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip().replace("postgresql+asyncpg://", "postgresql://")
    raise SystemExit(f"No DATABASE_URL in {ENV_FILE}")


def pairs_of(arrow_steps) -> list[dict]:
    """Flatten a stored arrow into (question, answer) pairs.

    Two shapes exist in the data - older rows use "answer", newer ones "response" - and the first
    question is sometimes the literal string "Starting thought" rather than a question.
    """
    out = []
    for step in arrow_steps or []:
        answer = (step.get("response") or step.get("answer") or "").strip()
        question = (step.get("question") or "").strip()
        if answer:
            out.append({"question": question, "response": answer})
    return out


def key(situation: str, child_last_said: str) -> str:
    return f"{(situation or '').strip().lower()}|{' '.join(child_last_said.lower().split())}"


def candidates_from(row) -> list[dict]:
    pairs = pairs_of(json.loads(row["arrow_steps"]) if isinstance(row["arrow_steps"], str) else row["arrow_steps"])
    if len(pairs) < 2:
        return []          # nothing was asked after the opening, so there is no question to judge
    situation = row["situation"]
    opening = pairs[0]["question"]
    cases = []
    for i in range(1, len(pairs)):
        case = {
            "id": f"real-{str(row['id'])[:8]}-{i}",
            "situation": situation,
            "starting_thought": pairs[0]["response"],
            "steps_so_far": [{"question": p["question"], "response": p["response"]} for p in pairs[1:i]],
            "child_last_said": pairs[i - 1]["response"],
            "question_actually_asked": pairs[i]["question"],
            "source_date": str(row["created_at"].date()),
            "facilitated_by": row["facilitated_by"],
            "status": "needs_review",
        }
        if opening and opening.lower() != "starting thought":
            case["opening_question"] = opening
        cases.append(case)
    return cases


async def main() -> int:
    import asyncpg

    existing = set()
    live = HERE / "cases.json"
    if live.exists():
        for c in json.loads(live.read_text()):
            existing.add(key(c.get("situation", ""), c["child_last_said"]))

    since = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--since=")), HARVEST_FROM)
    since_date = date.fromisoformat(since)   # asyncpg wants a real date, not a string

    conn = await asyncpg.connect(database_url())
    try:
        rows = await conn.fetch("""
            select a.id, a.created_at, a.facilitated_by, a.arrow_steps, ts.name as situation
            from downward_arrows a
            left join trigger_situations ts on ts.id = a.trigger_situation_id
            where jsonb_array_length(a.arrow_steps) > 1
              and a.created_at >= $1
            order by a.created_at desc
        """, since_date)
    finally:
        await conn.close()

    fresh, already, junk = [], 0, 0
    for row in rows:
        if (row["situation"] or "").strip().lower() in JUNK_SITUATIONS:
            junk += 1
            continue
        for case in candidates_from(row):
            if key(case["situation"], case["child_last_said"]) in existing:
                already += 1
            else:
                fresh.append(case)

    OUT.write_text(json.dumps(fresh, indent=2) + "\n")
    print(f"arrows created on or after {since}: {len(rows)} with more than one step "
          f"({junk} skipped as test rows)")
    print(f"{already} candidates already in cases.json")
    print(f"{len(fresh)} new candidates -> {OUT.name}")
    if not fresh:
        print("\nNothing new. Arrows before " + since + " are deliberately ignored - they were asked")
        print("by an earlier prompt. Run this again once more chains have been recorded.")
    if fresh:
        print("\nReview them, add a target_question where the asked question was wrong,")
        print("then move the ones worth keeping into cases.json.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
