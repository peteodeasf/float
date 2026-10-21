"""The teen data testing page: back-dating and Fill in 3 weeks (docs/plans/teen-data-testing.md).

Both are a new way to write a child's exposure data, with a chosen date and in bulk. What must
hold: nothing works with the test switch off, a date may not be in the future, and every write
touches only the signed-in teen's own records.
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.experiment import Experiment
from app.models.message import Message
from tests.factories import (
    make_org, make_patient, make_plan, make_practitioner, make_rung, make_situation,
)

AFTER = {
    "feared_outcome_occurred": False,
    "what_happened": "Test entry",
    "distress_thermometer_actual": 3,
    "bip_after": 30,
    "what_learned": "Test entry",
}


@pytest.fixture
def switch_on(monkeypatch):
    monkeypatch.setattr(settings, "TEEN_DATA_TESTING", True)


@pytest.fixture
def switch_off(monkeypatch):
    monkeypatch.setattr(settings, "TEEN_DATA_TESTING", False)


async def _teen_with_ladder(db, org, *, visible=True, scores=(3, 5, 7)):
    """A teen whose clinician has built a ladder of `scores`, easiest first."""
    patient = await make_patient(db, org)
    practitioner = await make_practitioner(db, org)
    patient.primary_practitioner_id = practitioner.id
    plan = await make_plan(db, org, patient=patient)
    plan.ladder_active = visible
    situation = await make_situation(db, plan, name="School drop off")
    rungs = [
        await make_rung(db, situation, name=f"Rung at {dt}", dt=dt, behavior_type="scenario")
        for dt in scores
    ]
    await db.flush()
    return patient, practitioner, rungs


async def _committed(api, rung) -> str:
    """An exposure set up and locked in through the teen app's own routes."""
    exp = (await api.post(f"/patient/behaviors/{rung.id}/experiments", json={
        "scheduled_date": (datetime.now(timezone.utc) - timedelta(days=3)).isoformat(),
    })).json()
    await api.put(f"/patient/experiments/{exp['id']}/before", json={
        "plan_description": rung.name, "prediction": "Test entry", "bip_before": 70,
        "distress_thermometer_expected": 6, "confidence_level": "medium",
        "scheduled_time_bucket": "afternoon",
    })
    await api.post(f"/patient/experiments/{exp['id']}/commit")
    return exp["id"]


# ── Back-dating ────────────────────────────────────────────────────────────────

async def test_a_date_is_refused_with_the_switch_off(api, db, switch_off):
    """Back-dating must never be possible for a real teen. With the switch off, saying when is
    refused outright, rather than quietly ignored and stamped now."""
    org = await make_org(db)
    patient, _, rungs = await _teen_with_ladder(db, org)
    api.sign_in_as(patient.user)
    exp_id = await _committed(api, rungs[0])

    past = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
    r = await api.put(f"/patient/experiments/{exp_id}/after", json={**AFTER, "completed_at": past})
    assert r.status_code == 403
    r = await api.post(f"/patient/experiments/{exp_id}/too-hard", json={"at": past})
    assert r.status_code == 403

    exp = await db.get(Experiment, exp_id)
    await db.refresh(exp)
    assert exp.status == "committed"


async def test_the_teen_app_still_works_with_the_switch_off(api, db, switch_off):
    """The current teen app sends no date. It must carry on exactly as before."""
    org = await make_org(db)
    patient, _, rungs = await _teen_with_ladder(db, org)
    api.sign_in_as(patient.user)
    exp_id = await _committed(api, rungs[0])

    r = await api.put(f"/patient/experiments/{exp_id}/after", json=AFTER)
    assert r.status_code == 200
    assert r.json()["completed_date"][:10] == datetime.now(timezone.utc).date().isoformat()


async def test_a_back_dated_exposure_keeps_its_date(api, db, switch_on):
    """The whole point: the clinician's weeks, streak and charts read the chosen date."""
    org = await make_org(db)
    patient, _, rungs = await _teen_with_ladder(db, org)
    api.sign_in_as(patient.user)
    exp_id = await _committed(api, rungs[0])

    when = (datetime.now(timezone.utc) - timedelta(days=10)).replace(microsecond=0)
    r = await api.put(f"/patient/experiments/{exp_id}/after", json={**AFTER, "completed_at": when.isoformat()})
    assert r.status_code == 200
    assert datetime.fromisoformat(r.json()["completed_date"]) == when


async def test_too_hard_can_be_back_dated(api, db, switch_on):
    org = await make_org(db)
    patient, _, rungs = await _teen_with_ladder(db, org)
    api.sign_in_as(patient.user)
    exp_id = await _committed(api, rungs[0])

    when = (datetime.now(timezone.utc) - timedelta(days=4)).replace(microsecond=0)
    r = await api.post(f"/patient/experiments/{exp_id}/too-hard", json={"at": when.isoformat()})
    assert r.status_code == 200
    assert datetime.fromisoformat(r.json()["too_hard_at"]) == when


async def test_a_future_date_is_refused(api, db, switch_on):
    """A date in the future would put work on the clinician's week strip that has not happened."""
    org = await make_org(db)
    patient, _, rungs = await _teen_with_ladder(db, org)
    api.sign_in_as(patient.user)
    exp_id = await _committed(api, rungs[0])

    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    r = await api.put(f"/patient/experiments/{exp_id}/after", json={**AFTER, "completed_at": future})
    assert r.status_code == 400
    r = await api.post(f"/patient/experiments/{exp_id}/too-hard", json={"at": future})
    assert r.status_code == 400


async def test_back_dating_cannot_reach_another_childs_exposure(api, db, switch_on):
    """The switch adds a date, not reach. Another child's exposure stays out of bounds."""
    org = await make_org(db)
    victim, _, victim_rungs = await _teen_with_ladder(db, org)
    other, _, _ = await _teen_with_ladder(db, org)
    api.sign_in_as(victim.user)
    exp_id = await _committed(api, victim_rungs[0])

    api.sign_in_as(other.user)
    past = (datetime.now(timezone.utc) - timedelta(days=5)).isoformat()
    r = await api.put(f"/patient/experiments/{exp_id}/after", json={**AFTER, "completed_at": past})
    assert r.status_code == 404
    r = await api.post(f"/patient/experiments/{exp_id}/too-hard", json={"at": past})
    assert r.status_code == 404

    exp = await db.get(Experiment, exp_id)
    await db.refresh(exp)
    assert exp.status == "committed"


# ── The switch, as the page reads it ───────────────────────────────────────────

async def test_the_page_can_tell_the_switch_is_off(api, db, switch_off):
    org = await make_org(db)
    patient, _, _ = await _teen_with_ladder(db, org)
    api.sign_in_as(patient.user)
    assert (await api.get("/patient/testing")).json() == {"switched_on": False}


async def test_a_clinician_cannot_use_the_testing_routes(api, db, switch_on):
    """The clinician never writes the teen's data. These routes are for a teen's own account."""
    org = await make_org(db)
    patient, practitioner, _ = await _teen_with_ladder(db, org)
    api.sign_in_as(practitioner.user)
    assert (await api.post("/patient/testing/fill-three-weeks")).status_code == 403
    rows = (await db.execute(select(Experiment).where(Experiment.patient_id == patient.id))).scalars().all()
    assert rows == []


# ── Fill in 3 weeks ────────────────────────────────────────────────────────────

async def test_fill_is_refused_with_the_switch_off(api, db, switch_off):
    org = await make_org(db)
    patient, _, _ = await _teen_with_ladder(db, org)
    api.sign_in_as(patient.user)

    assert (await api.post("/patient/testing/fill-three-weeks")).status_code == 403
    rows = (await db.execute(select(Experiment).where(Experiment.patient_id == patient.id))).scalars().all()
    assert rows == []


async def test_fill_refuses_a_ladder_the_teen_cannot_see(api, db, switch_on):
    """If the clinician has not made the ladder visible, the teen app has nothing to do — so
    neither does the fill."""
    org = await make_org(db)
    patient, _, _ = await _teen_with_ladder(db, org, visible=False)
    api.sign_in_as(patient.user)
    r = await api.post("/patient/testing/fill-three-weeks")
    assert r.status_code == 400
    assert "not visible" in r.json()["detail"]


async def test_fill_makes_the_history_the_plan_describes(api, db, switch_on):
    """Over the past 21 days: 2–3 done a week working up from the easiest rung, fear and belief
    coming down, one too hard, one left undone in the past, and every text marked as a test."""
    org = await make_org(db)
    patient, _, rungs = await _teen_with_ladder(db, org, scores=(3, 5, 7))
    api.sign_in_as(patient.user)

    r = await api.post("/patient/testing/fill-three-weeks")
    assert r.status_code == 201
    assert {k: r.json()[k] for k in ("done", "too_hard", "missed")} == {"done": 8, "too_hard": 1, "missed": 1}

    rows = (await db.execute(select(Experiment).where(Experiment.patient_id == patient.id))).scalars().all()
    now = datetime.now(timezone.utc)
    done = sorted([e for e in rows if e.status == "completed"], key=lambda e: e.completed_date)
    too_hard = [e for e in rows if e.status == "too_hard"]
    missed = [e for e in rows if e.status == "committed"]
    assert len(done) == 8 and len(too_hard) == 1 and len(missed) == 1

    # All within the past three weeks, none in the future.
    for e in done:
        assert now - timedelta(days=21) <= e.completed_date <= now
    assert too_hard[0].too_hard_at < now
    # Missed: set up for a day that has passed and never done. The clinician's app shows that as
    # missed (ExposuresTab.tsx, dayDots and DayRow).
    assert missed[0].scheduled_date < now - timedelta(days=1)
    assert missed[0].completed_date is None

    # 2–3 a week.
    per_week = [sum(1 for e in done if timedelta(days=7 * w) <= now - e.completed_date < timedelta(days=7 * (w + 1)))
                for w in range(3)]
    assert all(2 <= n <= 3 for n in per_week), per_week

    # Works up the ladder from the easiest rung, never down.
    order = {r.id: i for i, r in enumerate(rungs)}
    climbed = [order[e.avoidance_behavior_id] for e in done]
    assert climbed[0] == 0 and climbed == sorted(climbed)

    # Actual a little under expected; fear and belief lower at the end than the start.
    for e in done:
        assert e.distress_thermometer_actual < e.distress_thermometer_expected
        assert e.bip_after < e.bip_before
    assert done[-1].bip_before < done[0].bip_before
    first_rung = [e for e in done if e.avoidance_behavior_id == rungs[0].id]
    assert first_rung[-1].distress_thermometer_actual < first_rung[0].distress_thermometer_actual

    # Nobody mistakes it for a child's words.
    for e in rows:
        assert e.prediction.startswith("Test entry")
    for e in done:
        assert e.what_happened.startswith("Test entry") and e.what_learned.startswith("Test entry")


async def test_fill_reaches_the_clinician_like_real_work(api, db, switch_on):
    """It runs through the same functions as recording by hand, so the clinician gets the same
    messages a real teen's work would send them."""
    org = await make_org(db)
    patient, practitioner, _ = await _teen_with_ladder(db, org)
    api.sign_in_as(patient.user)
    await api.post("/patient/testing/fill-three-weeks")

    kinds = (await db.execute(
        select(Message.message_type).where(Message.recipient_user_id == practitioner.user_id)
    )).scalars().all()
    assert kinds.count("experiment_completed") == 8
    assert kinds.count("too_hard") == 1


async def test_fill_touches_only_the_signed_in_teens_records(api, db, switch_on):
    """A bulk write is the easiest place for a wrong id to spill into another family."""
    org = await make_org(db)
    patient, _, _ = await _teen_with_ladder(db, org)
    other, _, other_rungs = await _teen_with_ladder(db, org)
    api.sign_in_as(patient.user)
    await api.post("/patient/testing/fill-three-weeks")

    others = (await db.execute(select(Experiment).where(Experiment.patient_id == other.id))).scalars().all()
    assert others == []
    other_ids = {r.id for r in other_rungs}
    mine = (await db.execute(select(Experiment).where(Experiment.patient_id == patient.id))).scalars().all()
    assert mine and not any(e.avoidance_behavior_id in other_ids for e in mine)


async def test_fill_with_a_one_rung_ladder(api, db, switch_on):
    """A short ladder is common early in treatment. Everything lands on the one rung."""
    org = await make_org(db)
    patient, _, rungs = await _teen_with_ladder(db, org, scores=(4,))
    api.sign_in_as(patient.user)
    assert (await api.post("/patient/testing/fill-three-weeks")).status_code == 201
    rows = (await db.execute(select(Experiment).where(Experiment.patient_id == patient.id))).scalars().all()
    assert {e.avoidance_behavior_id for e in rows} == {rungs[0].id}
