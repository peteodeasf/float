"""Clear behavior suggestions from monitoring that no clinician has touched

Peter, 2026-11-19: behavior suggestions retold the parent's story ("Seemed only half there; parent
couldn't get a read on what was going on with him; didn't have breakfast…") instead of naming what
the child does. The extractor prompt now writes one short, present-tense behavior per suggestion.
Suggestions are matched on their exact wording, so the old ones would stay beside the new ones.
Pre-launch, so the untouched old ones are cleared and come back in the new wording the next time
the monitoring analysis runs (a new monitoring entry, or AI Refresh on the Case Summary tab).

DESTRUCTIVE. Deletes `patient_insights` rows that are all of:
- kind `behavior`
- from the monitoring log only (`sources` is exactly {monitoring})
- not on the plan (`avoidance_behavior_id` and `added_at` empty)
- not removed by a clinician (`removed_at` empty), so a removal is remembered
- not typed or edited by a clinician (`is_edited` false)
- not the parent of another suggestion
Everything else is kept: situations, accommodations, sub-situations, and any behavior a clinician
added, removed or edited, or that came from a session note or a parent. Test data only
(CLAUDE.md, "Current stage: pre-launch"). Not reversible: the rows are rebuilt by the next
analysis, not by downgrade.

Revision ID: c3a7e9d2b4f1
Revises: b8d2e5f1a9c3
Create Date: 2026-11-19
"""
from alembic import op

revision = 'c3a7e9d2b4f1'
down_revision = 'b8d2e5f1a9c3'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        DELETE FROM patient_insights AS p
        WHERE p.kind = 'behavior'
          AND p.sources = ARRAY['monitoring']::varchar[]
          AND p.avoidance_behavior_id IS NULL
          AND p.added_at IS NULL
          AND p.removed_at IS NULL
          AND p.is_edited = false
          AND NOT EXISTS (SELECT 1 FROM patient_insights c WHERE c.parent_insight_id = p.id)
    """)


def downgrade() -> None:
    # The deleted suggestions are not restored. The next monitoring analysis rebuilds them.
    pass
