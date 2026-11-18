"""What the AI proposed for a patient, and what the clinician did with it

docs/plans/ai-foundation-and-features.md. Additive: a new table, nothing existing changes.

Revision ID: b8d2e5f1a9c3
Revises: a3f9c2d7e8b1
Create Date: 2026-11-18
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'b8d2e5f1a9c3'
down_revision = 'a3f9c2d7e8b1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'ai_suggestions',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('patient_id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('job', sa.String(), nullable=False),
        sa.Column('model', sa.String(), nullable=False),
        sa.Column('prompt_fingerprint', sa.String(length=12), nullable=False),
        sa.Column('source', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('output', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('triggered_by_user_id', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('status', sa.String(), server_default='pending', nullable=False),
        sa.Column('decided_by_user_id', sa.UUID(), nullable=True),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('final', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.ForeignKeyConstraint(['patient_id'], ['patient_profiles.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
        sa.ForeignKeyConstraint(['triggered_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['decided_by_user_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_ai_suggestions_patient', 'ai_suggestions', ['patient_id', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_ai_suggestions_patient', table_name='ai_suggestions')
    op.drop_table('ai_suggestions')
