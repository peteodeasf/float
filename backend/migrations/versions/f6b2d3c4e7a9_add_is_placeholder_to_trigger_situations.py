"""add is_placeholder to trigger_situations

Revision ID: f6b2d3c4e7a9
Revises: e5a1c2b3d6f8
Create Date: 2026-06-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f6b2d3c4e7a9'
down_revision: Union[str, None] = 'e5a1c2b3d6f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'trigger_situations',
        sa.Column('is_placeholder', sa.Boolean(), nullable=False, server_default=sa.text('false')),
    )


def downgrade() -> None:
    op.drop_column('trigger_situations', 'is_placeholder')
