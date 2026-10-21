"""Who may read the co-design sign-up list without being a Float admin. docs/plans/codesign-viewer.md

The list is the CODESIGN_VIEWERS setting. Its own module so the clinician "me" route can ask the
same question as the codesign route without the two routers importing each other.
"""
from app.core.config import settings


def _normal(email: str) -> str:
    return email.strip().lower()


def can_view_codesign(email: str | None) -> bool:
    if not email:
        return False
    allowed = {_normal(e) for e in settings.CODESIGN_VIEWERS.split(",") if e.strip()}
    return _normal(email) in allowed
