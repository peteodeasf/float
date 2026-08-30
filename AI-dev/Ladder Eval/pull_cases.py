"""Pull real situations out of the database to use as ladder-generation cases.

    python "AI-dev/Ladder Eval/pull_cases.py"

Reads DATABASE_URL from backend/.env. READ ONLY - one SELECT, writes a local file.

A case is a situation the feature would be asked to break down: its name, its distress rating, and
the rungs the child already has under it. Nothing is a test until a human has said what a good
breakdown of it looks like, so every case lands with "status": "needs_review" and no target.

Two shapes are deliberately kept, because telling them apart is the job:

  "behaviour rungs"  the existing rungs are things the child DOES to feel safer
                     ("wears headphones so nobody talks to her")
  "bare"             a situation with nothing under it yet, or only a blanket "avoids X"

A model that confuses "a narrower version of this situation" with "a thing you do in it" will pass
on one shape and fail on the other, which is exactly what the set has to be able to show.

Plan: docs/plans/ladder-generation.md


WRITES A FILE OF PATIENTS' OWN WORDS. That file is gitignored on purpose: once a real child's
situation is committed it is in the repository permanently. Today every patient in the database is
fake, so this is safe. Before the first REAL PATIENT, this script needs a decision about whether it
should run at all, and where its output is allowed to live. See docs/backlog.md, HIPAA item 6.
"""
import asyncio
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
ENV_FILE = HERE.parent.parent / "backend" / ".env"
OUT = HERE / "cases_review.json"

MIN_RATING, MAX_RATING = 1, 10


sys.path.insert(0, str(HERE.parent / "scripts"))
from db import connect  # noqa: E402


def shape_of(rungs: list[dict], situation_name: str) -> str:
    """A rung that is just "Avoids <the situation>" is the placeholder every situation gets, not a
    real breakdown. A situation with only that is still bare."""
    real = [r for r in rungs
            if r["name"].strip().lower() not in {f"avoids {situation_name.strip().lower()}"}]
    return "behaviour rungs" if real else "bare"


async def main() -> int:
    conn = await connect()
    try:
        rows = await conn.fetch("""
            select ts.id, ts.name, ts.description, ts.distress_thermometer_rating as dt,
                   ts.created_at
            from trigger_situations ts
            where coalesce(ts.is_placeholder, false) = false
              and ts.distress_thermometer_rating is not null
              and length(trim(ts.name)) > 3
            order by ts.created_at desc
        """)
        rungs_by_situation = {}
        for r in await conn.fetch("""
            select trigger_situation_id as sid, name, behavior_type,
                   distress_thermometer_when_refraining as dt
            from avoidance_behaviors
            where trigger_situation_id is not null
            order by distress_thermometer_when_refraining nulls last
        """):
            rungs_by_situation.setdefault(r["sid"], []).append({
                "name": r["name"],
                "behavior_type": r["behavior_type"],
                "distress_rating": float(r["dt"]) if r["dt"] is not None else None,
            })
    finally:
        await conn.close()

    seen, cases = set(), []
    for row in rows:
        # The same situation name recurs across test patients; one of each is enough.
        key = (row["name"].strip().lower(), float(row["dt"]))
        if key in seen:
            continue
        seen.add(key)
        rungs = rungs_by_situation.get(row["id"], [])
        cases.append({
            "id": f"sit-{str(row['id'])[:8]}",
            "situation": row["name"].strip(),
            "description": (row["description"] or "").strip() or None,
            "distress_rating": float(row["dt"]),
            "existing_rungs": rungs,
            "shape": shape_of(rungs, row["name"]),
            "source_date": str(row["created_at"].date()),
            "status": "needs_review",
            "target_breakdown": None,
        })

    OUT.write_text(json.dumps(cases, indent=2, ensure_ascii=False) + "\n")
    by_shape = {}
    for c in cases:
        by_shape[c["shape"]] = by_shape.get(c["shape"], 0) + 1
    print(f"{len(rows)} rated situations, {len(cases)} after removing duplicate names")
    print("by shape:", by_shape)
    print(f"-> {OUT.name}")
    print("\nNone of these is a test yet. Each needs a target_breakdown - what a good set of")
    print("narrower versions looks like - confirmed by Dr. Walker before it means anything.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
