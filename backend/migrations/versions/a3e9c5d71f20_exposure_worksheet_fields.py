"""Two answers from Dr. Walker's exposure worksheet. docs/plans/exposure-worksheet-questions.md

Additive: two nullable columns on experiments. Nothing existing is changed.

Revision ID: a3e9c5d71f20
Revises: f2a7d4c8e1b5
Create Date: 2026-11-24
"""
from alembic import op
import sqlalchemy as sa

revision = 'a3e9c5d71f20'
down_revision = 'f2a7d4c8e1b5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('experiments', sa.Column('how_will_i_know', sa.Text(), nullable=True))
    op.add_column('experiments', sa.Column('was_surprised', sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column('experiments', 'was_surprised')
    op.drop_column('experiments', 'how_will_i_know')
