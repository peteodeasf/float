"""organization checklist items (platform-admin configurable process checklist)

Revision ID: b9f1c2d3e4a5
Revises: a7b8c9d0e1f2
Create Date: 2026-08-24 00:00:00.000000

Additive only: creates one table and seeds it. Nothing existing is altered or
dropped.

The seed inserts the 28 items that were until now hardcoded in the frontend
(`apps/web/src/lib/checklists.ts`), for every organization that already exists,
WITH THEIR ORIGINAL KEYS. That matters: per-patient completion lives in
`consultation_checklists.checked_items` as a `key -> bool` JSONB map, so seeding
with fresh keys would silently blank every checklist in production.
"""
from typing import Sequence, Union

from alembic import op, context
import sqlalchemy as sa

# The default list as it was when this migration ran. Copied in on 2026-11-19, when the checklist was
# removed and `app/data/default_checklist.py` went with it, so this migration still runs unchanged.
DEFAULT_PROCESS_CHECKLIST: list[dict] = [
    dict(key='send_monitoring_links', text='Send monitoring links to parents'),
    dict(key='analyze_monitoring_data', text='Analyze monitoring data'),
    dict(key='prep_parent_consultation', text='Prepare for parent consultation meeting'),
    dict(key='parent_first_meeting', text='Parent first meeting'),
    dict(key='prep_parent_child_meeting', text='Prepare for parent-child meeting'),
    dict(key='parent_child_first_meeting', text='Parent-child first meeting'),
    dict(key='child_first_meeting', text='Child first meeting'),
    dict(key='review_cbt_exposure_concepts', text='Review key CBT and exposure concepts'),
    dict(key='setup_exposure_ladder', text='Set up exposure ladder for child'),
    dict(key='setup_accommodation_ladder', text='Set up accommodation ladder for parents'),
    dict(key='child_first_exposure', text="Child's first exposure"),
    dict(key='monitor_progress_exposure_data', text='Monitoring of progress and exposure data'),
]


# revision identifiers, used by Alembic.
revision: str = 'b9f1c2d3e4a5'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
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
    op.create_index(
        'ix_org_checklist_items_org', 'organization_checklist_items', ['organization_id']
    )
    op.create_unique_constraint(
        'uq_org_checklist_item_key', 'organization_checklist_items', ['organization_id', 'key']
    )

    # The seed reads existing rows, which offline (`alembic upgrade --sql`) cannot do. DDL still
    # renders; only the data step is skipped.
    if context.is_offline_mode():
        return

    conn = op.get_bind()
    org_ids = [r[0] for r in conn.execute(sa.text('SELECT id FROM organizations')).fetchall()]
    if not org_ids:
        return
    conn.execute(
        sa.text(
            'INSERT INTO organization_checklist_items '
            '(organization_id, key, text, link_icon, link_label, nav_label, nav_action, display_order) '
            'VALUES (:organization_id, :key, :text, :link_icon, :link_label, :nav_label, :nav_action, :display_order)'
        ),
        [
            {
                'organization_id': org_id,
                'key': item['key'],
                'text': item['text'],
                'link_icon': item.get('link_icon'),
                'link_label': item.get('link_label'),
                'nav_label': item.get('nav_label'),
                'nav_action': item.get('nav_action'),
                'display_order': i,
            }
            for org_id in org_ids
            for i, item in enumerate(DEFAULT_PROCESS_CHECKLIST)
        ],
    )


def downgrade() -> None:
    op.drop_index('ix_org_checklist_items_org', table_name='organization_checklist_items')
    op.drop_table('organization_checklist_items')
