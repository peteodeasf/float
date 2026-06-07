"""add conceptualization fields to clinical_formulations

Revision ID: c9a3f1b2d4e7
Revises: b7e1a4d9c2f0
Create Date: 2026-06-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9a3f1b2d4e7'
down_revision: Union[str, None] = 'b7e1a4d9c2f0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('clinical_formulations', sa.Column('situations', sa.ARRAY(sa.String()), nullable=True))
    op.add_column('clinical_formulations', sa.Column('behaviors', sa.ARRAY(sa.String()), nullable=True))
    op.add_column('clinical_formulations', sa.Column('parent_feared_outcomes', sa.ARRAY(sa.String()), nullable=True))
    op.add_column('clinical_formulations', sa.Column('patient_feared_outcomes', sa.ARRAY(sa.String()), nullable=True))
    op.add_column('clinical_formulations', sa.Column('last_updated_step', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('clinical_formulations', 'last_updated_step')
    op.drop_column('clinical_formulations', 'patient_feared_outcomes')
    op.drop_column('clinical_formulations', 'parent_feared_outcomes')
    op.drop_column('clinical_formulations', 'behaviors')
    op.drop_column('clinical_formulations', 'situations')
