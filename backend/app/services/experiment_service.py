import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.core.teen_testing import back_date
from app.models.experiment import Experiment
from app.models.message import Message
from app.models.patient import PatientProfile, PractitionerProfile
from app.models.user import User
from app.schemas.experiment import (
    ExperimentCreate,
    ExperimentPlanCreate,
    ExperimentBeforeState,
    ExperimentAfterState
)


async def create_experiment(
    db: AsyncSession,
    rung_id: uuid.UUID,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: ExperimentCreate
) -> Experiment:
    experiment = Experiment(
        ladder_rung_id=rung_id,
        patient_id=patient_id,
        organization_id=organization_id,
        status="planned",
        scheduled_date=data.scheduled_date
    )
    db.add(experiment)
    await db.commit()
    await db.refresh(experiment)
    return experiment


async def create_experiment_for_behavior(
    db: AsyncSession,
    behavior_id: uuid.UUID,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: ExperimentCreate
) -> Experiment:
    experiment = Experiment(
        avoidance_behavior_id=behavior_id,
        patient_id=patient_id,
        organization_id=organization_id,
        status="planned",
        scheduled_date=data.scheduled_date
    )
    db.add(experiment)
    await db.commit()
    await db.refresh(experiment)
    return experiment


async def plan_experiment_for_behavior(
    db: AsyncSession,
    behavior_id: uuid.UUID,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: ExperimentPlanCreate
) -> Experiment:
    experiment = Experiment(
        avoidance_behavior_id=behavior_id,
        patient_id=patient_id,
        organization_id=organization_id,
        status="planned",
        scheduled_date=data.scheduled_date,
        plan_description=data.plan_description,
        confidence_level=data.confidence_level,
    )
    db.add(experiment)
    await db.commit()
    await db.refresh(experiment)
    return experiment


async def save_session_setup(
    db: AsyncSession,
    behavior,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID,
    data,
) -> Experiment:
    """Save an exposure set up with the child in session.

    With days and a time of day it is fully set up: committed, on the child's ladder as ready.
    Each day picked is its own exposure with the same answers; the first is returned (Peter,
    2026-11-28). With no day it is `planned`: the answers are in and the child picks when at home.
    The child app is unchanged in this round, so that stays (docs/plans/action-plan-centred-treatment.md).
    """
    dates = list(data.scheduled_dates or ([data.scheduled_date] if data.scheduled_date else []))
    if data.scheduled_time_bucket is None:
        dates = []
    created = []
    for when in sorted(dates) or [None]:
        experiment = Experiment(
            avoidance_behavior_id=behavior.id,
            patient_id=patient_id,
            organization_id=organization_id,
            status="committed" if when else "planned",
            committed_at=datetime.now(timezone.utc) if when else None,
            scheduled_date=when,
            scheduled_time_bucket=data.scheduled_time_bucket if when else None,
            plan_description=behavior.name,
            prediction=data.prediction,
            how_will_i_know=(data.how_will_i_know or "").strip() or None,
            bip_before=data.bip_before,
            distress_thermometer_expected=data.distress_thermometer_expected,
            tempting_behaviors=data.tempting_behaviors,
            confidence_level=data.confidence_level,
        )
        db.add(experiment)
        created.append(experiment)
    await db.commit()
    await db.refresh(created[0])
    return created[0]


async def get_experiment(
    db: AsyncSession,
    experiment_id: uuid.UUID,
    organization_id: uuid.UUID,
    patient_id: uuid.UUID | None = None,
) -> Experiment:
    """Fetch an experiment the caller is allowed to see.

    `patient_id` MUST be passed whenever the caller is a patient. Filtering on organisation alone
    let any signed-in child read and modify any other child's experiments in the same clinic —
    found by tests/test_api_patient_scoping.py, 2026-08-26. A clinician passes no patient_id and
    still sees the whole institution.
    """
    conditions = [
        Experiment.id == experiment_id,
        Experiment.organization_id == organization_id,
    ]
    if patient_id is not None:
        conditions.append(Experiment.patient_id == patient_id)
    result = await db.execute(select(Experiment).where(*conditions))
    experiment = result.scalar_one_or_none()
    if not experiment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Experiment not found"
        )
    return experiment


async def get_experiments_for_rung(
    db: AsyncSession,
    rung_id: uuid.UUID,
    organization_id: uuid.UUID
) -> list[Experiment]:
    result = await db.execute(
        select(Experiment)
        .where(
            Experiment.ladder_rung_id == rung_id,
            Experiment.organization_id == organization_id
        )
        .order_by(Experiment.created_at.desc())
    )
    return result.scalars().all()


async def get_experiments_for_patient(
    db: AsyncSession,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID,
    limit: int = 50
) -> list[dict]:
    from app.models.treatment import AvoidanceBehavior, TriggerSituation

    result = await db.execute(
        select(Experiment, AvoidanceBehavior, TriggerSituation)
        .outerjoin(
            AvoidanceBehavior,
            AvoidanceBehavior.id == Experiment.avoidance_behavior_id
        )
        .outerjoin(
            TriggerSituation,
            TriggerSituation.id == AvoidanceBehavior.trigger_situation_id
        )
        .where(
            Experiment.patient_id == patient_id,
            Experiment.organization_id == organization_id
        )
        .order_by(Experiment.created_at.desc())
        .limit(limit)
    )

    rows = []
    for exp, behavior, situation in result.all():
        rows.append({
            "id": exp.id,
            "ladder_rung_id": exp.ladder_rung_id,
            "avoidance_behavior_id": exp.avoidance_behavior_id,
            "status": exp.status,
            "scheduled_date": exp.scheduled_date,
            "completed_date": exp.completed_date,
            "plan_description": exp.plan_description,
            "confidence_level": exp.confidence_level,
            "bip_before": exp.bip_before,
            "bip_after": exp.bip_after,
            "distress_thermometer_expected": exp.distress_thermometer_expected,
            "distress_thermometer_actual": exp.distress_thermometer_actual,
            "feared_outcome_occurred": exp.feared_outcome_occurred,
            "what_learned": exp.what_learned,
            # The rest of Dr. Walker's worksheet, for the clinician's exposure row.
            "prediction": exp.prediction,
            "how_will_i_know": exp.how_will_i_know,
            "tempting_behaviors": exp.tempting_behaviors,
            "what_happened": exp.what_happened,
            "was_surprised": exp.was_surprised,
            "behavior_name": behavior.name if behavior else None,
            "situation_name": situation.name if situation else None,
            "trigger_situation_id": situation.id if situation else None,
            "created_at": exp.created_at,
        })
    return rows


async def save_before_state(
    db: AsyncSession,
    experiment_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: ExperimentBeforeState,
    patient_id: uuid.UUID | None = None,
) -> Experiment:
    experiment = await get_experiment(db, experiment_id, organization_id, patient_id)

    if experiment.status not in ("planned", "in_progress"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update before state — experiment already completed"
        )

    experiment.plan_description = data.plan_description
    experiment.prediction = data.prediction
    experiment.how_will_i_know = (data.how_will_i_know or "").strip() or None
    experiment.bip_before = data.bip_before
    experiment.distress_thermometer_expected = data.distress_thermometer_expected
    experiment.tempting_behaviors = data.tempting_behaviors
    experiment.confidence_level = data.confidence_level
    if data.times_per_day is not None:
        experiment.times_per_day = data.times_per_day
    if data.scheduled_time_bucket is not None:
        experiment.scheduled_time_bucket = data.scheduled_time_bucket
    if data.scheduled_date is not None:
        experiment.scheduled_date = data.scheduled_date
    experiment.status = "in_progress"
    experiment.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(experiment)
    return experiment


async def save_after_state(
    db: AsyncSession,
    experiment_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: ExperimentAfterState,
    patient_id: uuid.UUID | None = None,
) -> Experiment:
    # Checked before anything is touched. A chosen date only from the teen data testing page, and
    # only with its switch on.
    completed_date = (
        back_date(data.completed_at) if data.completed_at is not None else datetime.now(timezone.utc)
    )
    experiment = await get_experiment(db, experiment_id, organization_id, patient_id)

    if experiment.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Experiment already completed"
        )

    experiment.feared_outcome_occurred = data.feared_outcome_occurred
    experiment.what_happened = data.what_happened
    experiment.was_surprised = data.was_surprised
    experiment.distress_thermometer_actual = data.distress_thermometer_actual
    experiment.bip_after = data.bip_after
    experiment.what_learned = data.what_learned
    experiment.status = "completed"
    experiment.completed_date = completed_date
    experiment.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(experiment)
    return experiment


async def skip_experiment(
    db: AsyncSession,
    experiment_id: uuid.UUID,
    organization_id: uuid.UUID,
    patient_id: uuid.UUID | None = None,
) -> Experiment:
    experiment = await get_experiment(db, experiment_id, organization_id, patient_id)
    experiment.status = "skipped"
    experiment.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(experiment)
    return experiment


async def _own_experiment(db: AsyncSession, experiment_id: uuid.UUID, patient_id: uuid.UUID) -> Experiment:
    experiment = (await db.execute(
        select(Experiment).where(
            Experiment.id == experiment_id,
            Experiment.patient_id == patient_id,
        )
    )).scalar_one_or_none()
    if not experiment:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


async def commit_experiment(db: AsyncSession, experiment_id: uuid.UUID, patient_id: uuid.UUID) -> Experiment:
    """The child locks in an exposure they have set up. Their own only."""
    experiment = await _own_experiment(db, experiment_id, patient_id)
    experiment.status = "committed"
    experiment.committed_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(experiment)
    return experiment


async def _practitioner_for(db: AsyncSession, patient: PatientProfile, fallback: bool):
    """The clinician a child's messages go to: their own, or with `fallback` anyone in the clinic."""
    practitioner = None
    if patient.primary_practitioner_id:
        practitioner = (await db.execute(
            select(PractitionerProfile).where(
                PractitionerProfile.id == patient.primary_practitioner_id,
                PractitionerProfile.organization_id == patient.organization_id,
            )
        )).scalar_one_or_none()
    if practitioner is None and fallback:
        practitioner = (await db.execute(
            select(PractitionerProfile).where(
                PractitionerProfile.organization_id == patient.organization_id
            )
        )).scalars().first()
    return practitioner


async def mark_too_hard(
    db: AsyncSession,
    experiment_id: uuid.UUID,
    user: User,
    patient: PatientProfile,
    reason: str | None,
    at: datetime | None = None,
) -> Experiment:
    """The child found an exposure too hard. With a reason, their clinician gets a message.

    `at` is when, for the teen data testing page only; refused unless its switch is on.
    """
    when = back_date(at) if at is not None else datetime.now(timezone.utc)
    experiment = await _own_experiment(db, experiment_id, patient.id)
    experiment.status = "too_hard"
    experiment.too_hard_at = when

    if reason:
        practitioner = await _practitioner_for(db, patient, fallback=False)
        if practitioner:
            db.add(Message(
                organization_id=patient.organization_id,
                sender_user_id=user.id,
                recipient_user_id=practitioner.user_id,
                patient_id=patient.id,
                content=f"I found this experiment too hard: {reason}. Can you suggest a change?",
                message_type="too_hard",
            ))

    await db.commit()
    await db.refresh(experiment)
    return experiment


async def notify_clinician_completed(
    db: AsyncSession, user: User, patient: PatientProfile, experiment: Experiment
) -> None:
    """Tell the child's clinician an exposure was finished, with its numbers."""
    from app.models.treatment import AvoidanceBehavior

    practitioner = await _practitioner_for(db, patient, fallback=True)
    if practitioner is None:
        return

    behavior_name = None
    if experiment.avoidance_behavior_id:
        behavior = (await db.execute(
            select(AvoidanceBehavior).where(AvoidanceBehavior.id == experiment.avoidance_behavior_id)
        )).scalar_one_or_none()
        if behavior:
            behavior_name = behavior.name

    date_str = (
        experiment.completed_date.strftime("%Y-%m-%d")
        if experiment.completed_date else "unknown date"
    )
    bip_before = f"{int(experiment.bip_before)}" if experiment.bip_before is not None else "?"
    bip_after = f"{int(experiment.bip_after)}" if experiment.bip_after is not None else "?"
    dt_actual = (
        f"{experiment.distress_thermometer_actual:g}"
        if experiment.distress_thermometer_actual is not None else "?"
    )
    fo_str = (
        "Yes" if experiment.feared_outcome_occurred is True
        else "No" if experiment.feared_outcome_occurred is False
        else "Unknown"
    )
    content = (
        f"Experiment completed: {behavior_name or 'experiment'} on {date_str}. "
        f"BIP: {bip_before}% → {bip_after}%. "
        f"Fear level: {dt_actual}/10. "
        f"Feared outcome occurred: {fo_str}."
    )

    db.add(Message(
        organization_id=patient.organization_id,
        sender_user_id=user.id,
        recipient_user_id=practitioner.user_id,
        patient_id=patient.id,
        content=content,
        message_type="experiment_completed",
        sender_type="system",
    ))
    await db.commit()


# The setup answers a new exposure copies from the last one on the same step.
_SETUP_FIELDS = (
    "plan_description", "prediction", "how_will_i_know", "bip_before", "distress_thermometer_expected",
    "tempting_behaviors", "confidence_level",
)


async def record_for_child(
    db: AsyncSession, patient_id: uuid.UUID, organization_id: uuid.UUID, rung_id: uuid.UUID,
    data: ExperimentAfterState,
) -> Experiment:
    """The clinician records how an exposure went, in session, with the child's debrief questions
    (action plan check-in, Peter 2026-11-27). Uses the step's set-up exposure; when the last one was
    recorded already, a new one with the same set-up answers, as the child would set it up again."""
    from app.models.treatment import AvoidanceBehavior, TreatmentPlan, TriggerSituation
    from sqlalchemy import or_

    tp_ids = select(TreatmentPlan.id).where(TreatmentPlan.patient_id == patient_id)
    owned = (await db.execute(
        select(AvoidanceBehavior.id)
        .outerjoin(TriggerSituation, TriggerSituation.id == AvoidanceBehavior.trigger_situation_id)
        .where(AvoidanceBehavior.id == rung_id, or_(
            AvoidanceBehavior.treatment_plan_id.in_(tp_ids), TriggerSituation.treatment_plan_id.in_(tp_ids)))
    )).scalar_one_or_none()
    if owned is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Step not found")

    on_step = select(Experiment).where(Experiment.patient_id == patient_id, Experiment.avoidance_behavior_id == rung_id)
    pending = (await db.execute(
        on_step.where(Experiment.status.in_(("planned", "committed"))).order_by(Experiment.created_at.desc()).limit(1)
    )).scalar_one_or_none()
    if pending is None:
        last = (await db.execute(on_step.order_by(Experiment.created_at.desc()).limit(1))).scalar_one_or_none()
        if last is None:
            raise HTTPException(status_code=422, detail="Set it up first")
        pending = Experiment(patient_id=patient_id, organization_id=organization_id,
                             avoidance_behavior_id=rung_id, status="planned",
                             **{f: getattr(last, f) for f in _SETUP_FIELDS})
        db.add(pending)
        await db.flush()
    pending.recorded_by = "clinician"
    return await save_after_state(db, pending.id, organization_id, data, patient_id=patient_id)
