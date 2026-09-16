"""One-time setup links: how a new user chooses their own password.

docs/plans/clinician-practice-onboarding.md, "The setup link".
"""
import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.setup_link import SetupLink

LINK_LIFETIME = timedelta(days=7)


def _hash(token: str) -> str:
    # The token is 32 random bytes, so a plain SHA-256 is enough. A slow hash like bcrypt is for
    # passwords people choose, which are guessable.
    return hashlib.sha256(token.encode()).hexdigest()


def setup_url(token: str) -> str:
    # After a #, so the token is never sent to the web server and never lands in its logs.
    return f"{settings.BASE_URL}/setup#token={token}"


async def issue(
    db: AsyncSession,
    user_id: uuid.UUID,
    organization_id: uuid.UUID,
    purpose: str,
    created_by_user_id: uuid.UUID | None,
) -> str:
    """Make a new link for this user and return its token. Any earlier unused link stops working."""
    now = datetime.now(timezone.utc)
    await db.execute(
        update(SetupLink)
        .where(
            SetupLink.user_id == user_id,
            SetupLink.used_at.is_(None),
            SetupLink.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )
    token = secrets.token_urlsafe(32)
    db.add(SetupLink(
        user_id=user_id,
        organization_id=organization_id,
        purpose=purpose,
        token_hash=_hash(token),
        expires_at=now + LINK_LIFETIME,
        created_by_user_id=created_by_user_id,
    ))
    await db.flush()
    return token


async def find_usable(db: AsyncSession, token: str, lock: bool = False) -> SetupLink | None:
    """The link for this token, if it has not been used, replaced or expired."""
    if not token:
        return None
    query = select(SetupLink).where(
        SetupLink.token_hash == _hash(token),
        SetupLink.used_at.is_(None),
        SetupLink.revoked_at.is_(None),
        SetupLink.expires_at > datetime.now(timezone.utc),
    )
    if lock:
        # Two tabs submitting the same link at once: the second waits, then finds it used.
        query = query.with_for_update()
    return (await db.execute(query)).scalar_one_or_none()
