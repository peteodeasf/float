"""Tools and strategies: pages, what each person sees, highlights and opens.

docs/plans/tools-and-strategies.md
"""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select, delete
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tool import Tool, ToolExample, ToolHighlight, ToolOpen, ToolImage
from app.models.video import Video

# Who a page is for, by the reader's role.
FOR_CHILD = ("child", "both")
FOR_PARENT = ("parent", "both")
IMAGE_TYPES = ("image/png", "image/jpeg", "image/gif", "image/webp")
IMAGE_MAX_BYTES = 2 * 1024 * 1024


def not_found(what: str = "Page") -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"{what} not found")


async def examples_of(db: AsyncSession, tool_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[ToolExample]]:
    out: dict[uuid.UUID, list[ToolExample]] = {t: [] for t in tool_ids}
    if not tool_ids:
        return out
    rows = (await db.execute(
        select(ToolExample).where(ToolExample.tool_id.in_(tool_ids)).order_by(ToolExample.position)
    )).scalars().all()
    for e in rows:
        out[e.tool_id].append(e)
    return out


def tool_out(t: Tool, examples: list[ToolExample], *, admin: bool = False) -> dict:
    out = {
        "id": str(t.id),
        "name": t.name,
        "kind": t.kind,
        "audience": t.audience,
        "summary": t.summary,
        "blocks": t.blocks or [],
        "examples": [{"id": str(e.id), "name": e.name, "how_used": e.how_used} for e in examples],
    }
    if admin:
        out.update({"display_order": t.display_order, "is_published": t.is_published})
    return out


async def list_tools(db: AsyncSession, *, audiences: tuple[str, ...] | None = None,
                     published_only: bool = True) -> list[Tool]:
    q = select(Tool).order_by(Tool.display_order, Tool.name)
    if published_only:
        q = q.where(Tool.is_published.is_(True))
    if audiences:
        q = q.where(Tool.audience.in_(audiences))
    return list((await db.execute(q)).scalars().all())


async def tools_out(db: AsyncSession, tools: list[Tool], *, admin: bool = False) -> list[dict]:
    ex = await examples_of(db, [t.id for t in tools])
    return [tool_out(t, ex[t.id], admin=admin) for t in tools]


async def published_tool(db: AsyncSession, tool_id: uuid.UUID, audiences: tuple[str, ...] | None = None) -> Tool:
    t = await db.get(Tool, tool_id)
    if t is None or not t.is_published or (audiences and t.audience not in audiences):
        raise not_found()
    return t


# ── The family's view ──

async def family_list(db: AsyncSession, patient_id: uuid.UUID, user_id: uuid.UUID, role: str) -> list[dict]:
    """Every published page for this reader, the ones highlighted for them first."""
    audiences = FOR_CHILD if role == "child" else FOR_PARENT
    tools = await list_tools(db, audiences=audiences)
    hl = (await db.execute(select(ToolHighlight).where(ToolHighlight.patient_id == patient_id))).scalars().all()
    highlighted = {h.tool_id for h in hl if (h.for_child if role == "child" else h.for_parent)}
    opened = set((await db.execute(
        select(ToolOpen.tool_id).where(ToolOpen.user_id == user_id)
    )).scalars().all())
    rows = await tools_out(db, tools)
    for r, t in zip(rows, tools):
        r["highlighted"] = t.id in highlighted
        r["opened"] = t.id in opened
    rows.sort(key=lambda r: not r["highlighted"])
    return rows


async def record_open(db: AsyncSession, tool_id: uuid.UUID, user_id: uuid.UUID, patient_id: uuid.UUID) -> None:
    exists = (await db.execute(
        select(ToolOpen.id).where(ToolOpen.tool_id == tool_id, ToolOpen.user_id == user_id)
    )).scalar_one_or_none()
    if exists is None:
        db.add(ToolOpen(tool_id=tool_id, user_id=user_id, patient_id=patient_id))
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()  # opened twice at once: already recorded


# ── Admin ──

def _uuid(v) -> str:
    try:
        return str(uuid.UUID(str(v)))
    except ValueError:
        raise HTTPException(status_code=422, detail="Not a valid id")


def clean_blocks(blocks: list[dict]) -> list[dict]:
    """Only the three kinds of block, with only their own field."""
    out = []
    for b in blocks:
        kind = b.get("type")
        if kind == "text" and str(b.get("text") or "").strip():
            out.append({"type": "text", "text": str(b["text"]).strip()})
        elif kind == "image" and b.get("image_id"):
            out.append({"type": "image", "image_id": _uuid(b["image_id"])})
        elif kind == "video" and b.get("video_id"):
            out.append({"type": "video", "video_id": _uuid(b["video_id"])})
        elif kind not in ("text", "image", "video"):
            raise HTTPException(status_code=422, detail="A block is text, an image or a video")
    return out


async def check_block_targets(db: AsyncSession, blocks: list[dict]) -> None:
    for b in blocks:
        if b["type"] == "image" and await db.get(ToolImage, uuid.UUID(b["image_id"])) is None:
            raise not_found("Image")
        if b["type"] == "video" and await db.get(Video, uuid.UUID(b["video_id"])) is None:
            raise not_found("Video")


async def replace_examples(db: AsyncSession, tool: Tool, examples: list[dict]) -> None:
    """Keep the ids of examples that stay, so action plans that picked one keep their link."""
    current = {e.id: e for e in (await examples_of(db, [tool.id]))[tool.id]}
    keep: set[uuid.UUID] = set()
    for pos, e in enumerate(examples):
        name = (e.get("name") or "").strip()
        if not name:
            continue
        how = (e.get("how_used") or "").strip() or None
        eid = uuid.UUID(_uuid(e["id"])) if e.get("id") else None
        if eid and eid in current:
            row = current[eid]
            row.name, row.how_used, row.position = name, how, pos
            keep.add(eid)
        else:
            db.add(ToolExample(tool_id=tool.id, name=name, how_used=how, position=pos))
    gone = [i for i in current if i not in keep]
    if gone:
        await db.execute(delete(ToolExample).where(ToolExample.id.in_(gone)))


def touch(t: Tool) -> None:
    t.updated_at = datetime.now(timezone.utc)
