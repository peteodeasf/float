"""Pull real downward-arrow chains out of the database and turn them into review candidates.

    python "AI-dev/Arrow Eval/harvest.py"

Reads DATABASE_URL from backend/.env. READ ONLY - it runs one SELECT and writes a local file.

Every arrow is a chain of question/answer pairs. Each pair after the first becomes one candidate
case: everything the child said up to that point, plus the question the shipped prompt actually
asked next. Candidates land in `cases_review.json` with "status": "needs_review". Peter reads them,
writes a `target_question` where he disagrees with what was asked, and moves the good ones into
`cases.json`. Nothing is promoted automatically - a case is only worth something once a human has
said what the right question was.

Cases already in `cases.json` are skipped, matched on the situation and the child's last words.
"""
import asyncio
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ENV_FILE = HERE.parent.parent / "backend" / ".env"
OUT = HERE / "cases_review.json"

# The prompt was rewritten from the meaning question ("what would that mean about you?") to the
# consequence question on 2026-08-24. Anything asked before that date shows the OLD behaviour, so it
# is not evidence about the prompt as it stands - but it is useful as an example of what not to do.
CONSEQUENCE_REWRITE = "2026-08-24"

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
        if case["source_date"] < CONSEQUENCE_REWRITE:
            case["asked_by"] = "the old prompt, before the 2026-08-24 consequence rewrite"
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

    conn = await asyncpg.connect(database_url())
    try:
        rows = await conn.fetch("""
            select a.id, a.created_at, a.facilitated_by, a.arrow_steps, ts.name as situation
            from downward_arrows a
            left join trigger_situations ts on ts.id = a.trigger_situation_id
            where jsonb_array_length(a.arrow_steps) > 1
            order by a.created_at desc
        """)
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
    print(f"{len(rows)} arrows with more than one step ({junk} skipped as test rows)")
    print(f"{already} candidates already in cases.json")
    print(f"{len(fresh)} new candidates -> {OUT.name}")
    if fresh:
        print("\nReview them, add a target_question where the asked question was wrong,")
        print("then move the ones worth keeping into cases.json.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
