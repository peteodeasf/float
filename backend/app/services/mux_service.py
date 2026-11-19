"""Talking to Mux, for Float's own videos. docs/plans/videos.md

Three jobs: list the videos in the Mux account, make one private (a signed playback id, and no
public one), and sign the short-lived pass a play needs. Nothing about a patient or a viewer is
ever sent to Mux: the pass names only the video.
"""
import base64
import time

import httpx
from jose import jwt

from app.core.config import settings

API = "https://api.mux.com/video/v1"

#: How long a pass lasts. Mux checks it on every part of the stream, so it must outlast a viewing,
#: with room for pausing. A copied link stops working after this.
PASS_SECONDS = 4 * 60 * 60


class MuxNotConfigured(Exception):
    """The Mux keys are not set, so there are no videos."""


class MuxError(Exception):
    """Mux answered with an error."""


def configured() -> bool:
    return bool(settings.MUX_TOKEN_ID and settings.MUX_TOKEN_SECRET
                and settings.MUX_SIGNING_KEY_ID and settings.MUX_SIGNING_PRIVATE_KEY)


def _client() -> httpx.AsyncClient:
    if not (settings.MUX_TOKEN_ID and settings.MUX_TOKEN_SECRET):
        raise MuxNotConfigured()
    return httpx.AsyncClient(base_url=API, auth=(settings.MUX_TOKEN_ID, settings.MUX_TOKEN_SECRET), timeout=20)


async def _request(method: str, path: str, **kwargs) -> dict:
    async with _client() as c:
        r = await c.request(method, path, **kwargs)
    if r.status_code >= 400:
        raise MuxError(f"Mux {method} {path}: {r.status_code}")
    return r.json() if r.content else {}


async def list_assets() -> list[dict]:
    """Every video in the Mux account, newest first, as Mux describes it. One page of 100 is plenty
    for a library this size; say so if it ever is not."""
    return (await _request("GET", "/assets", params={"limit": 100})).get("data", [])


async def get_asset(asset_id: str) -> dict:
    return (await _request("GET", f"/assets/{asset_id}")).get("data", {})


async def make_private(asset: dict) -> str:
    """Make sure the video plays only with a pass, and return its signed playback id.

    Adds a signed playback id if there is none, then deletes every public one. Mux's dashboard
    makes uploads public by default and does not clearly offer this (Peter, 2026-11-19).
    """
    ids = asset.get("playback_ids") or []
    signed = next((p["id"] for p in ids if p.get("policy") == "signed"), None)
    if signed is None:
        signed = (await _request("POST", f"/assets/{asset['id']}/playback-ids",
                                 json={"policy": "signed"}))["data"]["id"]
    for p in ids:
        if p.get("policy") == "public":
            await _request("DELETE", f"/assets/{asset['id']}/playback-ids/{p['id']}")
    return signed


def playback_pass(playback_id: str, kind: str = "v") -> str:
    """A signed pass for one video: `v` to play it, `t` for its still picture."""
    if not (settings.MUX_SIGNING_KEY_ID and settings.MUX_SIGNING_PRIVATE_KEY):
        raise MuxNotConfigured()
    key = base64.b64decode(settings.MUX_SIGNING_PRIVATE_KEY).decode()
    claims = {"sub": playback_id, "aud": kind, "exp": int(time.time()) + PASS_SECONDS}
    return jwt.encode(claims, key, algorithm="RS256", headers={"kid": settings.MUX_SIGNING_KEY_ID})
