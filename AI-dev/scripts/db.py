"""Reaching the production database from a laptop, now that it is not on the internet.

The database came off the public internet on 2026-08-29 — no TCP proxy, no public domain. The only
way in is Railway's private network, so a script on your machine needs a tunnel.

    railway ssh keys add                                  # once, per machine
    railway connect Postgres --tunnel-only --port 55433

That prints the connection details and holds the tunnel open until Ctrl+C. Leave it running in one
terminal and run scripts in another.

The tunnel goes over SSH, so Railway needs a public key for this machine — that is the first
command, and it only has to be done once. Without it the second command says
"No registered SSH keys found".

Every script here calls `database_url()`, which looks in this order:

1. `FLOAT_DB_URL` in the environment — set this to the tunnel's URL.
2. `--db=<url>` on the command line.
3. `backend/.env`, which still holds the old public endpoint and no longer works. Kept only so the
   error can say so plainly rather than timing out.

`connect()` wraps asyncpg and turns a refused connection into the instructions above, because the
raw error is a timeout that tells you nothing.
"""
import os
import pathlib
import sys

ENV_FILE = pathlib.Path(__file__).resolve().parent.parent.parent / "backend" / ".env"

TUNNEL_HELP = """
Cannot reach the database.

It is no longer on the public internet (closed 2026-08-29), so this needs a tunnel. In another
terminal:

    railway connect Postgres --tunnel-only --port 55433

(first time on this machine: railway ssh keys add)

That prints a connection URL and stays open. Then, in this terminal:

    export FLOAT_DB_URL='postgresql://postgres:PASSWORD@127.0.0.1:55433/railway'

using the password it printed. Then run this script again.
"""


def _from_env_file() -> str | None:
    if not ENV_FILE.exists():
        return None
    for line in ENV_FILE.read_text().splitlines():
        if line.startswith("DATABASE_URL="):
            return line.split("=", 1)[1].strip()
    return None


def database_url() -> str:
    """Where to connect, as a plain postgresql:// url."""
    for candidate in (
        os.environ.get("FLOAT_DB_URL"),
        next((a.split("=", 1)[1] for a in sys.argv[1:] if a.startswith("--db=")), None),
        _from_env_file(),
    ):
        if candidate:
            return candidate.replace("postgresql+asyncpg://", "postgresql://")
    raise SystemExit(TUNNEL_HELP)


def points_at_the_dead_endpoint(url: str) -> bool:
    """The old public proxy. Worth naming, because it is what backend/.env still holds."""
    return "proxy.rlwy.net" in url or "railway.app" in url


async def connect(timeout: int = 15):
    """asyncpg.connect, but a refused connection explains itself."""
    import asyncpg

    url = database_url()
    if points_at_the_dead_endpoint(url):
        print("The URL points at the old public endpoint, which was closed on 2026-08-29.")
        raise SystemExit(TUNNEL_HELP)
    try:
        return await asyncpg.connect(url, timeout=timeout)
    except Exception as e:
        print(f"{type(e).__name__}: {str(e)[:120]}")
        raise SystemExit(TUNNEL_HELP)
