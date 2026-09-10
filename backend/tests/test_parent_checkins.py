"""The parent's weekly check-in on their focus accommodation.

Plan: docs/plans/weekly-checkin.md
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.models.experiment import AccommodationBehavior, AccommodationCheckin

from tests.factories import grant_patient_to, make_org, make_patient, make_plan, make_practitioner
from tests.test_role_boundary import _parent_of


def _monday(weeks_from_now: int = 0) -> str:
    today = datetime.now(timezone.utc).date()
    return (today - timedelta(days=today.weekday()) + timedelta(weeks=weeks_from_now)).isoformat()


async def _family(db):
    org = await make_org(db)
    child = await make_patient(db, org)
    plan = await make_plan(db, org, patient=child)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, child, clinician, owner=True)
    parent = await _parent_of(db, org, child)
    acc = AccommodationBehavior(treatment_plan_id=plan.id, organization_id=org.id,
                                name="Lies down with them at bedtime", is_weekly_focus=True,
                                status="started")
    db.add(acc)
    await db.flush()
    return org, child, plan, clinician, parent, acc


def _answer(acc, answer="mostly", week=None):
    return {"accommodation_id": str(acc.id), "answer": answer, "week_start": week or _monday()}


async def test_the_parent_answers_for_this_week(api, db):
    *_, parent, acc = await _family(db)
    api.sign_in_as(parent)

    r = await api.post("/parent/checkins", json=_answer(acc))
    assert r.status_code == 200, r.text
    mine = (await api.get("/parent/checkins")).json()
    assert [(c["accommodation_name"], c["answer"], c["week_start"]) for c in mine] == [
        ("Lies down with them at bedtime", "mostly", _monday())]


async def test_answering_again_that_week_changes_it(api, db):
    *_, parent, acc = await _family(db)
    api.sign_in_as(parent)

    await api.post("/parent/checkins", json=_answer(acc, "every_time"))
    await api.post("/parent/checkins", json=_answer(acc, "gave_in"))

    mine = (await api.get("/parent/checkins")).json()
    assert [c["answer"] for c in mine] == ["gave_in"]


async def test_only_the_three_answers(api, db):
    *_, parent, acc = await _family(db)
    api.sign_in_as(parent)
    for bad in ("caved", "yes", ""):
        assert (await api.post("/parent/checkins", json=_answer(acc, bad))).status_code == 422, bad


async def test_only_this_week_or_last(api, db):
    *_, parent, acc = await _family(db)
    api.sign_in_as(parent)

    assert (await api.post("/parent/checkins", json=_answer(acc, week=_monday(-1)))).status_code == 200
    tuesday = (datetime.fromisoformat(_monday()) + timedelta(days=1)).date().isoformat()
    for week in (tuesday, _monday(-2), _monday(1)):
        r = await api.post("/parent/checkins", json=_answer(acc, week=week))
        assert r.status_code == 422, (week, r.text)


async def test_not_on_another_familys_accommodation(api, db):
    *_, parent, _ = await _family(db)
    *_, other_acc = await _family(db)
    api.sign_in_as(parent)

    r = await api.post("/parent/checkins", json=_answer(other_acc))
    assert r.status_code == 404, r.text
    rows = (await db.execute(select(AccommodationCheckin).where(
        AccommodationCheckin.accommodation_id == other_acc.id))).scalars().all()
    assert rows == []


async def test_a_closed_patients_parent_cannot_check_in(api, db):
    _, child, *_, parent, acc = await _family(db)
    child.closed_at = datetime.now(timezone.utc)
    await db.flush()
    api.sign_in_as(parent)

    assert (await api.post("/parent/checkins", json=_answer(acc))).status_code == 403


async def test_the_clinician_sees_the_answers(api, db):
    _, _, plan, clinician, parent, acc = await _family(db)
    api.sign_in_as(parent)
    await api.post("/parent/checkins", json=_answer(acc, "gave_in"))

    api.sign_in_as(clinician.user)
    r = await api.get(f"/plans/{plan.id}/accommodations/checkins")
    assert r.status_code == 200, r.text
    [c] = r.json()
    assert c["answer"] == "gave_in"
    assert c["accommodation_name"] == "Lies down with them at bedtime"
    assert c["parent_email"] == parent.email
    assert c["week_start"] == _monday()


async def test_a_clinician_without_access_cannot_read_them(api, db):
    org, _, plan, *_ = await _family(db)
    colleague = await make_practitioner(db, org)
    api.sign_in_as(colleague.user)

    assert (await api.get(f"/plans/{plan.id}/accommodations/checkins")).status_code in (403, 404)


async def test_deleting_the_accommodation_takes_its_answers_with_it(api, db):
    _, _, plan, clinician, parent, acc = await _family(db)
    api.sign_in_as(parent)
    await api.post("/parent/checkins", json=_answer(acc))

    api.sign_in_as(clinician.user)
    r = await api.delete(f"/plans/{plan.id}/accommodations/{acc.id}")
    assert r.status_code == 204, r.text
    assert (await api.get(f"/plans/{plan.id}/accommodations/checkins")).json() == []


async def test_logging_each_moment_is_gone(api, db):
    _, _, plan, clinician, parent, _ = await _family(db)
    api.sign_in_as(parent)
    assert (await api.post("/parent/moments", json={"held": True})).status_code in (404, 405)
    assert (await api.get("/parent/moments")).status_code in (404, 405)
    api.sign_in_as(clinician.user)
    assert (await api.get(f"/plans/{plan.id}/accommodations/moments")).status_code in (404, 405, 422)
