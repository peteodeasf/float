"""Where a patient is up to.

Replaces a progress label built from four setup steps chained with `and`. That broke quietly: one
of the four needed a downward arrow recorded as facilitated by a PARENT, nothing in the app ever
created one, and so every patient sat at "Setup · Step 3 of 4" forever no matter what the clinician
did. Peter noticed it had stopped moving; nothing errored.

So each phase here is ONE observable fact. A patient moves forward because something happened, and
one thing failing to be recorded cannot freeze the column.

Derived, not stored — except CLOSED, which is a deliberate act by a clinician and is recorded on
the patient.

Plan: docs/plans/patient-list-phases.md
"""
from enum import StrEnum


class Phase(StrEnum):
    NEW = "new"
    MONITORING = "monitoring"
    ASSESSMENT = "assessment"
    PLANNING = "planning"
    IN_TREATMENT = "in_treatment"
    CLOSED = "closed"


# What a clinician reads on the list.
LABELS: dict[Phase, str] = {
    Phase.NEW: "New",
    Phase.MONITORING: "Monitoring",
    Phase.ASSESSMENT: "Assessment",
    Phase.PLANNING: "Planning",
    Phase.IN_TREATMENT: "In treatment",
    Phase.CLOSED: "Closed",
}

# The order they happen in, for sorting and for the filter.
ORDER: list[Phase] = [
    Phase.NEW, Phase.MONITORING, Phase.ASSESSMENT,
    Phase.PLANNING, Phase.IN_TREATMENT, Phase.CLOSED,
]


def phase_of(
    *,
    is_closed: bool,
    plan_status: str | None,
    monitoring_entries_count: int,
    has_any_session_note: bool,
    monitoring_form_sent: bool,
) -> Phase:
    """Read from the most advanced fact backwards, so a patient never appears to go backwards.

    Checking in this order matters. A patient in treatment still has a monitoring form; asking
    "was a form sent?" first would report them as Monitoring forever.
    """
    if is_closed:
        return Phase.CLOSED
    if plan_status == "active":
        return Phase.IN_TREATMENT
    if plan_status is not None:
        # A plan exists but is not active yet: it is being built.
        return Phase.PLANNING
    if monitoring_entries_count > 0 or has_any_session_note:
        return Phase.ASSESSMENT
    if monitoring_form_sent:
        return Phase.MONITORING
    return Phase.NEW
