"""One unfinished treatment plan per patient.

Issue #92. A patient with two unfinished plans could not load their Plan tab, and each click on
Create treatment plan made another. This clears up patients who already have more than one, then
adds a database rule so it cannot happen again.

For each patient with more than one unfinished plan, the plan with the most situations is kept (the
oldest if that is a tie). Each other unfinished plan is:
- DELETED if nothing points at it (no situations, rungs, experiments or anything else). These are
  the empty plans the broken button made.
- otherwise marked "complete", so its data is kept but it is no longer the patient's plan.

DESTRUCTIVE: empty duplicate plans are deleted, and the downgrade does not bring them back. The
downgrade only drops the rule. Pre-launch, all data is test data (CLAUDE.md).

Revision ID: b3d8f1a6c2e4
Revises: e7a2c4d9b1f6
Create Date: 2026-10-29
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b3d8f1a6c2e4"
down_revision: Union[str, None] = "e7a2c4d9b1f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX = "uq_treatment_plans_one_open_per_patient"


def upgrade() -> None:
    # One block of plain SQL, so the migration renders offline. The columns that point at a plan
    # are read from the database rather than listed by hand, so a table added later is not missed.
    op.execute("""
DO $$
DECLARE
    in_use text;
BEGIN
    SELECT coalesce(string_agg(format(
        'EXISTS (SELECT 1 FROM %I.%I r WHERE r.%I = p.id)', ns.nspname, cl.relname, att.attname
    ), ' OR '), 'FALSE')
    INTO in_use
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    WHERE con.contype = 'f' AND con.confrelid = 'treatment_plans'::regclass;

    -- The extra unfinished plans: every one except the plan kept for that patient.
    CREATE TEMP TABLE extra_open_plans AS
    SELECT id FROM (
        SELECT p.id, ROW_NUMBER() OVER (
            PARTITION BY p.patient_id
            ORDER BY (SELECT count(*) FROM trigger_situations t WHERE t.treatment_plan_id = p.id) DESC,
                     p.created_at ASC, p.id ASC
        ) AS rank
        FROM treatment_plans p
        WHERE p.status != 'complete'
    ) ranked
    WHERE rank > 1;

    EXECUTE 'DELETE FROM treatment_plans p WHERE p.id IN (SELECT id FROM extra_open_plans) AND NOT ('
        || in_use || ')';

    UPDATE treatment_plans SET status = 'complete', updated_at = now()
    WHERE id IN (SELECT id FROM extra_open_plans);

    DROP TABLE extra_open_plans;
END $$;
""")

    op.create_index(
        INDEX, "treatment_plans", ["patient_id"],
        unique=True, postgresql_where=sa.text("status != 'complete'"),
    )


def downgrade() -> None:
    op.drop_index(INDEX, table_name="treatment_plans")
