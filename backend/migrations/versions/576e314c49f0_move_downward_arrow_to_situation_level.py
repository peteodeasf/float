"""move downward arrow to situation level

Revision ID: 576e314c49f0
Revises: e2ead5cd800f
Create Date: 2026-04-14 21:50:11.462601

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '576e314c49f0'
down_revision: Union[str, None] = 'e2ead5cd800f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add the new column as nullable so we can backfill
    op.add_column('downward_arrows', sa.Column('trigger_situation_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'downward_arrows_trigger_situation_id_fkey',
        'downward_arrows', 'trigger_situations',
        ['trigger_situation_id'], ['id']
    )

    # 2. Backfill trigger_situation_id from existing rung -> ladder -> trigger chain
    op.execute("""
        UPDATE downward_arrows da
        SET trigger_situation_id = el.trigger_situation_id
        FROM ladder_rungs lr
        JOIN exposure_ladders el ON el.id = lr.ladder_id
        WHERE da.ladder_rung_id = lr.id
    """)

    # 3. Drop any DAs that could not be mapped (should be none, but be safe)
    op.execute("DELETE FROM downward_arrows WHERE trigger_situation_id IS NULL")

    # 4. Now make trigger_situation_id NOT NULL
    op.alter_column('downward_arrows', 'trigger_situation_id', nullable=False)

    # 5. Drop old ladder_rung_id column
    op.drop_constraint('downward_arrows_ladder_rung_id_fkey', 'downward_arrows', type_='foreignkey')
    op.drop_column('downward_arrows', 'ladder_rung_id')


def downgrade() -> None:
    op.add_column('downward_arrows', sa.Column('ladder_rung_id', sa.UUID(), autoincrement=False, nullable=True))
    op.create_foreign_key(
        'downward_arrows_ladder_rung_id_fkey',
        'downward_arrows', 'ladder_rungs',
        ['ladder_rung_id'], ['id']
    )
    op.drop_constraint('downward_arrows_trigger_situation_id_fkey', 'downward_arrows', type_='foreignkey')
    op.drop_column('downward_arrows', 'trigger_situation_id')
