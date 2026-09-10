"""The child's ratings of the accommodations: when they were sent, and who may see them

Peter, 2026-09-10: the accommodations on the plan go to the child to rate, and the clinician chooses
whether the parent sees those ratings. docs/plans/accommodation-conversation.md

Additive. Two nullable columns; nothing existing is changed.

Revision ID: f6c1d8a24e90
Revises: e5b2c9f07a13
Create Date: 2026-09-10
"""
from alembic import op
import sqlalchemy as sa

revision = 'f6c1d8a24e90'
down_revision = 'e5b2c9f07a13'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('accommodation_behaviors', sa.Column(
        'child_rating_requested_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('patient_profiles', sa.Column(
        'accommodation_ratings_shared_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('patient_profiles', 'accommodation_ratings_shared_at')
    op.drop_column('accommodation_behaviors', 'child_rating_requested_at')
