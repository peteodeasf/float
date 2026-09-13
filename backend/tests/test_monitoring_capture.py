"""Monitoring, just say it: an observation said out loud or typed as a quick note.

Peter, 2026-09-12: the parent just talks and it goes. No form to check. Float writes it up after they
are told "Got it", and the clinician sees it with the parent's words.

Google and Claude are faked; nothing leaves the machine. docs/plans/monitoring-just-say-it.md
"""
import base64
import json
import secrets
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.monitoring import MonitoringEntry, MonitoringForm, MonitoringNote
from app.services import monitoring_capture as capture
from app.services.insight_service import format_entries
from tests.factories import grant_patient_to, make_org, make_patient, make_practitioner

TODAY = datetime.now(timezone.utc).date()


async def _form(db, status="in_progress"):
    org = await make_org(db)
    child = await make_patient(db, org)
    form = MonitoringForm(patient_id=child.id, organization_id=org.id, status=status,
                          access_token=secrets.token_hex(32), sent_at=datetime.now(timezone.utc))
    db.add(form)
    await db.flush()
    return org, child, form


@pytest.fixture(autouse=True)
def claude(monkeypatch):
    """What Claude answers, set per test. Autouse, so no test here can reach the real one."""
    state = {"answer": {"observations": []}, "asked": [], "during": None}

    async def fake(system, text):
        state["asked"].append((system, text))
        if state["during"]:
            await state["during"]()
        if isinstance(state["answer"], Exception):
            raise state["answer"]
        return json.dumps(state["answer"])

    monkeypatch.setattr(capture, "_ask_claude", fake)
    return state


@pytest.fixture
def google(monkeypatch):
    state = {"text": "", "calls": 0, "fail": False}
    monkeypatch.setattr(settings, "GOOGLE_SPEECH_CREDENTIALS", '{"project_id": "p"}')

    async def fake(audio):
        state["calls"] += 1
        if state["fail"]:
            raise capture.CaptureFailed()
        return state["text"]

    monkeypatch.setattr(capture, "transcribe", fake)
    return state


def _obs(**kw):
    o = {"date": TODAY.isoformat(), "situation": "Getting in the car for school",
         "child": "Cried and said her tummy hurt", "parent": "I let her stay home", "fear": None}
    o.update(kw)
    return o


async def _write(api, form, text):
    return await api.post(f"/monitor/{form.access_token}/notes/text", json={"text": text, "today": TODAY.isoformat()})


async def _say(api, form, data=b"fake audio", content_type="audio/mp4"):
    return await api.post(f"/monitor/{form.access_token}/notes/voice",
                          files={"audio": ("note.m4a", data, content_type)}, data={"today": TODAY.isoformat()})


async def _entries(db, form):
    return (await db.execute(select(MonitoringEntry).where(
        MonitoringEntry.monitoring_form_id == form.id).execution_options(populate_existing=True))).scalars().all()


async def _notes(db, form):
    return (await db.execute(select(MonitoringNote).where(
        MonitoringNote.monitoring_form_id == form.id).execution_options(populate_existing=True))).scalars().all()


def _sessions(db):
    @asynccontextmanager
    async def this_session():
        yield db
    return this_session


# ── Saying it ─────────────────────────────────────────────────────────────────

async def test_a_recording_goes_straight_in_as_observations_with_no_form_to_check(api, db, google, claude):
    _, _, form = await _form(db, status="pending")
    words = "This morning she cried getting in the car. At bedtime she wanted me to stay."
    google["text"] = words
    claude["answer"] = {"observations": [
        _obs(),
        _obs(situation="Bedtime", child="Asked me to stay", parent="I lay down with her"),
    ]}

    r = await _say(api, form)

    assert r.status_code == 200, r.text
    assert r.json()["note"]["words"] == words
    entries = await _entries(db, form)
    assert sorted(e.situation for e in entries) == ["Bedtime", "Getting in the car for school"]
    # Saved as observations, not drafts: nothing waits on the parent.
    assert all(not e.is_draft and e.captured_by == "voice" and e.parent_words == words for e in entries)
    [note] = await _notes(db, form)
    assert all(e.note_id == note.id for e in entries) and note.written_up_at is not None
    assert form.status == "in_progress"
    # Claude was told the parent's date, to work out "this morning" and "last night".
    assert TODAY.isoformat() in claude["asked"][0][0]


async def test_a_typed_note_goes_the_same_way(api, db, claude):
    _, _, form = await _form(db)
    claude["answer"] = {"observations": [_obs()]}
    r = await _write(api, form, "She cried in the car this morning.")
    assert r.status_code == 200, r.text
    [entry] = await _entries(db, form)
    assert (entry.captured_by, entry.is_draft, entry.parent_words) == ("note", False, "She cried in the car this morning.")


async def test_the_fear_level_is_never_guessed(api, db, claude):
    _, _, form = await _form(db)

    claude["answer"] = {"observations": [_obs(fear=8)]}
    await _write(api, form, "She was terrified at the doctor's.")
    claude["answer"] = {"observations": [_obs(fear=7)]}
    await _write(api, form, "She was about a seven out of ten.")
    claude["answer"] = {"observations": [_obs(fear=11)]}
    await _write(api, form, "Honestly an 11.")

    by_words = {e.parent_words: e.fear_thermometer for e in await _entries(db, form)}
    assert by_words == {"She was terrified at the doctor's.": None,  # a word, not a number
                        "She was about a seven out of ten.": 7,
                        "Honestly an 11.": None}


async def test_the_tap_after_recording_fills_the_fear_level_the_parent_did_not_say(api, db, claude):
    _, _, form = await _form(db)
    claude["answer"] = {"observations": [_obs(fear=8), _obs(situation="Bedtime")]}
    note = (await _write(api, form, "School run was about an eight. Bedtime was hard too.")).json()["note"]

    r = await api.put(f"/monitor/{form.access_token}/notes/{note['id']}/fear", json={"fear_level": 6})

    assert r.status_code == 200, r.text
    fears = {e.situation: e.fear_thermometer for e in await _entries(db, form)}
    assert fears == {"Getting in the car for school": 8, "Bedtime": 6}  # the number they said stays
    for bad in (0, 11, "high"):
        assert (await api.put(f"/monitor/{form.access_token}/notes/{note['id']}/fear",
                              json={"fear_level": bad})).status_code == 422


async def test_a_tap_that_lands_before_the_write_up_still_counts(db, claude):
    _, _, form = await _form(db)
    note = MonitoringNote(monitoring_form_id=form.id, words="Bedtime was hard.", captured_by="voice",
                          entry_date=TODAY, fear_level=5)
    db.add(note)
    await db.flush()
    claude["answer"] = {"observations": [_obs(situation="Bedtime")]}

    await capture.write_up_note(_sessions(db), note.id)

    [entry] = await _entries(db, form)
    assert entry.fear_thermometer == 5


async def test_dates_come_from_the_parent_and_stay_sensible(api, db, claude):
    _, _, form = await _form(db)
    yesterday = TODAY - timedelta(days=1)
    claude["answer"] = {"observations": [
        _obs(date=yesterday.isoformat(), situation="a"),
        _obs(date=(TODAY + timedelta(days=3)).isoformat(), situation="b"),
        _obs(date=(TODAY - timedelta(days=60)).isoformat(), situation="c"),
        _obs(date="last week", situation="d"),
    ]}
    await _write(api, form, "Last night and some other times.")
    dates = {e.situation: e.entry_date for e in await _entries(db, form)}
    assert dates == {"a": yesterday, "b": TODAY, "c": TODAY, "d": TODAY}


async def test_nothing_the_parent_said_is_lost_when_claude_finds_nothing_or_fails(api, db, claude):
    _, _, form = await _form(db)
    claude["answer"] = {"observations": [_obs(situation="", child="  ", parent="")]}
    await _write(api, form, "We had pizza.")
    claude["answer"] = RuntimeError("down")
    r = await _write(api, form, "She cried at school.")
    assert r.status_code == 200  # the parent is told "Got it" either way

    entries = await _entries(db, form)
    assert sorted(e.parent_words for e in entries) == ["She cried at school.", "We had pizza."]
    assert all(e.situation is None and not e.is_draft for e in entries)
    # And the clinician's extraction still reads their words.
    text, _ = format_entries(entries)
    assert "Parent's own words: She cried at school." in text


async def test_an_empty_note_is_refused(api, db):
    _, _, form = await _form(db)
    assert (await _write(api, form, "")).status_code == 422
    assert (await _write(api, form, "   ")).status_code == 422
    assert (await _write(api, form, "x" * (capture.MAX_NOTE_CHARS + 1))).status_code == 422
    assert await _notes(db, form) == []


# ── Recording ─────────────────────────────────────────────────────────────────

async def test_nothing_heard_saves_nothing_and_asks_again(api, db, google):
    _, _, form = await _form(db)
    google["text"] = "   "
    r = await _say(api, form)
    assert r.status_code == 422
    assert "couldn't hear" in r.json()["detail"]
    assert await _notes(db, form) == []


async def test_only_a_recording_of_up_to_a_minute(api, db, google, monkeypatch):
    _, _, form = await _form(db)
    assert (await _say(api, form, content_type="text/plain")).status_code == 415
    monkeypatch.setattr(capture, "MAX_AUDIO_BYTES", 10)
    assert (await _say(api, form, data=b"x" * 11)).status_code == 413
    assert (await _say(api, form, data=b"")).status_code == 400
    assert google["calls"] == 0


async def test_recording_is_offered_only_once_google_is_set_up(api, db, monkeypatch):
    _, _, form = await _form(db)
    monkeypatch.setattr(settings, "GOOGLE_SPEECH_CREDENTIALS", "")
    assert (await api.get(f"/monitor/{form.access_token}")).json()["voice_available"] is False
    assert (await _say(api, form)).status_code == 503

    monkeypatch.setattr(settings, "GOOGLE_SPEECH_CREDENTIALS", '{"project_id": "p"}')
    assert (await api.get(f"/monitor/{form.access_token}")).json()["voice_available"] is True


async def test_when_google_fails_the_parent_is_told_to_try_again(api, db, google):
    _, _, form = await _form(db)
    google["fail"] = True
    r = await _say(api, form)
    assert r.status_code == 502
    assert "type it" in r.json()["detail"]
    assert await _notes(db, form) == []


# ── Limits and the link ───────────────────────────────────────────────────────

async def test_a_daily_limit_on_recordings_and_notes(api, db, google, monkeypatch):
    _, _, form = await _form(db)
    google["text"] = "She cried."
    monkeypatch.setattr(capture, "DAILY_LIMIT", 2)
    assert (await _say(api, form)).status_code == 200
    assert (await _write(api, form, "She cried.")).status_code == 200
    assert (await _say(api, form)).status_code == 429
    assert (await _write(api, form, "She cried.")).status_code == 429
    assert google["calls"] == 1

    # A new day starts again.
    form.capture_day = TODAY - timedelta(days=1)
    await db.flush()
    assert (await _write(api, form, "She cried.")).status_code == 200


async def test_refused_once_the_form_is_submitted(api, db, google, claude):
    _, _, form = await _form(db)
    note = (await _write(api, form, "She cried.")).json()["note"]
    form.status = "submitted"
    await db.flush()
    assert (await _say(api, form)).status_code == 400
    assert (await _write(api, form, "She cried.")).status_code == 400
    assert (await api.put(f"/monitor/{form.access_token}/notes/{note['id']}/fear", json={"fear_level": 3})).status_code == 400
    assert (await api.delete(f"/monitor/{form.access_token}/notes/{note['id']}")).status_code == 400


async def test_an_unknown_link_finds_nothing(api, db, google):
    await _form(db)
    assert (await api.post("/monitor/not-a-real-token/notes/text", json={"text": "x"})).status_code == 404
    assert (await api.post("/monitor/not-a-real-token/notes/voice",
                           files={"audio": ("a.m4a", b"x", "audio/mp4")})).status_code == 404


# ── What the parent sees, and deleting one ────────────────────────────────────

async def test_the_parent_sees_their_words_not_the_form(api, db, claude):
    _, _, form = await _form(db)
    claude["answer"] = {"observations": [_obs()]}
    note = (await _write(api, form, "She cried in the car.")).json()["note"]
    await api.put(f"/monitor/{form.access_token}/notes/{note['id']}/fear", json={"fear_level": 7})

    page = (await api.get(f"/monitor/{form.access_token}")).json()
    [shown] = page["notes"]
    assert (shown["words"], shown["captured_by"], shown["fear_level"]) == ("She cried in the car.", "note", 7)
    # The observation written up from it carries the note, so the page can leave it out of their list.
    assert [e["note_id"] for e in page["entries"]] == [note["id"]]


async def test_the_parent_can_delete_one_and_what_came_of_it(api, db, claude):
    _, _, form = await _form(db)
    typed = MonitoringEntry(monitoring_form_id=form.id, situation="From the form", is_draft=False)
    db.add(typed)
    await db.flush()
    claude["answer"] = {"observations": [_obs(), _obs(situation="Bedtime")]}
    note = (await _write(api, form, "Two moments.")).json()["note"]
    assert len(await _entries(db, form)) == 3

    # Another family's link cannot reach it.
    _, _, other = await _form(db)
    assert (await api.delete(f"/monitor/{other.access_token}/notes/{note['id']}")).status_code == 404
    assert (await api.put(f"/monitor/{other.access_token}/notes/{note['id']}/fear", json={"fear_level": 2})).status_code == 404

    assert (await api.delete(f"/monitor/{form.access_token}/notes/{note['id']}")).status_code == 204
    assert [e.situation for e in await _entries(db, form)] == ["From the form"]
    assert await _notes(db, form) == []


async def test_one_deleted_while_it_is_being_written_up_leaves_nothing(db, claude):
    _, _, form = await _form(db)
    note = MonitoringNote(monitoring_form_id=form.id, words="She cried.", captured_by="voice", entry_date=TODAY)
    db.add(note)
    await db.flush()
    note_id = note.id

    async def parent_deletes_it():
        await db.delete(note)
        await db.flush()

    claude["answer"] = {"observations": [_obs()]}
    claude["during"] = parent_deletes_it
    await capture.write_up_note(_sessions(db), note_id)

    assert await _entries(db, form) == []


async def test_the_clinician_sees_it_straight_away_with_the_parents_words(api, db, google, claude):
    org, child, form = await _form(db)
    words = "At the doctor's she hid behind me, about an eight."
    google["text"] = words
    claude["answer"] = {"observations": [_obs(situation="At the doctor's", fear=8)]}
    await _say(api, form)

    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, child, clinician, owner=True)
    api.sign_in_as(clinician.user)
    [row] = (await api.get(f"/patients/{child.id}/monitoring-form/report")).json()["entries"]
    assert (row["parent_words"], row["captured_by"], row["fear_thermometer"]) == (words, "voice", 8)


# ── Google, as it is really called ────────────────────────────────────────────

def _service_account():
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                            serialization.NoEncryption()).decode()
    public = key.public_key().public_bytes(serialization.Encoding.PEM,
                                           serialization.PublicFormat.SubjectPublicKeyInfo).decode()
    creds = {"project_id": "float-test", "client_email": "speech@float-test.iam.gserviceaccount.com",
             "private_key": pem, "token_uri": "https://oauth2.googleapis.com/token"}
    return creds, public


async def test_google_is_asked_the_way_its_api_expects(monkeypatch):
    from jose import jwt
    creds, public = _service_account()
    monkeypatch.setattr(settings, "GOOGLE_SPEECH_CREDENTIALS", json.dumps(creds))
    monkeypatch.setattr(capture, "_token_cache", {})
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth2.googleapis.com":
            form = dict(x.split("=", 1) for x in request.content.decode().split("&"))
            claims = jwt.decode(form["assertion"], public, algorithms=["RS256"], audience=creds["token_uri"])
            seen["claims"] = claims
            return httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})
        seen["url"], seen["auth"] = str(request.url), request.headers["Authorization"]
        seen["body"] = json.loads(request.content)
        return httpx.Response(200, json={"results": [
            {"alternatives": [{"transcript": "She cried in the car."}]},
            {"alternatives": [{"transcript": " Then she was fine. "}]},
            {"alternatives": []},
        ]})

    monkeypatch.setattr(capture, "_transport", httpx.MockTransport(handler))
    text = await capture.transcribe(b"audio bytes")

    assert text == "She cried in the car. Then she was fine."
    assert seen["claims"]["iss"] == creds["client_email"]
    assert seen["url"] == ("https://us-speech.googleapis.com/v2/projects/float-test"
                           "/locations/us/recognizers/_:recognize")
    assert seen["auth"] == "Bearer tok"
    assert seen["body"]["config"]["model"] == "chirp_3"
    assert seen["body"]["config"]["autoDecodingConfig"] == {}
    assert base64.b64decode(seen["body"]["content"]) == b"audio bytes"


async def test_a_google_error_is_reported_without_the_words(monkeypatch, caplog):
    creds, _ = _service_account()
    monkeypatch.setattr(settings, "GOOGLE_SPEECH_CREDENTIALS", json.dumps(creds))
    monkeypatch.setattr(capture, "_token_cache", {})
    monkeypatch.setattr(capture, "_transport", httpx.MockTransport(
        lambda r: httpx.Response(200, json={"access_token": "t"}) if r.url.host == "oauth2.googleapis.com"
        else httpx.Response(400, json={"error": {"message": "secret words she cried"}})))
    with pytest.raises(capture.CaptureFailed):
        await capture.transcribe(b"audio")
    assert "she cried" not in caplog.text
