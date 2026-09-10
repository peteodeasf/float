"""Run what is due, then exit.

Started every 15 minutes by the floatcbt-jobs service on Railway, whose start command and schedule
are set on the service itself. Railway expects it to finish and close its connections.
docs/plans/scheduled-jobs.md
"""
import asyncio
import logging
from datetime import datetime, timezone

from app.core.database import AsyncSessionLocal, engine
from app.services.reminder_jobs import run_due

logging.basicConfig(level=logging.INFO)


async def main() -> None:
    try:
        async with AsyncSessionLocal() as db:
            counts = await run_due(db, datetime.now(timezone.utc))
        print(f"scheduled jobs done: {counts}", flush=True)
    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
