"""Float's own videos, stage 1. docs/plans/videos.md

Mux is never called: its three calls are replaced by a stand-in that records what was asked. The
pass is signed with a key made here, so the test can read it back and check what it says.
"""
import base64

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwt

from app.core.config import settings
from app.models.video import Video
from app.services import mux_service
from tests.factories import make_float_admin, make_org, make_patient, make_practitioner, _make_user

pytestmark = pytest.mark.asyncio


@pytest.fixture
def signing_key(monkeypatch):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
                            serialization.NoEncryption())
    monkeypatch.setattr(settings, "MUX_SIGNING_KEY_ID", "test-key-id")
    monkeypatch.setattr(settings, "MUX_SIGNING_PRIVATE_KEY", base64.b64encode(pem).decode())
    monkeypatch.setattr(settings, "MUX_TOKEN_ID", "id")
    monkeypatch.setattr(settings, "MUX_TOKEN_SECRET", "secret")
    return key.public_key().public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)


@pytest.fixture
def fake_mux(monkeypatch):
    """Two assets on Mux: one public and ready, one still processing."""
    calls = []
    assets = {
        "assetPublic1": {"id": "assetPublic1", "status": "ready", "duration": 93.4,
                         "playback_ids": [{"id": "pub-1", "policy": "public"}]},
        "assetProcessing1": {"id": "assetProcessing1", "status": "preparing", "playback_ids": []},
    }

    async def _request(method, path, **kw):
        calls.append((method, path, kw.get("json")))
        if method == "GET" and path == "/assets":
            return {"data": list(assets.values())}
        if method == "GET" and path.startswith("/assets/"):
            return {"data": assets[path.split("/")[2]]}
        if method == "POST" and path.endswith("/playback-ids"):
            return {"data": {"id": "signed-1", "policy": "signed"}}
        if method == "DELETE":
            return {}
        raise AssertionError(f"unexpected Mux call {method} {path}")

    monkeypatch.setattr(mux_service, "_request", _request)
    return calls


async def _video(db, published=True, audience="family"):
    v = Video(mux_asset_id=f"a-{audience}-{published}", mux_playback_id="signed-x", title="The Worry Hill",
              audience=audience, is_published=published)
    db.add(v)
    await db.flush()
    return v


# ── Adding a video makes it private ───────────────────────────────────────────

async def test_adding_a_public_video_makes_it_private(api, db, signing_key, fake_mux):
    api.sign_in_as(await make_float_admin(db))
    r = await api.post("/admin/videos", json={"mux_asset_id": "assetPublic1", "title": "Worry Hill", "audience": "family"})
    assert r.status_code == 201, r.text
    assert ("POST", "/assets/assetPublic1/playback-ids", {"policy": "signed"}) in fake_mux
    assert ("DELETE", "/assets/assetPublic1/playback-ids/pub-1", None) in fake_mux
    saved = (await db.get(Video, __import__("uuid").UUID(r.json()["id"])))
    assert saved.mux_playback_id == "signed-1"
    assert saved.is_published is False  # starts hidden from clinicians
    assert float(saved.duration_seconds) == 93.4


async def test_a_video_still_processing_cannot_be_added(api, db, signing_key, fake_mux):
    api.sign_in_as(await make_float_admin(db))
    r = await api.post("/admin/videos", json={"mux_asset_id": "assetProcessing1", "title": "x"})
    assert r.status_code == 409


async def test_the_list_from_mux_leaves_out_videos_already_added(api, db, signing_key, fake_mux):
    api.sign_in_as(await make_float_admin(db))
    await api.post("/admin/videos", json={"mux_asset_id": "assetPublic1", "title": "Worry Hill"})
    r = await api.get("/admin/videos/from-mux")
    assert [a["mux_asset_id"] for a in r.json()] == ["assetProcessing1"]


async def test_without_mux_keys_the_admin_is_told_so(api, db, monkeypatch):
    monkeypatch.setattr(settings, "MUX_TOKEN_ID", "")
    api.sign_in_as(await make_float_admin(db))
    r = await api.get("/admin/videos/from-mux")
    assert r.status_code == 503
    assert "Mux keys" in r.json()["detail"]


# ── Who can see and play what ─────────────────────────────────────────────────

async def test_clinicians_see_every_published_video_and_nothing_unpublished(api, db, signing_key):
    await _video(db, audience="family")
    await _video(db, audience="clinician")
    await _video(db, published=False)
    api.sign_in_as((await make_practitioner(db, await make_org(db))).user)
    r = await api.get("/videos")
    assert r.status_code == 200
    assert sorted(v["audience"] for v in r.json()) == ["clinician", "family"]
    assert "mux_asset_id" not in r.json()[0]


async def test_a_pass_names_only_the_video_and_runs_out(api, db, signing_key):
    v = await _video(db)
    api.sign_in_as((await make_practitioner(db, await make_org(db))).user)
    r = await api.get(f"/videos/{v.id}/playback")
    assert r.status_code == 200
    body = r.json()
    claims = jwt.decode(body["token"], signing_key, algorithms=["RS256"], audience="v")
    assert jwt.get_unverified_header(body["token"])["kid"] == "test-key-id"
    assert claims["sub"] == "signed-x"
    assert set(claims) == {"sub", "aud", "exp"}  # nothing about who is watching
    assert jwt.decode(body["thumbnail_token"], signing_key, algorithms=["RS256"], audience="t")["sub"] == "signed-x"


async def test_an_unpublished_video_cannot_be_played(api, db, signing_key):
    v = await _video(db, published=False)
    api.sign_in_as((await make_practitioner(db, await make_org(db))).user)
    assert (await api.get(f"/videos/{v.id}/playback")).status_code == 404


async def test_children_and_parents_get_no_videos_yet(api, db, signing_key):
    v = await _video(db)
    org = await make_org(db)
    child = await make_patient(db, org)
    parent = await _make_user(db, org, "parent")
    for user in (child.user, parent):
        api.sign_in_as(user)
        assert (await api.get("/videos")).status_code in (401, 403)
        assert (await api.get(f"/videos/{v.id}/playback")).status_code in (401, 403)


async def test_clinicians_cannot_use_the_admin_routes(api, db, signing_key, fake_mux):
    api.sign_in_as((await make_practitioner(db, await make_org(db))).user)
    assert (await api.get("/admin/videos/from-mux")).status_code in (401, 403)
    assert (await api.post("/admin/videos", json={"mux_asset_id": "assetPublic1", "title": "x"})).status_code in (401, 403)
    assert not fake_mux  # Mux was never asked anything


async def test_a_mux_id_must_be_letters_and_numbers(api, db, signing_key, fake_mux):
    # It goes into the Mux API address, so nothing like a path or a URL gets through.
    api.sign_in_as(await make_float_admin(db))
    r = await api.post("/admin/videos", json={"mux_asset_id": "../assets", "title": "x"})
    assert r.status_code == 422
    assert not fake_mux
