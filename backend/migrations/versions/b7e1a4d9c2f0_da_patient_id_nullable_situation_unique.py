"""downward arrows: nullable situation, patient_id link, (situation, facilitated_by) unique

Revision ID: b7e1a4d9c2f0
Revises: 8af0210c34e6
Create Date: 2026-06-05 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7e1a4d9c2f0'
down_revision: Union[str, None] = '8af0210c34e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Allow situation-agnostic arrows (e.g. the parent DA) to have no situation.
    op.alter_column('downward_arrows', 'trigger_situation_id', nullable=True)

    # 2. Add a direct patient link.
    op.add_column('downward_arrows', sa.Column('patient_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'downward_arrows_patient_id_fkey',
        'downward_arrows', 'patient_profiles',
        ['patient_id'], ['id']
    )

    # 3. Backfill patient_id for existing situation-linked arrows
    #    (situation -> treatment plan -> patient).
    op.execute("""
        UPDATE downward_arrows da
        SET patient_id = tp.patient_id
        FROM trigger_situations ts
        JOIN treatment_plans tp ON tp.id = ts.treatment_plan_id
        WHERE da.trigger_situation_id = ts.id
    """)

    # 4. Enforce one arrow per (situation, facilitated_by) so a single situation
    #    can hold both a parent and a practitioner arrow.
    op.create_unique_constraint(
        'uq_downward_arrows_situation_facilitated_by',
        'downward_arrows',
        ['trigger_situation_id', 'facilitated_by']
    )


def downgrade() -> None:
    op.drop_constraint(
        'uq_downward_arrows_situation_facilitated_by',
        'downward_arrows',
        type_='unique'
    )

    op.drop_constraint(
        'downward_arrows_patient_id_fkey',
        'downward_arrows',
        type_='foreignkey'
    )
    op.drop_column('downward_arrows', 'patient_id')

    # Situation-agnostic arrows cannot exist once trigger_situation_id is NOT NULL.
    op.execute("DELETE FROM downward_arrows WHERE trigger_situation_id IS NULL")
    op.alter_column('downward_arrows', 'trigger_situation_id', nullable=False)
