"""One saved list per patient — what we know, and where it came from

Peter, 2026-09-05. Everything the app suggests must come from this patient's own record, and
nothing is on the treatment plan until a clinician explicitly adds it. This table is that record.

It holds situations, child behaviours, accommodations and generated sub-situations, each carrying
the monitoring entries (later: session notes) it came from, and a nullable pointer to the plan row
a clinician created from it.

Additive. Nothing existing is read or changed.

Revision ID: f8c3a2e91b47
Revises: e7a41f83b6d2
Create Date: 2026-09-05
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'f8c3a2e91b47'
down_revision = 'e7a41f83b6d2'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'patient_insights',
        sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('patient_id', sa.UUID(), nullable=False),
        sa.Column('organization_id', sa.UUID(), nullable=False),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('name', sa.Text(), nullable=False),
        sa.Column('normalized_name', sa.Text(), nullable=False),
        sa.Column('parent_insight_id', sa.UUID(), nullable=True),
        sa.Column('attributes', postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column('fear_rating', sa.Numeric(3, 1), nullable=True),
        sa.Column('sources', postgresql.ARRAY(sa.String()), server_default=sa.text("'{}'"), nullable=False),
        sa.Column('monitoring_entry_ids', postgresql.ARRAY(sa.UUID()), server_default=sa.text("'{}'"), nullable=False),
        sa.Column('session_note_ids', postgresql.ARRAY(sa.UUID()), server_default=sa.text("'{}'"), nullable=False),
        sa.Column('trigger_situation_id', sa.UUID(), nullable=True),
        sa.Column('avoidance_behavior_id', sa.UUID(), nullable=True),
        sa.Column('accommodation_behavior_id', sa.UUID(), nullable=True),
        sa.Column('added_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('removed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_edited', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('first_seen_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['patient_id'], ['patient_profiles.id']),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id']),
        # A situation's behaviours go with it.
        sa.ForeignKeyConstraint(['parent_insight_id'], ['patient_insights.id'], ondelete='CASCADE'),
        # Delete the plan row and the item goes back to being available, rather than claiming
        # forever that it was added.
        sa.ForeignKeyConstraint(['trigger_situation_id'], ['trigger_situations.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['avoidance_behavior_id'], ['avoidance_behaviors.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['accommodation_behavior_id'], ['accommodation_behaviors.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_patient_insights_patient', 'patient_insights', ['patient_id', 'kind'])
    op.create_index('ix_patient_insights_parent', 'patient_insights', ['parent_insight_id'])
    # One row per item per patient. Analysing the log again folds into what is here rather than
    # adding a second copy. parent_insight_id is coalesced because NULLs do not collide in a
    # plain unique index, and a situation's parent is NULL.
    op.execute(
        "CREATE UNIQUE INDEX uq_patient_insights_item ON patient_insights "
        "(patient_id, kind, normalized_name, "
        " COALESCE(parent_insight_id, '00000000-0000-0000-0000-000000000000'::uuid))"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_patient_insights_item")
    op.drop_index('ix_patient_insights_parent', table_name='patient_insights')
    op.drop_index('ix_patient_insights_patient', table_name='patient_insights')
    op.drop_table('patient_insights')
