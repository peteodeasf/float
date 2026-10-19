"""Teen co-design sign-ups. docs/plans/codesign-signup.md

The six sessions come from the migration, as they do in production.
"""
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from app.api.routers import codesign
from app.models.codesign import CodesignSession, CodesignSignup
from app.services import email_service

from tests.factories import make_float_admin, make_org, make_practitioner


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


async def test_the_six_dates_at_noon_eastern(api, db):
    r = (await api.get("/codesign/sessions")).json()
    assert r["open"] is True
    assert [s["label"] for s in r["sessions"]] == [
        "Tuesday, November 3 at 12pm Eastern",
        "Wednesday, November 4 at 12pm Eastern",
        "Thursday, November 5 at 12pm Eastern",
        "Tuesday, November 10 at 12pm Eastern",
        "Wednesday, November 11 at 12pm Eastern",
        "Thursday, November 12 at 12pm Eastern",
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
    assert "Tuesday, November 3 at 12pm Eastern" in " ".join(open_and_outbox[0]["paragraphs"])


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
    r = await api.post(f"/codesign/permission/{_token(open_and_outbox)}", json={"name": "Ana Rivera", "agree": True})
    assert r.status_code == 200
    first = (await db.execute(select(CodesignSignup))).scalar_one()
    first.created_at = datetime.now(timezone.utc) - timedelta(days=10)
    await db.flush()
    second = _form(w1[0], w2[0], teen_email="sam@example.com", parent_email="dad@example.com")
    assert (await api.post("/codesign/signups", json=second)).status_code == 409


async def test_the_permission_page_shows_only_the_first_name_and_dates(api, db, open_and_outbox):
    w1, w2 = await _sessions(db)
    await api.post("/codesign/signups", json=_form(w1[2], w2[2]))
    r = await api.get(f"/codesign/permission/{_token(open_and_outbox)}")
    assert r.status_code == 200
    assert r.json() == {
        "teen_first_name": "Maya",
        "dates": ["Thursday, November 5 at 12pm Eastern", "Thursday, November 12 at 12pm Eastern"],
        "permission_given": False,
    }
    for private in ("Rivera", "maya@example.com", "ana@example.com", "15"):
        assert private not in r.text


async def test_giving_permission_records_the_name_and_time_once(api, db, open_and_outbox):
    w1, w2 = await _sessions(db)
    await api.post("/codesign/signups", json=_form(w1[0], w2[0]))
    token = _token(open_and_outbox)
    assert (await api.post(f"/codesign/permission/{token}", json={"name": "Ana", "agree": False})).status_code == 422
    assert (await api.post(f"/codesign/permission/{token}", json={"name": " ", "agree": True})).status_code == 422
    open_and_outbox.clear()
    assert (await api.post(f"/codesign/permission/{token}", json={"name": "Ana Rivera", "agree": True})).status_code == 200
    assert [e["to_email"] for e in open_and_outbox] == ["ana@example.com", "maya@example.com"]

    signup = (await db.execute(select(CodesignSignup))).scalar_one()
    given_at = signup.permission_given_at
    assert (signup.permission_given_by, given_at is not None) == ("Ana Rivera", True)
    await api.post(f"/codesign/permission/{token}", json={"name": "Someone Else", "agree": True})
    await db.refresh(signup)
    assert (signup.permission_given_by, signup.permission_given_at) == ("Ana Rivera", given_at)
    assert (await api.get(f"/codesign/permission/{token}")).json()["permission_given"] is True


async def test_an_unknown_link_finds_nothing(api, db):
    assert (await api.get("/codesign/permission/not-a-real-token")).status_code == 404
    assert (await api.post("/codesign/permission/not-a-real-token",
                           json={"name": "X", "agree": True})).status_code == 404


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
    assert (first["taken"], first["seats"]) == (1, 8)
    [row] = first["signups"]
    assert (row["teen_email"], row["parent_email"], row["permission"]) == ("maya@example.com", "ana@example.com", "waiting")
    assert r["sessions"][1]["signups"] == []
    assert r["sessions"][3]["signups"][0]["id"] == row["id"]
