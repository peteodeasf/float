"""Float's own videos. docs/plans/videos.md

Stage 1: the Float team adds videos that are already on Mux, and clinicians play them in the
Library. Sharing with families is stage 2.

- `/admin/videos…`: Float admins only. Adding a video makes it private on Mux.
- `/videos…`: any clinician in a practice that is set up. Every published video, whoever it is
  for: a clinician shows family videos in session too.
Children and parents get nothing here (stage 2 adds what was shared with them).
"""
import uuid
from datetime import datetime, timezone
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routers.admin import get_admin_context
from app.api.routers.patients import get_practitioner_context
from app.core.database import get_db
from app.models.user import User
from app.models.video import Video
from app.services import mux_service

router = APIRouter(tags=["videos"])

Audience = Literal["clinician", "family", "both"]


def _video_out(v: Video, admin: bool = False) -> dict:
    out = {
        "id": str(v.id),
        "title": v.title,
        "description": v.description,
        "audience": v.audience,
        "duration_seconds": float(v.duration_seconds) if v.duration_seconds is not None else None,
        "display_order": v.display_order,
    }
    if admin:
        out |= {"mux_asset_id": v.mux_asset_id, "is_published": v.is_published}
    return out


def _mux_unavailable(e: Exception) -> HTTPException:
    if isinstance(e, mux_service.MuxNotConfigured):
        return HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Videos are not set up yet: the Mux keys are missing.")
    return HTTPException(status.HTTP_502_BAD_GATEWAY, "Mux did not answer. Try again in a minute.")


# ── Clinicians ────────────────────────────────────────────────────────────────

@router.get("/videos")
async def list_videos(
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(Video).where(Video.is_published.is_(True)).order_by(Video.display_order, Video.created_at)
    )).scalars().all()
    return [_video_out(v) for v in rows]


@router.get("/videos/{video_id}/playback")
async def video_playback(
    video_id: uuid.UUID,
    context: tuple = Depends(get_practitioner_context),
    db: AsyncSession = Depends(get_db),
):
    """The playback id and short-lived passes to play one published video and show its picture."""
    v = await db.get(Video, video_id)
    if v is None or not v.is_published:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Video not found")
    try:
        return {
            "playback_id": v.mux_playback_id,
            "token": mux_service.playback_pass(v.mux_playback_id, "v"),
            "thumbnail_token": mux_service.playback_pass(v.mux_playback_id, "t"),
        }
    except mux_service.MuxNotConfigured as e:
        raise _mux_unavailable(e)


# ── Float admins ──────────────────────────────────────────────────────────────

class VideoAdd(BaseModel):
    # Mux ids are letters and numbers. Checked because it goes into the Mux API address.
    mux_asset_id: str = Field(pattern=r"^[A-Za-z0-9]{1,128}$")
    title: str = Field(min_length=1)
    description: Optional[str] = None
    audience: Audience = "clinician"


class VideoEdit(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    audience: Optional[Audience] = None
    display_order: Optional[int] = None
    is_published: Optional[bool] = None


@router.get("/admin/videos")
async def admin_list_videos(_: User = Depends(get_admin_context), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Video).order_by(Video.display_order, Video.created_at))).scalars().all()
    return [_video_out(v, admin=True) for v in rows]


@router.get("/admin/videos/from-mux")
async def admin_mux_assets(_: User = Depends(get_admin_context), db: AsyncSession = Depends(get_db)):
    """The videos on Mux that Float does not have yet. `public` says whether adding it will make it
    private."""
    try:
        assets = await mux_service.list_assets()
    except (mux_service.MuxNotConfigured, mux_service.MuxError) as e:
        raise _mux_unavailable(e)
    have = set((await db.execute(select(Video.mux_asset_id))).scalars().all())
    return [
        {
            "mux_asset_id": a["id"],
            "status": a.get("status"),
            "duration_seconds": a.get("duration"),
            "created_at": a.get("created_at"),
            "name": (a.get("meta") or {}).get("title") or a.get("passthrough"),
            "public": any(p.get("policy") == "public" for p in a.get("playback_ids") or []),
        }
        for a in assets if a["id"] not in have
    ]


@router.post("/admin/videos", status_code=status.HTTP_201_CREATED)
async def admin_add_video(body: VideoAdd, _: User = Depends(get_admin_context), db: AsyncSession = Depends(get_db)):
    """Add a video that is on Mux. It is made private on Mux first, and starts unpublished."""
    existing = (await db.execute(select(Video).where(Video.mux_asset_id == body.mux_asset_id))).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "That video is already in Float")
    try:
        asset = await mux_service.get_asset(body.mux_asset_id)
        if asset.get("status") != "ready":
            raise HTTPException(status.HTTP_409_CONFLICT, "Mux is still processing that video. Try again when it says Ready.")
        playback_id = await mux_service.make_private(asset)
    except (mux_service.MuxNotConfigured, mux_service.MuxError) as e:
        raise _mux_unavailable(e)
    v = Video(mux_asset_id=body.mux_asset_id, mux_playback_id=playback_id, title=body.title.strip(),
              description=(body.description or "").strip() or None, audience=body.audience,
              duration_seconds=asset.get("duration"))
    db.add(v)
    await db.commit()
    await db.refresh(v)
    return _video_out(v, admin=True)


@router.put("/admin/videos/{video_id}")
async def admin_edit_video(video_id: uuid.UUID, body: VideoEdit, _: User = Depends(get_admin_context),
                           db: AsyncSession = Depends(get_db)):
    v = await db.get(Video, video_id)
    if v is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Video not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        if field in ("title", "description") and isinstance(value, str):
            value = value.strip() or None
        if field == "title" and value is None:
            continue
        setattr(v, field, value)
    v.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(v)
    return _video_out(v, admin=True)


@router.delete("/admin/videos/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_remove_video(video_id: uuid.UUID, _: User = Depends(get_admin_context), db: AsyncSession = Depends(get_db)):
    """Takes it out of Float. The file stays on Mux, still private."""
    v = await db.get(Video, video_id)
    if v is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Video not found")
    await db.delete(v)
    await db.commit()
