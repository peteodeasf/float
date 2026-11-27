"""Tools and strategies: the clinician's Library, highlighting, the family's reading, and images.

The admin routes are in admin.py. docs/plans/tools-and-strategies.md
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.patient import PatientProfile, ParentPatientLink
from app.models.tool import Tool, ToolHighlight, ToolImage, ToolOpen
from app.models.user import User, UserRole
from app.api.routers.patients import (
    get_practitioner_context, get_permitted_patient, get_patient_context, get_parent_context,
)
from app.services import tool_service as svc
from app.services.patient_access_service import accessible_patient_ids

router = APIRouter(tags=["tools"])


# ── Clinicians ────────────────────────────────────────────────────────────────

@router.get("/tools")
async def list_tools(_ctx: tuple = Depends(get_practitioner_context), db: AsyncSession = Depends(get_db)):
    """Every published page, for the Library and for action plans."""
    return await svc.tools_out(db, await svc.list_tools(db))


@router.get("/tools/{tool_id}")
async def get_tool(tool_id: uuid.UUID, _ctx: tuple = Depends(get_practitioner_context),
                   db: AsyncSession = Depends(get_db)):
    t = await svc.published_tool(db, tool_id)
    return (await svc.tools_out(db, [t]))[0]


@router.get("/tools/{tool_id}/highlights")
async def list_highlights(tool_id: uuid.UUID, context: tuple = Depends(get_practitioner_context),
                          db: AsyncSession = Depends(get_db)):
    """Who this page is highlighted for, among the patients this clinician may see, and whether
    each person opened it."""
    user, practitioner = context
    await svc.published_tool(db, tool_id)
    allowed = await accessible_patient_ids(db, user.id, practitioner)
    q = (select(ToolHighlight, PatientProfile)
         .join(PatientProfile, PatientProfile.id == ToolHighlight.patient_id)
         .where(ToolHighlight.tool_id == tool_id,
                ToolHighlight.organization_id == practitioner.organization_id,
                PatientProfile.organization_id == practitioner.organization_id)
         .order_by(ToolHighlight.created_at.desc()))
    if allowed is not None:
        q = q.where(ToolHighlight.patient_id.in_(allowed))
    rows = (await db.execute(q)).all()
    patient_ids = [p.id for _, p in rows]
    opens = (await db.execute(
        select(ToolOpen.user_id).where(ToolOpen.tool_id == tool_id, ToolOpen.patient_id.in_(patient_ids))
    )).scalars().all() if patient_ids else []
    opened_by = set(opens)
    parents: dict[uuid.UUID, list[uuid.UUID]] = {}
    if patient_ids:
        for link in (await db.execute(
            select(ParentPatientLink).where(ParentPatientLink.patient_id.in_(patient_ids))
        )).scalars():
            parents.setdefault(link.patient_id, []).append(link.parent_user_id)
    return [{
        "patient_id": str(p.id),
        "patient_name": p.name,
        "for_child": h.for_child,
        "for_parent": h.for_parent,
        "highlighted_at": h.created_at.isoformat() if h.created_at else None,
        "child_opened": p.user_id in opened_by,
        "parent_opened": any(u in opened_by for u in parents.get(p.id, [])),
    } for h, p in rows]


class HighlightIn(BaseModel):
    for_child: bool = False
    for_parent: bool = False


@router.put("/patients/{patient_id}/tool-highlights/{tool_id}")
async def set_highlight(patient_id: uuid.UUID, tool_id: uuid.UUID, data: HighlightIn,
                        context: tuple = Depends(get_practitioner_context),
                        patient: PatientProfile = Depends(get_permitted_patient),
                        db: AsyncSession = Depends(get_db)):
    """Highlight a page for this patient's child, parent, or both. Neither takes it off."""
    _, practitioner = context
    t = await svc.published_tool(db, tool_id)
    # Only for someone the page is written for.
    for_child = data.for_child and t.audience in svc.FOR_CHILD
    for_parent = data.for_parent and t.audience in svc.FOR_PARENT
    h = (await db.execute(select(ToolHighlight).where(
        ToolHighlight.tool_id == tool_id, ToolHighlight.patient_id == patient.id))).scalar_one_or_none()
    if not for_child and not for_parent:
        if h is not None:
            await db.delete(h)
            await db.commit()
        return {"highlighted": False}
    if h is None:
        h = ToolHighlight(tool_id=tool_id, patient_id=patient.id, organization_id=patient.organization_id,
                          highlighted_by=practitioner.id)
        db.add(h)
    h.for_child, h.for_parent = for_child, for_parent
    await db.commit()
    return {"highlighted": True, "for_child": for_child, "for_parent": for_parent}


# ── The child and the parent ──────────────────────────────────────────────────
# The family apps' screens wait for the redesign; these give them the data.

@router.get("/patient/tools")
async def child_tools(context: tuple = Depends(get_patient_context), db: AsyncSession = Depends(get_db)):
    user, patient = context
    return await svc.family_list(db, patient.id, user.id, "child")


@router.get("/patient/tools/{tool_id}")
async def child_tool(tool_id: uuid.UUID, context: tuple = Depends(get_patient_context),
                     db: AsyncSession = Depends(get_db)):
    user, patient = context
    t = await svc.published_tool(db, tool_id, svc.FOR_CHILD)
    out = (await svc.tools_out(db, [t]))[0]
    await svc.record_open(db, t.id, user.id, patient.id)
    return out


@router.get("/parent/tools")
async def parent_tools(context: tuple = Depends(get_parent_context), db: AsyncSession = Depends(get_db)):
    user, children = context
    return await svc.family_list(db, children[0].id, user.id, "parent")


@router.get("/parent/tools/{tool_id}")
async def parent_tool(tool_id: uuid.UUID, context: tuple = Depends(get_parent_context),
                      db: AsyncSession = Depends(get_db)):
    user, children = context
    t = await svc.published_tool(db, tool_id, svc.FOR_PARENT)
    out = (await svc.tools_out(db, [t]))[0]
    await svc.record_open(db, t.id, user.id, children[0].id)
    return out


# ── Images ────────────────────────────────────────────────────────────────────

@router.get("/tool-images/{image_id}")
async def tool_image(image_id: uuid.UUID, user: User = Depends(get_current_user),
                     db: AsyncSession = Depends(get_db)):
    """Anyone signed in may see an image on a published page; a Float admin sees any (drafts)."""
    img = await db.get(ToolImage, image_id)
    if img is None:
        raise svc.not_found("Image")
    roles = set((await db.execute(select(UserRole.role).where(UserRole.user_id == user.id))).scalars().all())
    if "admin" not in roles:
        # On a published page written for this reader: a child never gets a parent-only page's image.
        q = select(Tool.id).where(Tool.is_published.is_(True),
                                  Tool.blocks.contains([{"type": "image", "image_id": str(image_id)}]))
        if not roles & {"practitioner", "practice_manager"}:
            audiences: set[str] = set()
            if "patient" in roles:
                audiences |= set(svc.FOR_CHILD)
            if "parent" in roles:
                audiences |= set(svc.FOR_PARENT)
            q = q.where(Tool.audience.in_(audiences))
        if (await db.execute(q)).first() is None:
            raise svc.not_found("Image")
    return Response(content=img.data, media_type=img.content_type,
                    headers={"Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff"})
