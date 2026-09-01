from datetime import datetime, timedelta, timezone
from typing import Any
import bcrypt
from jose import JWTError, jwt
from app.core.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))


def create_access_token(
    subject: str,
    additional_claims: dict[str, Any] = {},
    issued_at: datetime | None = None,
) -> str:
    now = issued_at or datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {
        "sub": subject,
        "exp": expire,
        # When it was issued. Lets a password change invalidate every token older than itself,
        # which is the whole point of changing a password after someone else has your session.
        "iat": now,
        "type": "access",
        **additional_claims
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def create_refresh_token(subject: str, issued_at: datetime | None = None) -> str:
    now = issued_at or datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": subject,
        "exp": expire,
        "iat": now,
        "type": "refresh"
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])


def token_predates_password_change(payload: dict[str, Any], password_changed_at) -> bool:
    """Whether this token was issued before the user last changed their password.

    Refresh tokens are stateless and last a week, so without this a password change did nothing to
    a session someone else already had — which is the one situation people change a password for.

    A token with no `iat` predates this check being added, so it is refused once the user has
    changed their password. Failing closed costs them one sign-in; failing open would leave the
    stolen session alive for the rest of the week.
    """
    if password_changed_at is None:
        return False
    issued_at = payload.get("iat")
    if issued_at is None:
        return True
    changed = password_changed_at
    if changed.tzinfo is None:
        changed = changed.replace(tzinfo=timezone.utc)
    # `iat` is whole seconds, so a token issued in the same second as the change cannot be told
    # apart from one issued just before it. That second is refused as well, and the replacement
    # tokens handed back by change-password are stamped a second later so they survive. The cost
    # is that anyone signing in during that same one second has to sign in again.
    return int(issued_at) <= int(changed.timestamp())
