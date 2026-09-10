"""Recording parental consent to connect the child, and the clinician app seeing it.

Both halves were broken from 2026-08-10, when the consent step was added:

* POST /child-connect-consent saved the consent and then failed building its reply — the patient
  row has no email, and the reply requires one — so every click was a 500.
* GET /patients/{id} never included the consent date, so the Teen Access panel never learned
  consent had been given, and Send invite stayed disabled for every patient.
"""
from tests.factories import grant_patient_to, make_org, make_patient, make_practitioner


async def _clinician(db, org, patient):
    c = await make_practitioner(db, org)
    await grant_patient_to(db, patient, c, owner=True)
    return c


async def test_recording_consent_succeeds_and_says_so(api, db):
    org = await make_org(db)
    patient = await make_patient(db, org)
    clinician = await _clinician(db, org, patient)

    api.sign_in_as(clinician.user)
    r = await api.post(f"/patients/{patient.id}/child-connect-consent", json={"granted": True})

    assert r.status_code == 200, r.text
    body = r.json()
    assert body["child_connect_consent_at"] is not None
    assert body["consent_source"] == "clinician"
    assert body["email"]


async def test_the_patient_page_sees_the_consent(api, db):
    """The half that kept Send invite disabled even after a reload."""
    org = await make_org(db)
    patient = await make_patient(db, org)
    clinician = await _clinician(db, org, patient)

    api.sign_in_as(clinician.user)
    before = (await api.get(f"/patients/{patient.id}")).json()
    assert before["child_connect_consent_at"] is None

    await api.post(f"/patients/{patient.id}/child-connect-consent", json={"granted": True})

    after = (await api.get(f"/patients/{patient.id}")).json()
    assert after["child_connect_consent_at"] is not None
    assert after["consent_source"] == "clinician"


async def test_consent_can_be_withdrawn(api, db):
    org = await make_org(db)
    patient = await make_patient(db, org)
    clinician = await _clinician(db, org, patient)

    api.sign_in_as(clinician.user)
    await api.post(f"/patients/{patient.id}/child-connect-consent", json={"granted": True})
    r = await api.post(f"/patients/{patient.id}/child-connect-consent", json={"granted": False})

    assert r.status_code == 200, r.text
    assert r.json()["child_connect_consent_at"] is None
    assert r.json()["consent_source"] is None


async def test_saving_the_profile_keeps_consent_in_the_reply(api, db):
    """The profile form refreshes the page's copy of the patient from this reply, so leaving
    consent out here would make the panel forget it again."""
    org = await make_org(db)
    patient = await make_patient(db, org)
    clinician = await _clinician(db, org, patient)

    api.sign_in_as(clinician.user)
    await api.post(f"/patients/{patient.id}/child-connect-consent", json={"granted": True})
    r = await api.put(f"/patients/{patient.id}", json={"name": "A new name"})

    assert r.status_code == 200, r.text
    assert r.json()["name"] == "A new name"
    assert r.json()["child_connect_consent_at"] is not None


async def test_a_clinician_without_access_cannot_record_consent(api, db):
    org = await make_org(db)
    patient = await make_patient(db, org)
    await _clinician(db, org, patient)
    outsider = await make_practitioner(db, org)

    api.sign_in_as(outsider.user)
    r = await api.post(f"/patients/{patient.id}/child-connect-consent", json={"granted": True})

    assert r.status_code in (403, 404)
