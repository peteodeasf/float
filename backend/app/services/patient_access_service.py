"""Who may open which patient.

Before this, any clinician could open any patient in their own institution: the lookup filtered on
organization_id and nothing else. Access is now explicit — a clinician sees a patient because
someone granted it, or because they are an admin of that institution.

Refusals are 404, never 403. A 403 would confirm the patient exists, which lets a clinician map
another colleague's caseload by probing ids.

Plan: docs/plans/clinician-patient-access-grants.md
"""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.patient import PatientAccessGrant, PatientProfile, PractitionerProfile
from app.models.user import UserRole


NOT_FOUND = HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Patient not found")


async def is_institution_admin(
    db: AsyncSession, user_id: uuid.UUID, organization_id: uuid.UUID
) -> bool:
    """An admin of THIS institution. Being an admin somewhere else counts for nothing."""
    result = await db.execute(
        select(UserRole).where(
            UserRole.user_id == user_id,
            UserRole.organization_id == organization_id,
            UserRole.is_org_admin.is_(True),
        )
    )
    return result.scalar_one_or_none() is not None


async def has_live_grant(
    db: AsyncSession, patient_id: uuid.UUID, practitioner_id: uuid.UUID
) -> bool:
    result = await db.execute(
        select(PatientAccessGrant).where(
            PatientAccessGrant.patient_id == patient_id,
            PatientAccessGrant.practitioner_id == practitioner_id,
            PatientAccessGrant.revoked_at.is_(None),
        )
    )
    return result.scalar_one_or_none() is not None


async def may_access(
    db: AsyncSession,
    patient: PatientProfile,
    user_id: uuid.UUID,
    practitioner: PractitionerProfile,
) -> bool:
    if patient.organization_id != practitioner.organization_id:
        return False
    if await is_institution_admin(db, user_id, practitioner.organization_id):
        return True
    return await has_live_grant(db, patient.id, practitioner.id)


async def get_patient_for_practitioner(
    db: AsyncSession,
    patient_id: uuid.UUID,
    user_id: uuid.UUID,
    practitioner: PractitionerProfile,
) -> PatientProfile:
    """Resolve a patient the caller is allowed to see, or 404."""
    result = await db.execute(
        select(PatientProfile).where(PatientProfile.id == patient_id)
    )
    patient = result.scalar_one_or_none()
    if patient is None:
        raise NOT_FOUND
    if not await may_access(db, patient, user_id, practitioner):
        raise NOT_FOUND
    return patient


async def accessible_patient_ids(
    db: AsyncSession, user_id: uuid.UUID, practitioner: PractitionerProfile
) -> list[uuid.UUID] | None:
    """Patient ids this clinician may see. None means "all of them" — the caller is an admin.

    None rather than a list of every id so the roster query stays a single filter instead of an
    IN over the whole institution.
    """
    if await is_institution_admin(db, user_id, practitioner.organization_id):
        return None
    result = await db.execute(
        select(PatientAccessGrant.patient_id).where(
            PatientAccessGrant.practitioner_id == practitioner.id,
            PatientAccessGrant.revoked_at.is_(None),
        )
    )
    return list(result.scalars().all())


async def list_grants(db: AsyncSession, patient_id: uuid.UUID) -> list[PatientAccessGrant]:
    result = await db.execute(
        select(PatientAccessGrant)
        .where(
            PatientAccessGrant.patient_id == patient_id,
            PatientAccessGrant.revoked_at.is_(None),
        )
        .order_by(PatientAccessGrant.created_at)
    )
    return list(result.scalars().all())


async def grant_access(
    db: AsyncSession,
    patient: PatientProfile,
    practitioner_id: uuid.UUID,
    granted_by: PractitionerProfile,
) -> PatientAccessGrant:
    """Give a clinician in the same institution access to this patient.

    The caller has already been checked by the dependency — reaching here means they can see the
    patient themselves. What still has to be checked is the clinician being granted to.
    """
    result = await db.execute(
        select(PractitionerProfile).where(PractitionerProfile.id == practitioner_id)
    )
    target = result.scalar_one_or_none()
    if target is None or target.organization_id != patient.organization_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Clinician not found"
        )

    if await has_live_grant(db, patient.id, practitioner_id):
        existing = await db.execute(
            select(PatientAccessGrant).where(
                PatientAccessGrant.patient_id == patient.id,
                PatientAccessGrant.practitioner_id == practitioner_id,
                PatientAccessGrant.revoked_at.is_(None),
            )
        )
        return existing.scalar_one()

    grant = PatientAccessGrant(
        patient_id=patient.id,
        practitioner_id=practitioner_id,
        organization_id=patient.organization_id,
        granted_by_practitioner_id=granted_by.id,
    )
    db.add(grant)
    await db.commit()
    await db.refresh(grant)
    return grant


async def revoke_access(
    db: AsyncSession,
    patient: PatientProfile,
    practitioner_id: uuid.UUID,
    revoked_by: PractitionerProfile,
) -> None:
    """Revoking the last live grant is refused — it would leave a patient nobody can open.

    An institution admin can still reach them, but only in an institution that has one, and
    relying on that would make the patient invisible to the people actually treating them.
    """
    live = await list_grants(db, patient.id)
    if not any(g.practitioner_id == practitioner_id for g in live):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No access to revoke"
        )
    if len(live) == 1:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This is the only clinician with access. Grant access to someone else first.",
        )

    grant = next(g for g in live if g.practitioner_id == practitioner_id)
    grant.revoked_at = datetime.now(timezone.utc)
    grant.revoked_by_practitioner_id = revoked_by.id
    await db.commit()


async def patient_of_record(db: AsyncSession, model, record_id: uuid.UUID) -> uuid.UUID:
    """The patient a row belongs to, or 404.

    Patient data is reachable through ids other than a patient's own — a treatment plan, an action
    plan. The route sweep found five such routes still open after the patient-keyed ones were
    fixed, all of them under /plans/{plan_id}. Anything keyed on a row that belongs to a patient
    has to resolve back to that patient before it can be checked.
    """
    result = await db.execute(select(model.patient_id).where(model.id == record_id))
    patient_id = result.scalar_one_or_none()
    if patient_id is None:
        raise NOT_FOUND
    return patient_id


# --- resolving a row back to the patient it belongs to -------------------------------------
#
# Patient data hangs off ids other than a patient's own: a plan, a situation, a behaviour, a
# ladder, a rung, an arrow, a note. Each of these is a door into one child's record, and the
# route sweep found eighteen clinician routes reachable through them after the patient-keyed
# and plan-keyed routes were closed. Every door has to lead back to a patient before it can be
# checked, so each resolver below does exactly that and nothing else.


async def _patient_id_of_plan(db: AsyncSession, plan_id: uuid.UUID) -> uuid.UUID:
    from app.models.treatment import TreatmentPlan
    return await patient_of_record(db, TreatmentPlan, plan_id)


async def patient_id_of_situation(db: AsyncSession, situation_id: uuid.UUID) -> uuid.UUID:
    from app.models.treatment import TriggerSituation
    result = await db.execute(
        select(TriggerSituation.treatment_plan_id).where(TriggerSituation.id == situation_id)
    )
    plan_id = result.scalar_one_or_none()
    if plan_id is None:
        raise NOT_FOUND
    return await _patient_id_of_plan(db, plan_id)


async def patient_id_of_behavior(db: AsyncSession, behavior_id: uuid.UUID) -> uuid.UUID:
    """A behaviour may hang off a plan directly or off a situation, since rungs became
    plan-level. Try the plan first, fall back to the situation."""
    from app.models.treatment import AvoidanceBehavior
    result = await db.execute(
        select(AvoidanceBehavior.treatment_plan_id, AvoidanceBehavior.trigger_situation_id)
        .where(AvoidanceBehavior.id == behavior_id)
    )
    row = result.one_or_none()
    if row is None:
        raise NOT_FOUND
    plan_id, situation_id = row
    if plan_id is not None:
        return await _patient_id_of_plan(db, plan_id)
    if situation_id is not None:
        return await patient_id_of_situation(db, situation_id)
    raise NOT_FOUND


async def patient_id_of_ladder(db: AsyncSession, ladder_id: uuid.UUID) -> uuid.UUID:
    from app.models.ladder import ExposureLadder
    result = await db.execute(
        select(ExposureLadder.trigger_situation_id).where(ExposureLadder.id == ladder_id)
    )
    situation_id = result.scalar_one_or_none()
    if situation_id is None:
        raise NOT_FOUND
    return await patient_id_of_situation(db, situation_id)


async def patient_id_of_rung(db: AsyncSession, rung_id: uuid.UUID) -> uuid.UUID:
    from app.models.ladder import LadderRung
    result = await db.execute(
        select(LadderRung.ladder_id).where(LadderRung.id == rung_id)
    )
    ladder_id = result.scalar_one_or_none()
    if ladder_id is None:
        raise NOT_FOUND
    return await patient_id_of_ladder(db, ladder_id)


async def patient_id_of_arrow(db: AsyncSession, arrow_id: uuid.UUID) -> uuid.UUID:
    """An arrow carries a patient_id, except for older rows where it is null and the patient has
    to come from the situation."""
    from app.models.downward_arrow import DownwardArrow
    result = await db.execute(
        select(DownwardArrow.patient_id, DownwardArrow.trigger_situation_id)
        .where(DownwardArrow.id == arrow_id)
    )
    row = result.one_or_none()
    if row is None:
        raise NOT_FOUND
    patient_id, situation_id = row
    if patient_id is not None:
        return patient_id
    if situation_id is not None:
        return await patient_id_of_situation(db, situation_id)
    raise NOT_FOUND
