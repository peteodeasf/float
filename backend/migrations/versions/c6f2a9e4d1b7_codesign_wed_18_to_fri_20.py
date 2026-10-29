"""Co-design week 2: Wednesday Nov 18 becomes Friday Nov 20.

Peter, 2026-10-29: week 2's dates are Tue Nov 17, Thu Nov 19 and Fri Nov 20, still 12pm Eastern
(17:00 UTC; daylight time ended Nov 1). Week 1 is unchanged. docs/plans/codesign-signup.md

Data only: the Wednesday session's start moves two days. Sign-ups on it move with it. Nothing is added
or dropped.

Revision ID: c6f2a9e4d1b7
Revises: b3d8f1a6c2e4
Create Date: 2026-10-29
"""
from typing import Sequence, Union

from alembic import op

revision: str = "c6f2a9e4d1b7"
down_revision: Union[str, None] = "b3d8f1a6c2e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD = "2026-11-18 17:00:00+00"
NEW = "2026-11-20 17:00:00+00"


def upgrade() -> None:
    op.execute(f"UPDATE codesign_sessions SET starts_at = '{NEW}' WHERE week = 2 AND starts_at = '{OLD}'")


def downgrade() -> None:
    op.execute(f"UPDATE codesign_sessions SET starts_at = '{OLD}' WHERE week = 2 AND starts_at = '{NEW}'")
