"""Create a review round and a link for each reviewer.

    python "AI-dev/scripts/seed_review_round.py" ladder-v1 "AI-dev/Ladder Eval/review_sheet_source.json" "Dr. Walker" "Peter"

Writes to PRODUCTION, which since 2026-08-29 needs a tunnel — see AI-dev/scripts/db.py. That is the
point here: the link has to work for someone who is not on this machine.

Prints one link per reviewer. Re-running with the same slug reuses the round and adds any reviewer
that is missing, so it is safe to run twice.
"""
import asyncio
import json
import pathlib
import secrets
import sys

HERE = pathlib.Path(__file__).resolve().parent
ENV = HERE.parent.parent / "backend" / ".env"
DEPLOYED = "https://floatcbt-production.up.railway.app"


sys.path.insert(0, str(HERE))
from db import connect  # noqa: E402


async def main() -> int:
    if len([a for a in sys.argv[1:] if not a.startswith("--")]) < 3:
        print(__doc__)
        return 2
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    slug, source, names = args[0], pathlib.Path(args[1]), args[2:]

    cases = json.loads(source.read_text())
    items = [{
        "key": c["id"],
        "situation": c["situation"],
        "rating": c.get("distress_rating"),
        "existing": c.get("existing_rungs") or [],
        "suggestions": c["suggestions"],
        "note": c.get("note"),
    } for c in cases]

    url = setting("DATABASE_URL").replace("postgresql+asyncpg://", "postgresql://")
    # NOT read from backend/.env: app.core.config.Settings rejects unknown keys, so an extra line
    # in that file stops the whole app booting. Pass --base= to override.
    base = next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--base=")), DEPLOYED)
    conn = await asyncpg.connect(url)
    try:
        row = await conn.fetchrow("select id from review_rounds where slug=$1", slug)
        if row is None:
            row = await conn.fetchrow(
                """insert into review_rounds (slug, title, instructions, items)
                   values ($1, $2, $3, $4::jsonb) returning id""",
                slug,
                "Would you show these sub-situation suggestions to a therapist / child?",
                "Review the situations below and the suggested sub-situations for each. Mark "
                "every one <b>Show</b> or <b>Don&rsquo;t show</b>.",
                json.dumps(items),
            )
            print(f"created round {slug} with {len(items)} situations, "
                  f"{sum(len(i['suggestions']) for i in items)} suggestions")
        else:
            print(f"round {slug} already exists")
        round_id = row["id"]

        for name in names:
            existing = await conn.fetchrow(
                "select token from review_reviewers where round_id=$1 and name=$2", round_id, name)
            token = existing["token"] if existing else secrets.token_urlsafe(32)
            if not existing:
                await conn.execute(
                    "insert into review_reviewers (round_id, name, token) values ($1,$2,$3)",
                    round_id, name, token)
            print(f"  {name:<14} {base}/review/{token}")
    finally:
        await conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
