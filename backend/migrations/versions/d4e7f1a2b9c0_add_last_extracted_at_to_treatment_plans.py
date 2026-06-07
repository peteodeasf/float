"""add last_extracted_at to treatment_plans

Revision ID: d4e7f1a2b9c0
Revises: c9a3f1b2d4e7
Create Date: 2026-06-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd4e7f1a2b9c0'
down_revision: Union[str, None] = 'c9a3f1b2d4e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('treatment_plans', sa.Column('last_extracted_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('treatment_plans', 'last_extracted_at')
