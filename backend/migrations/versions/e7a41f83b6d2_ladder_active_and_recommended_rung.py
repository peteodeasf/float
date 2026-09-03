"""Turn the whole ladder on for a child, and say which rung to do next

Two decisions from Peter, 2026-09-01.

**The ladder is on or off, all of it.** Until now visibility was per situation — `is_active` on
`trigger_situations` — so a clinician switched situations on one at a time. `ladder_active` on the
plan replaces that. Backfilled true for any plan that already had an active situation, so no child
loses access on deploy.

`is_active` is left on `trigger_situations` and simply stops being read. Nothing is dropped.

**One rung can be recommended.** The child can still do any rung whenever they like; the
recommendation is advice, and marking it is the only way the app can carry what the therapist
suggested. A single nullable column gives "one at a time" by construction.

Revision ID: e7a41f83b6d2
Revises: d5e2b9174c30
Create Date: 2026-09-01
"""
from alembic import op
import sqlalchemy as sa

revision = 'e7a41f83b6d2'
down_revision = 'd5e2b9174c30'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'treatment_plans',
        sa.Column(
            'ladder_active', sa.Boolean(), nullable=False, server_default=sa.text('false')
        ),
    )
    # Keep every child who can see something today still seeing it.
    op.execute(
        "UPDATE treatment_plans SET ladder_active = true WHERE id IN ("
        "  SELECT DISTINCT treatment_plan_id FROM trigger_situations WHERE is_active = true"
        ")"
    )

    op.add_column(
        'treatment_plans',
        sa.Column('recommended_rung_id', sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        'fk_treatment_plans_recommended_rung',
        'treatment_plans', 'avoidance_behaviors',
        ['recommended_rung_id'], ['id'],
        # A rung the clinician deletes should clear the recommendation, not block the delete or
        # leave the plan pointing at a row that is gone.
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_treatment_plans_recommended_rung', 'treatment_plans', type_='foreignkey')
    op.drop_column('treatment_plans', 'recommended_rung_id')
    op.drop_column('treatment_plans', 'ladder_active')
