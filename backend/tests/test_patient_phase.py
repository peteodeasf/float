"""Where a patient is up to.

The old progress label was four conditions chained with `and`, and one of them could never become
true, so every patient stuck at step 3 and nothing complained. These tests exist mostly to make
that failure impossible to repeat: each phase depends on ONE fact, and a patient with later facts
true never falls back to an earlier phase.
"""
import pytest

from app.services.patient_phase import Phase, phase_of


def phase(**over) -> Phase:
    base = dict(
        is_closed=False, plan_status=None, monitoring_entries_count=0,
        has_any_session_note=False, monitoring_form_sent=False,
    )
    return phase_of(**{**base, **over})


def test_a_patient_with_nothing_yet_is_new():
    assert phase() == Phase.NEW


def test_a_sent_monitoring_form_is_monitoring():
    assert phase(monitoring_form_sent=True) == Phase.MONITORING


def test_entries_coming_back_is_assessment():
    assert phase(monitoring_form_sent=True, monitoring_entries_count=4) == Phase.ASSESSMENT


def test_a_session_note_is_assessment_even_with_no_monitoring():
    """Not every patient starts with a monitoring form."""
    assert phase(has_any_session_note=True) == Phase.ASSESSMENT


def test_a_plan_that_is_not_active_is_planning():
    assert phase(monitoring_form_sent=True, plan_status="setup") == Phase.PLANNING


def test_an_active_plan_is_in_treatment():
    assert phase(monitoring_form_sent=True, plan_status="active") == Phase.IN_TREATMENT


def test_closed_wins_over_everything():
    assert phase(is_closed=True, plan_status="active", monitoring_entries_count=9) == Phase.CLOSED


def test_a_patient_never_goes_backwards():
    """The bug this replaces was a patient stuck early. The opposite failure — reading an old fact
    first and reporting an advanced patient as Monitoring — is just as wrong."""
    far_along = dict(
        monitoring_form_sent=True, monitoring_entries_count=12,
        has_any_session_note=True, plan_status="active",
    )
    assert phase(**far_along) == Phase.IN_TREATMENT


@pytest.mark.parametrize("status", ["setup", "complete", "paused", "anything_else"])
def test_any_plan_status_other_than_active_means_planning(status):
    """Deliberately not a list of known statuses. A status nobody has thought of yet should read as
    Planning rather than crashing or falling through to Monitoring."""
    assert phase(monitoring_form_sent=True, plan_status=status) == Phase.PLANNING
