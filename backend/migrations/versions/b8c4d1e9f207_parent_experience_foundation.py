"""parent experience foundation — accommodation reshape + parent link hardening

Revision ID: b8c4d1e9f207
Revises: f3a91c05e8d2
Create Date: 2026-07-23 00:00:00.000000

Spine schema for the parent accommodation-reduction experience
(float_parent_experience_plan.md, steps 1-2).

`accommodation_behaviors` (empty in prod, so reshaped freely):
- + trigger_situation_id  — OPTIONAL situation link (nullable FK)
- + display_order         — per-child ladder position
- + distress_min/max      — the child's distress-if-stopped range (single value = min==max)
- parent_user_id          — dropped NOT NULL so the therapist can enter accommodations
                            before a parent account exists
- distress_thermometer_when_refraining — DROPPED (wrong "child-refrains" semantics for an
                            accommodation; superseded by distress_min/max)

`parent_patient_links` (empty, previously dead):
- unique (parent_user_id, patient_id) so a parent can't be double-linked to one child
- indexes for the /auth/me and therapist-panel lookups

No backfill — both tables are empty in production (verified 2026-07-23).
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b8c4d1e9f207'
down_revision: Union[str, None] = 'f3a91c05e8d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---- accommodation_behaviors ----
    op.add_column(
        'accommodation_behaviors',
        sa.Column('trigger_situation_id', sa.Uuid(), nullable=True),
    )
    op.create_foreign_key(
        'fk_accommodation_trigger_situation',
        'accommodation_behaviors', 'trigger_situations',
        ['trigger_situation_id'], ['id'],
    )
    op.add_column(
        'accommodation_behaviors',
        sa.Column('display_order', sa.Integer(), nullable=True),
    )
    op.add_column(
        'accommodation_behaviors',
        sa.Column('distress_min', sa.Numeric(3, 1), nullable=True),
    )
    op.add_column(
        'accommodation_behaviors',
        sa.Column('distress_max', sa.Numeric(3, 1), nullable=True),
    )
    op.alter_column('accommodation_behaviors', 'parent_user_id', nullable=True)
    op.drop_column('accommodation_behaviors', 'distress_thermometer_when_refraining')

    # ---- parent_patient_links ----
    op.create_unique_constraint(
        'uq_parent_patient_link',
        'parent_patient_links', ['parent_user_id', 'patient_id'],
    )
    op.create_index(
        'ix_parent_patient_links_patient_id',
        'parent_patient_links', ['patient_id'],
    )
    op.create_index(
        'ix_parent_patient_links_parent_user_id',
        'parent_patient_links', ['parent_user_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_parent_patient_links_parent_user_id', table_name='parent_patient_links')
    op.drop_index('ix_parent_patient_links_patient_id', table_name='parent_patient_links')
    op.drop_constraint('uq_parent_patient_link', 'parent_patient_links', type_='unique')

    op.add_column(
        'accommodation_behaviors',
        sa.Column('distress_thermometer_when_refraining', sa.Numeric(3, 1), nullable=True),
    )
    op.alter_column('accommodation_behaviors', 'parent_user_id', nullable=False)
    op.drop_column('accommodation_behaviors', 'distress_max')
    op.drop_column('accommodation_behaviors', 'distress_min')
    op.drop_column('accommodation_behaviors', 'display_order')
    op.drop_constraint('fk_accommodation_trigger_situation', 'accommodation_behaviors', type_='foreignkey')
    op.drop_column('accommodation_behaviors', 'trigger_situation_id')
