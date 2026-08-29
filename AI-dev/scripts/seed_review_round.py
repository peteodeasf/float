"""Create a review round and a link for each reviewer.

    python "AI-dev/scripts/seed_review_round.py" ladder-v1 "AI-dev/Ladder Eval/review_sheet_source.json" "Dr. Walker" "Peter"

Writes to whatever DATABASE_URL points at — which is PRODUCTION unless you say otherwise. That is
the point here: the link has to work for someone who is not on this machine.

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


def setting(key: str, default: str = "") -> str:
    for line in ENV.read_text().splitlines():
        if line.startswith(key + "="):
            return line.split("=", 1)[1].strip()
    return default


async def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__)
        return 2
    slug, source, names = sys.argv[1], pathlib.Path(sys.argv[2]), sys.argv[3:]

    import asyncpg
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
    base = setting("PUBLIC_BASE_URL") or setting("BASE_URL", "http://localhost:8000")
    conn = await asyncpg.connect(url)
    try:
        row = await conn.fetchrow("select id from review_rounds where slug=$1", slug)
        if row is None:
            row = await conn.fetchrow(
                """insert into review_rounds (slug, title, instructions, items)
                   values ($1, $2, $3, $4::jsonb) returning id""",
                slug,
                "Would you show this suggestion to a child?",
                "Mark every one <b>Show</b> or <b>Don&rsquo;t show</b>. Saved as you go — "
                "close the tab whenever you like and come back to the same link.",
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
