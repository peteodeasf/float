"""Co-design sessions move one week later.

Peter, 2026-10-28: the sessions are pushed back a week. New dates: Tue Nov 10, Wed Nov 11, Thu Nov 12
(week 1) and Tue Nov 17, Wed Nov 18, Thu Nov 19 (week 2), still 12pm Eastern. All six dates are after
daylight time ends on Nov 1, so 12pm Eastern is 17:00 UTC, as before. docs/plans/codesign-signup.md

Data only: each session's start moves 7 days. Sign-ups keep their sessions, so they move with them.
Nothing is added or dropped.

Revision ID: e7a2c4d9b1f6
Revises: dcb15663ca0d
Create Date: 2026-10-28
"""
from typing import Sequence, Union

from alembic import op

revision: str = "e7a2c4d9b1f6"
down_revision: Union[str, None] = "dcb15663ca0d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (week, old start, new start)
MOVES = [
    (1, "2026-11-03 17:00:00+00", "2026-11-10 17:00:00+00"),
    (1, "2026-11-04 17:00:00+00", "2026-11-11 17:00:00+00"),
    (1, "2026-11-05 17:00:00+00", "2026-11-12 17:00:00+00"),
    (2, "2026-11-10 17:00:00+00", "2026-11-17 17:00:00+00"),
    (2, "2026-11-11 17:00:00+00", "2026-11-18 17:00:00+00"),
    (2, "2026-11-12 17:00:00+00", "2026-11-19 17:00:00+00"),
]


def upgrade() -> None:
    # Matched on week as well as time: week 1's new dates are week 2's old ones.
    for week, old, new in MOVES:
        op.execute(f"UPDATE codesign_sessions SET starts_at = '{new}' WHERE week = {week} AND starts_at = '{old}'")


def downgrade() -> None:
    for week, old, new in MOVES:
        op.execute(f"UPDATE codesign_sessions SET starts_at = '{old}' WHERE week = {week} AND starts_at = '{new}'")
