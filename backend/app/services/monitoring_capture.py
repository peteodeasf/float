"""A parent's monitoring observation, said out loud or typed as a quick note.

Peter, 2026-09-11: a faster way in than the four-box form, alongside it. A recording goes to Google
Speech-to-Text and is never stored. The text goes to Claude, which writes it up as one or more
observations for the parent to check before they are saved. Only the text is kept.
docs/plans/monitoring-just-say-it.md
"""
import base64
import json
import logging
import re
import time
from datetime import date, timedelta

import anthropic
import httpx
from jose import jwt

from app.core.config import settings
from app.services.insight_service import parse_model_json

logger = logging.getLogger(__name__)

MAX_AUDIO_BYTES = 10 * 1024 * 1024  # Google's limit for a quick request; a minute is well under it
DAILY_LIMIT = 80                    # recordings and write-ups together, per form per day
MAX_NOTE_CHARS = 5000
MAX_OBSERVATIONS = 10
OLDEST_DAYS = 14                    # a date further back than this is taken as a mistake: today

GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
GOOGLE_SCOPE = "https://www.googleapis.com/auth/cloud-platform"

# Tests swap in a fake Google. None means the real one.
_transport: httpx.AsyncBaseTransport | None = None
_token_cache: dict = {}


class CaptureFailed(Exception):
    """Google or Claude did not answer usefully. The page says to try again, or type it."""


# ── Google Speech-to-Text ────────────────────────────────────────────────────

def voice_available() -> bool:
    return bool(settings.GOOGLE_SPEECH_CREDENTIALS)


def _assertion(creds: dict, now: int) -> str:
    """The service account's signed request for an access token: Google's sign-in for servers."""
    return jwt.encode({
        "iss": creds["client_email"],
        "scope": GOOGLE_SCOPE,
        "aud": creds.get("token_uri", GOOGLE_TOKEN_URI),
        "iat": now,
        "exp": now + 3600,
    }, creds["private_key"], algorithm="RS256")


async def _access_token(client: httpx.AsyncClient, creds: dict) -> str:
    now = int(time.time())
    if _token_cache.get("email") == creds["client_email"] and _token_cache.get("expires", 0) > now + 60:
        return _token_cache["token"]
    r = await client.post(creds.get("token_uri", GOOGLE_TOKEN_URI), data={
        "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
        "assertion": _assertion(creds, now),
    })
    r.raise_for_status()
    body = r.json()
    _token_cache.update(email=creds["client_email"], token=body["access_token"],
                        expires=now + int(body.get("expires_in", 3600)))
    return body["access_token"]


async def transcribe(audio: bytes) -> str:
    """The words in a recording of up to a minute, or "" when no speech was heard.

    Google works out the format itself: iPhones record AAC in MP4, Chrome and Android Opus in
    WebM, and it takes both as they are.
    """
    try:
        creds = json.loads(settings.GOOGLE_SPEECH_CREDENTIALS)
        loc = settings.GOOGLE_SPEECH_LOCATION
        url = (f"https://{loc}-speech.googleapis.com/v2/projects/{creds['project_id']}"
               f"/locations/{loc}/recognizers/_:recognize")
        async with httpx.AsyncClient(timeout=30, transport=_transport) as client:
            token = await _access_token(client, creds)
            r = await client.post(url, headers={"Authorization": f"Bearer {token}"}, json={
                "config": {
                    "autoDecodingConfig": {},
                    "languageCodes": ["en-US"],
                    "model": settings.GOOGLE_SPEECH_MODEL,
                    "features": {"enableAutomaticPunctuation": True},
                },
                "content": base64.b64encode(audio).decode(),
            })
            r.raise_for_status()
            results = r.json().get("results", [])
    except (httpx.HTTPError, KeyError, ValueError, TypeError) as e:
        # The kind of failure only: never the audio, the words, or Google's reply.
        logger.warning("speech-to-text failed: %s", type(e).__name__)
        raise CaptureFailed from e
    words = [(res.get("alternatives") or [{}])[0].get("transcript", "").strip() for res in results]
    return " ".join(w for w in words if w)


# ── Writing it up ────────────────────────────────────────────────────────────

def _prompt(today: date) -> str:
    return f"""You turn a parent's spoken or typed note into monitoring observations for their child's anxiety clinician.

The parent is keeping a monitoring diary before treatment starts. Each observation records one moment when their child was anxious: the situation, what the child did or said, and how the parent responded.

Return JSON only, in this shape:
{{"observations": [{{"date": "YYYY-MM-DD", "situation": "", "child": "", "parent": "", "fear": null}}]}}

Rules:
- One observation for each separate moment. One moment told in several sentences is one observation.
- situation: where and when it happened, and what was going on.
- child: what the child did or said, and how they seemed.
- parent: what the parent did or said in response.
- Keep the parent's own words. Tidy them into short sentences in the parent's voice ("I sat with her until she calmed down"). Do not add anything, soften it, explain it or diagnose it.
- Use "" for anything the parent did not say. Never fill a gap with a guess.
- fear: the child's Fear Level from 1 to 10, only when the parent said a number for it. Otherwise null. Words like "terrified" or "a bit nervous" are not a number.
- date: today is {today.strftime("%A")} {today.isoformat()}. Work out each moment's date from what the parent said: "this morning" is today, "last night" is yesterday, "on Tuesday" is the most recent Tuesday. If they did not say, use today.
- If nothing in the note is a moment when the child was anxious, return {{"observations": []}}."""


async def _ask_claude(system: str, text: str) -> str:
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    message = await client.messages.create(
        model="claude-sonnet-4-6",  # the same model as monitoring extraction
        max_tokens=2000,
        system=system,
        messages=[{"role": "user", "content": text}],
    )
    return message.content[0].text


NUMBER_WORDS = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five",
                6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten"}


def _said(text: str, n: int) -> bool:
    return re.search(rf"\b({n}|{NUMBER_WORDS[n]})\b", text, re.IGNORECASE) is not None


def _part(value) -> str | None:
    s = value.strip()[:2000] if isinstance(value, str) else ""
    return s or None


def _clean(o, text: str, today: date) -> dict | None:
    """One observation as it will be saved, or None when there is nothing in it."""
    if not isinstance(o, dict):
        return None
    situation, child, parent = _part(o.get("situation")), _part(o.get("child")), _part(o.get("parent"))
    if not (situation or child or parent):
        return None
    # Never guessed. A Fear Level only when the parent said that number: ratings must come from the
    # source (CONCEPTS.md), so a number the model offers that is not in their words is dropped.
    fear = o.get("fear")
    if isinstance(fear, bool) or not isinstance(fear, int) or not 1 <= fear <= 10 or not _said(text, fear):
        fear = None
    try:
        day = date.fromisoformat(str(o.get("date")))
    except ValueError:
        day = today
    if day > today or day < today - timedelta(days=OLDEST_DAYS):
        day = today
    return {
        "entry_date": day,
        "situation": situation,
        "child_behavior_observed": child,
        "parent_response": parent,
        "fear_thermometer": fear,
    }


async def write_up(text: str, today: date) -> list[dict]:
    """The observations in a parent's note, ready to save as drafts. [] when there are none."""
    try:
        data = parse_model_json(await _ask_claude(_prompt(today), text))
    except Exception as e:
        logger.warning("monitoring write-up failed: %s", type(e).__name__)
        raise CaptureFailed from e
    found = data.get("observations") if isinstance(data, dict) else None
    cleaned = [_clean(o, text, today) for o in (found if isinstance(found, list) else [])]
    return [c for c in cleaned if c][:MAX_OBSERVATIONS]
