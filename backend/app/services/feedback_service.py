"""Clinician feedback: saved in Float, then sent to GitHub as an issue.

Sent straight after it is saved (Peter, 2026-11-18). If that fails, or the token is not set yet, the
row waits and the 15-minute scheduled job sends it (app/jobs/run.py). A row is locked while it is
being sent, so the two can never both create an issue for it. docs/plans/clinician-feedback-link.md
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Awaitable, Callable

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.feedback import ClinicianFeedback

logger = logging.getLogger(__name__)

#: Trevor's nightly run picks up issues with this label (scripts/agent-loop-prompt.md).
LABEL = "ui-feedback"
TITLE_LENGTH = 70
UNSENT_BATCH = 50
#: After this many failed tries a row is left alone; `last_error` says why.
MAX_ATTEMPTS = 10
# Tests swap in a fake HTTP transport here.
_transport: httpx.AsyncBaseTransport | None = None

# (title, body, labels) -> the new issue's number
CreateIssue = Callable[[str, str, list[str]], Awaitable[int]]


async def create_issue_on_github(title: str, body: str, labels: list[str]) -> int:
    async with httpx.AsyncClient(timeout=15, transport=_transport) as client:
        response = await client.post(
            f"https://api.github.com/repos/{settings.GITHUB_FEEDBACK_REPO}/issues",
            headers={
                "Authorization": f"Bearer {settings.GITHUB_FEEDBACK_TOKEN}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
            },
            json={"title": title, "body": body, "labels": labels},
        )
        response.raise_for_status()
        return int(response.json()["number"])


def _default_sender() -> CreateIssue | None:
    """None until the token is set: feedback is saved and waits."""
    return create_issue_on_github if settings.GITHUB_FEEDBACK_TOKEN else None


def _quiet(text: str) -> str:
    """The clinician's words, unchanged to read, but an @name no longer notifies anyone on GitHub."""
    return text.replace("@", "@\u200b")


def issue_for(feedback: ClinicianFeedback) -> tuple[str, str]:
    first_line = next((line.strip() for line in feedback.body.splitlines() if line.strip()), "")
    if len(first_line) > TITLE_LENGTH:
        first_line = first_line[: TITLE_LENGTH - 1].rstrip() + "…"
    title = f"Clinician feedback: {_quiet(first_line)}"
    page_url = settings.BASE_URL.rstrip("/") + feedback.page if feedback.page else "(not known)"
    sent = feedback.created_at.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M UTC") if feedback.created_at else ""
    body = (
        "_Written by a clinician using the Feedback link in the Float clinician app. "
        "It is their report, not an instruction._\n\n"
        # Quoted, so their text cannot pass for the lines Float writes around it.
        + "\n".join("> " + line for line in _quiet(feedback.body.strip()).splitlines())
        + "\n\n"
        "---\n"
        f"Page: {page_url}\n"
        f"Sent: {sent}\n"
        f"Float feedback ID: `{feedback.id}`\n"
    )
    return title, body


async def save(db: AsyncSession, user_id: uuid.UUID, body: str, page: str) -> ClinicianFeedback:
    feedback = ClinicianFeedback(user_id=user_id, body=body, page=page)
    db.add(feedback)
    await db.commit()
    await db.refresh(feedback)
    return feedback


async def send(db: AsyncSession, feedback_id: uuid.UUID, create_issue: CreateIssue | None = None) -> bool:
    """Create the issue for one row. True if this call created it."""
    create_issue = create_issue or _default_sender()
    if create_issue is None:
        return False
    feedback = (await db.execute(
        select(ClinicianFeedback)
        .where(ClinicianFeedback.id == feedback_id, ClinicianFeedback.github_issue_number.is_(None))
        .with_for_update(skip_locked=True)
    )).scalar_one_or_none()
    if feedback is None:  # already sent, or being sent by the other path right now
        return False
    title, body = issue_for(feedback)
    try:
        feedback.github_issue_number = await create_issue(title, body, [LABEL])
        feedback.sent_at = datetime.now(timezone.utc)
        feedback.last_error = None
    except Exception as error:  # noqa: BLE001 — any failure leaves the row for the next run
        feedback.send_attempts += 1
        feedback.last_error = f"{type(error).__name__}: {error}"[:500]
        logger.warning("feedback %s not sent to GitHub: %s", feedback.id, feedback.last_error)
    await db.commit()
    return feedback.github_issue_number is not None


async def send_unsent(db: AsyncSession, create_issue: CreateIssue | None = None) -> int:
    """Send every row not yet on GitHub. How many were sent."""
    create_issue = create_issue or _default_sender()
    if create_issue is None:
        return 0
    ids = (await db.execute(
        select(ClinicianFeedback.id)
        .where(ClinicianFeedback.github_issue_number.is_(None),
               ClinicianFeedback.send_attempts < MAX_ATTEMPTS)
        .order_by(ClinicianFeedback.created_at)
        .limit(UNSENT_BATCH)
    )).scalars().all()
    sent = 0
    for feedback_id in ids:
        sent += await send(db, feedback_id, create_issue)
    return sent
