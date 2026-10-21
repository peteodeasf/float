"""The test switch for the teen data testing page (docs/plans/teen-data-testing.md).

One place decides whether a teen may give an exposure a date of their choosing. Every route that
takes such a date goes through `back_date`, so a route added later cannot forget the switch.
"""
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status

from app.core.config import settings

SWITCHED_OFF = "Teen data testing is switched off"

# A tester's browser clock and the server's are never exactly together. "Now" from the page can be
# a little ahead of the server's now; that is not a date in the future.
CLOCK_SLACK = timedelta(minutes=2)


def testing_on() -> bool:
    return bool(settings.TEEN_DATA_TESTING)


def require_testing() -> None:
    if not testing_on():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=SWITCHED_OFF)


def back_date(when: datetime) -> datetime:
    """The moment a teen says something happened, checked. Refused with the switch off, refused if
    it is in the future. A date with no time zone is taken as UTC."""
    require_testing()
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    if when > datetime.now(timezone.utc) + CLOCK_SLACK:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="That date is in the future"
        )
    return when
