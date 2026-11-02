"""Co-design sign-ups, high school and college. docs/plans/codesign-signup.md

The sessions (six high school, three college) come from the migrations, as they do in production.
"""
import json
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.api.routers import codesign
from app.core.config import settings
from app.models.codesign import COLLEGE, HIGH_SCHOOL, CodesignSession, CodesignSignup
from app.services import codesign_agreement, codesign_form, email_service

from tests.factories import (
    _make_user, make_float_admin, make_org, make_patient, make_practice_manager, make_practitioner,
)


@pytest.fixture(autouse=True)
def open_and_outbox(monkeypatch):
    """Sign-ups open whatever today's date, and emails caught instead of sent."""
    monkeypatch.setattr(codesign, "SIGNUPS_CLOSE_AT", datetime(2100, 1, 1, tzinfo=timezone.utc))
    monkeypatch.setattr(codesign, "COLLEGE_SIGNUPS_CLOSE_AT", datetime(2100, 1, 1, tzinfo=timezone.utc))
    sent = []

    async def capture(**kwargs):
        sent.append(kwargs)
        return True

    monkeypatch.setattr(email_service, "send_codesign_email", capture)
    return sent


async def _sessions(db):
    """The high school sessions, week 1 and week 2."""
    rows = (await db.execute(select(CodesignSession).where(CodesignSession.audience == HIGH_SCHOOL)
                             .order_by(CodesignSession.starts_at))).scalars().all()
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
    [link] = [e["cta_link"] for e in sent if "?t=" in (e.get("cta_link") or "")]
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
        "Thursday, November 19 at 12pm Eastern",
        "Friday, November 20 at 12pm Eastern",
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
    dates = ["Thursday, November 12 at 12pm Eastern", "Friday, November 20 at 12pm Eastern"]
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
    # Peter, 2026-10-21: 6 seats per session, set on the six high school dates by the migration.
    # Peter, 2026-11-02: 6 on each of the three college dates too.
    assert [s.seats for s in (await db.execute(select(CodesignSession))).scalars().all()] == [6] * 9


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


# ── The summary emailed to the team (CODESIGN_NOTIFY_EMAILS) ─────────────────

TEAM = ("notify@example.com", "notify.two@example.com")


@pytest.fixture
def team(monkeypatch):
    monkeypatch.setattr(settings, "CODESIGN_NOTIFY_EMAILS", f" {TEAM[0]} , {TEAM[1]} ")


def _to_team(outbox):
    return [e for e in outbox if e["to_email"] in TEAM]


async def test_a_sign_up_sends_the_summary_to_everyone_on_the_list(api, db, open_and_outbox, team):
    # Peter, 2026-10-29: Sally hears about each new sign-up without opening the list. Every address
    # on the setting gets it, spaces around the commas ignored.
    w1, w2 = await _sessions(db)
    await api.post("/codesign/signups", json=_form(w1[0], w2[0]))
    sent = _to_team(open_and_outbox)
    assert sorted(e["to_email"] for e in sent) == sorted(TEAM)
    assert {e["subject"] for e in sent} == {"New co-design sign-up, high school: Maya R."}
    assert sent[0]["paragraphs"][0] == ("Maya R. (high school) signed up for Tuesday, November 10 at "
                                        "12pm Eastern, and Tuesday, November 17 at 12pm Eastern.")
    assert sent[0]["cta_link"] == f"{settings.BASE_URL}/codesign/signups"


async def test_nothing_goes_to_the_team_when_the_setting_is_empty(api, db, open_and_outbox, monkeypatch):
    # Empty by default, so nothing is sent until Peter sets it on Railway. Only the parent and the
    # teen are emailed, as before.
    monkeypatch.setattr(settings, "CODESIGN_NOTIFY_EMAILS", " , ")
    w1, w2 = await _sessions(db)
    await api.post("/codesign/signups", json=_form(w1[0], w2[0]))
    assert [e["to_email"] for e in open_and_outbox] == ["ana@example.com", "maya@example.com"]
    token = _token(open_and_outbox)
    open_and_outbox.clear()
    await api.post(f"/codesign/permission/{token}", json=_answers())
    assert [e["to_email"] for e in open_and_outbox] == ["ana@example.com", "maya@example.com"]


@pytest.mark.parametrize("answers, subject", [
    (dict(), "Co-design, high school: Maya R. confirmed"),
    (dict(parent_consents=False), "Co-design, high school: Maya R. won't take part"),
])
async def test_an_answer_sends_one_summary(api, db, open_and_outbox, team, answers, subject):
    # Peter, 2026-10-29: Sally also hears when a parent confirms or says no, in the same format.
    # One email per address, and only one: the parent's copy and the teen's note are unchanged.
    token = await _signed_up(api, db, open_and_outbox)
    await api.post(f"/codesign/permission/{token}", json=_answers(**answers))
    sent = _to_team(open_and_outbox)
    assert sorted(e["to_email"] for e in sent) == sorted(TEAM)
    assert {e["subject"] for e in sent} == {subject}
    status = "confirmed" if not answers else "declined"
    assert f"Maya R. ({status})" in " ".join(sent[0]["paragraphs"])


async def test_a_repeat_send_tells_the_team_nothing(api, db, open_and_outbox, team):
    # The first answer stands and a second send changes nothing, so there is nothing new to tell.
    token = await _signed_up(api, db, open_and_outbox)
    await api.post(f"/codesign/permission/{token}", json=_answers())
    open_and_outbox.clear()
    r = await api.post(f"/codesign/permission/{token}", json=_answers())
    assert r.json()["already"] is True
    assert open_and_outbox == []


async def test_the_summary_has_names_and_counts_and_no_contact_details(api, db, open_and_outbox, team):
    # The summary goes to an ordinary inbox outside the sign-in. It carries each teen's first name
    # and last initial, the seat counts and the statuses, and nothing else about a teen or parent:
    # no surname, age, email, phone or parent name. Those stay behind the sign-in.
    w1, w2 = await _sessions(db)
    await api.post("/codesign/signups", json=_form(w1[0], w2[0]))
    token = _token(open_and_outbox)
    await api.post(f"/codesign/permission/{token}", json=_answers())
    # The whole test is one database transaction, so now() gives both sign-ups the same created_at
    # and the list's order would be a coin toss. In production each sign-up is its own transaction.
    maya = (await db.execute(select(CodesignSignup))).scalar_one()
    maya.created_at -= timedelta(minutes=1)
    await db.flush()
    open_and_outbox.clear()
    await api.post("/codesign/signups", json=_form(
        w1[0], w2[1], teen_first_name="Sam", teen_last_name="Okafor", teen_age=16,
        teen_email="sam.teen@example.com", parent_name="Grace Okafor", parent_email="grace@example.com"))
    [mail, _] = _to_team(open_and_outbox)
    text = "\n".join([mail["subject"], mail["heading"], *mail["paragraphs"]])

    assert mail["subject"] == "New co-design sign-up, high school: Sam O."
    assert "High school: 2 signed up so far." in text
    assert ("High school · Tuesday, November 10 at 12pm Eastern: 2 of 6 seats taken. "
            "Maya R. (confirmed), Sam O. (waiting for permission).") in text
    assert "High school · Tuesday, November 17 at 12pm Eastern: 1 of 6 seats taken. Maya R. (confirmed)." in text
    assert ("High school · Thursday, November 19 at 12pm Eastern: 1 of 6 seats taken. "
            "Sam O. (waiting for permission).") in text
    assert "High school · Wednesday, November 11 at 12pm Eastern: 0 of 6 seats taken. No sign-ups yet." in text
    # High school sessions in date order, then college.
    labels = [p.split(":")[0] for p in mail["paragraphs"][2:8]]
    assert labels[0].endswith("Tuesday, November 10 at 12pm Eastern")
    assert labels[-1].endswith("Friday, November 20 at 12pm Eastern")
    assert "College: 0 signed up so far." in text
    for secret in ("Rivera", "Okafor", "Ana", "Grace", "15", "16", "@", "617", "555", "Mother"):
        assert secret not in text, secret


async def test_a_failing_team_email_does_not_fail_the_sign_up(api, db, open_and_outbox, team, monkeypatch):
    # The summary is a courtesy to the team. If sending it breaks, the teen is still signed up, the
    # parent and the teen still get their emails, and the parent's answer is still recorded.
    sent = []

    async def flaky(**kwargs):
        if kwargs["to_email"] in TEAM:
            raise RuntimeError("mail service down")
        sent.append(kwargs)
        return True

    monkeypatch.setattr(email_service, "send_codesign_email", flaky)
    w1, w2 = await _sessions(db)
    assert (await api.post("/codesign/signups", json=_form(w1[0], w2[0]))).status_code == 200
    assert [e["to_email"] for e in sent] == ["ana@example.com", "maya@example.com"]
    assert (await db.execute(select(CodesignSignup))).scalar_one() is not None
    r = await api.post(f"/codesign/permission/{_token(sent)}", json=_answers())
    assert r.status_code == 200 and r.json()["confirmed"] is True


# ── College (18 to 20): one date, no parent, they agree for themselves ───────
# Peter, 2026-11-02. docs/plans/codesign-signup.md ("College students")

# Read before the autouse fixture opens sign-ups, so the real closing dates can be checked.
REAL_SIGNUPS_CLOSE_AT = codesign.SIGNUPS_CLOSE_AT
REAL_COLLEGE_SIGNUPS_CLOSE_AT = codesign.COLLEGE_SIGNUPS_CLOSE_AT


async def _college_sessions(db):
    return (await db.execute(select(CodesignSession).where(CodesignSession.audience == COLLEGE)
                             .order_by(CodesignSession.starts_at))).scalars().all()


def _college_form(session, **over):
    body = dict(
        first_name="Jordan", last_name="Kim", age=19, email="Jordan.Kim@example.com",
        session_id=str(session.id), agrees_to_recording=True, agrees_to_take_part=True,
        agreement_version=codesign_agreement.AGREEMENT_VERSION, company="", elapsed_ms=20000,
    )
    body.update(over)
    return body


async def _college_rows(db):
    return (await db.execute(select(CodesignSignup).where(CodesignSignup.audience == COLLEGE))).scalars().all()


async def test_the_three_college_dates_and_the_agreement(api, db):
    # Why: the college page shows exactly the poster's three dates at 12pm Eastern, and the
    # agreement text comes from the server, so the page and the emailed copy say the same thing.
    r = (await api.get("/codesign/college/sessions")).json()
    assert r["open"] is True
    assert [s["label"] for s in r["sessions"]] == [
        "Tuesday, November 10 at 12pm Eastern",
        "Wednesday, November 11 at 12pm Eastern",
        "Thursday, November 12 at 12pm Eastern",
    ]
    assert [s["seats_left"] for s in r["sessions"]] == [6, 6, 6]
    assert r["agreement"] == codesign_agreement.agreement()
    text = json.dumps(r["agreement"])
    for line in ("This is product research, not a counseling session",
                 "receive a $60 gift card after completing full session.",
                 "I agree to the session being recorded as described above.",
                 "I have read this information and agree to take part."):
        assert line in text, line


async def test_a_college_sign_up_with_both_boxes_is_confirmed_at_once(api, db, open_and_outbox):
    # Why: Peter, 2026-11-02: college students are over 18, so there is no parent, no permission link
    # and no 3-day hold. Signing up with both boxes ticked confirms them, and the record says what
    # they agreed to, when, and which wording.
    [s1, *_] = await _college_sessions(db)
    r = await api.post("/codesign/college/signups", json=_college_form(s1))
    assert r.status_code == 200
    [row] = await _college_rows(db)
    assert (row.teen_first_name, row.teen_last_name, row.teen_age, row.teen_email) == (
        "Jordan", "Kim", 19, "jordan.kim@example.com")
    assert (row.session1_id, row.session2_id, row.parent_name, row.parent_email, row.permission_token_hash) == (
        s1.id, None, None, None, None)
    assert (row.agrees_to_recording, row.agrees_to_take_part) == (True, True)
    assert row.agreed_at is not None
    assert row.agreement_version == codesign_agreement.AGREEMENT_VERSION

    # Only the student is emailed: their date, who sends the invite, and a copy of what they agreed to.
    [mail] = open_and_outbox
    assert mail["to_email"] == "jordan.kim@example.com"
    assert "cta_link" not in mail
    text = "\n".join(mail["paragraphs"])
    assert "Your date: Tuesday, November 10 at 12pm Eastern." in text
    assert "Sally will send you the video invite" in text
    for line in (*codesign_agreement.as_paragraphs(),
                 "I agree to the session being recorded as described above. Yes",
                 "I have read this information and agree to take part. Yes",
                 f"Version: {codesign_agreement.AGREEMENT_VERSION}",
                 codesign._stamp(row.agreed_at)):
        assert line in text, line

    api.sign_in_as(await make_float_admin(db))
    listing = (await api.get("/codesign/signups")).json()
    [listed] = listing["college_sessions"][0]["signups"]
    assert (listed["first_name"], listed["age"], listed["email"], listed["recording_agreed"]) == (
        "Jordan", 19, "jordan.kim@example.com", True)
    assert listed["confirmed_at"] is not None
    assert not any(k.startswith("parent") or k == "permission" for k in listed)
    # Not on any high school session.
    assert all(sess["signups"] == [] for sess in listing["sessions"])


@pytest.mark.parametrize("over", [
    dict(agrees_to_recording=False), dict(agrees_to_take_part=False),
    dict(agrees_to_recording=None), dict(agrees_to_take_part="yes"),
    dict(agrees_to_recording=False, agrees_to_take_part=False),
])
async def test_either_box_unticked_is_refused(api, db, open_and_outbox, over):
    # Why: Peter, 2026-11-02: both boxes are required to sign up. A missing box, or one sent as text,
    # must not be read as ticked; nothing is saved and nobody is emailed.
    [s1, *_] = await _college_sessions(db)
    assert (await api.post("/codesign/college/signups", json=_college_form(s1, **over))).status_code == 422
    for key in ("agrees_to_recording", "agrees_to_take_part"):
        body = _college_form(s1)
        del body[key]
        assert (await api.post("/codesign/college/signups", json=body)).status_code == 422, key
    assert await _college_rows(db) == []
    assert open_and_outbox == []


@pytest.mark.parametrize("age", [12, 16, 17, 21, 30])
async def test_college_is_18_to_20_only(api, db, age):
    # Why: the college sessions are for adults, 18 to 20. Someone younger needs a parent's permission
    # and belongs on the high school page; the refusal says who the sessions are for.
    [s1, *_] = await _college_sessions(db)
    r = await api.post("/codesign/college/signups", json=_college_form(s1, age=age))
    assert r.status_code == 422
    assert r.json()["detail"] == "The college sessions are for ages 18 to 20."
    assert await _college_rows(db) == []


@pytest.mark.parametrize("age", [18, 20])
async def test_18_and_20_can_sign_up_for_college(api, db, age):
    # Why: the edges of 18 to 20 are in, not out.
    [s1, *_] = await _college_sessions(db)
    assert (await api.post("/codesign/college/signups", json=_college_form(s1, age=age))).status_code == 200


@pytest.mark.parametrize("age, status", [(12, 422), (13, 200), (17, 200), (18, 422)])
async def test_high_school_is_still_13_to_17(api, db, age, status):
    # Why: adding college must not open the high school sign-up to adults, or close it to 13 or 17.
    w1, w2 = await _sessions(db)
    assert (await api.post("/codesign/signups", json=_form(w1[0], w2[0], teen_age=age))).status_code == status


async def test_a_session_belongs_to_one_group(api, db):
    # Why: Peter, 2026-11-02: adults and 13-to-17-year-olds never share a session. A college date
    # cannot be used by a high school sign-up, and a high school date cannot be used by a college one.
    w1, w2 = await _sessions(db)
    [c1, *_] = await _college_sessions(db)
    assert (await api.post("/codesign/signups", json=_form(c1, w2[0]))).status_code == 422
    assert (await api.post("/codesign/college/signups", json=_college_form(w1[0]))).status_code == 422
    assert (await api.post("/codesign/college/signups", json=_college_form(w2[0]))).status_code == 422
    assert (await db.execute(select(CodesignSignup))).scalars().all() == []


async def test_the_old_calls_are_high_school_only(api, db):
    # Why: the live page calls these with no group until the new website is uploaded. They must
    # behave exactly as before: high school dates only, and a sign-up saved as high school.
    body = (await api.get("/codesign/sessions")).json()
    college_ids = {str(s.id) for s in await _college_sessions(db)}
    assert len(body["sessions"]) == 6 and not college_ids & {s["id"] for s in body["sessions"]}
    assert "agreement" not in body
    w1, w2 = await _sessions(db)
    assert (await api.post("/codesign/signups", json=_form(w1[0], w2[0]))).status_code == 200
    assert (await db.execute(select(CodesignSignup))).scalar_one().audience == HIGH_SCHOOL


def test_each_group_closes_on_its_own_date():
    # Why: high school sign-ups close at the end of Friday, November 6, college at the end of
    # Sunday, November 8, both Eastern. The server enforces each, whatever the page says.
    assert REAL_SIGNUPS_CLOSE_AT == datetime(2026, 11, 7, 0, 0, tzinfo=codesign.EASTERN)
    assert REAL_COLLEGE_SIGNUPS_CLOSE_AT == datetime(2026, 11, 9, 0, 0, tzinfo=codesign.EASTERN)


async def test_high_school_closed_and_college_still_open(api, db, monkeypatch):
    # Why: on November 7 and 8, high school is closed and college is not. Each page, and each
    # sign-up route, reads its own date.
    monkeypatch.setattr(codesign, "SIGNUPS_CLOSE_AT", datetime(2000, 1, 1, tzinfo=timezone.utc))
    w1, w2 = await _sessions(db)
    [c1, *_] = await _college_sessions(db)
    assert (await api.get("/codesign/sessions")).json()["open"] is False
    assert (await api.post("/codesign/signups", json=_form(w1[0], w2[0]))).status_code == 400
    assert (await api.get("/codesign/college/sessions")).json()["open"] is True
    assert (await api.post("/codesign/college/signups", json=_college_form(c1))).status_code == 200

    monkeypatch.setattr(codesign, "COLLEGE_SIGNUPS_CLOSE_AT", datetime(2000, 1, 1, tzinfo=timezone.utc))
    assert (await api.get("/codesign/college/sessions")).json()["open"] is False
    r = await api.post("/codesign/college/signups", json=_college_form(c1, email="other@example.com"))
    assert r.status_code == 400


async def test_seats_are_counted_per_session(api, db):
    # Why: a college date and the high school date at the same time are separate sessions with
    # separate seats ("we will do one or the other"). A full college date does not fill the high
    # school one, and a college sign-up holds its seat from the start.
    w1, w2 = await _sessions(db)
    [c1, c2, _] = await _college_sessions(db)
    c1.seats = 1
    await db.flush()
    assert (await api.post("/codesign/college/signups", json=_college_form(c1))).status_code == 200
    r = await api.post("/codesign/college/signups", json=_college_form(c1, email="sam@example.com"))
    assert r.status_code == 409
    college = (await api.get("/codesign/college/sessions")).json()["sessions"]
    assert [(s["full"], s["seats_left"]) for s in college] == [(True, 0), (False, 6), (False, 6)]
    assert (await api.post("/codesign/college/signups",
                           json=_college_form(c2, email="sam@example.com"))).status_code == 200
    # The high school session at the same time is untouched.
    hs = (await api.get("/codesign/sessions")).json()["sessions"][0]
    assert hs["starts_at"] == college[0]["starts_at"]
    assert (hs["full"], hs["seats_left"]) == (False, 6)
    assert (await api.post("/codesign/signups", json=_form(w1[0], w2[0]))).status_code == 200


async def test_college_old_wording_is_refused(api, db):
    # Why: a page opened before the agreement changed must not record the new wording as agreed to.
    [c1, *_] = await _college_sessions(db)
    r = await api.post("/codesign/college/signups", json=_college_form(c1, agreement_version="2026-11-01"))
    assert r.status_code == 409
    assert await _college_rows(db) == []


async def test_college_bots_are_dropped_silently(api, db, open_and_outbox):
    # Why: the same anti-bot check as the high school form.
    [c1, *_] = await _college_sessions(db)
    for over in (dict(company="Acme"), dict(elapsed_ms=500)):
        assert (await api.post("/codesign/college/signups", json=_college_form(c1, **over))).status_code == 200
    assert await _college_rows(db) == []
    assert open_and_outbox == []


async def test_college_one_email_cannot_be_sent_a_stream_of_sign_ups(api, db):
    # Why: the same duplicate-email rule as the high school form, so the page cannot be used to
    # send a stream of emails to someone. It counts the address wherever it appears, here as a parent.
    w1, w2 = await _sessions(db)
    [c1, *_] = await _college_sessions(db)
    for i in range(codesign.MAX_PER_EMAIL_PER_DAY):
        r = await api.post("/codesign/signups", json=_form(
            w1[0], w2[0], teen_email=f"t{i}@example.com", parent_email="jordan.kim@example.com"))
        assert r.status_code == 200
    assert (await api.post("/codesign/college/signups", json=_college_form(c1))).status_code == 429


async def test_one_college_seat_per_student(api, db, open_and_outbox):
    # Why: college is one session each. A second tap, or signing up for a second date, would hold a
    # seat another student could have. The second is refused and Sally changes dates by hand.
    [c1, c2, _] = await _college_sessions(db)
    assert (await api.post("/codesign/college/signups", json=_college_form(c1))).status_code == 200
    r = await api.post("/codesign/college/signups", json=_college_form(c2, email="JORDAN.KIM@example.com"))
    assert r.status_code == 409
    assert "already signed up" in r.json()["detail"]
    assert len(await _college_rows(db)) == 1
    assert len(open_and_outbox) == 1


async def test_the_permission_link_refuses_a_college_sign_up(api, db, open_and_outbox):
    # Why: a college sign-up has no parent. Even if a permission link somehow matched one, it must not
    # be shown, or answered as a high school permission form.
    [c1, *_] = await _college_sessions(db)
    await api.post("/codesign/college/signups", json=_college_form(c1))
    [row] = await _college_rows(db)
    row.permission_token_hash = codesign._hash("college-token")
    await db.flush()
    assert (await api.get("/codesign/permission/college-token")).status_code == 404
    assert (await api.post("/codesign/permission/college-token", json=_answers())).status_code == 404
    await db.refresh(row)
    assert (row.form_submitted_at, row.permission_given_at, row.parent_consents) == (None, None, None)


async def test_the_summary_labels_the_group_and_has_no_contact_details(api, db, open_and_outbox, team):
    # Why: Sally's summary covers both groups, labeled, and says which group in the subject. It goes
    # to an ordinary inbox, so it still carries first name and last initial only: no surname, age or
    # email. No parent is emailed for college.
    w1, w2 = await _sessions(db)
    await api.post("/codesign/signups", json=_form(w1[0], w2[0]))
    open_and_outbox.clear()
    [c1, *_] = await _college_sessions(db)
    # Age 18, not 19 or 20: those are in the session dates ("November 19"), so the check below
    # could not tell them apart.
    await api.post("/codesign/college/signups", json=_college_form(c1, age=18))
    assert [e["to_email"] for e in open_and_outbox if e["to_email"] not in TEAM] == ["jordan.kim@example.com"]
    [mail, _] = _to_team(open_and_outbox)
    text = "\n".join([mail["subject"], mail["heading"], *mail["paragraphs"]])

    assert mail["subject"] == "New co-design sign-up, college: Jordan K."
    assert mail["paragraphs"][0] == "Jordan K. (college) signed up for Tuesday, November 10 at 12pm Eastern."
    assert "High school: 1 signed up so far." in text
    assert "College: 1 signed up so far." in text
    assert ("High school · Tuesday, November 10 at 12pm Eastern: 1 of 6 seats taken. "
            "Maya R. (waiting for permission).") in text
    assert "College · Tuesday, November 10 at 12pm Eastern: 1 of 6 seats taken. Jordan K. (confirmed)." in text
    assert "College · Thursday, November 12 at 12pm Eastern: 0 of 6 seats taken. No sign-ups yet." in text
    for secret in ("Kim", "Rivera", "18", "15", "@", "Ana"):
        assert secret not in text, secret
