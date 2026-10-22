"""Where a patient is up to.

Replaces a progress label built from four setup steps chained with `and`. That broke quietly: one
of the four needed a downward arrow recorded as facilitated by a PARENT, nothing in the app ever
created one, and so every patient sat at "Setup · Step 3 of 4" forever no matter what the clinician
did. Peter noticed it had stopped moving; nothing errored.

So each phase here is ONE observable fact. A patient moves forward because something happened, and
one thing failing to be recorded cannot freeze the column.

Derived, not stored — except MAINTENANCE and CLOSED, which are deliberate acts by a clinician and
are recorded on the patient.

The list is Peter's, 2026-10-21 (issue #53): New, Monitoring, In treatment, Maintenance, Closed.
Assessment and Planning were dropped; a patient who used to read as either now reads as Monitoring
until their plan is active.

Plan: docs/plans/patient-list-phases.md
"""
from enum import StrEnum


class Phase(StrEnum):
    NEW = "new"
    MONITORING = "monitoring"
    IN_TREATMENT = "in_treatment"
    MAINTENANCE = "maintenance"
    CLOSED = "closed"


# What a clinician reads on the list.
LABELS: dict[Phase, str] = {
    Phase.NEW: "New",
    Phase.MONITORING: "Monitoring",
    Phase.IN_TREATMENT: "In treatment",
    Phase.MAINTENANCE: "Maintenance",
    Phase.CLOSED: "Closed",
}

# The order they happen in, for sorting and for the filter.
ORDER: list[Phase] = [
    Phase.NEW, Phase.MONITORING, Phase.IN_TREATMENT, Phase.MAINTENANCE, Phase.CLOSED,
]


def phase_of(
    *,
    is_closed: bool,
    in_maintenance: bool,
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
    if in_maintenance:
        # Set by hand, so it is believed whatever the plan says.
        return Phase.MAINTENANCE
    if plan_status == "active":
        return Phase.IN_TREATMENT
    if (
        monitoring_form_sent or monitoring_entries_count > 0
        or has_any_session_note or plan_status is not None
    ):
        # Anything at all has started, but the plan is not active yet.
        return Phase.MONITORING
    return Phase.NEW
