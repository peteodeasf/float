import secrets
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.config import settings
from app.core.dependencies import get_current_user
from app.models.user import User, UserRole
from app.models.organization import Organization
from app.models.patient import PatientProfile, PractitionerProfile, ParentPatientLink
from app.models.experiment import Experiment
from app.services.email_service import send_password_reset_email


router = APIRouter(prefix="/admin", tags=["admin"])


async def get_admin_context(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    result = await db.execute(
        select(UserRole).where(UserRole.user_id == current_user.id)
    )
    roles = result.scalars().all()
    if not any(r.role == "admin" for r in roles):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
    return current_user


class CreateOrganizationRequest(BaseModel):
    name: str
    admin_email: str | None = None


@router.get("/stats")
async def get_stats(
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    total_clinicians = (
        await db.execute(
            select(func.count(func.distinct(UserRole.user_id))).where(
                UserRole.role == "practitioner"
            )
        )
    ).scalar() or 0
    total_patients = (
        await db.execute(select(func.count(PatientProfile.id)))
    ).scalar() or 0
    total_organizations = (
        await db.execute(select(func.count(Organization.id)))
    ).scalar() or 0
    total_experiments_completed = (
        await db.execute(
            select(func.count(Experiment.id)).where(
                Experiment.completed_date.is_not(None)
            )
        )
    ).scalar() or 0

    recent_result = await db.execute(
        select(User).order_by(User.created_at.desc()).limit(5)
    )
    recent_users = recent_result.scalars().all()

    recent_signups = []
    for u in recent_users:
        role_result = await db.execute(
            select(UserRole).where(UserRole.user_id == u.id)
        )
        u_roles = role_result.scalars().all()
        role_label = u_roles[0].role if u_roles else "unknown"
        recent_signups.append({
            "id": str(u.id),
            "email": u.email,
            "role": role_label,
            "created_at": u.created_at.isoformat() if u.created_at else None,
        })

    return {
        "total_users": total_users,
        "total_clinicians": total_clinicians,
        "total_patients": total_patients,
        "total_organizations": total_organizations,
        "total_experiments_completed": total_experiments_completed,
        "recent_signups": recent_signups,
    }


@router.get("/users")
async def list_users(
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    users_result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = users_result.scalars().all()

    orgs_result = await db.execute(select(Organization))
    orgs_by_id = {o.id: o for o in orgs_result.scalars().all()}

    roles_result = await db.execute(select(UserRole))
    roles_by_user: dict[uuid.UUID, list[UserRole]] = {}
    for r in roles_result.scalars().all():
        roles_by_user.setdefault(r.user_id, []).append(r)

    output = []
    for u in users:
        u_roles = roles_by_user.get(u.id, [])
        role_label = u_roles[0].role if u_roles else None
        org_name = None
        if u_roles:
            org = orgs_by_id.get(u_roles[0].organization_id)
            org_name = org.name if org else None
        output.append({
            "id": str(u.id),
            "email": u.email,
            "role": role_label,
            "organization": org_name,
            "created_at": u.created_at.isoformat() if u.created_at else None,
            "last_login": None,
            "must_change_password": u.must_change_password,
        })
    return output


async def _delete_user_cascade(user_id: uuid.UUID, db: AsyncSession) -> None:
    # Find patient profiles owned by this user and delete them (with cascade).
    patient_result = await db.execute(
        select(PatientProfile).where(PatientProfile.user_id == user_id)
    )
    patients = patient_result.scalars().all()
    for p in patients:
        await _delete_patient_cascade(p.id, db)

    # Delete practitioner profiles linked to this user.
    await db.execute(
        delete(PractitionerProfile).where(PractitionerProfile.user_id == user_id)
    )
    # Delete parent links for this user.
    await db.execute(
        delete(ParentPatientLink).where(ParentPatientLink.parent_user_id == user_id)
    )
    # Delete roles.
    await db.execute(delete(UserRole).where(UserRole.user_id == user_id))
    # Delete the user.
    await db.execute(delete(User).where(User.id == user_id))


async def _delete_patient_cascade(patient_id: uuid.UUID, db: AsyncSession) -> None:
    """Delete all data owned by a patient in correct FK order."""
    from sqlalchemy import text as sql_text

    pid = str(patient_id)

    # 1. Experiments (references ladder_rungs.id and patient_profiles.id)
    await db.execute(
        sql_text("DELETE FROM experiments WHERE patient_id = :pid"),
        {"pid": pid},
    )

    # 2. Ladder rungs (references exposure_ladders.id)
    await db.execute(
        sql_text(
            "DELETE FROM ladder_rungs WHERE ladder_id IN ("
            "  SELECT el.id FROM exposure_ladders el"
            "  JOIN trigger_situations ts ON el.trigger_situation_id = ts.id"
            "  JOIN treatment_plans tp ON ts.treatment_plan_id = tp.id"
            "  WHERE tp.patient_id = :pid"
            ")"
        ),
        {"pid": pid},
    )

    # 3. Ladder review flags (references exposure_ladders.id)
    await db.execute(
        sql_text(
            "DELETE FROM ladder_review_flags WHERE ladder_id IN ("
            "  SELECT el.id FROM exposure_ladders el"
            "  JOIN trigger_situations ts ON el.trigger_situation_id = ts.id"
            "  JOIN treatment_plans tp ON ts.treatment_plan_id = tp.id"
            "  WHERE tp.patient_id = :pid"
            ")"
        ),
        {"pid": pid},
    )

    # 4. Exposure ladders (references trigger_situations.id)
    await db.execute(
        sql_text(
            "DELETE FROM exposure_ladders WHERE trigger_situation_id IN ("
            "  SELECT ts.id FROM trigger_situations ts"
            "  JOIN treatment_plans tp ON ts.treatment_plan_id = tp.id"
            "  WHERE tp.patient_id = :pid"
            ")"
        ),
        {"pid": pid},
    )

    # 5. Downward arrows (references trigger_situations.id)
    await db.execute(
        sql_text(
            "DELETE FROM downward_arrows WHERE trigger_situation_id IN ("
            "  SELECT ts.id FROM trigger_situations ts"
            "  JOIN treatment_plans tp ON ts.treatment_plan_id = tp.id"
            "  WHERE tp.patient_id = :pid"
            ")"
        ),
        {"pid": pid},
    )

    # 6. Avoidance behaviors (references trigger_situations.id)
    await db.execute(
        sql_text(
            "DELETE FROM avoidance_behaviors WHERE trigger_situation_id IN ("
            "  SELECT ts.id FROM trigger_situations ts"
            "  JOIN treatment_plans tp ON ts.treatment_plan_id = tp.id"
            "  WHERE tp.patient_id = :pid"
            ")"
        ),
        {"pid": pid},
    )

    # 7. Trigger situations (references treatment_plans.id)
    await db.execute(
        sql_text(
            "DELETE FROM trigger_situations WHERE treatment_plan_id IN ("
            "  SELECT id FROM treatment_plans WHERE patient_id = :pid"
            ")"
        ),
        {"pid": pid},
    )

    # 8. Accommodation behaviors (references treatment_plans.id)
    await db.execute(
        sql_text(
            "DELETE FROM accommodation_behaviors WHERE treatment_plan_id IN ("
            "  SELECT id FROM treatment_plans WHERE patient_id = :pid"
            ")"
        ),
        {"pid": pid},
    )

    # 9. Treatment plans (references patient_profiles.id)
    await db.execute(
        sql_text("DELETE FROM treatment_plans WHERE patient_id = :pid"),
        {"pid": pid},
    )

    # 10. Action plans (references patient_profiles.id)
    await db.execute(
        sql_text("DELETE FROM action_plans WHERE patient_id = :pid"),
        {"pid": pid},
    )

    # 11. Session notes (references patient_profiles.id)
    await db.execute(
        sql_text("DELETE FROM session_notes WHERE patient_id = :pid"),
        {"pid": pid},
    )

    # 12. Messages (references patient_profiles.id)
    await db.execute(
        sql_text("DELETE FROM messages WHERE patient_id = :pid"),
        {"pid": pid},
    )

    # 13. Monitoring entries (references monitoring_forms.id)
    await db.execute(
        sql_text(
            "DELETE FROM monitoring_entries WHERE monitoring_form_id IN ("
            "  SELECT id FROM monitoring_forms WHERE patient_id = :pid"
            ")"
        ),
        {"pid": pid},
    )

    # 14. Monitoring forms (references patient_profiles.id)
    await db.execute(
        sql_text("DELETE FROM monitoring_forms WHERE patient_id = :pid"),
        {"pid": pid},
    )

    # 15. Parent-patient links (references patient_profiles.id)
    await db.execute(
        sql_text("DELETE FROM parent_patient_links WHERE patient_id = :pid"),
        {"pid": pid},
    )

    # 16. Patient profile
    await db.execute(
        delete(PatientProfile).where(PatientProfile.id == patient_id)
    )


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: uuid.UUID,
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own admin account",
        )
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    await _delete_user_cascade(user_id, db)
    await db.commit()
    return {"success": True}


@router.post("/users/{user_id}/reset-password")
async def admin_reset_password(
    user_id: uuid.UUID,
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    token = secrets.token_hex(32)
    user.password_reset_token = token
    user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=1)
    await db.commit()

    role_result = await db.execute(
        select(UserRole).where(UserRole.user_id == user.id)
    )
    roles = role_result.scalars().all()
    is_patient = any(r.role == "patient" for r in roles)
    reset_path = (
        f"/teen/reset-password?token={token}"
        if is_patient
        else f"/reset-password?token={token}"
    )
    reset_link = f"{settings.BASE_URL}{reset_path}"
    await send_password_reset_email(user.email, reset_link)
    return {"success": True}


@router.get("/organizations")
async def list_organizations(
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    orgs_result = await db.execute(
        select(Organization).order_by(Organization.created_at.desc())
    )
    orgs = orgs_result.scalars().all()

    output = []
    for o in orgs:
        clinician_count = (
            await db.execute(
                select(func.count(PractitionerProfile.id)).where(
                    PractitionerProfile.organization_id == o.id
                )
            )
        ).scalar() or 0
        patient_count = (
            await db.execute(
                select(func.count(PatientProfile.id)).where(
                    PatientProfile.organization_id == o.id
                )
            )
        ).scalar() or 0
        output.append({
            "id": str(o.id),
            "name": o.name,
            "clinician_count": clinician_count,
            "patient_count": patient_count,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        })
    return output


@router.post("/organizations")
async def create_organization(
    request: CreateOrganizationRequest,
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    org = Organization(name=request.name, type="clinic", settings={})
    db.add(org)
    await db.flush()
    org_id = org.id
    await db.commit()
    return {
        "id": str(org_id),
        "name": request.name,
    }


@router.get("/organizations/{org_id}")
async def get_organization_detail(
    org_id: uuid.UUID,
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    org_result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = org_result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")

    clinician_result = await db.execute(
        select(PractitionerProfile).where(PractitionerProfile.organization_id == org_id)
    )
    clinicians = clinician_result.scalars().all()

    patient_result = await db.execute(
        select(PatientProfile).where(PatientProfile.organization_id == org_id)
    )
    patients = patient_result.scalars().all()

    clinician_out = []
    for c in clinicians:
        user_result = await db.execute(select(User).where(User.id == c.user_id))
        u = user_result.scalar_one_or_none()
        clinician_out.append({
            "id": str(c.id),
            "name": c.name,
            "email": u.email if u else None,
        })

    patient_out = [
        {
            "id": str(p.id),
            "name": p.name,
            "age": p.age,
        }
        for p in patients
    ]

    return {
        "id": str(org.id),
        "name": org.name,
        "created_at": org.created_at.isoformat() if org.created_at else None,
        "clinicians": clinician_out,
        "patients": patient_out,
    }


@router.get("/patients")
async def list_patients(
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    patients_result = await db.execute(
        select(PatientProfile).order_by(PatientProfile.created_at.desc())
    )
    patients = patients_result.scalars().all()

    orgs_result = await db.execute(select(Organization))
    orgs_by_id = {o.id: o for o in orgs_result.scalars().all()}

    practitioner_result = await db.execute(select(PractitionerProfile))
    practitioners_by_id = {p.id: p for p in practitioner_result.scalars().all()}

    output = []
    for p in patients:
        exp_count = (
            await db.execute(
                select(func.count(Experiment.id)).where(Experiment.patient_id == p.id)
            )
        ).scalar() or 0
        last_activity_result = await db.execute(
            select(func.max(Experiment.updated_at)).where(Experiment.patient_id == p.id)
        )
        last_activity = last_activity_result.scalar()

        org = orgs_by_id.get(p.organization_id)
        practitioner = (
            practitioners_by_id.get(p.primary_practitioner_id)
            if p.primary_practitioner_id
            else None
        )

        # Treatment plan status — best-effort soft lookup.
        plan_status = None
        try:
            from sqlalchemy import text as sql_text
            plan_result = await db.execute(
                sql_text(
                    "SELECT activated_at FROM treatment_plans "
                    "WHERE patient_id = :pid ORDER BY created_at DESC LIMIT 1"
                ),
                {"pid": str(p.id)},
            )
            row = plan_result.first()
            if row:
                plan_status = "active" if row[0] is not None else "draft"
        except Exception:
            plan_status = None

        output.append({
            "id": str(p.id),
            "name": p.name,
            "age": p.age,
            "gender": p.gender,
            "organization": org.name if org else None,
            "clinician": practitioner.name if practitioner else None,
            "plan_status": plan_status,
            "experiment_count": exp_count,
            "last_activity": last_activity.isoformat() if last_activity else None,
        })
    return output


@router.delete("/patients/{patient_id}")
async def delete_patient(
    patient_id: uuid.UUID,
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PatientProfile).where(PatientProfile.id == patient_id)
    )
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    user_id = patient.user_id
    await _delete_patient_cascade(patient_id, db)

    # Also delete the underlying user account and their role.
    await db.execute(delete(UserRole).where(UserRole.user_id == user_id))
    await db.execute(delete(User).where(User.id == user_id))

    await db.commit()
    return {"success": True}
