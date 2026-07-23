"""add times_per_day to experiments

Revision ID: e2f5a83b1d47
Revises: c7d9f2a1e4b8
Create Date: 2026-07-23 00:00:00.000000

`experiments.tempting_behaviors` is a clinical field — the safety behaviours a
teen is tempted to use during an exposure. The teen commit flow had nowhere to
put "times per day", so it encoded it into that same column as the string
`times:N`, crowding out the field's actual meaning.

This adds a dedicated column and backfills it from those legacy strings.

Deliberately non-destructive: `tempting_behaviors` is only READ here, never
written. Legacy rows keep their `times:N` value (the client still decodes it as
a fallback), so `downgrade()` is a plain column drop with no data loss.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2f5a83b1d47'
down_revision: Union[str, None] = 'c7d9f2a1e4b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'experiments',
        sa.Column('times_per_day', sa.Integer(), nullable=True)
    )

    # Backfill from the legacy `times:N` encoding. The pattern requires digits
    # immediately after `times:`, so JSON payloads (`{"times":2,...}`) do not
    # match and are left to the client-side decoder.
    op.execute(
        """
        UPDATE experiments
        SET times_per_day = CAST(
            substring(tempting_behaviors FROM 'times:([0-9]+)') AS INTEGER
        )
        WHERE tempting_behaviors ~ 'times:[0-9]+'
          AND times_per_day IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column('experiments', 'times_per_day')
