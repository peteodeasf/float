"""Building and updating the one saved list per patient.

The whole monitoring log is analysed every time — that does not change. What changes is that the
answer is folded into the list rather than thrown away, so a clinician's decisions survive:

* an item they removed stays removed, or they would remove the same thing every week
* an item they put on the plan keeps its link and gains the new evidence
* wording they edited is not overwritten
* genuinely new items appear

Matching is on the wording, lowercased and stripped. It will sometimes miss — with more entries the
model may name the same thing differently, and two near-identical items end up side by side. The
answer for now is to show both and let the clinician remove one. Worth seeing how often that
happens on real logs before building anything cleverer.

See docs/plans/patient-specific-suggestions.md.
"""
import re
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.insight import (
    KIND_ACCOMMODATION, KIND_BEHAVIOR, KIND_SITUATION, KINDS,
    SOURCE_MONITORING, PatientInsight,
)


def normalise_name(value: str) -> str:
    """The matching key. Lowercase, collapse whitespace, drop trailing punctuation.

    Deliberately blunt. A cleverer key would silently merge two things a clinician meant to keep
    apart, and that is the more expensive mistake.
    """
    v = (value or "").strip().lower()
    v = re.sub(r"\s+", " ", v)
    return v.strip(" .,;:!?-–—")


async def _existing(db: AsyncSession, patient_id: uuid.UUID) -> dict:
    rows = (await db.execute(
        select(PatientInsight).where(PatientInsight.patient_id == patient_id)
    )).scalars().all()
    return {(r.kind, r.normalized_name, r.parent_insight_id): r for r in rows}


def _merge_evidence(row: PatientInsight, entry_ids: list[uuid.UUID], source: str) -> None:
    """Add evidence without duplicating it. Arrays, not a join table — an item's evidence is read
    all at once or not at all, and this keeps the whole item in one row."""
    if source not in row.sources:
        row.sources = [*row.sources, source]
    seen = set(row.monitoring_entry_ids)
    new = [e for e in entry_ids if e not in seen]
    if new:
        row.monitoring_entry_ids = [*row.monitoring_entry_ids, *new]


async def upsert_insight(
    db: AsyncSession,
    *,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID,
    kind: str,
    name: str,
    parent: PatientInsight | None = None,
    fear_rating: float | None = None,
    attributes: dict | None = None,
    monitoring_entry_ids: list[uuid.UUID] | None = None,
    source: str = SOURCE_MONITORING,
    existing: dict | None = None,
) -> PatientInsight | None:
    """Add the item, or fold it into the one already there. Returns the row, or None for a blank
    name — the model does occasionally return one and it is not worth a row."""
    if kind not in KINDS:
        raise ValueError(f"Unknown insight kind {kind!r}")
    clean = (name or "").strip()
    if not clean:
        return None

    key = (kind, normalise_name(clean), parent.id if parent else None)
    row = (existing or {}).get(key)
    now = datetime.now(timezone.utc)

    if row is None:
        row = PatientInsight(
            patient_id=patient_id,
            organization_id=organization_id,
            kind=kind,
            name=clean,
            normalized_name=key[1],
            parent_insight_id=parent.id if parent else None,
            fear_rating=fear_rating,
            attributes=attributes or {},
            sources=[],
            monitoring_entry_ids=[],
            session_note_ids=[],
        )
        db.add(row)
        await db.flush()
        if existing is not None:
            existing[key] = row
    else:
        row.last_seen_at = now
        # Never overwrite wording a clinician changed. Everything else is the record catching up.
        if not row.is_edited and clean != row.name:
            row.name = clean
        if fear_rating is not None:
            row.fear_rating = fear_rating
        if attributes:
            row.attributes = {**(row.attributes or {}), **attributes}

    _merge_evidence(row, monitoring_entry_ids or [], source)
    return row


async def rebuild_from_monitoring(
    db: AsyncSession,
    *,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID,
    extraction: dict,
    entry_ids_by_situation: dict[str, list[uuid.UUID]],
) -> list[PatientInsight]:
    """Fold one extraction result into the list.

    `extraction` is what the monitoring extractor returns: situations, each with behaviours and
    accommodations under it. `entry_ids_by_situation` maps a situation's normalised name to the
    monitoring entries it was drawn from — the evidence, and the thing that was never stored before.
    """
    existing = await _existing(db, patient_id)
    touched: list[PatientInsight] = []

    for sit in extraction.get("situations", []) or []:
        situation = await upsert_insight(
            db,
            patient_id=patient_id,
            organization_id=organization_id,
            kind=KIND_SITUATION,
            name=sit.get("name") or "",
            fear_rating=sit.get("fear_rating"),
            monitoring_entry_ids=entry_ids_by_situation.get(
                normalise_name(sit.get("name") or ""), []
            ),
            existing=existing,
        )
        if situation is None:
            continue
        touched.append(situation)

        for b in sit.get("behaviors", []) or []:
            child = await upsert_insight(
                db,
                patient_id=patient_id,
                organization_id=organization_id,
                kind=KIND_BEHAVIOR,
                name=b.get("description") or "",
                parent=situation,
                attributes={"behavior_type": b.get("type")} if b.get("type") else None,
                monitoring_entry_ids=situation.monitoring_entry_ids,
                existing=existing,
            )
            if child is not None:
                touched.append(child)

        for a in sit.get("accommodations", []) or []:
            child = await upsert_insight(
                db,
                patient_id=patient_id,
                organization_id=organization_id,
                kind=KIND_ACCOMMODATION,
                name=a.get("description") or "",
                parent=situation,
                monitoring_entry_ids=situation.monitoring_entry_ids,
                existing=existing,
            )
            if child is not None:
                touched.append(child)

    await db.flush()
    return touched


async def get_insights(
    db: AsyncSession,
    *,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID,
    kind: str | None = None,
    include_removed: bool = False,
) -> list[PatientInsight]:
    q = select(PatientInsight).where(
        PatientInsight.patient_id == patient_id,
        PatientInsight.organization_id == organization_id,
    )
    if kind is not None:
        q = q.where(PatientInsight.kind == kind)
    if not include_removed:
        q = q.where(PatientInsight.removed_at.is_(None))
    rows = (await db.execute(q)).scalars().all()
    # Most evidence first — how often something came up is the closest thing we have to how much it
    # matters. Unrated and unseen fall to the end rather than counting as zero.
    return sorted(
        rows,
        key=lambda r: (-len(r.monitoring_entry_ids), r.first_seen_at),
    )


# ── Running the extractor and folding the answer in ────────────────────────────

def format_entries(entries) -> tuple[str, dict[int, uuid.UUID]]:
    """The monitoring log as text for the model, with each entry numbered.

    The numbers are how a situation says which entries it came from. Without them the model has no
    way to point at anything, and the evidence — the whole point of the list — cannot be recorded.
    """
    blocks = []
    by_number: dict[int, uuid.UUID] = {}
    for i, e in enumerate(entries, start=1):
        by_number[i] = e.id
        distress = e.fear_thermometer if e.fear_thermometer is not None else "unknown"
        blocks.append(
            f"[{i}] Date: {e.entry_date.isoformat()}\n"
            f"Situation: {e.situation or 'N/A'}\n"
            f"Child behavior observed: {e.child_behavior_observed or 'N/A'}\n"
            f"Parent response: {e.parent_response or 'N/A'}\n"
            f"Distress level: {distress}/10"
        )
    return "\n\n".join(blocks), by_number


def entry_ids_by_situation(extraction: dict, by_number: dict[int, uuid.UUID]) -> dict:
    """Turn the entry numbers the model returned into monitoring entry ids.

    Anything it returns that is not a number we handed it is dropped rather than trusted — the
    model is pointing at our list, so a value outside it is a mistake, not new information.
    """
    out: dict[str, list[uuid.UUID]] = {}
    for sit in extraction.get("situations", []) or []:
        key = normalise_name(sit.get("name") or "")
        if not key:
            continue
        ids = []
        for n in sit.get("entries", []) or []:
            try:
                entry_id = by_number.get(int(n))
            except (TypeError, ValueError):
                continue
            if entry_id is not None and entry_id not in ids:
                ids.append(entry_id)
        out[key] = ids
    return out


def parse_model_json(raw: str) -> dict:
    """The model is asked for bare JSON; a fenced block is the usual way that goes wrong."""
    import json

    clean = (raw or "").strip()
    if clean.startswith("```"):
        lines = clean.split("\n")
        clean = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:]).strip()
    return json.loads(clean)


def summarise_for_report(insights: list[PatientInsight]) -> str:
    """The list as text, for writing the report from.

    The report used to be written straight from the raw log by a second model call, so it could
    quietly disagree with the situations offered in the ladder builder. Writing it from the list
    makes them the same thing in the same words.
    """
    situations = [r for r in insights if r.kind == KIND_SITUATION]
    by_parent: dict[uuid.UUID, list[PatientInsight]] = {}
    for r in insights:
        if r.parent_insight_id is not None:
            by_parent.setdefault(r.parent_insight_id, []).append(r)

    lines: list[str] = []
    for s in situations:
        rating = f", rated {float(s.fear_rating):g}/10" if s.fear_rating is not None else ""
        seen = len(s.monitoring_entry_ids)
        lines.append(f"Situation: {s.name}{rating} (recorded {seen} time{'s' if seen != 1 else ''})")
        children = by_parent.get(s.id, [])
        for b in [c for c in children if c.kind == KIND_BEHAVIOR]:
            kind = (b.attributes or {}).get("behavior_type") or "behaviour"
            lines.append(f"  What the child does ({kind}): {b.name}")
        for a in [c for c in children if c.kind == KIND_ACCOMMODATION]:
            lines.append(f"  What an adult does: {a.name}")
        lines.append("")
    return "\n".join(lines).strip()
