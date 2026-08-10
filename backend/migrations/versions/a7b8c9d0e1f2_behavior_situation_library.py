"""behavior/situation library + reuse links + sub-behavior self-ref (Tier C, C1)

Revision ID: a7b8c9d0e1f2
Revises: f5a6b7c8d9e0
Create Date: 2026-08-10

Additive, non-destructive. Adds cross-org `situation_library` / `behavior_library`
(generic name + type only), nullable reuse FKs on trigger_situations and
avoidance_behaviors, and a self-referential parent_behavior_id for sub-behaviors.
Backfills the library from existing distinct (normalized) names and links every
existing row. No existing situation/behavior is modified beyond gaining a link.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'f5a6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Same normalization as the frontend isSimilar helper: lowercase, strip non-alphanumerics.
_NORM = "lower(regexp_replace({col}, '[^a-zA-Z0-9]', '', 'g'))"


def upgrade() -> None:
    # ── Library tables ──
    op.create_table(
        'situation_library',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('normalized_name', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('normalized_name'),
    )
    op.create_table(
        'behavior_library',
        sa.Column('id', sa.Uuid(), server_default=sa.text('gen_random_uuid()'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('normalized_name', sa.String(), nullable=False),
        sa.Column('behavior_type', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('normalized_name'),
    )

    # ── Reuse / hierarchy FK columns (nullable) ──
    op.add_column('trigger_situations', sa.Column('situation_library_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_trigger_situations_situation_library', 'trigger_situations',
        'situation_library', ['situation_library_id'], ['id'],
    )
    op.add_column('avoidance_behaviors', sa.Column('behavior_library_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_avoidance_behaviors_behavior_library', 'avoidance_behaviors',
        'behavior_library', ['behavior_library_id'], ['id'],
    )
    op.add_column('avoidance_behaviors', sa.Column('parent_behavior_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_avoidance_behaviors_parent', 'avoidance_behaviors',
        'avoidance_behaviors', ['parent_behavior_id'], ['id'],
    )

    # ── Backfill: distinct normalized names -> one library row each; link existing rows ──
    sit_norm = _NORM.format(col='name')
    op.execute(f"""
        INSERT INTO situation_library (name, normalized_name)
        SELECT min(name), {sit_norm} AS norm
        FROM trigger_situations
        WHERE name IS NOT NULL AND {sit_norm} <> ''
        GROUP BY {sit_norm}
    """)
    op.execute(f"""
        UPDATE trigger_situations ts
        SET situation_library_id = sl.id
        FROM situation_library sl
        WHERE sl.normalized_name = {_NORM.format(col='ts.name')}
    """)

    beh_norm = _NORM.format(col='name')
    op.execute(f"""
        INSERT INTO behavior_library (name, normalized_name, behavior_type)
        SELECT min(name), {beh_norm} AS norm, min(behavior_type)
        FROM avoidance_behaviors
        WHERE name IS NOT NULL AND {beh_norm} <> ''
        GROUP BY {beh_norm}
    """)
    op.execute(f"""
        UPDATE avoidance_behaviors ab
        SET behavior_library_id = bl.id
        FROM behavior_library bl
        WHERE bl.normalized_name = {_NORM.format(col='ab.name')}
    """)


def downgrade() -> None:
    op.drop_constraint('fk_avoidance_behaviors_parent', 'avoidance_behaviors', type_='foreignkey')
    op.drop_column('avoidance_behaviors', 'parent_behavior_id')
    op.drop_constraint('fk_avoidance_behaviors_behavior_library', 'avoidance_behaviors', type_='foreignkey')
    op.drop_column('avoidance_behaviors', 'behavior_library_id')
    op.drop_constraint('fk_trigger_situations_situation_library', 'trigger_situations', type_='foreignkey')
    op.drop_column('trigger_situations', 'situation_library_id')
    op.drop_table('behavior_library')
    op.drop_table('situation_library')
