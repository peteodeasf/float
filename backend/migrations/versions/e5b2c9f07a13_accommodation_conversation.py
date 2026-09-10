"""What the parent says about their accommodations, and who rated them

The parent's half of the accommodation conversation (docs/plans/accommodation-conversation.md):
on patient_insights, the parent's estimate of how hard it would be for the child if they stopped,
whether they still do it, and who named it. On accommodation_behaviors, the parent's estimate
carried over, and when the child rated it.

Additive. Nullable columns only; nothing existing is changed.

Revision ID: e5b2c9f07a13
Revises: d3a8e6f41b27
Create Date: 2026-09-10
"""
from alembic import op
import sqlalchemy as sa

revision = 'e5b2c9f07a13'
down_revision = 'd3a8e6f41b27'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('patient_insights', sa.Column('parent_estimate_min', sa.Numeric(3, 1), nullable=True))
    op.add_column('patient_insights', sa.Column('parent_estimate_max', sa.Numeric(3, 1), nullable=True))
    op.add_column('patient_insights', sa.Column('still_does', sa.Boolean(), nullable=True))
    op.add_column('patient_insights', sa.Column('named_by_user_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'patient_insights_named_by_user_id_fkey', 'patient_insights', 'users',
        ['named_by_user_id'], ['id'], ondelete='SET NULL')
    op.add_column('accommodation_behaviors', sa.Column('parent_estimate_min', sa.Numeric(3, 1), nullable=True))
    op.add_column('accommodation_behaviors', sa.Column('parent_estimate_max', sa.Numeric(3, 1), nullable=True))
    op.add_column('accommodation_behaviors', sa.Column('child_rated_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('accommodation_behaviors', 'child_rated_at')
    op.drop_column('accommodation_behaviors', 'parent_estimate_max')
    op.drop_column('accommodation_behaviors', 'parent_estimate_min')
    op.drop_constraint('patient_insights_named_by_user_id_fkey', 'patient_insights', type_='foreignkey')
    op.drop_column('patient_insights', 'named_by_user_id')
    op.drop_column('patient_insights', 'still_does')
    op.drop_column('patient_insights', 'parent_estimate_max')
    op.drop_column('patient_insights', 'parent_estimate_min')
