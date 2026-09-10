"""The clinician's switch for the parent seeing the child's progress

Peter, 2026-09-10: the parent app can show the child's ladder, what's planned and what's done, once
the clinician switches it on for that child. Null is off, and every existing child starts off.

Additive. Two nullable columns on patient_profiles; nothing existing is changed.

Revision ID: b91e4d7c2a58
Revises: f8c3a2e91b47
Create Date: 2026-09-10
"""
from alembic import op
import sqlalchemy as sa

revision = 'b91e4d7c2a58'
down_revision = 'f8c3a2e91b47'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('patient_profiles', sa.Column(
        'progress_shared_with_parent_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('patient_profiles', sa.Column(
        'progress_shared_by_practitioner_id', sa.UUID(), nullable=True))
    op.create_foreign_key(
        'patient_profiles_progress_shared_by_fkey', 'patient_profiles', 'practitioner_profiles',
        ['progress_shared_by_practitioner_id'], ['id'])


def downgrade() -> None:
    op.drop_constraint('patient_profiles_progress_shared_by_fkey', 'patient_profiles', type_='foreignkey')
    op.drop_column('patient_profiles', 'progress_shared_by_practitioner_id')
    op.drop_column('patient_profiles', 'progress_shared_with_parent_at')
