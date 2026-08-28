"""Test fixtures.

**Read this before changing the database wiring.**

Tests run against a local Postgres in Docker — see `docker-compose.test.yml`:

    docker compose -f docker-compose.test.yml up -d

The schema is built by running the real Alembic migrations, not by `create_all` from the models.
That is deliberate: Railway runs `alembic upgrade head` on every deploy, so a migration that is
broken in a way the models do not capture would otherwise pass every test and fail in production.
Building from migrations means the migrations are tested too.

The guard below compares HOSTS and refuses to run against the production host. It matters even
with a local database: `.env` points at production, so a careless change to the URL resolution
would send a test run straight at real data. The failure mode is "tests refuse to start", never
"tests wrote to production". Do not weaken it to make something pass.
"""
import os
from pathlib import Path
from urllib.parse import urlsplit

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

BACKEND_DIR = Path(__file__).resolve().parents[1]
ENV_FILE = BACKEND_DIR / ".env.test"

# The local container from docker-compose.test.yml. Overridable by TEST_DATABASE_URL or
# backend/.env.test — CI will set the environment variable.
DEFAULT_TEST_URL = "postgresql+asyncpg://float:float@localhost:55432/float_test"


def _load_test_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url and ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line.startswith("TEST_DATABASE_URL="):
                url = line.split("=", 1)[1].strip()
                break
    return url or DEFAULT_TEST_URL


def _host(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.hostname}:{parts.port}"


def _assert_not_production(url: str) -> None:
    prod = str(settings.DATABASE_URL)
    if url == prod:
        raise RuntimeError("Refusing to run tests: TEST_DATABASE_URL is the production URL.")
    if _host(url) == _host(prod):
        raise RuntimeError(
            f"Refusing to run tests: test host {_host(url)} is the production host. "
            "The test database must be a separate instance."
        )


TEST_URL = _load_test_url()
_assert_not_production(TEST_URL)


def _sync_url(url: str) -> str:
    return url.replace("+asyncpg", "")


# NOT autouse: the `engine` fixture below depends on it, so anything that touches the database
# gets it, while pure tests (the arrow-probe checks, the case-file validators) run with no Docker
# container at all.
@pytest.fixture(scope="session")
def migrated_schema():
    """Bring the test database to the current migration head, once per run.

    Uses the real migrations rather than `create_all`, so a broken migration fails here instead
    of on deploy.
    """
    from alembic import command
    from alembic.config import Config

    _assert_not_production(TEST_URL)
    # migrations/env.py reads ALEMBIC_DATABASE_URL first; setting it on the Config alone is not
    # enough, because env.py rewrites sqlalchemy.url when it loads.
    previous = os.environ.get("ALEMBIC_DATABASE_URL")
    os.environ["ALEMBIC_DATABASE_URL"] = TEST_URL
    try:
        cfg = Config(str(BACKEND_DIR / "alembic.ini"))
        cfg.set_main_option("script_location", str(BACKEND_DIR / "migrations"))
        cfg.set_main_option("sqlalchemy.url", TEST_URL)
        command.upgrade(cfg, "head")
        yield
    finally:
        if previous is None:
            os.environ.pop("ALEMBIC_DATABASE_URL", None)
        else:
            os.environ["ALEMBIC_DATABASE_URL"] = previous


@pytest_asyncio.fixture
async def engine(migrated_schema):
    # Function-scoped deliberately. asyncpg binds connections to the event loop that created
    # them, and pytest-asyncio gives each test its own loop — a session-scoped engine hands the
    # second test a connection from the first test's loop and fails with "attached to a
    # different loop". A fresh pool per test costs a few milliseconds and removes the class.
    _assert_not_production(TEST_URL)
    eng = create_async_engine(TEST_URL, echo=False, pool_pre_ping=True)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def db(engine) -> AsyncSession:
    """A session whose work is always rolled back.

    Each test runs inside an outer transaction that is discarded afterwards, so tests never see
    each other's rows and the database does not accumulate junk between runs.
    """
    async with engine.connect() as conn:
        trans = await conn.begin()
        maker = async_sessionmaker(bind=conn, expire_on_commit=False, class_=AsyncSession)
        session = maker()
        try:
            yield session
        finally:
            await session.close()
            await trans.rollback()


# ── The API, called in memory ─────────────────────────────────────────────────
# The app is a Python object; tests call it directly through an in-process transport. No server
# starts, nothing is deployed, and it runs at the same speed as the service tests.
#
# Only TWO dependencies are swapped: the database session (so it uses the test database) and the
# signed-in user. `get_practitioner_context` is deliberately NOT overridden — it does a real lookup
# and raises 403 when a user has no practitioner profile, and that is behaviour worth exercising.
@pytest_asyncio.fixture
async def api(db):
    import httpx
    from app.main import app
    from app.core.database import get_db
    from app.core.dependencies import get_current_user

    state = {"user": None}

    async def _db_override():
        yield db

    async def _user_override():
        from fastapi import HTTPException, status as http_status
        if state["user"] is None:
            raise HTTPException(status_code=http_status.HTTP_401_UNAUTHORIZED, detail="Not signed in")
        return state["user"]

    app.dependency_overrides[get_db] = _db_override
    app.dependency_overrides[get_current_user] = _user_override

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # `client.sign_in_as(user)` decides who the request is from; leave it unset for anonymous.
        client.sign_in_as = lambda user: state.__setitem__("user", user)  # type: ignore[attr-defined]
        yield client

    app.dependency_overrides.clear()


# ── Nothing leaves the machine during tests ───────────────────────────────────
# `.env` carries live Twilio and Resend credentials, so a route that sends a text or an email
# would really send one. Autouse, so it applies to every test whether or not it asks for it.
@pytest.fixture(autouse=True)
def no_outbound(monkeypatch):
    """Block real SMS and email, and record what would have been sent."""
    sent = {"sms": [], "email": []}

    class _BlockedTwilio:
        def __init__(self, *a, **kw):
            pass

        class messages:  # noqa: N801 - mirrors the Twilio client shape
            @staticmethod
            def create(**kw):
                sent["sms"].append(kw)
                raise AssertionError("a test tried to send a real SMS")

    class _BlockedResend:
        @staticmethod
        def send(payload):
            sent["email"].append(payload)
            raise AssertionError("a test tried to send a real email")

    try:
        import twilio.rest
        monkeypatch.setattr(twilio.rest, "Client", _BlockedTwilio, raising=False)
    except ImportError:
        pass
    try:
        import resend
        monkeypatch.setattr(resend, "Emails", _BlockedResend, raising=False)
        monkeypatch.setattr(resend, "api_key", "blocked-in-tests", raising=False)
    except ImportError:
        pass

    return sent
