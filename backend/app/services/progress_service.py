import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from datetime import datetime, timezone, timedelta

from app.models.experiment import Experiment
from app.models.ladder import ExposureLadder, LadderRung
from app.models.patient import PatientProfile
from app.models.notification import LadderReviewFlag
from app.models.treatment import TreatmentPlan
from app.schemas.progress import (
    ExperimentDataPoint,
    RungProgress,
    PatientProgressSummary,
    PatientProgressFull,
    PreSessionBrief
)


async def get_patient_progress(
    db: AsyncSession,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID
) -> PatientProgressFull:

    experiments_result = await db.execute(
        select(Experiment)
        .where(
            Experiment.patient_id == patient_id,
            Experiment.organization_id == organization_id,
            Experiment.status == "completed"
        )
        .order_by(Experiment.completed_date.asc())
    )
    completed = experiments_result.scalars().all()

    planned_result = await db.execute(
        select(Experiment)
        .where(
            Experiment.patient_id == patient_id,
            Experiment.organization_id == organization_id,
            Experiment.status.in_(["planned", "in_progress"])
        )
    )
    planned = planned_result.scalars().all()

    bip_reductions = [
        float(e.bip_before) - float(e.bip_after)
        for e in completed
        if e.bip_before is not None and e.bip_after is not None
    ]
    dt_reductions = [
        float(e.distress_thermometer_expected) - float(e.distress_thermometer_actual)
        for e in completed
        if e.distress_thermometer_expected is not None
        and e.distress_thermometer_actual is not None
    ]
    feared_occurred = sum(
        1 for e in completed if e.feared_outcome_occurred is True
    )

    summary = PatientProgressSummary(
        patient_id=patient_id,
        total_experiments_completed=len(completed),
        total_experiments_planned=len(planned),
        average_bip_reduction=round(sum(bip_reductions) / len(bip_reductions), 1)
        if bip_reductions else None,
        average_distress_thermometer_reduction=round(
            sum(dt_reductions) / len(dt_reductions), 1
        ) if dt_reductions else None,
        experiments_where_feared_outcome_occurred=feared_occurred,
        last_experiment_date=completed[-1].completed_date if completed else None
    )

    rung_ids = list({e.ladder_rung_id for e in completed})
    rung_progress = []

    for rung_id in rung_ids:
        rung_result = await db.execute(
            select(LadderRung).where(LadderRung.id == rung_id)
        )
        rung = rung_result.scalar_one_or_none()
        if not rung:
            continue

        rung_experiments = [e for e in completed if e.ladder_rung_id == rung_id]
        data_points = [
            ExperimentDataPoint(
                experiment_id=e.id,
                completed_date=e.completed_date,
                bip_before=float(e.bip_before) if e.bip_before else None,
                bip_after=float(e.bip_after) if e.bip_after else None,
                distress_thermometer_expected=float(e.distress_thermometer_expected)
                if e.distress_thermometer_expected else None,
                distress_thermometer_actual=float(e.distress_thermometer_actual)
                if e.distress_thermometer_actual else None,
                feared_outcome_occurred=e.feared_outcome_occurred,
                rung_order=rung.rung_order
            )
            for e in rung_experiments
        ]

        latest = rung_experiments[-1] if rung_experiments else None
        rung_progress.append(RungProgress(
            rung_id=rung_id,
            rung_order=rung.rung_order,
            distress_thermometer_rating=float(rung.distress_thermometer_rating)
            if rung.distress_thermometer_rating else None,
            experiments_completed=len(rung_experiments),
            latest_bip_before=float(latest.bip_before)
            if latest and latest.bip_before else None,
            latest_bip_after=float(latest.bip_after)
            if latest and latest.bip_after else None,
            latest_distress_thermometer_actual=float(latest.distress_thermometer_actual)
            if latest and latest.distress_thermometer_actual else None,
            data_points=data_points
        ))

    rung_progress.sort(key=lambda r: r.rung_order)

    recent = completed[-10:] if len(completed) > 10 else completed
    recent_data_points = [
        ExperimentDataPoint(
            experiment_id=e.id,
            completed_date=e.completed_date,
            bip_before=float(e.bip_before) if e.bip_before else None,
            bip_after=float(e.bip_after) if e.bip_after else None,
            distress_thermometer_expected=float(e.distress_thermometer_expected)
            if e.distress_thermometer_expected else None,
            distress_thermometer_actual=float(e.distress_thermometer_actual)
            if e.distress_thermometer_actual else None,
            feared_outcome_occurred=e.feared_outcome_occurred
        )
        for e in recent
    ]

    return PatientProgressFull(
        summary=summary,
        rung_progress=rung_progress,
        recent_experiments=recent_data_points
    )


async def get_pre_session_brief(
    db: AsyncSession,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID
) -> PreSessionBrief:

    patient_result = await db.execute(
        select(PatientProfile).where(PatientProfile.id == patient_id)
    )
    patient = patient_result.scalar_one_or_none()

    two_weeks_ago = datetime.now(timezone.utc) - timedelta(weeks=2)
    recent_result = await db.execute(
        select(Experiment)
        .where(
            Experiment.patient_id == patient_id,
            Experiment.organization_id == organization_id,
            Experiment.status == "completed",
            Experiment.completed_date >= two_weeks_ago
        )
        .order_by(Experiment.completed_date.desc())
    )
    recent = recent_result.scalars().all()

    bip_trend = "insufficient data"
    if len(recent) >= 2:
        first_bip = recent[-1].bip_after
        last_bip = recent[0].bip_after
        if first_bip and last_bip:
            if float(last_bip) < float(first_bip) - 5:
                bip_trend = "improving"
            elif float(last_bip) > float(first_bip) + 5:
                bip_trend = "worsening"
            else:
                bip_trend = "stable"

    dt_trend = "insufficient data"
    if len(recent) >= 2:
        first_dt = recent[-1].distress_thermometer_actual
        last_dt = recent[0].distress_thermometer_actual
        if first_dt and last_dt:
            if float(last_dt) < float(first_dt) - 0.5:
                dt_trend = "improving"
            elif float(last_dt) > float(first_dt) + 0.5:
                dt_trend = "worsening"
            else:
                dt_trend = "stable"

    flags_result = await db.execute(
        select(func.count(LadderReviewFlag.id))
        .join(ExposureLadder)
        .where(
            ExposureLadder.organization_id == organization_id,
            LadderReviewFlag.status == "open"
        )
    )
    open_flags = flags_result.scalar() or 0

    plan_result = await db.execute(
        select(TreatmentPlan)
        .where(
            TreatmentPlan.patient_id == patient_id,
            TreatmentPlan.status == "active"
        )
    )
    plan = plan_result.scalar_one_or_none()
    ladder_status = "no active plan"
    if plan:
        ladder_status = "setup phase"

    learnings = [
        e.what_learned for e in recent[:3]
        if e.what_learned
    ]

    if not recent:
        recommended_focus = "Check in on experiment progress — no experiments recorded recently"
    elif bip_trend == "improving" and dt_trend == "improving":
        recommended_focus = "Good progress — consider moving to next rung on ladder"
    elif bip_trend == "worsening" or dt_trend == "worsening":
        recommended_focus = "Review recent experiments — distress or belief scores trending up"
    elif open_flags > 0:
        recommended_focus = f"Review {open_flags} open ladder flag(s) before proceeding"
    else:
        recommended_focus = "Continue current exposure plan"

    return PreSessionBrief(
        patient_id=patient_id,
        patient_name=patient.name if patient else "Unknown",
        experiments_since_last_session=len(recent),
        bip_trend=bip_trend,
        distress_thermometer_trend=dt_trend,
        last_experiment_date=recent[0].completed_date if recent else None,
        current_ladder_status=ladder_status,
        open_flag_count=open_flags,
        recent_learnings=learnings,
        recommended_focus=recommended_focus
    )
