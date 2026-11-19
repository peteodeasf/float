"""Remove the process checklist; its per-patient record becomes the guide's

Peter, 2026-11-19: remove the checklist from the clinician and admin apps completely; it is
replaced by the clinician guide, whose goals are ticked in the guide itself. The guide already
saved its ticks in the checklist's per-patient record, under keys starting `guide:`. That record
is kept and renamed for the guide.

DESTRUCTIVE (pre-launch, test data only):
- Drops `organization_checklist_items`: every practice's list of checklist items.
- Deletes every key in each patient's record that does not start with `guide:`: the ticks
  clinicians made on the old checklist. The guide's own ticks are kept.

Renames, keeping every row:
- table `consultation_checklists` -> `guide_progress`
- column `checked_items` -> `ticks`
- the table's primary key and foreign keys, to match

Revision ID: d4b8f2a6c1e3
Revises: c3a7e9d2b4f1
Create Date: 2026-11-19
"""
from alembic import op
import sqlalchemy as sa

revision = 'd4b8f2a6c1e3'
down_revision = 'c3a7e9d2b4f1'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.rename_table('consultation_checklists', 'guide_progress')
    op.alter_column('guide_progress', 'checked_items', new_column_name='ticks')
    op.execute('ALTER INDEX consultation_checklists_pkey RENAME TO guide_progress_pkey')
    op.execute('ALTER TABLE guide_progress RENAME CONSTRAINT consultation_checklists_patient_id_fkey '
               'TO guide_progress_patient_id_fkey')
    op.execute('ALTER TABLE guide_progress RENAME CONSTRAINT consultation_checklists_organization_id_fkey '
               'TO guide_progress_organization_id_fkey')
    # Keep only the guide's keys.
    op.execute("""
        UPDATE guide_progress SET ticks = COALESCE(
            (SELECT jsonb_object_agg(key, value) FROM jsonb_each(ticks) WHERE key LIKE 'guide:%'),
            '{}'::jsonb)
    """)
    op.drop_table('organization_checklist_items')


def downgrade() -> None:
    # The structure comes back empty: the deleted checklist items and ticks are not restored.
    op.create_table(
        'organization_checklist_items',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('organization_id', sa.Uuid(), nullable=False),
        sa.Column('key', sa.String(), nullable=False),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('link_icon', sa.String(), nullable=True),
        sa.Column('link_label', sa.String(), nullable=True),
        sa.Column('nav_label', sa.String(), nullable=True),
        sa.Column('nav_action', sa.String(), nullable=True),
        sa.Column('display_order', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['organization_id'], ['organizations.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_org_checklist_items_org', 'organization_checklist_items', ['organization_id'])
    op.create_unique_constraint('uq_org_checklist_item_key', 'organization_checklist_items', ['organization_id', 'key'])
    op.execute('ALTER TABLE guide_progress RENAME CONSTRAINT guide_progress_organization_id_fkey '
               'TO consultation_checklists_organization_id_fkey')
    op.execute('ALTER TABLE guide_progress RENAME CONSTRAINT guide_progress_patient_id_fkey '
               'TO consultation_checklists_patient_id_fkey')
    op.execute('ALTER INDEX guide_progress_pkey RENAME TO consultation_checklists_pkey')
    op.alter_column('guide_progress', 'ticks', new_column_name='checked_items')
    op.rename_table('guide_progress', 'consultation_checklists')
