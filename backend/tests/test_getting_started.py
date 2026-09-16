"""The getting-started checklist on a new clinician's home screen.

docs/plans/clinician-practice-onboarding.md, step 5 ("First run").
"""
from datetime import datetime, timezone

from app.models.monitoring import MonitoringForm

from tests.factories import grant_patient_to, make_org, make_org_admin, make_patient, make_practitioner


def done(body) -> dict:
    return {i["key"]: i["done"] for i in body["items"]}


async def test_a_new_clinician_has_nothing_done_and_cannot_hide_it(api, db):
    org = await make_org(db)
    me = await make_practitioner(db, org)
    api.sign_in_as(me.user)

    body = (await api.get("/practitioners/me/getting-started")).json()
    assert done(body) == {"education": False, "patient": False, "monitoring": False}
    assert body["can_hide"] is False


async def test_items_tick_off_from_what_is_really_there(api, db):
    org = await make_org(db)
    me = await make_practitioner(db, org)
    patient = await make_patient(db, org)
    await grant_patient_to(db, patient, me, owner=True)
    db.add(MonitoringForm(patient_id=patient.id, organization_id=org.id, status="sent",
                          access_token="t-" + str(patient.id), sent_at=datetime.now(timezone.utc)))
    await db.flush()
    api.sign_in_as(me.user)

    await api.post("/practitioners/me/getting-started/read_education")
    body = (await api.get("/practitioners/me/getting-started")).json()
    assert done(body) == {"education": True, "patient": True, "monitoring": True}
    assert body["can_hide"] is True


async def test_another_clinicians_patient_does_not_count(api, db):
    org = await make_org(db)
    me = await make_practitioner(db, org)
    other = await make_practitioner(db, org)
    patient = await make_patient(db, org)
    await grant_patient_to(db, patient, other, owner=True)
    api.sign_in_as(me.user)

    assert done((await api.get("/practitioners/me/getting-started")).json())["patient"] is False


async def test_an_admin_of_a_bigger_practice_is_asked_to_invite_someone(api, db):
    org = await make_org(db)
    org.size = 4
    admin = await make_org_admin(db, org)
    api.sign_in_as(admin.user)

    assert done((await api.get("/practitioners/me/getting-started")).json())["invite"] is False
    await make_practitioner(db, org)
    assert done((await api.get("/practitioners/me/getting-started")).json())["invite"] is True


async def test_hiding_is_remembered(api, db):
    org = await make_org(db)
    me = await make_practitioner(db, org)
    api.sign_in_as(me.user)

    await api.post("/practitioners/me/getting-started/hide_getting_started")
    assert (await api.get("/practitioners/me/getting-started")).json()["hidden"] is True
