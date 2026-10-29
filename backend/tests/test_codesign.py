"""Teen co-design sign-ups. docs/plans/codesign-signup.md

The six sessions come from the migration, as they do in production.
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.api.routers import codesign
from app.core.config import settings
from app.models.codesign import CodesignSession, CodesignSignup
from app.services import codesign_form, email_service

from tests.factories import (
    _make_user, make_float_admin, make_org, make_patient, make_practice_manager, make_practitioner,
)


@pytest.fixture(autouse=True)
def open_and_outbox(monkeypatch):
    """Sign-ups open whatever today's date, and emails caught instead of sent."""
    monkeypatch.setattr(codesign, "SIGNUPS_CLOSE_AT", datetime(2100, 1, 1, tzinfo=timezone.utc))
    sent = []

    async def capture(**kwargs):
        sent.append(kwargs)
        return True

    monkeypatch.setattr(email_service, "send_codesign_email", capture)
    return sent


async def _sessions(db):
    rows = (await db.execute(select(CodesignSession).order_by(CodesignSession.starts_at))).scalars().all()
    return [s for s in rows if s.week == 1], [s for s in rows if s.week == 2]


def _form(week1, week2, **over):
    body = dict(
        teen_first_name="Maya", teen_last_name="Rivera", teen_age=15, teen_email="maya@example.com",
        parent_name="Ana Rivera", parent_email="ana@example.com",
        session1_id=str(week1.id), session2_id=str(week2.id), company="", elapsed_ms=20000,
    )
    body.update(over)
    return body


def _token(sent) -> str:
    [link] = [e["cta_link"] for e in sent if e.get("cta_link")]
    return link.split("?t=", 1)[1]


def _answers(**over):
    """The permission form filled in with a yes to everything."""
    body = dict(
        parent_consents=True, parent_allows_recording=True,
        parent_confirms_guardian=True, parent_name="Ana Rivera", parent_relationship="Mother",
        parent_phone="617-555-0142", parent_email=None, parent_session_phone="617-555-0199",
        child_wants_to_take_part=True, form_version=codesign_form.FORM_VERSION,
    )
    body.update(over)
    return body


async def _signed_up(api, db, outbox, **over) -> str:
    """One sign-up for the first date of each week; returns the permission link's token."""
    w1, w2 = await _sessions(db)
    assert (await api.post("/codesign/signups", json=_form(w1[0], w2[0], **over))).status_code == 200
    token = _token(outbox)
    outbox.clear()
    return token


async def test_the_six_dates_at_noon_eastern(api, db):
    r = (await api.get("/codesign/sessions")).json()
    assert r["open"] is True
    assert [s["label"] for s in r["sessions"]] == [
        "Tuesday, November 10 at 12pm Eastern",
        "Wednesday, November 11 at 12pm Eastern",
        "Thursday, November 12 at 12pm Eastern",
        "Tuesday, November 17 at 12pm Eastern",
        "Wednesday, November 18 at 12pm Eastern",
        "Thursday, November 19 at 12pm Eastern",
    ]
    assert [s["week"] for s in r["sessions"]] == [1, 1, 1, 2, 2, 2]


async def test_signing_up_emails_the_parent_a_permission_link_and_the_teen(api, db, open_and_outbox):
    w1, w2 = await _sessions(db)
    assert (await api.post("/codesign/signups", json=_form(w1[0], w2[1]))).status_code == 200

    [signup] = (await db.execute(select(CodesignSignup))).scalars().all()
    assert (signup.teen_email, signup.parent_email, signup.session1_id, signup.session2_id) == (
        "maya@example.com", "ana@example.com", w1[0].id, w2[1].id)
    to = [e["to_email"] for e in open_and_outbox]
    assert to == ["ana@example.com", "maya@example.com"]
    token = _token(open_and_outbox)
    assert token not in signup.permission_token_hash  # only a hash is kept
    assert "Tuesday, November 10 at 12pm Eastern" in " ".join(open_and_outbox[0]["paragraphs"])


@pytest.mark.parametrize("over", [
    dict(teen_age=12), dict(teen_age=18), dict(teen_email=""), dict(parent_email="not-an-email"),
    dict(teen_first_name="  "), dict(parent_name=""),
])
async def test_a_missing_or_wrong_answer_is_refused(api, db, over):
    w1, w2 = await _sessions(db)
    assert (await api.post("/codesign/signups", json=_form(w1[0], w2[0], **over))).status_code == 422
    assert (await db.execute(select(CodesignSignup))).scalars().all() == []


async def test_one_date_from_each_week(api, db):
    w1, w2 = await _sessions(db)
    assert (await api.post("/codesign/signups", json=_form(w1[0], w1[1]))).status_code == 422
    assert (await api.post("/codesign/signups", json=_form(w2[0], w1[0]))).status_code == 422


async def test_a_full_date_cannot_be_picked_and_frees_up_after_three_days(api, db):
    w1, w2 = await _sessions(db)
    w1[0].seats = 1
    await db.flush()
    assert (await api.post("/codesign/signups", json=_form(w1[0], w2[0]))).status_code == 200
    second = _form(w1[0], w2[0], teen_email="sam@example.com", parent_email="dad@example.com")
    assert (await api.post("/codesign/signups", json=second)).status_code == 409
    listed = (await api.get("/codesign/sessions")).json()["sessions"][0]
    assert (listed["full"], listed["seats_left"]) == (True, 0)

    # No permission after 3 days: the seat is free again.
    first = (await db.execute(select(CodesignSignup))).scalar_one()
    first.created_at = datetime.now(timezone.utc) - timedelta(days=3, minutes=1)
    await db.flush()
    assert (await api.post("/codesign/signups", json=second)).status_code == 200


async def test_permission_keeps_the_seat_after_three_days(api, db, open_and_outbox):
    w1, w2 = await _sessions(db)
    w1[0].seats = 1
    await db.flush()
    await api.post("/codesign/signups", json=_form(w1[0], w2[0]))
    r = await api.post(f"/codesign/permission/{_token(open_and_outbox)}", json=_answers())
    assert r.status_code == 200
    first = (await db.execute(select(CodesignSignup))).scalar_one()
    first.created_at = datetime.now(timezone.utc) - timedelta(days=10)
    await db.flush()
    second = _form(w1[0], w2[0], teen_email="sam@example.com", parent_email="dad@example.com")
    assert (await api.post("/codesign/signups", json=second)).status_code == 409


async def test_the_permission_page_shows_only_the_first_name_and_dates(api, db, open_and_outbox):
    # The link travels by email and could be forwarded. Before the form is sent it must give away
    # nothing about the teen but their first name and dates: no surname, email or age.
    w1, w2 = await _sessions(db)
    await api.post("/codesign/signups", json=_form(w1[2], w2[2], teen_age=16))
    r = await api.get(f"/codesign/permission/{_token(open_and_outbox)}")
    assert r.status_code == 200
    body = r.json()
    dates = ["Thursday, November 12 at 12pm Eastern", "Thursday, November 19 at 12pm Eastern"]
    assert {k: v for k, v in body.items() if k != "form"} == {
        "teen_first_name": "Maya", "dates": dates, "answered": False, "confirmed": False,
    }
    # The form itself is Peter's wording with this teen's two dates filled in.
    assert body["form"] == codesign_form.form_for(dates)
    assert f"Session 1: {dates[0]}. Session 2: {dates[1]}." in r.text
    # The form's version code is random letters and digits, so it is left out of the age check.
    text = r.text.replace(codesign_form.FORM_VERSION, "")
    for private in ("Rivera", "maya@example.com", "ana@example.com", "Ana", "16"):
        assert private not in text


async def test_every_answer_is_required(api, db, open_and_outbox):
    # A record that is missing an answer cannot say what was agreed to, so nothing is saved until
    # every choice and field is filled in, and the guardian box is ticked.
    token = await _signed_up(api, db, open_and_outbox)
    missing = [k for k in _answers() if k != "parent_email"]
    for key in missing:
        body = _answers()
        del body[key]
        assert (await api.post(f"/codesign/permission/{token}", json=body)).status_code == 422, key
    for over in (dict(parent_confirms_guardian=False), dict(parent_name="  "),
                 dict(parent_consents="no"), dict(child_wants_to_take_part=None),
                 dict(parent_phone="12"), dict(parent_phone="  12     ")):
        assert (await api.post(f"/codesign/permission/{token}", json=_answers(**over))).status_code == 422, over
    signup = (await db.execute(select(CodesignSignup))).scalar_one()
    assert (signup.form_submitted_at, signup.permission_given_at) == (None, None)
    assert open_and_outbox == []


async def test_confirmed_needs_the_parents_yes_and_the_child_box(api, db, open_and_outbox):
    # Peter, 2026-10-29: the parent's permission and the box "My child wants to participate" are
    # both needed (it replaced the teen agreement). Both: confirmed, every answer stored, and the
    # version of the wording shown is recorded.
    token = await _signed_up(api, db, open_and_outbox)
    r = await api.post(f"/codesign/permission/{token}", json=_answers(parent_email="Ana.Work@Example.com"))
    assert r.json() == {"success": True, "confirmed": True, "already": False}
    s = (await db.execute(select(CodesignSignup))).scalar_one()
    assert s.permission_given_at is not None and s.permission_given_at == s.form_submitted_at
    assert (s.permission_given_by, s.parent_signed_name, s.teen_consents) == ("Ana Rivera", "Ana Rivera", True)
    assert (s.parent_relationship, s.parent_phone, s.parent_session_phone, s.parent_contact_email) == (
        "Mother", "617-555-0142", "617-555-0199", "ana.work@example.com")
    assert s.form_version == codesign_form.FORM_VERSION
    assert (await api.get(f"/codesign/permission/{token}")).json()["confirmed"] is True


@pytest.mark.parametrize("no", ["parent_consents", "child_wants_to_take_part"])
async def test_a_no_from_either_declines_and_frees_the_seats(api, db, open_and_outbox, no):
    # "If either of you says no, your child will not take part." The seats go back at once rather
    # than after the 3-day hold, so another teen can have them.
    w1, w2 = await _sessions(db)
    w1[0].seats = 1
    await db.flush()
    token = await _signed_up(api, db, open_and_outbox)
    second = _form(w1[0], w2[0], teen_email="sam@example.com", parent_email="dad@example.com")
    assert (await api.post("/codesign/signups", json=second)).status_code == 409

    r = await api.post(f"/codesign/permission/{token}", json=_answers(**{no: False}))
    assert r.json() == {"success": True, "confirmed": False, "already": False}
    s = (await db.execute(select(CodesignSignup))).scalar_one()
    assert (s.permission_given_at, s.form_submitted_at is not None) == (None, True)
    teen_note = next(e for e in open_and_outbox if e["to_email"] == "maya@example.com")
    assert "won't be taking part" in teen_note["subject"]
    page = (await api.get(f"/codesign/permission/{token}")).json()
    assert (page["answered"], page["confirmed"]) == (True, False)
    assert (await api.post("/codesign/signups", json=second)).status_code == 200


@pytest.mark.parametrize("parent", [True, False])
async def test_recording_is_the_parents_answer(api, db, open_and_outbox, parent):
    # Peter, 2026-10-29: the teen agreement, with its own recording question, is dropped, so
    # recording follows the parent's answer. Sally's list must say no unless the parent said yes.
    token = await _signed_up(api, db, open_and_outbox)
    allowed = parent
    await api.post(f"/codesign/permission/{token}", json=_answers(parent_allows_recording=parent))
    api.sign_in_as(await make_float_admin(db))
    [row] = (await api.get("/codesign/signups")).json()["sessions"][0]["signups"]
    assert row["recording_allowed"] == allowed
    assert "quotes_allowed" not in row
    assert "completed_by" not in row
    assert (row["permission"], row["parent_relationship"], row["parent_session_phone"]) == (
        "confirmed", "Mother", "617-555-0199")


async def test_the_parent_is_emailed_a_copy_with_every_answer(api, db, open_and_outbox):
    # The form says "We will give you a copy of this form to keep". The copy carries the wording,
    # the parent's answers, the date and time, and Sally's contact. It goes to the
    # address the link was sent to, not the one typed on the page.
    token = await _signed_up(api, db, open_and_outbox)
    await api.post(f"/codesign/permission/{token}", json=_answers(
        parent_allows_recording=False, parent_email="someone.else@example.com"))
    [copy] = [e for e in open_and_outbox if e["to_email"] == "ana@example.com"]
    assert "someone.else@example.com" not in [e["to_email"] for e in open_and_outbox]
    text = "\n".join(copy["paragraphs"])
    s = (await db.execute(select(CodesignSignup))).scalar_one()
    for line in (
        "Session 1: Tuesday, November 10 at 12pm Eastern. Session 2: Tuesday, November 17 at 12pm Eastern.",
        "Group size: Up to 5 other teens, ages 13 to 17",
        "Child's name: Maya Rivera. Child's age: 15.",
        f"{codesign_form.PARENT_QUESTIONS['parent_consents']} Yes",
        f"{codesign_form.PARENT_QUESTIONS['parent_allows_recording']} No",
        f"{codesign_form.CHILD_WANTS} Yes",
        f"{codesign_form.PARENT_CONFIRM} Yes",
        "Relationship to child: Mother",
        "Phone and email: 617-555-0142, someone.else@example.com",
        "Best number to reach you during the session: 617-555-0199",
        f"Date: {codesign._stamp(s.form_submitted_at)}",
        f"Form version: {codesign_form.FORM_VERSION}",
        "sally@floatcbt.com",
    ):
        assert line in text, line


async def test_a_used_link_changes_nothing(api, db, open_and_outbox):
    # One answer per link, as before: the first one stands, and a second send neither overwrites it
    # nor emails anyone. To change an answer, the parent emails Sally.
    token = await _signed_up(api, db, open_and_outbox)
    await api.post(f"/codesign/permission/{token}", json=_answers(child_wants_to_take_part=False))
    s = (await db.execute(select(CodesignSignup))).scalar_one()
    sent_at = s.form_submitted_at
    open_and_outbox.clear()
    r = await api.post(f"/codesign/permission/{token}", json=_answers(parent_name="Someone Else"))
    assert r.json() == {"success": True, "confirmed": False, "already": True}
    await db.refresh(s)
    assert (s.form_submitted_at, s.parent_signed_name, s.permission_given_at) == (sent_at, "Ana Rivera", None)
    assert open_and_outbox == []


async def test_old_wording_is_refused(api, db, open_and_outbox):
    # A page opened before the wording changed must not record the new wording as agreed to.
    token = await _signed_up(api, db, open_and_outbox)
    r = await api.post(f"/codesign/permission/{token}", json=_answers(form_version="2026-10-19"))
    assert r.status_code == 409
    assert (await db.execute(select(CodesignSignup))).scalar_one().form_submitted_at is None


async def test_an_unknown_link_finds_nothing(api, db):
    # Guessing at links gets nothing back, and saves nothing.
    assert (await api.get("/codesign/permission/not-a-real-token")).status_code == 404
    assert (await api.post("/codesign/permission/not-a-real-token", json=_answers())).status_code == 404


async def test_six_seats_per_session(api, db):
    # Peter, 2026-10-21: 6 seats per session, set on the six existing dates by the migration.
    assert [s.seats for s in (await db.execute(select(CodesignSession))).scalars().all()] == [6] * 6


async def test_bots_are_dropped_silently(api, db, open_and_outbox):
    w1, w2 = await _sessions(db)
    assert (await api.post("/codesign/signups", json=_form(w1[0], w2[0], company="Acme"))).status_code == 200
    assert (await api.post("/codesign/signups", json=_form(w1[0], w2[0], elapsed_ms=500))).status_code == 200
    assert (await db.execute(select(CodesignSignup))).scalars().all() == []
    assert open_and_outbox == []


async def test_closed_after_the_deadline(api, db, monkeypatch):
    monkeypatch.setattr(codesign, "SIGNUPS_CLOSE_AT", datetime(2000, 1, 1, tzinfo=timezone.utc))
    w1, w2 = await _sessions(db)
    assert (await api.get("/codesign/sessions")).json()["open"] is False
    assert (await api.post("/codesign/signups", json=_form(w1[0], w2[0]))).status_code == 400


async def test_one_email_cannot_be_sent_a_stream_of_sign_ups(api, db):
    w1, w2 = await _sessions(db)
    for i in range(codesign.MAX_PER_EMAIL_PER_DAY):
        r = await api.post("/codesign/signups", json=_form(w1[0], w2[0], teen_email=f"t{i}@example.com"))
        assert r.status_code == 200
    r = await api.post("/codesign/signups", json=_form(w1[0], w2[0], teen_email="t9@example.com"))
    assert r.status_code == 429


async def test_only_float_admins_see_who_signed_up(api, db):
    w1, w2 = await _sessions(db)
    await api.post("/codesign/signups", json=_form(w1[0], w2[0]))
    assert (await api.get("/codesign/signups")).status_code == 401
    clinician = await make_practitioner(db, await make_org(db))
    api.sign_in_as(clinician.user)
    assert (await api.get("/codesign/signups")).status_code == 403

    api.sign_in_as(await make_float_admin(db))
    r = (await api.get("/codesign/signups")).json()
    first = r["sessions"][0]
    assert (first["taken"], first["seats"]) == (1, 6)
    [row] = first["signups"]
    assert (row["teen_email"], row["parent_email"], row["permission"]) == ("maya@example.com", "ana@example.com", "waiting")
    assert r["sessions"][1]["signups"] == []
    assert r["sessions"][3]["signups"][0]["id"] == row["id"]


# ── The named viewers: a read-only copy of the list for clinician logins on CODESIGN_VIEWERS ──
# docs/plans/codesign-viewer.md. The list holds minors' names and emails and their parents'
# details, so every way in that is not "a clinician on the list" must be refused.

VIEWER_ROUTE = "/codesign/viewer/signups"


async def _viewer(db, email="viewer@example.com"):
    clinician = await make_practitioner(db, await make_org(db))
    clinician.user.email = email
    await db.flush()
    return clinician


async def test_a_clinician_on_the_list_sees_who_signed_up(api, db, monkeypatch):
    # The point of the feature: the person running the sessions can read the list without being
    # made a Float admin.
    monkeypatch.setattr(settings, "CODESIGN_VIEWERS", "viewer@example.com")
    w1, w2 = await _sessions(db)
    await api.post("/codesign/signups", json=_form(w1[0], w2[0]))
    api.sign_in_as((await _viewer(db)).user)
    r = await api.get(VIEWER_ROUTE)
    assert r.status_code == 200
    [row] = r.json()["sessions"][0]["signups"]
    assert (row["teen_email"], row["parent_email"]) == ("maya@example.com", "ana@example.com")
    assert (await api.get("/practitioners/me")).json()["can_view_codesign"] is True


async def test_a_clinician_not_on_the_list_is_refused(api, db, monkeypatch):
    # Having a clinician login is not enough: any clinician at any practice could otherwise read
    # minors' contact details.
    monkeypatch.setattr(settings, "CODESIGN_VIEWERS", "viewer@example.com")
    api.sign_in_as((await _viewer(db, email="someone-else@example.com")).user)
    assert (await api.get(VIEWER_ROUTE)).status_code == 403
    assert (await api.get("/practitioners/me")).json()["can_view_codesign"] is False


async def test_parent_teen_and_office_manager_logins_are_refused_even_if_listed(api, db, monkeypatch):
    # Only a clinician login counts. If one of these emails got onto the list by mistake, a
    # parent, a teen or an office manager still must not see other families' teens.
    org = await make_org(db)
    teen = (await make_patient(db, org)).user
    parent = await _make_user(db, org, "parent")
    manager = await make_practice_manager(db, org)
    monkeypatch.setattr(settings, "CODESIGN_VIEWERS", ",".join(u.email for u in (teen, parent, manager)))
    for user in (teen, parent, manager):
        api.sign_in_as(user)
        assert (await api.get(VIEWER_ROUTE)).status_code == 403, user.email


async def test_no_sign_in_is_refused(api, db, monkeypatch):
    # Anyone who has the address but no login gets nothing.
    monkeypatch.setattr(settings, "CODESIGN_VIEWERS", "viewer@example.com")
    assert (await api.get(VIEWER_ROUTE)).status_code == 401


async def test_an_empty_setting_means_nobody(api, db, monkeypatch):
    # The default. Nobody sees the list until Peter sets it on Railway.
    monkeypatch.setattr(settings, "CODESIGN_VIEWERS", "")
    api.sign_in_as((await _viewer(db)).user)
    assert (await api.get(VIEWER_ROUTE)).status_code == 403
    assert (await api.get("/practitioners/me")).json()["can_view_codesign"] is False
    # Stray commas and spaces do not let anyone through either.
    monkeypatch.setattr(settings, "CODESIGN_VIEWERS", " , ,")
    assert (await api.get(VIEWER_ROUTE)).status_code == 403


async def test_matching_ignores_case_and_spaces(api, db, monkeypatch):
    # The setting is typed by hand on Railway; " Viewer@Example.COM " must still match the login.
    monkeypatch.setattr(settings, "CODESIGN_VIEWERS", " other@example.com ,  Viewer@Example.COM ")
    api.sign_in_as((await _viewer(db, email="viewer@example.com")).user)
    assert (await api.get(VIEWER_ROUTE)).status_code == 200


async def test_the_viewer_list_is_the_admin_list(api, db, monkeypatch, open_and_outbox):
    # One function behind both routes, so the viewers' page and the admin dashboard never disagree
    # about who signed up or whose permission is in.
    monkeypatch.setattr(settings, "CODESIGN_VIEWERS", "viewer@example.com")
    w1, w2 = await _sessions(db)
    await api.post("/codesign/signups", json=_form(w1[0], w2[1]))
    await api.post("/codesign/permission/" + _token(open_and_outbox), json=_answers())
    await api.post("/codesign/signups", json=_form(
        w1[1], w2[1], teen_email="sam@example.com", parent_email="dad@example.com"))

    api.sign_in_as(await make_float_admin(db))
    admin_view = (await api.get("/codesign/signups")).json()
    api.sign_in_as((await _viewer(db)).user)
    assert (await api.get(VIEWER_ROUTE)).json() == admin_view


# Why: Peter, 2026-10-29, removed the quotes question and its sentence from the permission form.
# It must not come back in the form the page shows, nor in the emailed copy.
def test_the_form_says_nothing_about_quotes():
    import json
    dates = ["Tuesday, November 10 at 12pm Eastern", "Tuesday, November 17 at 12pm Eastern"]
    text = (json.dumps(codesign_form.form_for(dates)) + " ".join(codesign_form.as_paragraphs(dates))).lower()
    assert "quote" not in text
    assert "parent_allows_quotes" not in codesign_form.PARENT_QUESTIONS


# Why: Peter, 2026-10-29, dropped the teen agreement. The form must not show it again, and the
# parent's part carries the one box in its place.
def test_the_form_has_no_teen_agreement():
    form = codesign_form.form_for(["Tuesday, November 10 at 12pm Eastern", "Tuesday, November 17 at 12pm Eastern"])
    assert "teen" not in form
    assert form["parent"]["child_wants"] == "My child wants to participate in this initiative."
