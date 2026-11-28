"""The Progress tab shows a "too hard" attempt with the child's reason.

docs/plans/progress-tab-action-plan.md
"""
from tests.test_session_setup import ANSWERS, _in, _setup


async def test_the_clinician_sees_when_and_why_it_was_too_hard(api, db):
    _, plan, step, clinician = await _setup(db)
    api.sign_in_as(clinician.user)
    exp_id = (await api.post(f"/behaviors/{step.id}/session-setup", json={
        **ANSWERS, "scheduled_date": _in(1), "scheduled_time_bucket": "evening",
    })).json()["id"]

    api.sign_in_as(plan.patient.user)
    r = await api.post(f"/patient/experiments/{exp_id}/too-hard", json={"reason": "  Too many people  "})
    assert r.status_code == 200, r.text

    api.sign_in_as(clinician.user)
    mine = next(e for e in (await api.get(f"/patients/{plan.patient.id}/experiments")).json() if e["id"] == exp_id)
    assert mine["status"] == "too_hard"
    assert mine["too_hard_reason"] == "Too many people"
    assert mine["too_hard_at"] is not None


async def test_no_reason_is_kept_as_none(api, db):
    _, plan, step, clinician = await _setup(db)
    api.sign_in_as(clinician.user)
    exp_id = (await api.post(f"/behaviors/{step.id}/session-setup", json=ANSWERS)).json()["id"]

    api.sign_in_as(plan.patient.user)
    assert (await api.post(f"/patient/experiments/{exp_id}/too-hard", json={})).status_code == 200

    api.sign_in_as(clinician.user)
    mine = next(e for e in (await api.get(f"/patients/{plan.patient.id}/experiments")).json() if e["id"] == exp_id)
    assert mine["too_hard_reason"] is None
