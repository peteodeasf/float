"""Test fixtures.

**Read this before changing the database wiring.**

Tests run against a real Postgres: Railway project `float`, environment `test`, a separate
instance from production. The connection string lives in `backend/.env.test`, which is gitignored.

Railway names every database it creates `railway`, so the test database has the SAME NAME as the
production one. A name check is therefore worthless here — the guard below compares HOSTS, and
refuses to run if the target host is the production host or if TEST_DATABASE_URL is missing
entirely. There is no fallback that derives a test URL from the production one: if the file is
absent, tests fail to start rather than quietly reaching for something.

The failure mode is "tests refuse to start", never "tests wrote to production". Do not weaken this
to make something pass.
"""
import os
from pathlib import Path
from urllib.parse import urlsplit

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

ENV_FILE = Path(__file__).resolve().parents[1] / ".env.test"


def _load_test_url() -> str:
    url = os.environ.get("TEST_DATABASE_URL")
    if not url and ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line.startswith("TEST_DATABASE_URL="):
                url = line.split("=", 1)[1].strip()
                break
    if not url:
        raise RuntimeError(
            "TEST_DATABASE_URL is not set and backend/.env.test is missing. "
            "Tests will not guess a database. See the Railway `test` environment."
        )
    return url


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


@pytest_asyncio.fixture
async def engine():
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
