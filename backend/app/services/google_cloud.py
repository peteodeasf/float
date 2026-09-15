"""Google Cloud Storage and Speech-to-Text batch mode, for recorded sessions.

Same Google project, service account and HIPAA agreement as Voice Monitoring. A recording is stored
in the bucket in pieces, joined there, transcribed with the speakers separated, and deleted. Nothing
here logs audio, words or Google's replies: only the kind of failure.
docs/plans/session-recording.md
"""
import json
import logging
from urllib.parse import quote

import httpx

from app.core.config import settings
from app.services.monitoring_capture import _access_token

logger = logging.getLogger(__name__)

STORAGE = "https://storage.googleapis.com"
COMPOSE_LIMIT = 32  # Cloud Storage joins at most 32 objects in one request

# Tests swap in a fake Google. None means the real one.
_transport: httpx.AsyncBaseTransport | None = None


class GoogleFailed(Exception):
    """Google did not do what was asked."""


def configured() -> bool:
    return bool(settings.GOOGLE_SPEECH_CREDENTIALS and settings.GOOGLE_RECORDINGS_BUCKET)


def _creds() -> dict:
    return json.loads(settings.GOOGLE_SPEECH_CREDENTIALS)


def _bucket() -> str:
    return settings.GOOGLE_RECORDINGS_BUCKET


async def _call(method: str, url: str, *, allow_404: bool = False, **kw) -> httpx.Response:
    try:
        async with httpx.AsyncClient(timeout=120, transport=_transport) as client:
            token = await _access_token(client, _creds())
            headers = {"Authorization": f"Bearer {token}", **kw.pop("headers", {})}
            r = await client.request(method, url, headers=headers, **kw)
            if allow_404 and r.status_code == 404:
                return r
            r.raise_for_status()
            return r
    except (httpx.HTTPError, KeyError, ValueError, TypeError) as e:
        logger.warning("google %s failed: %s", method, type(e).__name__)
        raise GoogleFailed from e


def _object_url(name: str) -> str:
    return f"{STORAGE}/storage/v1/b/{_bucket()}/o/{quote(name, safe='')}"


# ── Cloud Storage ────────────────────────────────────────────────────────────

async def put_object(name: str, data: bytes, content_type: str) -> None:
    await _call("POST", f"{STORAGE}/upload/storage/v1/b/{_bucket()}/o",
                params={"uploadType": "media", "name": name},
                headers={"Content-Type": content_type}, content=data)


async def list_objects(prefix: str) -> list[str]:
    names: list[str] = []
    token = None
    while True:
        params = {"prefix": prefix, "fields": "items(name),nextPageToken"}
        if token:
            params["pageToken"] = token
        body = (await _call("GET", f"{STORAGE}/storage/v1/b/{_bucket()}/o", params=params)).json()
        names += [i["name"] for i in body.get("items", [])]
        token = body.get("nextPageToken")
        if not token:
            return names


async def delete_object(name: str) -> None:
    await _call("DELETE", _object_url(name), allow_404=True)


async def delete_prefix(prefix: str) -> None:
    for name in await list_objects(prefix):
        await delete_object(name)


async def join(pieces: list[str], dest: str, content_type: str) -> None:
    """The pieces, in order, as one object. In rounds of 32, each round adding to what is joined."""
    if not pieces:
        raise GoogleFailed("nothing to join")
    remaining = list(pieces)
    first, remaining = remaining[:COMPOSE_LIMIT], remaining[COMPOSE_LIMIT:]
    await _compose(first, dest, content_type)
    while remaining:
        batch, remaining = remaining[:COMPOSE_LIMIT - 1], remaining[COMPOSE_LIMIT - 1:]
        await _compose([dest, *batch], dest, content_type)


async def _compose(sources: list[str], dest: str, content_type: str) -> None:
    await _call("POST", f"{_object_url(dest)}/compose", json={
        "sourceObjects": [{"name": s} for s in sources],
        "destination": {"contentType": content_type},
    })


# ── Speech-to-Text, batch mode ───────────────────────────────────────────────

def _speech_base() -> str:
    loc = settings.GOOGLE_SPEECH_LOCATION
    return f"https://{loc}-speech.googleapis.com/v2"


async def start_transcription(name: str) -> str:
    """Start transcribing an object in the bucket, speakers separated. Returns Google's job name."""
    loc = settings.GOOGLE_SPEECH_LOCATION
    url = f"{_speech_base()}/projects/{_creds()['project_id']}/locations/{loc}/recognizers/_:batchRecognize"
    body = {
        "config": {
            "autoDecodingConfig": {},
            "languageCodes": ["en-US"],
            "model": settings.GOOGLE_SPEECH_MODEL,
            "features": {"enableAutomaticPunctuation": True, "diarizationConfig": {}},
        },
        "files": [{"uri": f"gs://{_bucket()}/{name}"}],
        # The words come back in Google's reply, so nothing else is written to the bucket.
        "recognitionOutputConfig": {"inlineResponseConfig": {}},
    }
    try:
        return (await _call("POST", url, json=body)).json()["name"]
    except KeyError as e:
        raise GoogleFailed from e


async def check_transcription(operation: str) -> list[tuple[str, str]] | None:
    """None while Google is still working. When done, each word with its speaker label, in order.

    A recording with no speech gives []. With `chirp_3`, speaker labels are on the words, and there
    are no times.
    """
    body = (await _call("GET", f"{_speech_base()}/{operation}")).json()
    if not body.get("done"):
        return None
    if "error" in body:
        logger.warning("google transcription failed: code %s", body["error"].get("code"))
        raise GoogleFailed("transcription failed")
    out: list[tuple[str, str]] = []
    for file_result in (body.get("response", {}).get("results") or {}).values():
        if "error" in file_result:
            logger.warning("google transcription failed for a file: code %s", file_result["error"].get("code"))
            raise GoogleFailed("transcription failed")
        for result in (file_result.get("inlineResult", {}).get("transcript", {}).get("results") or []):
            alt = (result.get("alternatives") or [{}])[0]
            words = alt.get("words") or []
            if words:
                out += [(str(w.get("speakerLabel") or "?"), w.get("word", "")) for w in words if w.get("word")]
            elif alt.get("transcript", "").strip():
                # Speakers not separated for this stretch: keep the words under an unknown speaker.
                out += [("?", w) for w in alt["transcript"].split()]
    return out
