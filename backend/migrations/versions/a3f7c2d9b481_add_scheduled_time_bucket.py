"""add scheduled_time_bucket to experiments

Revision ID: a3f7c2d9b481
Revises: b8c4d1e9f207
Create Date: 2026-07-26 00:00:00.000000

The teen before-state flow now asks for a coarse "when" (day + time bucket such
as morning / afternoon / evening). The day already lives in scheduled_date; this
adds a dedicated nullable column for the bucket label so it survives relabelling
and can later drive a reminder. Provisional and non-destructive — a plain
nullable add with a plain drop downgrade.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a3f7c2d9b481'
down_revision: Union[str, None] = 'b8c4d1e9f207'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'experiments',
        sa.Column('scheduled_time_bucket', sa.String(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column('experiments', 'scheduled_time_bucket')
