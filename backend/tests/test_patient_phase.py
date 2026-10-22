"""Where a patient is up to.

The old progress label was four conditions chained with `and`, and one of them could never become
true, so every patient stuck at step 3 and nothing complained. These tests exist mostly to make
that failure impossible to repeat: each phase depends on ONE fact, and a patient with later facts
true never falls back to an earlier phase.

The phases are Peter's list from issue #53 (2026-10-21): New, Monitoring, In treatment,
Maintenance, Closed.
"""
import pytest

from app.services.patient_phase import LABELS, ORDER, Phase, phase_of


def phase(**over) -> Phase:
    base = dict(
        is_closed=False, in_maintenance=False, plan_status=None, monitoring_entries_count=0,
        has_any_session_note=False, monitoring_form_sent=False,
    )
    return phase_of(**{**base, **over})


def test_the_phases_are_peters_list_in_order():
    """Issue #53: the old list had Assessment and Planning, which Peter said were wrong. This pins
    the labels a clinician reads, in the order the filter shows them."""
    assert [LABELS[p] for p in ORDER] == ["New", "Monitoring", "In treatment", "Maintenance", "Closed"]


def test_a_patient_with_nothing_yet_is_new():
    assert phase() == Phase.NEW


def test_a_sent_monitoring_form_is_monitoring():
    assert phase(monitoring_form_sent=True) == Phase.MONITORING


def test_entries_coming_back_is_still_monitoring():
    """Used to be Assessment. Peter agreed on #53 that these patients read as Monitoring."""
    assert phase(monitoring_form_sent=True, monitoring_entries_count=4) == Phase.MONITORING


def test_a_session_note_alone_is_monitoring():
    """Not every patient starts with a monitoring form, and a patient with a session note has
    started — they must not read as New."""
    assert phase(has_any_session_note=True) == Phase.MONITORING


@pytest.mark.parametrize("status", ["setup", "complete", "paused", "anything_else"])
def test_a_plan_that_is_not_active_is_monitoring(status):
    """Used to be Planning. Deliberately not a list of known statuses: a status nobody has thought
    of yet should still read as Monitoring rather than crashing or falling back to New."""
    assert phase(plan_status=status) == Phase.MONITORING


def test_an_active_plan_is_in_treatment():
    assert phase(monitoring_form_sent=True, plan_status="active") == Phase.IN_TREATMENT


def test_maintenance_is_set_by_hand_and_wins_over_the_plan():
    """Peter, #53: the clinician moves a patient into Maintenance by hand. Nothing works it out, so
    whatever the plan says, the clinician's choice is what shows."""
    assert phase(in_maintenance=True, plan_status="active") == Phase.MAINTENANCE
    assert phase(in_maintenance=True) == Phase.MAINTENANCE


def test_closed_wins_over_everything():
    assert phase(
        is_closed=True, in_maintenance=True, plan_status="active", monitoring_entries_count=9,
    ) == Phase.CLOSED


def test_a_patient_never_goes_backwards():
    """The bug this replaces was a patient stuck early. The opposite failure — reading an old fact
    first and reporting an advanced patient as Monitoring — is just as wrong."""
    far_along = dict(
        monitoring_form_sent=True, monitoring_entries_count=12,
        has_any_session_note=True, plan_status="active",
    )
    assert phase(**far_along) == Phase.IN_TREATMENT
