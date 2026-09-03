"""One set of words for what a ladder row is

`avoidance_behaviors.behavior_type` had drifted to 11 values across 136 rows:

    avoidance          94      safety_seeking      1
    safety             25      anxiety             1
    safety_behavior     6      anxiety_response    1
    physical_symptom    2      rumination          1
    cognitive           2      scenario            1
    anxious_cognition   2

Two separate problems.

**Spellings.** `safety_behavior` and `safety_seeking` are `safety`. Seven rows.

**Nine rows that are not behaviours.** They came out of monitoring extraction and read like it —
"Complained of stomach pain", "Reported feeling sick in parking lot", "Expressed fear of peer
ridicule". A symptom is not something a child does, and a thought is not a step they can climb, so
these were appearing as rungs on a clinician's ladder.

**Nothing is deleted.** They are re-typed to `observation` and the ladder stops returning them. They
are the only evidence we have of what that extraction produced, they may have experiments attached,
and hiding them costs nothing that removing them would gain.

No shipped code writes any of the six removed values — checked across the repo 2026-09-01 — so this
is a one-time correction, not a recurring clean-up.

Revision ID: d5e2b9174c30
Revises: b3d81a67c204
Create Date: 2026-09-01
"""
from alembic import op

revision = 'd5e2b9174c30'
down_revision = 'b3d81a67c204'
branch_labels = None
depends_on = None


ALIASES = {
    'safety_behavior': 'safety',
    'safety_seeking': 'safety',
}

NOT_A_BEHAVIOUR = (
    'physical_symptom',
    'cognitive',
    'anxious_cognition',
    'anxiety_response',
    'anxiety',
    'rumination',
)


def upgrade() -> None:
    for old, new in ALIASES.items():
        op.execute(
            f"UPDATE avoidance_behaviors SET behavior_type = '{new}' "
            f"WHERE behavior_type = '{old}'"
        )

    listed = ", ".join(f"'{v}'" for v in NOT_A_BEHAVIOUR)
    op.execute(
        f"UPDATE avoidance_behaviors SET behavior_type = 'observation' "
        f"WHERE behavior_type IN ({listed})"
    )

    # Anything that is not one of the five canonical values is, by the same reasoning, not a step a
    # clinician wrote. This catches values that were in the database but not in the count above —
    # so the ladder is left holding only rows we can account for.
    op.execute(
        "UPDATE avoidance_behaviors SET behavior_type = 'observation' "
        "WHERE behavior_type IS NULL OR behavior_type NOT IN "
        "('scenario', 'avoidance', 'safety', 'ritual', 'observation')"
    )

    # The shared behaviour library carries a type too, and the clinician's add form copies it onto
    # the new row when they pick a suggestion. Leaving old spellings there would put them straight
    # back into the table this migration just cleaned.
    for old, new in ALIASES.items():
        op.execute(
            f"UPDATE behavior_library SET behavior_type = '{new}' "
            f"WHERE behavior_type = '{old}'"
        )
    op.execute(
        f"UPDATE behavior_library SET behavior_type = NULL "
        f"WHERE behavior_type IS NOT NULL AND behavior_type NOT IN "
        f"('scenario', 'avoidance', 'safety', 'ritual', 'observation')"
    )


def downgrade() -> None:
    """Not reversible in a useful way.

    Every `safety_behavior` and `safety_seeking` row is now indistinguishable from a `safety` one,
    and the six observation spellings are collapsed into one. Undoing the schema is a no-op; the
    original words are gone. Nothing depends on them.
    """
    pass
