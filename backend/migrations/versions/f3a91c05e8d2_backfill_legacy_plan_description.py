"""backfill plan_description on legacy experiments where it holds the fear

Revision ID: f3a91c05e8d2
Revises: e2f5a83b1d47
Create Date: 2026-07-23 00:00:00.000000

Older teen commits wrote the *fear* into both `prediction` and
`plan_description`, leaving the plan field holding the worry rather than the
behaviour. The teen `moment` screen uses `plan_description` as its headline, so
on those rows the fear shows as the thing the teen is about to do.

This repairs exactly those rows — where `plan_description` still equals
`prediction` and the experiment is linked to a behaviour — by copying the
behaviour name into `plan_description`. Rows already carrying a distinct plan
are untouched.

Idempotent: after it runs, no row matches `plan_description = prediction` (unless
a behaviour name genuinely equals the prediction text), so re-running is a
no-op. There is no meaningful downgrade — the original (wrong) value is not
recoverable and was never correct — so `downgrade()` is intentionally empty.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'f3a91c05e8d2'
down_revision: Union[str, None] = 'e2f5a83b1d47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE experiments e
        SET plan_description = b.name
        FROM avoidance_behaviors b
        WHERE e.avoidance_behavior_id = b.id
          AND e.plan_description IS NOT DISTINCT FROM e.prediction
          AND e.prediction IS NOT NULL
        """
    )


def downgrade() -> None:
    # The prior value was the fear text duplicated from `prediction` — never a
    # real plan and not worth restoring. Nothing to undo.
    pass
