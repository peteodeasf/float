"""add parent contact fields to patient_profiles

Revision ID: e5a1c2b3d6f8
Revises: d4e7f1a2b9c0
Create Date: 2026-06-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e5a1c2b3d6f8'
down_revision: Union[str, None] = 'd4e7f1a2b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('patient_profiles', sa.Column('parent_name', sa.String(), nullable=True))
    op.add_column('patient_profiles', sa.Column('parent_email', sa.String(), nullable=True))
    op.add_column('patient_profiles', sa.Column('parent_phone', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('patient_profiles', 'parent_phone')
    op.drop_column('patient_profiles', 'parent_email')
    op.drop_column('patient_profiles', 'parent_name')
