"""The migrations must have exactly one head.

Railway runs `alembic upgrade head` before every deploy (railway.toml). With two heads that command
fails, the deploy fails, and production keeps running the old code. This happened on 2026-10-22,
when two PRs built in parallel each added a migration on the same parent. The fix is a merge
migration (`alembic merge`). docs/solutions/two-migration-heads-fail-the-deploy.md
"""
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

BACKEND = Path(__file__).resolve().parents[1]


# Why: catches two heads in CI, before the merge to main makes Railway's deploy fail.
def test_migrations_have_one_head():
    config = Config(str(BACKEND / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND / "migrations"))
    heads = ScriptDirectory.from_config(config).get_heads()
    assert len(heads) == 1, f"migrations have {len(heads)} heads: {heads}. Add a merge migration (alembic merge)."
