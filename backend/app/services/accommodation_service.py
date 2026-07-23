import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.experiment import AccommodationBehavior
from app.schemas.accommodation import AccommodationCreate, AccommodationUpdate


def _midpoint(acc: AccommodationBehavior) -> float | None:
    """Seed key for ladder ordering: the midpoint of the distress range.

    Subsumes the single-value case (min == max → that value). Returns None when
    unrated, so those sort last.
    """
    lo, hi = acc.distress_min, acc.distress_max
    if lo is not None and hi is not None:
        return (float(lo) + float(hi)) / 2
    if lo is not None:
        return float(lo)
    if hi is not None:
        return float(hi)
    return None


def _seed_sort_key(acc: AccommodationBehavior):
    """Ascending easiest-to-stop first; unrated last; ties by max then insertion."""
    mid = _midpoint(acc)
    return (
        mid is None,                                  # unrated sink to the bottom
        mid if mid is not None else 0.0,
        float(acc.distress_max) if acc.distress_max is not None else 0.0,
        acc.created_at,
    )


async def get_accommodations_for_plan(
    db: AsyncSession,
    plan_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> list[AccommodationBehavior]:
    result = await db.execute(
        select(AccommodationBehavior).where(
            AccommodationBehavior.treatment_plan_id == plan_id,
            AccommodationBehavior.organization_id == organization_id,
        )
    )
    accommodations = list(result.scalars().all())
    # display_order is the live sort key; nulls (never-ordered) fall to the end,
    # broken by creation time so the list is stable.
    accommodations.sort(
        key=lambda a: (
            a.display_order is None,
            a.display_order if a.display_order is not None else 0,
            a.created_at,
        )
    )
    return accommodations


async def create_accommodation(
    db: AsyncSession,
    plan_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: AccommodationCreate,
) -> AccommodationBehavior:
    # Append to the end of the ladder; the therapist can reorder, or reseed by
    # distress (see reseed_by_distress).
    existing = await get_accommodations_for_plan(db, plan_id, organization_id)
    next_order = len(existing)

    accommodation = AccommodationBehavior(
        treatment_plan_id=plan_id,
        organization_id=organization_id,
        trigger_situation_id=data.trigger_situation_id,
        name=data.name,
        description=data.description,
        distress_min=data.distress_min,
        distress_max=data.distress_max,
        display_order=next_order,
    )
    db.add(accommodation)
    await db.commit()
    await db.refresh(accommodation)
    return accommodation


async def update_accommodation(
    db: AsyncSession,
    accommodation_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: AccommodationUpdate,
) -> AccommodationBehavior:
    result = await db.execute(
        select(AccommodationBehavior).where(
            AccommodationBehavior.id == accommodation_id,
            AccommodationBehavior.organization_id == organization_id,
        )
    )
    accommodation = result.scalar_one_or_none()
    if not accommodation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Accommodation not found")

    fields = data.model_dump(exclude_unset=True)
    for field, value in fields.items():
        setattr(accommodation, field, value)

    await db.commit()
    await db.refresh(accommodation)
    return accommodation


async def delete_accommodation(
    db: AsyncSession,
    accommodation_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> None:
    result = await db.execute(
        select(AccommodationBehavior).where(
            AccommodationBehavior.id == accommodation_id,
            AccommodationBehavior.organization_id == organization_id,
        )
    )
    accommodation = result.scalar_one_or_none()
    if not accommodation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Accommodation not found")
    await db.delete(accommodation)
    await db.commit()


async def reorder_accommodations(
    db: AsyncSession,
    plan_id: uuid.UUID,
    organization_id: uuid.UUID,
    ordered_ids: list[uuid.UUID],
) -> list[AccommodationBehavior]:
    """Manual therapist reorder — the given order becomes authoritative."""
    result = await db.execute(
        select(AccommodationBehavior).where(
            AccommodationBehavior.treatment_plan_id == plan_id,
            AccommodationBehavior.organization_id == organization_id,
        )
    )
    by_id = {a.id: a for a in result.scalars().all()}
    for order, acc_id in enumerate(ordered_ids):
        if acc_id in by_id:
            by_id[acc_id].display_order = order
    await db.commit()
    return await get_accommodations_for_plan(db, plan_id, organization_id)


async def reseed_by_distress(
    db: AsyncSession,
    plan_id: uuid.UUID,
    organization_id: uuid.UUID,
) -> list[AccommodationBehavior]:
    """Reset display_order from the distress ratings (midpoint ascending).

    Called on demand — e.g. after the child rates accommodations — to (re)seed
    the ladder easiest-to-stop first. Overwrites any manual reorder, so it's an
    explicit action, never automatic.
    """
    result = await db.execute(
        select(AccommodationBehavior).where(
            AccommodationBehavior.treatment_plan_id == plan_id,
            AccommodationBehavior.organization_id == organization_id,
        )
    )
    accommodations = list(result.scalars().all())
    accommodations.sort(key=_seed_sort_key)
    for order, acc in enumerate(accommodations):
        acc.display_order = order
    await db.commit()
    return await get_accommodations_for_plan(db, plan_id, organization_id)
