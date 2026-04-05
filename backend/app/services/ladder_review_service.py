from dataclasses import dataclass, field
from typing import Any
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.ladder import ExposureLadder, LadderRung
from app.models.notification import LadderReviewFlag


# --- Rule configuration ---
# Parameters defined by Dr. Walker — updateable without code deployment

LADDER_RULES = {
    "max_starting_distress_thermometer": 4.0,
    "min_rungs": 3,
    "max_rung_gap": 2.0,
    "require_high_confidence_rung": False  # open until Dr. Walker confirms
}

FLAG_FALLBACKS = {
    "STARTING_DISTRESS_TOO_HIGH": (
        "The first rung has a distress thermometer rating of {actual}. "
        "The recommended maximum starting rating is {max_allowed}. "
        "Consider breaking this rung into sub-situations or adding an "
        "imaginal exposure as a lower starting point."
    ),
    "INSUFFICIENT_RUNGS": (
        "This ladder has {actual} rung(s). At least {min_required} rungs "
        "are recommended to allow gradual progression. Consider adding "
        "intermediate steps between the current rungs."
    ),
    "RUNG_GAP_TOO_LARGE": (
        "There is a gap of {gap} distress thermometer points between two "
        "adjacent rungs. The recommended maximum gap is {max_allowed}. "
        "Consider adding an intermediate rung to make the progression "
        "more gradual."
    ),
    "MISSING_BEHAVIOR_REFERENCE": (
        "One or more rungs have no associated avoidance or safety behavior. "
        "Each rung should reference a specific behavior the patient will "
        "refrain from during the exposure."
    )
}


@dataclass
class LadderFlag:
    flag_type: str
    data: dict[str, Any] = field(default_factory=dict)
    description: str = ""

    def generate_description(self) -> str:
        template = FLAG_FALLBACKS.get(self.flag_type, "Review this ladder rung.")
        try:
            return template.format(**self.data)
        except KeyError:
            return template


class LadderRuleEngine:
    def __init__(self, rules: dict = LADDER_RULES):
        self.rules = rules

    def review(self, rungs: list[LadderRung]) -> list[LadderFlag]:
        flags = []

        if not rungs:
            return flags

        sorted_rungs = sorted(rungs, key=lambda r: r.rung_order)

        flags.extend(self._check_starting_distress(sorted_rungs))
        flags.extend(self._check_rung_count(sorted_rungs))
        flags.extend(self._check_rung_gaps(sorted_rungs))
        flags.extend(self._check_behavior_references(sorted_rungs))

        # Generate descriptions for all flags
        for flag in flags:
            flag.description = flag.generate_description()

        return flags

    def _check_starting_distress(self, rungs: list[LadderRung]) -> list[LadderFlag]:
        first = rungs[0]
        if first.distress_thermometer_rating is None:
            return []
        max_allowed = self.rules["max_starting_distress_thermometer"]
        if float(first.distress_thermometer_rating) > max_allowed:
            return [LadderFlag(
                flag_type="STARTING_DISTRESS_TOO_HIGH",
                data={
                    "actual": float(first.distress_thermometer_rating),
                    "max_allowed": max_allowed
                }
            )]
        return []

    def _check_rung_count(self, rungs: list[LadderRung]) -> list[LadderFlag]:
        min_required = self.rules["min_rungs"]
        if len(rungs) < min_required:
            return [LadderFlag(
                flag_type="INSUFFICIENT_RUNGS",
                data={
                    "actual": len(rungs),
                    "min_required": min_required
                }
            )]
        return []

    def _check_rung_gaps(self, rungs: list[LadderRung]) -> list[LadderFlag]:
        flags = []
        max_gap = self.rules["max_rung_gap"]
        for i in range(len(rungs) - 1):
            current = rungs[i]
            next_rung = rungs[i + 1]
            if (current.distress_thermometer_rating is None or
                    next_rung.distress_thermometer_rating is None):
                continue
            gap = float(next_rung.distress_thermometer_rating) - \
                  float(current.distress_thermometer_rating)
            if gap > max_gap:
                flags.append(LadderFlag(
                    flag_type="RUNG_GAP_TOO_LARGE",
                    data={
                        "gap": round(gap, 1),
                        "max_allowed": max_gap,
                        "rung_order": next_rung.rung_order
                    }
                ))
        return flags

    def _check_behavior_references(self, rungs: list[LadderRung]) -> list[LadderFlag]:
        missing = [r for r in rungs if r.avoidance_behavior_id is None]
        if missing:
            return [LadderFlag(
                flag_type="MISSING_BEHAVIOR_REFERENCE",
                data={"count": len(missing)}
            )]
        return []


async def run_ladder_review(
    db: AsyncSession,
    ladder_id: uuid.UUID,
    organization_id: uuid.UUID
) -> dict:
    # Get ladder
    result = await db.execute(
        select(ExposureLadder)
        .where(
            ExposureLadder.id == ladder_id,
            ExposureLadder.organization_id == organization_id
        )
    )
    ladder = result.scalar_one_or_none()
    if not ladder:
        return {"error": "Ladder not found"}

    # Get rungs
    rungs_result = await db.execute(
        select(LadderRung)
        .where(LadderRung.ladder_id == ladder_id)
        .order_by(LadderRung.rung_order)
    )
    rungs = rungs_result.scalars().all()

    # Run rule engine
    engine = LadderRuleEngine()
    flags = engine.review(rungs)

    # Clear existing open flags
    existing = await db.execute(
        select(LadderReviewFlag)
        .where(
            LadderReviewFlag.ladder_id == ladder_id,
            LadderReviewFlag.status == "open"
        )
    )
    for existing_flag in existing.scalars().all():
        await db.delete(existing_flag)

    # Persist new flags
    for flag in flags:
        db_flag = LadderReviewFlag(
            ladder_id=ladder_id,
            organization_id=organization_id,
            flag_type=flag.flag_type,
            flag_data=str(flag.data),
            description=flag.description,
            status="open"
        )
        db.add(db_flag)

    # Update ladder review status
    ladder.review_status = "clean" if not flags else "needs_attention"
    await db.commit()

    return {
        "flag_count": len(flags),
        "status": ladder.review_status,
        "flags": [
            {
                "flag_type": f.flag_type,
                "description": f.description,
                "data": f.data
            }
            for f in flags
        ]
    }
