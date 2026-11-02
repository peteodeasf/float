from dataclasses import dataclass, field
from typing import Any
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models.ladder import ExposureLadder, LadderRung
from app.models.notification import LadderReviewFlag


# --- Rule configuration ---
# Clinical parameters. Changing one needs a deploy. The Ladder Validation values are Peter's
# (2026-11-02) and wait for Dr. Walker to confirm (docs/plans/ai-quality-testing.md, item 13).

LADDER_RULES = {
    "min_rungs": 3,
    # Ladder Validation (`review_steps`). Peter, 2026-11-02: at least 2 rungs at Fear Level 4 or
    # lower, and mostly go up 1 at a time — a recommendation, with no limit on a single jump.
    "low_rung_max": 4.0,
    "min_low_rungs": 2,
    "recommended_rung_gap": 1.0,
    "require_high_confidence_rung": False  # open until Dr. Walker confirms
}

# The older `LadderRuleEngine` below still checks the rules from before 2026-11-02: the lowest rung
# at 4 or below, and no jump over 2. It reads `ladder_rungs`, which has no rows (see the note above
# `review_steps`), so nothing a clinician sees comes from these.
_OLDER_ENGINE_RULES = {
    **LADDER_RULES,
    "max_starting_distress_thermometer": 4.0,
    "max_rung_gap": 2.0,
}

FLAG_FALLBACKS = {
    "STARTING_DISTRESS_TOO_HIGH": (
        "The first rung has a Fear Level of {actual}. "
        "The recommended maximum starting Fear Level is {max_allowed}. "
        "Consider breaking this rung into sub-situations or adding an "
        "imaginal exposure as a lower starting point."
    ),
    "INSUFFICIENT_RUNGS": (
        "This ladder has {actual} rung(s). At least {min_required} rungs "
        "are recommended to allow gradual progression. Consider adding "
        "rungs in between the current ones."
    ),
    "RUNG_GAP_TOO_LARGE": (
        "There is a gap of {gap} Fear Level points between two "
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
    def __init__(self, rules: dict = _OLDER_ENGINE_RULES):
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


# ── Reviewing the ladder a clinician actually built ───────────────────────────
#
# The engine above works on `LadderRung`, a table with zero rows in production — nothing has ever
# written to it (see docs/plans/ladder-rung-shape.md). The ladder a clinician builds is
# `avoidance_behaviors` rows of type `scenario`. This reads those, and applies `LADDER_RULES`
# above, so the numbers stay in one place. The engine above keeps its own older two.
#
# These checks are arithmetic, not judgement. The judgement — does a rung keep a safety
# behaviour, is there a way out built into it, is the situation a symptom rather than the target —
# is what Dr. Walker's review of our suggestions was about, and it is not built. Peter, 2026-10-29:
# the panel no longer says so on screen; `ai_pending` is still returned.


@dataclass
class ReviewFinding:
    """One bullet in Ladder Validation: a short label, shown bold, then the text."""
    code: str
    label: str
    text: str

    @property
    def message(self) -> str:
        return f"{self.label}: {self.text}"


def _first_three(items: list[str]) -> str:
    """The first three, then "…" if there are more, or "." if not."""
    return ", ".join(items[:3]) + ("…" if len(items) > 3 else ".")


def review_steps(steps: list[tuple[str, float | None]], rules: dict = LADDER_RULES) -> list[ReviewFinding]:
    """`steps` is (name, Fear Level), in any order. On screen these are rungs.

    Rungs with no Fear Level are reported and then set aside — a missing score is not a zero, and
    treating it as one would put a rung at the bottom of the ladder and make every gap check wrong.
    Only the rung's own Fear Level counts here; the situation's is not read.

    Advice only: nothing here stops the clinician saving.
    """
    findings: list[ReviewFinding] = []

    unscored = [name for name, score in steps if score is None]
    scored = sorted([(name, s) for name, s in steps if s is not None], key=lambda x: x[1])

    if not scored:
        findings.append(ReviewFinding(
            code="NO_SCORED_STEPS",
            label="Nothing on the ladder yet",
            text="add a situation, add a behavior under it, and give the behavior a Fear Level.",
        ))

    if unscored:
        ask = "Give it a Fear Level." if len(unscored) == 1 else "Give each one a Fear Level."
        findings.append(ReviewFinding(
            code="UNSCORED_STEPS", label="No Fear Level", text=f"{_first_three([f'“{n}”' for n in unscored])} {ask}",
        ))

    if not scored:
        return findings

    low_max, min_low = rules["low_rung_max"], rules["min_low_rungs"]
    low = sum(1 for _, s in scored if s <= low_max)
    if low < min_low:
        findings.append(ReviewFinding(
            code="FEW_LOW_RUNGS",
            label="Low rungs",
            text=f"{low} of the {min_low} needed at Fear Level {low_max:g} or lower. Add {min_low - low} more.",
        ))

    # Not an error: Peter, 2026-11-02, "there's no limit, but the recommendation is you should
    # mostly go up 1 at a time." So every bigger jump is listed in one bullet, with no threshold.
    gap = rules["recommended_rung_gap"]
    # Rounded so decimal Fear Levels (1.2 to 2.2) are not listed for floating-point noise.
    jumps = [
        f"“{a_name}” ({a:g}) to “{b_name}” ({b:g})"
        for (a_name, a), (b_name, b) in zip(scored, scored[1:])
        if round(b - a, 6) > gap
    ]
    if jumps:
        findings.append(ReviewFinding(
            code="BIG_JUMPS",
            label="Going up",
            text=f"mostly go up {gap:g} at a time. Bigger jumps here: {_first_three(jumps)}",
        ))

    min_rungs = rules["min_rungs"]
    if len(scored) < min_rungs:
        findings.append(ReviewFinding(
            code="INSUFFICIENT_RUNGS",
            label="Too few rungs",
            text=f"{len(scored)} on the ladder. Aim for at least {min_rungs}.",
        ))

    return findings
