"""Per-organization process checklist items.

Managed by the Float team (platform admin); organizations do not edit their own.
`key` is identity — per-patient completion is a `key -> bool` map on
`consultation_checklists`, so renaming a key orphans every tick against it.
"""
import re
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.checklist_item import OrganizationChecklistItem
from app.data.default_checklist import DEFAULT_PROCESS_CHECKLIST


async def list_items(
    db: AsyncSession, organization_id: uuid.UUID, include_inactive: bool = False
) -> list[OrganizationChecklistItem]:
    stmt = select(OrganizationChecklistItem).where(
        OrganizationChecklistItem.organization_id == organization_id
    )
    if not include_inactive:
        stmt = stmt.where(OrganizationChecklistItem.is_active.is_(True))
    stmt = stmt.order_by(OrganizationChecklistItem.display_order, OrganizationChecklistItem.key)
    return list((await db.execute(stmt)).scalars().all())


async def seed_defaults(db: AsyncSession, organization_id: uuid.UUID) -> None:
    """Give a new organization the default list. No-op if it already has items."""
    existing = (await db.execute(
        select(func.count()).select_from(OrganizationChecklistItem)
        .where(OrganizationChecklistItem.organization_id == organization_id)
    )).scalar_one()
    if existing:
        return
    for i, item in enumerate(DEFAULT_PROCESS_CHECKLIST):
        db.add(OrganizationChecklistItem(
            organization_id=organization_id,
            key=item["key"],
            text_=item["text"],
            link_icon=item.get("link_icon"),
            link_label=item.get("link_label"),
            nav_label=item.get("nav_label"),
            nav_action=item.get("nav_action"),
            display_order=i,
        ))


def _slugify(text: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", text.strip().lower()).strip("_")
    return (base[:48] or "item")


async def create_item(
    db: AsyncSession, organization_id: uuid.UUID, data: dict
) -> OrganizationChecklistItem:
    text_val = (data.get("text") or "").strip()
    if not text_val:
        raise HTTPException(status_code=400, detail="Text is required")

    # A new item needs a key that has never been used by this org, including by
    # items since deleted — an old tick could still be sitting in a patient's map.
    base = (data.get("key") or _slugify(text_val)).strip()
    taken = {
        k for (k,) in (await db.execute(
            select(OrganizationChecklistItem.key)
            .where(OrganizationChecklistItem.organization_id == organization_id)
        )).all()
    }
    key, n = base, 2
    while key in taken:
        key, n = f"{base}_{n}", n + 1

    next_order = (await db.execute(
        select(func.coalesce(func.max(OrganizationChecklistItem.display_order), -1) + 1)
        .where(OrganizationChecklistItem.organization_id == organization_id)
    )).scalar_one()

    item = OrganizationChecklistItem(
        organization_id=organization_id,
        key=key,
        text_=text_val,
        link_icon=data.get("link_icon") or None,
        link_label=data.get("link_label") or None,
        nav_label=data.get("nav_label") or None,
        nav_action=data.get("nav_action") or None,
        display_order=data.get("display_order") if data.get("display_order") is not None else next_order,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


async def _get(db: AsyncSession, item_id: uuid.UUID) -> OrganizationChecklistItem:
    item = (await db.execute(
        select(OrganizationChecklistItem).where(OrganizationChecklistItem.id == item_id)
    )).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Checklist item not found")
    return item


async def update_item(
    db: AsyncSession, item_id: uuid.UUID, data: dict
) -> OrganizationChecklistItem:
    item = await _get(db, item_id)
    # `key` is deliberately not updatable — see the module docstring.
    if data.get("text") is not None:
        t = data["text"].strip()
        if not t:
            raise HTTPException(status_code=400, detail="Text cannot be empty")
        item.text_ = t
    for field in ("link_icon", "link_label", "nav_label", "nav_action"):
        if field in data:
            setattr(item, field, (data[field] or None))
    if data.get("display_order") is not None:
        item.display_order = data["display_order"]
    if data.get("is_active") is not None:
        item.is_active = data["is_active"]
    await db.commit()
    await db.refresh(item)
    return item


async def delete_item(db: AsyncSession, item_id: uuid.UUID) -> None:
    item = await _get(db, item_id)
    await db.delete(item)
    await db.commit()


async def reorder_items(
    db: AsyncSession, organization_id: uuid.UUID, ordered_ids: list[uuid.UUID]
) -> list[OrganizationChecklistItem]:
    rows = await list_items(db, organization_id, include_inactive=True)
    by_id = {r.id: r for r in rows}
    for i, item_id in enumerate(ordered_ids):
        row = by_id.get(item_id)
        if row is not None:
            row.display_order = i
    await db.commit()
    return await list_items(db, organization_id, include_inactive=True)
