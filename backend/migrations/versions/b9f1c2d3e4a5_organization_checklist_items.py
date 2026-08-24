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

from app.data.default_checklist import DEFAULT_PROCESS_CHECKLIST


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
