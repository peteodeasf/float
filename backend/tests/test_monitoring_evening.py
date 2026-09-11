"""The evening email during the monitoring week: anything come up today?

Peter, 2026-09-11. docs/plans/monitoring-just-say-it.md
"""
import secrets

from sqlalchemy import select

from app.models.monitoring import MonitoringEntry, MonitoringForm
from app.services import email_service
from app.services.reminder_jobs import run_due

from tests.factories import grant_patient_to, make_org, make_patient, make_practitioner
from tests.test_scheduled_jobs import NEW_YORK, Outbox, at

LOS_ANGELES = "America/Los_Angeles"  # seven hours behind UTC in September


class FormOutbox:
    def __init__(self):
        self.sent = []

    async def __call__(self, form, to_email):
        self.sent.append((form.id, to_email))
        return True


async def _monitoring(db, tz=NEW_YORK, sent=None, email="parent@example.com", name="Sam Rivera"):
    """A form sent on Thursday the 10th at 10am in New York."""
    org = await make_org(db)
    child = await make_patient(db, org, name=name)
    child.parent_email = "on-the-record@example.com"  # never used: it may be the other parent's
    form = MonitoringForm(patient_id=child.id, organization_id=org.id, status="in_progress",
                          access_token=secrets.token_hex(32), sent_at=sent or at(10, 14),
                          parent_email=email, parent_timezone=tz)
    db.add(form)
    await db.flush()
    return org, child, form


async def _run(db, when):
    out = FormOutbox()
    await run_due(db, when, Outbox(), out)
    return out.sent


async def test_each_evening_of_the_monitoring_week_from_7pm_once(db):
    _, _, form = await _monitoring(db)
    assert await _run(db, at(10, 23, 10)) == []  # the evening it was sent
    assert await _run(db, at(11, 22, 30)) == []  # 6:30pm
    assert await _run(db, at(11, 23, 10)) == [(form.id, "parent@example.com")]  # 7:10pm
    assert await _run(db, at(11, 23, 40)) == []  # once a day
    assert await _run(db, at(12, 23, 10)) == [(form.id, "parent@example.com")]


async def test_not_on_a_day_they_already_added_one(db):
    _, _, form = await _monitoring(db)
    db.add(MonitoringEntry(monitoring_form_id=form.id, situation="School run", created_at=at(11, 15)))
    await db.flush()
    assert await _run(db, at(11, 23, 10)) == []
    assert await _run(db, at(12, 23, 10)) == [(form.id, "parent@example.com")]


async def test_the_week_ends(db):
    _, _, form = await _monitoring(db)
    assert await _run(db, at(17, 23, 10)) == [(form.id, "parent@example.com")]  # the seventh evening
    assert await _run(db, at(18, 23, 10)) == []


async def test_not_once_submitted_turned_off_or_closed_or_with_no_address(db):
    _, _, submitted = await _monitoring(db)
    submitted.status = "submitted"
    _, _, off = await _monitoring(db)
    off.reminders_off_at = at(10, 15)
    _, closed_child, _ = await _monitoring(db)
    closed_child.closed_at = at(10, 16)
    await _monitoring(db, email=None)
    await db.flush()
    assert await _run(db, at(11, 23, 10)) == []


async def test_the_clinicians_time_zone_when_the_page_never_said(db):
    org, child, form = await _monitoring(db, tz=None)
    clinician = await make_practitioner(db, org)
    clinician.user.timezone = LOS_ANGELES
    child.primary_practitioner_id = clinician.id
    await db.flush()
    assert await _run(db, at(11, 23, 10)) == []  # 4:10pm in Los Angeles
    assert await _run(db, at(12, 2, 10)) == [(form.id, "parent@example.com")]  # 7:10pm


async def test_no_email_without_any_time_zone(db):
    await _monitoring(db, tz=None)
    assert await _run(db, at(11, 23, 10)) == []


async def test_the_email_says_nothing_clinical_and_links_back(db, monkeypatch):
    _, _, form = await _monitoring(db, name="Sam Rivera")
    captured = []

    async def capture(**kwargs):
        captured.append(kwargs)
        return True

    monkeypatch.setattr(email_service, "send_reminder_email", capture)
    await run_due(db, at(11, 23, 10), Outbox())

    [email] = captured
    assert email["subject"] == "Anything come up today?"
    assert not any("Sam" in str(v) or "Rivera" in str(v) for v in email.values())
    assert email["cta_link"].endswith(f"/monitor/{form.access_token}")
    assert email["off_link"].endswith(f"/monitor/{form.access_token}?reminders=off")


async def test_the_page_reports_where_the_parent_lives(api, db):
    _, _, form = await _monitoring(db, tz=None)
    await api.get(f"/monitor/{form.access_token}", params={"tz": "Europe/Dublin"})
    assert form.parent_timezone == "Europe/Dublin"
    for bad in ("Not/AZone", "../../etc/passwd", "x" * 80):
        await api.get(f"/monitor/{form.access_token}", params={"tz": bad})
        assert form.parent_timezone == "Europe/Dublin", bad


async def test_the_off_link_stops_them(api, db):
    _, _, form = await _monitoring(db)
    r = await api.post(f"/monitor/{form.access_token}/reminders-off")
    assert r.status_code == 200
    assert form.reminders_off_at is not None
    assert await _run(db, at(11, 23, 10)) == []
    assert (await api.post("/monitor/not-a-real-token/reminders-off")).status_code == 404


async def test_it_goes_only_to_the_address_the_form_was_sent_to(api, db, monkeypatch):
    """Found by the security review: the patient record's address may be a different parent's."""
    org = await make_org(db)
    child = await make_patient(db, org)
    child.parent_email = "on-the-record@example.com"
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, child, clinician, owner=True)

    async def fake_invite(**kwargs):
        return True

    monkeypatch.setattr(email_service, "send_monitoring_form_email", fake_invite)
    api.sign_in_as(clinician.user)
    r = await api.post(f"/patients/{child.id}/monitoring-form/send", json={"parent_email": " sent-to@example.com "})
    assert r.status_code == 200, r.text
    form = (await db.execute(select(MonitoringForm).where(MonitoringForm.patient_id == child.id))).scalar_one()
    assert form.parent_email == "sent-to@example.com"

