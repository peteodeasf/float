"""Where each accommodation has got to: not started, started or stopped.

Plan: docs/plans/accommodation-states.md
"""
from tests.factories import grant_patient_to, make_org, make_patient, make_plan, make_practitioner


async def _setup(api, db):
    org = await make_org(db)
    patient = await make_patient(db, org)
    plan = await make_plan(db, org, patient=patient)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, patient, clinician, owner=True)
    api.sign_in_as(clinician.user)
    return plan


async def _add(api, plan, name):
    r = await api.post(f"/plans/{plan.id}/accommodations", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()


async def _put(api, plan, acc, **fields):
    return await api.put(f"/plans/{plan.id}/accommodations/{acc['id']}", json=fields)


async def test_a_new_accommodation_has_not_started(api, db):
    plan = await _setup(api, db)
    assert (await _add(api, plan, "Lies down with them at bedtime"))["status"] == "not_started"


async def test_the_clinician_sets_where_it_has_got_to(api, db):
    plan = await _setup(api, db)
    acc = await _add(api, plan, "Answers for them at the doctor's")

    for state in ("started", "stopped", "not_started"):
        r = await _put(api, plan, acc, status=state)
        assert r.status_code == 200, r.text
        assert r.json()["status"] == state


async def test_only_the_three_states(api, db):
    plan = await _setup(api, db)
    acc = await _add(api, plan, "Texts the teacher for them")

    for bad in ("active", "done", ""):
        assert (await _put(api, plan, acc, status=bad)).status_code == 422, bad


async def test_making_it_the_focus_marks_it_started(api, db):
    plan = await _setup(api, db)
    acc = await _add(api, plan, "Sits outside the classroom")

    r = await _put(api, plan, acc, is_weekly_focus=True)
    assert r.json()["status"] == "started"


async def test_one_that_came_back_is_started_again_by_making_it_the_focus(api, db):
    plan = await _setup(api, db)
    acc = await _add(api, plan, "Checks the doors with them")
    await _put(api, plan, acc, status="stopped")

    r = await _put(api, plan, acc, is_weekly_focus=True)
    assert r.json()["status"] == "started"


async def test_moving_the_focus_on_leaves_the_old_one_as_it_was(api, db):
    plan = await _setup(api, db)
    first = await _add(api, plan, "Lies down with them at bedtime")
    second = await _add(api, plan, "Answers for them at the doctor's")
    await _put(api, plan, first, is_weekly_focus=True)

    await _put(api, plan, second, is_weekly_focus=True)

    rows = {a["id"]: a for a in (await api.get(f"/plans/{plan.id}/accommodations")).json()}
    assert rows[first["id"]]["is_weekly_focus"] is False
    assert rows[first["id"]]["status"] == "started"
    assert rows[second["id"]]["status"] == "started"


async def test_clearing_the_focus_does_not_change_the_state(api, db):
    plan = await _setup(api, db)
    acc = await _add(api, plan, "Sits outside the classroom")
    await _put(api, plan, acc, is_weekly_focus=True)
    await _put(api, plan, acc, status="stopped")

    r = await _put(api, plan, acc, is_weekly_focus=False)
    assert r.json()["status"] == "stopped"
