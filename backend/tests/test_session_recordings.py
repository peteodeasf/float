"""Recording a session into Session Notes. docs/plans/session-recording.md

Google (storage and transcription) and Claude are faked; nothing leaves the machine.
"""
import json
import re
import uuid
from datetime import datetime, timedelta, timezone

import httpx
import pytest
from sqlalchemy import select

from app.core.config import settings
from app.models.session_note import SessionNote, SessionRecording
from app.services import google_cloud as google
from app.services import monitoring_capture as capture
from app.services import session_recording as recorder
from tests.factories import grant_patient_to, make_org, make_patient, make_practitioner
from tests.test_monitoring_capture import _service_account

NOTE = {
    "speakers": {"1:1": "Clinician", "1:2": "Child", "1:3": "Parent", "2:1": "Clinician"},
    "participants": ["patient", "parent"],
    "tag": "Weekly",
    "note": {"covered": "Bedtime practice.", "situations": "Bedtime: Fear Level 8, then 4.", "accommodations": "",
             "agreed": "Bedtime alone every night.", "follow_up": ""},
}


@pytest.fixture
def cloud(monkeypatch):
    state = {"objects": {}, "joined": [], "started": [], "words": {}, "pending": 0, "fail": None}
    monkeypatch.setattr(settings, "GOOGLE_SPEECH_CREDENTIALS", '{"project_id": "p"}')
    monkeypatch.setattr(settings, "GOOGLE_RECORDINGS_BUCKET", "bucket")
    monkeypatch.setattr(recorder, "POLL_SECONDS", 0)

    def maybe_fail(step):
        if state["fail"] == step:
            raise google.GoogleFailed()

    async def put_object(name, data, content_type):
        maybe_fail("put")
        state["objects"][name] = data

    async def list_objects(prefix):
        return sorted(n for n in state["objects"] if n.startswith(prefix))

    async def delete_object(name):
        state["objects"].pop(name, None)

    async def delete_prefix(prefix):
        for n in [n for n in state["objects"] if n.startswith(prefix)]:
            state["objects"].pop(n)

    async def join(pieces, dest, content_type):
        state["joined"].append((list(pieces), dest))
        state["objects"][dest] = b"".join(state["objects"][p] for p in pieces)

    async def start_transcription(name):
        maybe_fail("start")
        state["started"].append(name)
        return f"op/{name}"

    async def check_transcription(operation):
        maybe_fail("check")
        if state["pending"] > 0:
            state["pending"] -= 1
            return None
        return state["words"].get(int(re.search(r"s(\d+)\.audio$", operation).group(1)), [])

    for name, fn in [("put_object", put_object), ("list_objects", list_objects), ("delete_object", delete_object),
                     ("delete_prefix", delete_prefix), ("join", join), ("start_transcription", start_transcription),
                     ("check_transcription", check_transcription)]:
        monkeypatch.setattr(google, name, fn)
    return state


@pytest.fixture(autouse=True)
def claude(monkeypatch):
    state = {"answer": NOTE, "asked": []}

    async def fake(system, text):
        state["asked"].append((system, text))
        if isinstance(state["answer"], Exception):
            raise state["answer"]
        return json.dumps(state["answer"])

    monkeypatch.setattr(recorder, "_ask_claude", fake)
    return state


async def _clinic(db, consent=True):
    org = await make_org(db)
    child = await make_patient(db, org, name="Sam Rivera")
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, child, clinician, owner=True)
    if consent:
        child.recording_consent_at = datetime.now(timezone.utc)
        child.recording_consent_by = "Sam and her mother"
    await db.flush()
    return org, child, clinician


async def _start(api, child, participants=("patient", "parent")):
    r = await api.post(f"/patients/{child.id}/recordings",
                       json={"participants": list(participants), "content_type": "audio/webm;codecs=opus"})
    assert r.status_code == 201, r.text
    return r.json()


async def _piece(api, rec, segment, seq, data=b"audio", content_type="audio/webm"):
    return await api.put(f"/recordings/{rec['id']}/segments/{segment}/pieces/{seq}",
                         content=data, headers={"Content-Type": content_type})


async def _notes(db, child):
    return (await db.execute(select(SessionNote).where(SessionNote.patient_id == child.id)
                             .execution_options(populate_existing=True))).scalars().all()


async def _recording(db, rec):
    return (await db.execute(select(SessionRecording).where(SessionRecording.id == rec["id"])
                             .execution_options(populate_existing=True))).scalar_one_or_none()


# ── Starting ──────────────────────────────────────────────────────────────────

async def test_consent_first_then_recording_starts(api, db, cloud):
    _, child, clinician = await _clinic(db, consent=False)
    api.sign_in_as(clinician.user)
    body = {"participants": ["patient"], "content_type": "audio/mp4"}

    r = await api.post(f"/patients/{child.id}/recordings", json=body)
    assert r.status_code == 409 and "agreed" in r.json()["detail"]

    r = await api.post(f"/patients/{child.id}/recording-consent", json={"agreed_by": "Sam and her dad, verbally"})
    assert r.status_code == 200, r.text
    assert (await api.get(f"/patients/{child.id}")).json()["recording_consent_by"] == "Sam and her dad, verbally"

    r = await api.post(f"/patients/{child.id}/recordings", json=body)
    assert r.status_code == 201 and r.json()["status"] == "recording"


async def test_not_for_a_closed_patient_or_before_google_is_set_up(api, db, cloud, monkeypatch):
    _, child, clinician = await _clinic(db)
    api.sign_in_as(clinician.user)
    body = {"participants": ["patient"], "content_type": "audio/mp4"}
    monkeypatch.setattr(settings, "GOOGLE_RECORDINGS_BUCKET", "")
    assert (await api.post(f"/patients/{child.id}/recordings", json=body)).status_code == 503
    monkeypatch.setattr(settings, "GOOGLE_RECORDINGS_BUCKET", "bucket")
    child.closed_at = datetime.now(timezone.utc)
    await db.flush()
    assert (await api.post(f"/patients/{child.id}/recordings", json=body)).status_code == 409
    for bad in ({"participants": [], "content_type": "audio/mp4"}, {"participants": ["patient"], "content_type": "video/mp4"}):
        assert (await api.post(f"/patients/{child.id}/recordings", json=bad)).status_code == 422


# ── Recording to a draft note ─────────────────────────────────────────────────

async def test_a_recording_becomes_a_draft_note_with_the_speakers_named(api, db, cloud, claude):
    _, child, clinician = await _clinic(db)
    api.sign_in_as(clinician.user)
    rec = await _start(api, child)
    for seq in range(3):
        assert (await _piece(api, rec, 1, seq, data=f"a{seq}".encode())).status_code == 204
    # After "tap to carry on", a second stretch.
    for seq in range(2):
        assert (await _piece(api, rec, 2, seq, data=f"b{seq}".encode())).status_code == 204
    cloud["words"] = {
        1: [("1", "How"), ("1", "did"), ("1", "bedtime"), ("1", "go?"), ("2", "It"), ("2", "was"), ("2", "an"),
            ("2", "eight."), ("3", "She"), ("3", "cried"), ("3", "then"), ("3", "slept.")],
        2: [("1", "So"), ("1", "bedtime"), ("1", "alone"), ("1", "this"), ("1", "week.")],
    }

    r = await api.post(f"/recordings/{rec['id']}/stop")
    assert r.status_code == 200, r.text

    saved = await _recording(db, rec)
    assert saved.status == "done", saved.error
    [note] = await _notes(db, child)
    assert note.is_draft and note.source == "recording"
    assert note.transcript == [
        {"speaker": "1:1", "text": "How did bedtime go?"},
        {"speaker": "1:2", "text": "It was an eight."},
        {"speaker": "1:3", "text": "She cried then slept."},
        {"speaker": "2:1", "text": "So bedtime alone this week."},
    ]
    assert note.speaker_names == NOTE["speakers"]
    assert (note.participants, note.tags) == (["patient", "parent"], ["Weekly"])
    assert note.content.startswith("What was covered\nBedtime practice.")
    assert "Accommodations" not in note.content  # left empty, so left out
    assert saved.session_note_id == note.id

    # Each stretch was joined in order and transcribed on its own; then the audio was deleted.
    assert [dest for _, dest in cloud["joined"]] == [recorder.segment_object(saved.id, 1), recorder.segment_object(saved.id, 2)]
    assert cloud["joined"][0][0] == [recorder.piece_name(saved.id, 1, s) for s in range(3)]
    assert cloud["objects"] == {}
    # Claude was told the child's first name and read the transcript with speaker keys.
    system, text = claude["asked"][0]
    assert "The child is Sam." in system and "[1:2] It was an eight." in text


async def test_a_name_claude_does_not_give_stays_numbered(api, db, cloud, claude):
    _, child, clinician = await _clinic(db)
    api.sign_in_as(clinician.user)
    rec = await _start(api, child)
    await _piece(api, rec, 1, 0)
    cloud["words"] = {1: [("1", "Hello."), ("2", "Hi."), ("3", "Hey.")]}
    claude["answer"] = {**NOTE, "speakers": {"1:1": "Clinician", "1:2": "The Queen"}, "tag": "Party", "participants": []}
    await api.post(f"/recordings/{rec['id']}/stop")
    [note] = await _notes(db, child)
    assert note.speaker_names == {"1:1": "Clinician", "1:2": "Speaker 2", "1:3": "Speaker 3"}
    assert note.tags == [] and note.participants == ["patient", "parent"]


async def test_the_clinician_renames_a_speaker_and_approves(api, db, cloud):
    _, child, clinician = await _clinic(db)
    api.sign_in_as(clinician.user)
    rec = await _start(api, child)
    await _piece(api, rec, 1, 0)
    cloud["words"] = {1: [("1", "Hello."), ("2", "Hi.")]}
    await api.post(f"/recordings/{rec['id']}/stop")
    [note] = (await api.get(f"/patients/{child.id}/notes")).json()
    assert note["is_draft"] and note["transcript"][0] == {"speaker": "1:1", "text": "Hello."}

    r = await api.put(f"/notes/{note['id']}", json={"speaker_names": {"1:2": "Parent"}})
    assert r.status_code == 200 and r.json()["speaker_names"]["1:2"] == "Parent"
    assert (await api.put(f"/notes/{note['id']}", json={"speaker_names": {"9:9": "Parent"}})).status_code == 422
    assert (await api.put(f"/notes/{note['id']}", json={"is_draft": True})).status_code == 422
    r = await api.put(f"/notes/{note['id']}", json={"is_draft": False})
    assert r.status_code == 200 and r.json()["is_draft"] is False


# ── The pieces ────────────────────────────────────────────────────────────────

async def test_only_audio_pieces_in_range_while_recording(api, db, cloud, monkeypatch):
    _, child, clinician = await _clinic(db)
    api.sign_in_as(clinician.user)
    rec = await _start(api, child)
    assert (await _piece(api, rec, 1, 0, content_type="text/plain")).status_code == 415
    assert (await _piece(api, rec, 1, 0, data=b"")).status_code == 400
    assert (await _piece(api, rec, 0, 0)).status_code == 422
    assert (await _piece(api, rec, recorder.MAX_SEGMENTS + 1, 0)).status_code == 422
    monkeypatch.setattr(recorder, "MAX_PIECE_BYTES", 4)
    assert (await _piece(api, rec, 1, 0, data=b"12345")).status_code == 413
    monkeypatch.setattr(recorder, "MAX_PIECE_BYTES", 8 * 1024 * 1024)
    cloud["fail"] = "put"
    assert (await _piece(api, rec, 1, 0)).status_code == 502
    cloud["fail"] = None
    await _piece(api, rec, 1, 0)
    await api.post(f"/recordings/{rec['id']}/stop")
    assert (await _piece(api, rec, 1, 1)).status_code == 409


# ── When it goes wrong ────────────────────────────────────────────────────────

async def test_when_google_fails_it_can_be_tried_again(api, db, cloud):
    _, child, clinician = await _clinic(db)
    api.sign_in_as(clinician.user)
    rec = await _start(api, child)
    await _piece(api, rec, 1, 0)
    cloud["words"] = {1: [("1", "Hello.")]}
    cloud["fail"] = "start"
    await api.post(f"/recordings/{rec['id']}/stop")
    [shown] = (await api.get(f"/patients/{child.id}/recordings")).json()
    assert shown["status"] == "failed" and "Try again" in shown["error"]
    assert await _notes(db, child) == []

    cloud["fail"] = None
    r = await api.post(f"/recordings/{rec['id']}/retry")
    assert r.status_code == 200
    assert (await _recording(db, rec)).status == "done"
    assert len(await _notes(db, child)) == 1


async def test_when_the_write_up_fails_trying_again_does_not_transcribe_again(api, db, cloud, claude):
    _, child, clinician = await _clinic(db)
    api.sign_in_as(clinician.user)
    rec = await _start(api, child)
    await _piece(api, rec, 1, 0)
    cloud["words"] = {1: [("1", "Hello.")]}
    claude["answer"] = RuntimeError("down")
    await api.post(f"/recordings/{rec['id']}/stop")
    assert (await _recording(db, rec)).status == "failed"

    claude["answer"] = NOTE
    await api.post(f"/recordings/{rec['id']}/retry")
    assert (await _recording(db, rec)).status == "done"
    assert len(cloud["started"]) == 1


async def test_no_speech_is_a_failure_not_an_empty_note(api, db, cloud):
    _, child, clinician = await _clinic(db)
    api.sign_in_as(clinician.user)
    rec = await _start(api, child)
    await _piece(api, rec, 1, 0)
    cloud["words"] = {1: []}
    await api.post(f"/recordings/{rec['id']}/stop")
    saved = await _recording(db, rec)
    assert saved.status == "failed" and "No speech" in saved.error
    assert await _notes(db, child) == []


async def test_the_scheduled_jobs_finish_what_was_left(db, cloud, monkeypatch):
    org, child, clinician = await _clinic(db)
    old = datetime.now(timezone.utc) - timedelta(hours=3)
    # Put away without Stop.
    left = SessionRecording(patient_id=child.id, organization_id=org.id, practitioner_id=clinician.id,
                            participants=["patient"], content_type="audio/mp4", status="recording",
                            started_at=old, updated_at=old)
    db.add(left)
    await db.flush()
    cloud["objects"][recorder.piece_name(left.id, 1, 0)] = b"a"
    cloud["words"] = {1: [("1", "Hello.")]}
    cloud["pending"] = 1

    now = datetime.now(timezone.utc)
    later = now + recorder.BACKSTOP_AFTER + timedelta(minutes=1)
    # A jobs service without the Google settings leaves it alone rather than failing it.
    monkeypatch.setattr(settings, "GOOGLE_RECORDINGS_BUCKET", "")
    assert await recorder.backstop(db, now) == 0
    assert (await db.get(SessionRecording, left.id)).status == "recording"
    monkeypatch.setattr(settings, "GOOGLE_RECORDINGS_BUCKET", "bucket")

    await recorder.backstop(db, now)       # stopped, joined, Google asked
    assert (await db.get(SessionRecording, left.id)).status == "transcribing"
    await recorder.backstop(db, later)     # Google still working
    assert (await db.get(SessionRecording, left.id)).status == "transcribing"
    await recorder.backstop(db, later)     # done
    saved = (await db.execute(select(SessionRecording).where(SessionRecording.id == left.id)
                              .execution_options(populate_existing=True))).scalar_one()
    assert saved.status == "done"


async def test_a_recording_can_be_thrown_away_with_its_audio(api, db, cloud):
    _, child, clinician = await _clinic(db)
    api.sign_in_as(clinician.user)
    rec = await _start(api, child)
    await _piece(api, rec, 1, 0)
    assert (await api.delete(f"/recordings/{rec['id']}")).status_code == 204
    assert cloud["objects"] == {}
    assert await _recording(db, rec) is None
    # Work already under way on it stops instead of waiting for it forever.
    assert await recorder.advance(db, uuid.UUID(rec["id"])) == "gone"


# ── Who can reach it ──────────────────────────────────────────────────────────

async def test_another_clinician_cannot_reach_a_recording(api, db, cloud):
    org, child, clinician = await _clinic(db)
    api.sign_in_as(clinician.user)
    rec = await _start(api, child)
    await _piece(api, rec, 1, 0)

    for intruder in [await make_practitioner(db, org), await make_practitioner(db, await make_org(db))]:
        api.sign_in_as(intruder.user)
        assert (await api.get(f"/patients/{child.id}/recordings")).status_code in (403, 404)
        assert (await api.post(f"/patients/{child.id}/recording-consent", json={"agreed_by": "x"})).status_code in (403, 404)
        assert (await api.post(f"/patients/{child.id}/recordings", json={"participants": ["patient"], "content_type": "audio/mp4"})).status_code in (403, 404)
        assert (await _piece(api, rec, 1, 1)).status_code in (403, 404)
        for method, path in [("GET", ""), ("POST", "/stop"), ("POST", "/retry"), ("DELETE", "")]:
            r = await api.request(method, f"/recordings/{rec['id']}{path}")
            assert r.status_code in (403, 404), (method, path, r.status_code)
    assert recorder.piece_name(rec["id"], 1, 1) not in cloud["objects"]

    # And the child's own login cannot either.
    api.sign_in_as(child.user)
    assert (await api.get(f"/recordings/{rec['id']}")).status_code in (401, 403, 404)


# ── Google, as it is really called ────────────────────────────────────────────

async def test_google_is_asked_the_way_its_apis_expect(monkeypatch):
    creds, _ = _service_account()
    monkeypatch.setattr(settings, "GOOGLE_SPEECH_CREDENTIALS", json.dumps(creds))
    monkeypatch.setattr(settings, "GOOGLE_RECORDINGS_BUCKET", "float-session-recordings")
    monkeypatch.setattr(capture, "_token_cache", {})
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "tok", "expires_in": 3600})
        seen.append(request)
        if request.url.path.endswith(":batchRecognize"):
            return httpx.Response(200, json={"name": "projects/float-test/locations/us/operations/42"})
        if "operations/42" in request.url.path:
            return httpx.Response(200, json={"done": True, "response": {"results": {"gs://x": {"inlineResult": {"transcript": {"results": [
                {"alternatives": [{"transcript": "Hi there. Hello.", "words": [
                    {"word": "Hi", "speakerLabel": "1"}, {"word": "there.", "speakerLabel": "1"}, {"word": "Hello.", "speakerLabel": "2"}]}]},
                {"alternatives": [{"transcript": "No speakers here."}]},
            ]}}}}}})
        return httpx.Response(200, json={})

    monkeypatch.setattr(google, "_transport", httpx.MockTransport(handler))

    pieces = [f"recordings/r/s01/p{i:05d}" for i in range(70)]
    await google.join(pieces, "recordings/r/s01.audio", "audio/mp4")
    composes = [json.loads(r.content) for r in seen if r.url.path.endswith("/compose")]
    assert [len(c["sourceObjects"]) for c in composes] == [32, 32, 8]
    assert composes[1]["sourceObjects"][0]["name"] == "recordings/r/s01.audio"  # each round adds to the joined file
    assert [s["name"] for c in composes for s in c["sourceObjects"] if s["name"] != "recordings/r/s01.audio"] == pieces

    op = await google.start_transcription("recordings/r/s01.audio")
    body = json.loads(seen[-1].content)
    assert op == "projects/float-test/locations/us/operations/42"
    assert body["files"] == [{"uri": "gs://float-session-recordings/recordings/r/s01.audio"}]
    assert body["config"]["features"]["diarizationConfig"] == {} and body["config"]["model"] == "chirp_3"
    assert body["recognitionOutputConfig"] == {"inlineResponseConfig": {}}

    words = await google.check_transcription(op)
    assert words == [("1", "Hi"), ("1", "there."), ("2", "Hello."), ("?", "No"), ("?", "speakers"), ("?", "here.")]


async def test_a_google_error_is_reported_without_the_words(monkeypatch, caplog):
    creds, _ = _service_account()
    monkeypatch.setattr(settings, "GOOGLE_SPEECH_CREDENTIALS", json.dumps(creds))
    monkeypatch.setattr(settings, "GOOGLE_RECORDINGS_BUCKET", "b")
    monkeypatch.setattr(capture, "_token_cache", {})
    monkeypatch.setattr(google, "_transport", httpx.MockTransport(
        lambda r: httpx.Response(200, json={"access_token": "t"}) if r.url.host == "oauth2.googleapis.com"
        else httpx.Response(200, json={"done": True, "error": {"code": 3, "message": "secret words she cried"}})))
    with pytest.raises(google.GoogleFailed):
        await google.check_transcription("projects/p/locations/us/operations/1")
    assert "she cried" not in caplog.text
