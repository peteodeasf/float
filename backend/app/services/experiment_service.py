import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import HTTPException, status

from app.models.experiment import Experiment
from app.schemas.experiment import (
    ExperimentCreate,
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


async def get_experiment(
    db: AsyncSession,
    experiment_id: uuid.UUID,
    organization_id: uuid.UUID
) -> Experiment:
    result = await db.execute(
        select(Experiment)
        .where(
            Experiment.id == experiment_id,
            Experiment.organization_id == organization_id
        )
    )
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
) -> list[Experiment]:
    result = await db.execute(
        select(Experiment)
        .where(
            Experiment.patient_id == patient_id,
            Experiment.organization_id == organization_id
        )
        .order_by(Experiment.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


async def save_before_state(
    db: AsyncSession,
    experiment_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: ExperimentBeforeState
) -> Experiment:
    experiment = await get_experiment(db, experiment_id, organization_id)

    if experiment.status not in ("planned", "in_progress"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot update before state — experiment already completed"
        )

    experiment.plan_description = data.plan_description
    experiment.prediction = data.prediction
    experiment.bip_before = data.bip_before
    experiment.distress_thermometer_expected = data.distress_thermometer_expected
    experiment.tempting_behaviors = data.tempting_behaviors
    experiment.confidence_level = data.confidence_level
    experiment.status = "in_progress"
    experiment.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(experiment)
    return experiment


async def save_after_state(
    db: AsyncSession,
    experiment_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: ExperimentAfterState
) -> Experiment:
    experiment = await get_experiment(db, experiment_id, organization_id)

    if experiment.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Experiment already completed"
        )

    experiment.feared_outcome_occurred = data.feared_outcome_occurred
    experiment.what_happened = data.what_happened
    experiment.distress_thermometer_actual = data.distress_thermometer_actual
    experiment.bip_after = data.bip_after
    experiment.what_learned = data.what_learned
    experiment.status = "completed"
    experiment.completed_date = datetime.now(timezone.utc)
    experiment.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(experiment)
    return experiment


async def skip_experiment(
    db: AsyncSession,
    experiment_id: uuid.UUID,
    organization_id: uuid.UUID
) -> Experiment:
    experiment = await get_experiment(db, experiment_id, organization_id)
    experiment.status = "skipped"
    experiment.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(experiment)
    return experiment
