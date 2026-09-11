"""Monitoring, just say it: an observation said out loud or typed as a quick note.

Google and Claude are faked; nothing leaves the machine. docs/plans/monitoring-just-say-it.md
"""
import base64
import json
import secrets
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import func, select

from app.core.config import settings
from app.models.monitoring import MonitoringEntry, MonitoringForm
from app.services import monitoring_capture as capture
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
    state = {"answer": {"observations": []}, "asked": []}

    async def fake(system, text):
        state["asked"].append((system, text))
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


async def _write(api, form, text, **kw):
    return await api.post(f"/monitor/{form.access_token}/write-up",
                          json={"text": text, "today": TODAY.isoformat(), **kw})


async def _record(api, form, data=b"fake audio", content_type="audio/mp4"):
    return await api.post(f"/monitor/{form.access_token}/transcribe",
                          files={"audio": ("note.m4a", data, content_type)})


# ── Writing it up ─────────────────────────────────────────────────────────────

async def test_a_note_becomes_draft_observations_in_the_parents_words(api, db, claude):
    _, _, form = await _form(db, status="pending")
    words = "This morning she cried getting in the car. At bedtime she wanted me to stay."
    claude["answer"] = {"observations": [
        _obs(),
        _obs(situation="Bedtime", child="Asked me to stay", parent="I lay down with her"),
    ]}

    r = await _write(api, form, words, captured_by="voice")

    assert r.status_code == 200, r.text
    entries = r.json()["entries"]
    assert [e["situation"] for e in entries] == ["Getting in the car for school", "Bedtime"]
    assert all(e["is_draft"] and e["captured_by"] == "voice" and e["parent_words"] == words for e in entries)
    saved = (await db.execute(select(func.count()).select_from(MonitoringEntry).where(
        MonitoringEntry.monitoring_form_id == form.id))).scalar_one()
    assert saved == 2
    assert form.status == "in_progress"
    # Claude was told the parent's date, to work out "this morning" and "last night".
    assert TODAY.isoformat() in claude["asked"][0][0]


async def test_the_fear_level_is_never_guessed(api, db, claude):
    _, _, form = await _form(db)

    claude["answer"] = {"observations": [_obs(fear=8)]}
    r = await _write(api, form, "She was terrified at the doctor's.")
    assert r.json()["entries"][0]["fear_thermometer"] is None  # a word, not a number

    claude["answer"] = {"observations": [_obs(fear=7)]}
    r = await _write(api, form, "She was about a seven out of ten.")
    assert r.json()["entries"][0]["fear_thermometer"] == 7

    claude["answer"] = {"observations": [_obs(fear=11)]}
    r = await _write(api, form, "Honestly an 11.")
    assert r.json()["entries"][0]["fear_thermometer"] is None


async def test_dates_come_from_the_parent_and_stay_sensible(api, db, claude):
    _, _, form = await _form(db)
    yesterday = TODAY - timedelta(days=1)
    claude["answer"] = {"observations": [
        _obs(date=yesterday.isoformat()),
        _obs(date=(TODAY + timedelta(days=3)).isoformat()),
        _obs(date=(TODAY - timedelta(days=60)).isoformat()),
        _obs(date="last week"),
    ]}
    r = await _write(api, form, "Last night and some other times.")
    assert [e["entry_date"] for e in r.json()["entries"]] == [
        yesterday.isoformat(), TODAY.isoformat(), TODAY.isoformat(), TODAY.isoformat()]


async def test_nothing_to_record_saves_nothing(api, db, claude):
    _, _, form = await _form(db)
    claude["answer"] = {"observations": [_obs(situation="", child="  ", parent="")]}
    r = await _write(api, form, "We had pizza.")
    assert r.json() == {"entries": []}
    assert (await db.execute(select(MonitoringEntry).where(
        MonitoringEntry.monitoring_form_id == form.id))).first() is None


async def test_an_empty_note_is_refused(api, db):
    _, _, form = await _form(db)
    assert (await _write(api, form, "")).status_code == 422
    assert (await _write(api, form, "   ")).status_code == 422
    assert (await _write(api, form, "x" * (capture.MAX_NOTE_CHARS + 1))).status_code == 422


async def test_when_claude_fails_the_parent_is_told_to_try_again(api, db, claude):
    _, _, form = await _form(db)
    claude["answer"] = RuntimeError("down")
    r = await _write(api, form, "She cried at school.")
    assert r.status_code == 502
    assert "Try again" in r.json()["detail"]


# ── Recording ─────────────────────────────────────────────────────────────────

async def test_a_recording_becomes_text_and_is_not_kept(api, db, google):
    _, _, form = await _form(db)
    google["text"] = "She cried getting in the car."
    r = await _record(api, form)
    assert r.status_code == 200, r.text
    assert r.json() == {"text": "She cried getting in the car."}
    assert (await db.execute(select(MonitoringEntry).where(
        MonitoringEntry.monitoring_form_id == form.id))).first() is None


async def test_only_a_recording_of_up_to_a_minute(api, db, google, monkeypatch):
    _, _, form = await _form(db)
    assert (await _record(api, form, content_type="text/plain")).status_code == 415
    monkeypatch.setattr(capture, "MAX_AUDIO_BYTES", 10)
    assert (await _record(api, form, data=b"x" * 11)).status_code == 413
    assert (await _record(api, form, data=b"")).status_code == 400
    assert google["calls"] == 0


async def test_recording_is_offered_only_once_google_is_set_up(api, db, monkeypatch):
    _, _, form = await _form(db)
    monkeypatch.setattr(settings, "GOOGLE_SPEECH_CREDENTIALS", "")
    assert (await api.get(f"/monitor/{form.access_token}")).json()["voice_available"] is False
    assert (await _record(api, form)).status_code == 503

    monkeypatch.setattr(settings, "GOOGLE_SPEECH_CREDENTIALS", '{"project_id": "p"}')
    assert (await api.get(f"/monitor/{form.access_token}")).json()["voice_available"] is True


async def test_when_google_fails_the_parent_is_told_to_try_again(api, db, google):
    _, _, form = await _form(db)
    google["fail"] = True
    r = await _record(api, form)
    assert r.status_code == 502
    assert "type it" in r.json()["detail"]


# ── Limits and the link ───────────────────────────────────────────────────────

async def test_a_daily_limit_on_recordings_and_write_ups(api, db, google, monkeypatch):
    _, _, form = await _form(db)
    monkeypatch.setattr(capture, "DAILY_LIMIT", 2)
    assert (await _record(api, form)).status_code == 200
    assert (await _write(api, form, "She cried.")).status_code == 200
    assert (await _record(api, form)).status_code == 429
    assert (await _write(api, form, "She cried.")).status_code == 429
    assert google["calls"] == 1

    # A new day starts again.
    form.capture_day = TODAY - timedelta(days=1)
    await db.flush()
    assert (await _write(api, form, "She cried.")).status_code == 200


async def test_refused_once_the_form_is_submitted(api, db, google):
    _, _, form = await _form(db, status="submitted")
    assert (await _record(api, form)).status_code == 400
    assert (await _write(api, form, "She cried.")).status_code == 400


async def test_an_unknown_link_finds_nothing(api, db, google):
    await _form(db)
    assert (await api.post("/monitor/not-a-real-token/write-up", json={"text": "x"})).status_code == 404
    assert (await api.post("/monitor/not-a-real-token/transcribe",
                           files={"audio": ("a.m4a", b"x", "audio/mp4")})).status_code == 404


# ── Checking and saving ───────────────────────────────────────────────────────

async def test_a_draft_can_be_removed_and_a_saved_observation_cannot(api, db, claude):
    _, _, form = await _form(db)
    claude["answer"] = {"observations": [_obs(), _obs(situation="Bedtime")]}
    first, second = (await _write(api, form, "Two moments.")).json()["entries"]

    r = await api.put(f"/monitor/{form.access_token}/entries/{second['id']}", json={"is_draft": False})
    assert r.status_code == 200
    assert (await api.delete(f"/monitor/{form.access_token}/entries/{second['id']}")).status_code == 409
    assert (await api.delete(f"/monitor/{form.access_token}/entries/{first['id']}")).status_code == 204

    # Another family's link cannot reach it.
    _, _, other = await _form(db)
    assert (await api.delete(f"/monitor/{other.access_token}/entries/{second['id']}")).status_code == 404


async def test_the_clinician_sees_a_saved_one_with_the_parents_words(api, db, claude):
    org, child, form = await _form(db)
    words = "At the doctor's she hid behind me, about an eight."
    claude["answer"] = {"observations": [_obs(situation="At the doctor's", fear=8)]}
    [entry] = (await _write(api, form, words, captured_by="voice")).json()["entries"]

    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, child, clinician, owner=True)
    api.sign_in_as(clinician.user)
    report = (await api.get(f"/patients/{child.id}/monitoring-form/report")).json()
    assert report["total_entries"] == 0  # still a draft: the parent has not checked it

    api.sign_in_as(None)
    await api.put(f"/monitor/{form.access_token}/entries/{entry['id']}", json={"is_draft": False})
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
