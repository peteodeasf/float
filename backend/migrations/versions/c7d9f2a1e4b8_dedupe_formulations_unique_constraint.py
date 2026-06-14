"""dedupe clinical_formulations and add unique constraint on (patient_id, organization_id)

Revision ID: c7d9f2a1e4b8
Revises: b3e8c1a05f72
Create Date: 2026-06-14 00:00:00.000000

For each (patient_id, organization_id) group with duplicate rows, keep the most
recently created row as the survivor, backfill any NULL fields on it from the
other rows (most-recent non-null wins) so no data is lost, delete the rest, then
add a unique constraint so duplicates can't recur.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7d9f2a1e4b8'
down_revision: Union[str, None] = 'b3e8c1a05f72'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Columns backfilled via COALESCE (survivor value wins, else newest non-null from the group)
_MERGE_COLS = [
    'situations', 'behaviors', 'maintaining_mechanisms', 'accommodation_patterns',
    'parent_feared_outcomes', 'patient_feared_outcomes', 'treatment_targets',
    'preliminary_report', 'last_updated_step',
]


def upgrade() -> None:
    conn = op.get_bind()

    groups = conn.execute(sa.text(
        "SELECT patient_id, organization_id FROM clinical_formulations "
        "GROUP BY patient_id, organization_id HAVING COUNT(*) > 1"
    )).fetchall()

    for pid, oid in groups:
        ids = conn.execute(sa.text(
            "SELECT id FROM clinical_formulations "
            "WHERE patient_id = :p AND organization_id = :o ORDER BY created_at DESC"
        ), {"p": pid, "o": oid}).scalars().all()
        survivor = ids[0]

        set_clauses = [
            f"{c} = COALESCE(cf.{c}, ("
            f"SELECT o.{c} FROM clinical_formulations o "
            f"WHERE o.patient_id = :p AND o.organization_id = :o AND o.id <> :sid "
            f"AND o.{c} IS NOT NULL ORDER BY o.created_at DESC LIMIT 1))"
            for c in _MERGE_COLS
        ]
        set_clauses.append(
            "ai_suggested = COALESCE((SELECT bool_or(o.ai_suggested) FROM clinical_formulations o "
            "WHERE o.patient_id = :p AND o.organization_id = :o), cf.ai_suggested)"
        )
        conn.execute(
            sa.text(f"UPDATE clinical_formulations AS cf SET {', '.join(set_clauses)} WHERE cf.id = :sid"),
            {"p": pid, "o": oid, "sid": survivor},
        )
        conn.execute(sa.text(
            "DELETE FROM clinical_formulations "
            "WHERE patient_id = :p AND organization_id = :o AND id <> :sid"
        ), {"p": pid, "o": oid, "sid": survivor})

    op.create_unique_constraint(
        'uq_clinical_formulations_patient_org',
        'clinical_formulations',
        ['patient_id', 'organization_id'],
    )


def downgrade() -> None:
    op.drop_constraint(
        'uq_clinical_formulations_patient_org',
        'clinical_formulations',
        type_='unique',
    )
