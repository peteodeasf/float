"""trigger_situations: add distress_thermometer_max (optional range upper bound)

Revision ID: e4f5a6b7c8d9
Revises: d8e9f0a1b2c3
Create Date: 2026-08-10

Adds an optional `distress_thermometer_max`. When set, the situation DT is a
range (existing `distress_thermometer_rating` is the min/single value, this is
the upper bound). Additive and nullable — existing rows are unaffected (no range).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e4f5a6b7c8d9'
down_revision: Union[str, None] = 'd8e9f0a1b2c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'trigger_situations',
        sa.Column('distress_thermometer_max', sa.Numeric(3, 1), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('trigger_situations', 'distress_thermometer_max')
