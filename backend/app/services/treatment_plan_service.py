import uuid
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException, status

from app.models.treatment import TreatmentPlan, AvoidanceBehavior, TriggerSituation
from app.schemas.treatment_plan import TreatmentPlanCreate, TreatmentPlanUpdate


async def create_treatment_plan(
    db: AsyncSession,
    patient_id: uuid.UUID,
    practitioner_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: TreatmentPlanCreate
) -> tuple[TreatmentPlan, bool]:
    """The patient's unfinished plan, made now if there is none. Returns (plan, made_now).

    A patient has one unfinished plan, and the database enforces it. Issue #92: a second one made
    every lookup of the plan fail, so the Plan tab said "No treatment plan yet" and each click on
    Create added another. If one exists, it is handed back instead.
    """
    existing = await get_active_plan(db, patient_id, organization_id)
    if existing is not None:
        return existing, False
    plan = TreatmentPlan(
        patient_id=patient_id,
        practitioner_id=practitioner_id,
        organization_id=organization_id,
        clinical_track=data.clinical_track,
        parent_visibility_level=data.parent_visibility_level,
        status="setup",
        nickname=data.nickname
    )
    try:
        # A savepoint, so losing a race to a second click undoes only this insert.
        async with db.begin_nested():
            db.add(plan)
    except IntegrityError:
        existing = await get_active_plan(db, patient_id, organization_id)
        if existing is None:
            raise
        return existing, False
    await db.commit()
    await db.refresh(plan)
    return plan, True


async def get_active_plan(
    db: AsyncSession,
    patient_id: uuid.UUID,
    organization_id: uuid.UUID
) -> TreatmentPlan | None:
    result = await db.execute(
        select(TreatmentPlan)
        .where(
            TreatmentPlan.patient_id == patient_id,
            TreatmentPlan.organization_id == organization_id,
            TreatmentPlan.status != "complete"
        )
        .order_by(TreatmentPlan.created_at.desc())
    )
    return result.scalar_one_or_none()


async def update_treatment_plan(
    db: AsyncSession,
    plan_id: uuid.UUID,
    organization_id: uuid.UUID,
    data: TreatmentPlanUpdate,
    patient_id: uuid.UUID | None = None,
) -> TreatmentPlan:
    """patient_id is required by the route that has one - PUT /patients/{patient_id}/plan/{plan_id}.

    Without it the plan was matched on organization alone, so a clinician granted patient A could
    pass A's id with B's plan id and mutate B's plan. Flipping another child's plan status to
    "complete" takes the accommodations view away from that child's parent. Found by the security
    review; the route's identity is the (patient, plan) pair, so both belong in the query.
    """
    conditions = [
        TreatmentPlan.id == plan_id,
        TreatmentPlan.organization_id == organization_id,
    ]
    if patient_id is not None:
        conditions.append(TreatmentPlan.patient_id == patient_id)
    result = await db.execute(
        select(TreatmentPlan).where(*conditions)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Treatment plan not found"
        )
    if data.clinical_track is not None:
        plan.clinical_track = data.clinical_track
    if data.parent_visibility_level is not None:
        plan.parent_visibility_level = data.parent_visibility_level
    if data.status is not None:
        if plan.status == "complete" and data.status != "complete":
            other_open = (await db.execute(
                select(TreatmentPlan.id).where(
                    TreatmentPlan.patient_id == plan.patient_id,
                    TreatmentPlan.status != "complete",
                    TreatmentPlan.id != plan.id,
                )
            )).first()
            if other_open is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This patient already has an open treatment plan.",
                )
        if data.status == "active" and plan.status != "active" and plan.activated_at is None:
            plan.activated_at = datetime.now(timezone.utc)
        plan.status = data.status
    if data.nickname is not None:
        plan.nickname = data.nickname
    if data.ladder_active is not None:
        plan.ladder_active = data.ladder_active
    if data.clear_recommended_rung:
        plan.recommended_rung_id = None
    elif data.recommended_rung_id is not None:
        # It has to be a rung on THIS plan. Without the check a clinician could point their
        # patient's app at another child's row, and the child's ladder would read it out.
        rung = (await db.execute(
            select(AvoidanceBehavior).where(AvoidanceBehavior.id == data.recommended_rung_id)
        )).scalar_one_or_none()
        situation_plan_id = None
        if rung is not None and rung.trigger_situation_id is not None:
            situation_plan_id = (await db.execute(
                select(TriggerSituation.treatment_plan_id)
                .where(TriggerSituation.id == rung.trigger_situation_id)
            )).scalar_one_or_none()
        belongs = rung is not None and (
            rung.treatment_plan_id == plan.id or situation_plan_id == plan.id
        )
        if not belongs:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="That rung is not on this plan.",
            )
        plan.recommended_rung_id = data.recommended_rung_id
    await db.commit()
    await db.refresh(plan)
    return plan
