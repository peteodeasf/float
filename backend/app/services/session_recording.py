"""From a recorded session to a draft session note.

Peter, 2026-09-13: the clinician records the session on their phone; Float transcribes it with the
speakers separated (Google), writes the note (Claude), and saves it on the patient's record as a
draft for the clinician to approve. The recording is deleted once the transcript is saved; the full
transcript is kept. docs/plans/session-recording.md

A recording moves through: recording → stopped → transcribing → done, or failed. `advance` takes one
step, under a row lock, so the request that stopped it and the scheduled jobs service can both move
it along without doing anything twice.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone

import anthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.patient import PatientProfile
from app.models.session_note import SessionNote, SessionRecording
from app.services import google_cloud as google
from app.services.insight_service import parse_model_json

logger = logging.getLogger(__name__)

MAX_PIECE_BYTES = 8 * 1024 * 1024
MAX_SEGMENTS = 20
MAX_PIECES = 600               # per stretch: five hours at 30 seconds a piece
POLL_SECONDS = 20
GIVE_UP_AFTER = timedelta(hours=3)
STALE_RECORDING = timedelta(hours=2)   # no piece for this long: the phone was put away without Stop
BACKSTOP_AFTER = timedelta(minutes=5)

SPEAKER_NAMES = ("Clinician", "Child", "Parent", "Other")
SESSION_TAGS = ("Initial", "Consult", "Weekly", "Review")
SECTIONS = [
    ("covered", "What was covered"),
    ("situations", "Situations and exposures"),
    ("accommodations", "Accommodations"),
    ("agreed", "Agreed for the week"),
    ("follow_up", "To follow up"),
]


class WriteUpFailed(Exception):
    """Claude did not write the note."""


def recording_prefix(recording_id: uuid.UUID) -> str:
    return f"recordings/{recording_id}/"


def piece_name(recording_id: uuid.UUID, segment: int, seq: int) -> str:
    return f"{recording_prefix(recording_id)}s{segment:02d}/p{seq:05d}"


def segment_object(recording_id: uuid.UUID, segment: int) -> str:
    return f"{recording_prefix(recording_id)}s{segment:02d}.audio"


def turns_from_words(segment: int, words: list[tuple[str, str]]) -> list[dict]:
    """Consecutive words from one speaker become one turn. Speakers are numbered per stretch of
    recording, so the key carries both: "2:1" is speaker 1 after the first "tap to carry on"."""
    turns: list[dict] = []
    for label, word in words:
        key = f"{segment}:{label}"
        if turns and turns[-1]["speaker"] == key:
            turns[-1]["text"] += " " + word
        else:
            turns.append({"speaker": key, "text": word})
    return turns


# ── Writing the note ─────────────────────────────────────────────────────────

def _prompt(child_name: str, participants: list[str]) -> str:
    room = " and ".join({"patient": "the child", "parent": "their parent"}[p] for p in participants)
    return f"""You write a draft session note for a child's anxiety clinician from the transcript of a therapy session. The treatment is exposure-based CBT: exposures to feared situations on a ladder, and the parent reducing accommodation. The clinician will check and approve the note.

The child is {child_name}. In the room: the clinician, {room}.

The transcript is a list of turns. Each starts with a speaker key in square brackets, like [1:2]. The speakers were separated by software and are not named, and the separation can be wrong.

Return JSON only, in this shape:
{{"speakers": {{"1:1": "Clinician"}}, "participants": ["patient", "parent"], "tag": "Weekly", "note": {{"covered": "", "situations": "", "accommodations": "", "agreed": "", "follow_up": ""}}}}

Rules:
- speakers: a name for every speaker key in the transcript: "Clinician", "Child", "Parent" or "Other", judged from what each says.
- participants: who took part apart from the clinician: "patient" for the child, "parent" for the parent.
- tag: "Initial", "Consult", "Weekly" or "Review", or "" if you cannot tell.
- note.covered: what the session was about, in two to four short sentences.
- note.situations: situations and exposures discussed, and how they went. A Fear Level only when a number was said in the session.
- note.accommodations: what the parent does to accommodate the anxiety that was discussed, and any change agreed.
- note.agreed: what was agreed for the coming week.
- note.follow_up: anything the clinician said to come back to, or a concern raised.
- Use "" for any part the session did not cover. Never add anything that was not said, and do not diagnose.
- Return only the JSON object above and nothing else — no prose, no note to the reader, and never ask for more of the transcript. If the session is short or has no clinical content, still return the JSON, with "" for every part you cannot fill.
- Plain, short sentences. Say "the child" or use {child_name}'s first name; do not write "the patient"."""


async def _ask_claude(system: str, text: str) -> str:
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=3000,
        system=system,
        messages=[{"role": "user", "content": text}],
    )
    return message.content[0].text


async def write_note(turns: list[dict], child_name: str, participants: list[str]) -> dict:
    """The note's text, tags, participants and a name for each speaker. Everything Claude returns is
    checked against what is allowed; a speaker it did not name is left numbered."""
    transcript = "\n".join(f"[{t['speaker']}] {t['text']}" for t in turns)
    system = _prompt(child_name, participants)
    # The model occasionally answers a thin transcript in prose ("send me more") with no JSON at all,
    # so a good recording fails to write. One retry with a firmer reminder clears the non-deterministic
    # case; the prompt rule handles most of it.
    data = None
    for attempt in range(2):
        text = transcript if attempt == 0 else transcript + "\n\nReturn only the JSON object described above and nothing else."
        try:
            data = parse_model_json(await _ask_claude(system, text))
            break
        except Exception as e:
            if attempt == 1:
                logger.warning("session note write-up failed: %s", type(e).__name__)
                raise WriteUpFailed from e
    if not isinstance(data, dict):
        raise WriteUpFailed("not an object")

    keys = list(dict.fromkeys(t["speaker"] for t in turns))
    given = data.get("speakers") if isinstance(data.get("speakers"), dict) else {}
    speakers = {}
    for n, key in enumerate(keys, start=1):
        name = given.get(key)
        speakers[key] = name if name in SPEAKER_NAMES else f"Speaker {n}"

    found = data.get("participants") if isinstance(data.get("participants"), list) else []
    chosen = [p for p in ("patient", "parent") if p in found] or list(participants)

    tag = data.get("tag") if data.get("tag") in SESSION_TAGS else None

    note = data.get("note") if isinstance(data.get("note"), dict) else {}
    parts = []
    for key, heading in SECTIONS:
        value = note.get(key)
        if isinstance(value, str) and value.strip():
            parts.append(f"{heading}\n{value.strip()}")
    content = "\n\n".join(parts) or "Nothing to note. The transcript is below."

    return {"speakers": speakers, "participants": chosen, "tags": [tag] if tag else [], "content": content}


# ── Moving a recording along ─────────────────────────────────────────────────

async def _fail(db: AsyncSession, rec: SessionRecording, message: str) -> str:
    rec.status = "failed"
    rec.error = message
    rec.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return rec.status


async def advance(db: AsyncSession, recording_id: uuid.UUID) -> str:
    """One step for this recording. Returns its status after the step, "busy" when something
    else is moving it right now, or "gone" when it was deleted."""
    rec = (await db.execute(
        select(SessionRecording).where(SessionRecording.id == recording_id)
        .with_for_update(skip_locked=True).execution_options(populate_existing=True)
    )).scalar_one_or_none()
    if rec is None:
        still_there = (await db.execute(select(SessionRecording.id).where(SessionRecording.id == recording_id))).first()
        return "busy" if still_there else "gone"
    now = datetime.now(timezone.utc)
    jobs: list[dict] | None = None

    try:
        if rec.status == "stopped":
            jobs = [dict(j) for j in (rec.jobs or [])]
            if not jobs:
                names = await google.list_objects(recording_prefix(rec.id))
                by_segment: dict[int, list[str]] = {}
                for name in names:
                    part = name[len(recording_prefix(rec.id)):]
                    if "/" not in part:
                        continue
                    by_segment.setdefault(int(part.split("/")[0][1:]), []).append(name)
                if not by_segment:
                    return await _fail(db, rec, "No audio was received.")
                for segment in sorted(by_segment):
                    pieces = sorted(by_segment[segment])
                    dest = segment_object(rec.id, segment)
                    await google.join(pieces, dest, rec.content_type)
                    for piece in pieces:
                        await google.delete_object(piece)
                    jobs.append({"segment": segment, "object": dest, "operation": None, "turns": None})
            for job in jobs:
                if job["turns"] is None:
                    job["operation"] = await google.start_transcription(job["object"])
                    job["started_at"] = now.isoformat()
            rec.jobs = jobs
            rec.status = "transcribing"
            rec.updated_at = now
            await db.commit()
            return rec.status

        if rec.status == "transcribing":
            jobs = [dict(j) for j in (rec.jobs or [])]
            pending = False
            for job in jobs:
                if job["turns"] is None:
                    words = await google.check_transcription(job["operation"])
                    if words is None:
                        pending = True
                    else:
                        job["turns"] = turns_from_words(job["segment"], words)
            rec.jobs = jobs
            if pending:
                # Measured from when Google was asked, not from the recording: one the jobs service
                # finds hours after the phone was put away still gets its full time.
                started = min((datetime.fromisoformat(j["started_at"]) for j in jobs if j.get("started_at")), default=now)
                if now - started > GIVE_UP_AFTER:
                    return await _fail(db, rec, "Google took too long to transcribe the recording.")
                rec.updated_at = now
                await db.commit()
                return rec.status

            turns = [t for job in sorted(jobs, key=lambda j: j["segment"]) for t in job["turns"]]
            if not turns:
                return await _fail(db, rec, "No speech was found in the recording.")
            patient = await db.get(PatientProfile, rec.patient_id)
            child = (patient.name or "the child").split()[0] if patient else "the child"
            written = await write_note(turns, child, list(rec.participants))

            note = SessionNote(
                patient_id=rec.patient_id,
                organization_id=rec.organization_id,
                practitioner_id=rec.practitioner_id,
                participants=written["participants"],
                tags=written["tags"],
                session_date=(rec.started_at or now).date(),
                content=written["content"],
                is_draft=True,
                source="recording",
                transcript=turns,
                speaker_names=written["speakers"],
            )
            db.add(note)
            await db.flush()
            rec.session_note_id = note.id
            rec.status = "done"
            rec.error = None
            rec.updated_at = now
            objects = [j["object"] for j in jobs]
            await db.commit()
            # The transcript is saved, so the recording goes. A missed delete is caught by the
            # bucket's rule that removes anything older than two days.
            for name in objects:
                try:
                    await google.delete_object(name)
                except google.GoogleFailed:
                    logger.warning("a session recording could not be deleted; the bucket rule will remove it")
            return rec.status

        return rec.status
    except (google.GoogleFailed, WriteUpFailed) as e:
        # Keep what was done: the joined audio and any transcript already back, so trying again
        # carries on from there instead of starting over.
        if jobs is not None:
            rec.jobs = jobs
        if isinstance(e, WriteUpFailed):
            return await _fail(db, rec, "The note couldn't be written. Try again.")
        return await _fail(db, rec, "Google couldn't process the recording. Try again.")


async def settle(sessions, recording_id: uuid.UUID) -> None:
    """After Stop, move the recording along until it is done or failed. Runs after the response."""
    try:
        while True:
            async with sessions() as db:
                status = await advance(db, recording_id)
            if status in ("done", "failed", "gone"):
                return
            await asyncio.sleep(POLL_SECONDS)
    except Exception as e:
        # The scheduled jobs service picks it up from here.
        logger.warning("moving a session recording along stopped: %s", type(e).__name__)


async def backstop(db: AsyncSession, now: datetime) -> int:
    """For the scheduled jobs service: recordings the phone or the server left part-way."""
    if not google.configured():
        # Without the Google settings every step would fail the recording; leave them for a service that has them.
        return 0
    moved = 0
    stale = (await db.execute(
        select(SessionRecording.id).where(
            SessionRecording.status == "recording",
            SessionRecording.updated_at < now - STALE_RECORDING,
        )
    )).scalars().all()
    for rid in stale:
        rec = await db.get(SessionRecording, rid)
        rec.status = "stopped"
        rec.stopped_at = rec.updated_at
        await db.commit()
    waiting = (await db.execute(
        select(SessionRecording.id).where(
            SessionRecording.status.in_(["stopped", "transcribing"]),
            SessionRecording.updated_at < now - BACKSTOP_AFTER,
        )
    )).scalars().all()
    for rid in [*stale, *[w for w in waiting if w not in stale]]:
        if await advance(db, rid) not in ("busy", "gone"):
            moved += 1
    return moved
