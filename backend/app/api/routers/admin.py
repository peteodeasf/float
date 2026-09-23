import secrets
import uuid
from typing import Optional
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
from app.models.setup_link import SetupLink
from app.models.patient import PatientProfile, PractitionerProfile, ParentPatientLink
from app.models.experiment import Experiment
from app.models.jit_content import Tag, JitTip, JitTipTag
from app.services import checklist_item_service as checklist_items
from app.services import practice_service
from app.api.routers.checklist import checklist_item_out
from app.services.email_service import (
    send_password_reset_email,
)


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


CLINICIAN_INVITE_INTRO = "You've been set up as a clinician on Float."


class CreateClinicianRequest(BaseModel):
    name: str
    email: str
    organization_id: str


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

    # Who has been sent a setup link, and who has used one. A clinician created before setup links
    # existed has neither, and is offered Reset password like anyone else.
    links_result = await db.execute(select(SetupLink.user_id, SetupLink.used_at))
    sent_link, used_link = set(), set()
    for link_user_id, used_at in links_result.all():
        sent_link.add(link_user_id)
        if used_at is not None:
            used_link.add(link_user_id)

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
            # Sent a setup link and has not chosen a password yet: the admin app offers a new link.
            "awaiting_setup": (
                u.id in sent_link and u.id not in used_link and u.password_changed_at is None
            ),
        })
    return output


async def _delete_patient_cascade(patient_id: uuid.UUID, db: AsyncSession) -> None:
    """Delete a patient profile, all linked data, and the underlying user account."""
    from sqlalchemy import text as sql_text

    pid = str(patient_id)

    # 14. Get the user_id from patient_profiles
    user_id_result = await db.execute(
        sql_text("SELECT user_id FROM patient_profiles WHERE id = :pid"),
        {"pid": pid},
    )
    row = user_id_result.first()
    if not row:
        return
    user_id = str(row[0])

    # 1. Experiments
    await db.execute(
        sql_text("DELETE FROM experiments WHERE patient_id = :pid"),
        {"pid": pid},
    )

    # 2. Ladder review flags
    await db.execute(
        sql_text(
            "DELETE FROM ladder_review_flags WHERE ladder_id IN ("
            "  SELECT id FROM exposure_ladders WHERE trigger_situation_id IN ("
            "    SELECT id FROM trigger_situations WHERE treatment_plan_id IN ("
            "      SELECT id FROM treatment_plans WHERE patient_id = :pid"
            "    )"
            "  )"
            ")"
        ),
        {"pid": pid},
    )

    # 3. Ladder rungs
    await db.execute(
        sql_text(
            "DELETE FROM ladder_rungs WHERE ladder_id IN ("
            "  SELECT id FROM exposure_ladders WHERE trigger_situation_id IN ("
            "    SELECT id FROM trigger_situations WHERE treatment_plan_id IN ("
            "      SELECT id FROM treatment_plans WHERE patient_id = :pid"
            "    )"
            "  )"
            ")"
        ),
        {"pid": pid},
    )

    # 4. Exposure ladders
    await db.execute(
        sql_text(
            "DELETE FROM exposure_ladders WHERE trigger_situation_id IN ("
            "  SELECT id FROM trigger_situations WHERE treatment_plan_id IN ("
            "    SELECT id FROM treatment_plans WHERE patient_id = :pid"
            "  )"
            ")"
        ),
        {"pid": pid},
    )

    # 5. Downward arrows
    await db.execute(
        sql_text(
            "DELETE FROM downward_arrows WHERE trigger_situation_id IN ("
            "  SELECT id FROM trigger_situations WHERE treatment_plan_id IN ("
            "    SELECT id FROM treatment_plans WHERE patient_id = :pid"
            "  )"
            ")"
        ),
        {"pid": pid},
    )

    # 6. Avoidance behaviors
    await db.execute(
        sql_text(
            "DELETE FROM avoidance_behaviors WHERE trigger_situation_id IN ("
            "  SELECT id FROM trigger_situations WHERE treatment_plan_id IN ("
            "    SELECT id FROM treatment_plans WHERE patient_id = :pid"
            "  )"
            ")"
        ),
        {"pid": pid},
    )

    # 7. Trigger situations
    await db.execute(
        sql_text(
            "DELETE FROM trigger_situations WHERE treatment_plan_id IN ("
            "  SELECT id FROM treatment_plans WHERE patient_id = :pid"
            ")"
        ),
        {"pid": pid},
    )

    # 8. Treatment plans
    await db.execute(
        sql_text("DELETE FROM treatment_plans WHERE patient_id = :pid"),
        {"pid": pid},
    )

    # 9. Action plans
    await db.execute(
        sql_text("DELETE FROM action_plans WHERE patient_id = :pid"),
        {"pid": pid},
    )

    # 10. Session notes
    await db.execute(
        sql_text("DELETE FROM session_notes WHERE patient_id = :pid"),
        {"pid": pid},
    )

    # 11. Messages
    await db.execute(
        sql_text("DELETE FROM messages WHERE patient_id = :pid"),
        {"pid": pid},
    )

    # 12. Monitoring entries
    await db.execute(
        sql_text(
            "DELETE FROM monitoring_entries WHERE monitoring_form_id IN ("
            "  SELECT id FROM monitoring_forms WHERE patient_id = :pid"
            ")"
        ),
        {"pid": pid},
    )

    # 13. Monitoring forms
    await db.execute(
        sql_text("DELETE FROM monitoring_forms WHERE patient_id = :pid"),
        {"pid": pid},
    )

    # 15. Patient profile
    await db.execute(
        sql_text("DELETE FROM patient_profiles WHERE id = :pid"),
        {"pid": pid},
    )

    # 16. User roles
    await db.execute(
        sql_text("DELETE FROM user_roles WHERE user_id = :uid"),
        {"uid": user_id},
    )

    # 17. User
    await db.execute(
        sql_text("DELETE FROM users WHERE id = :uid"),
        {"uid": user_id},
    )


async def _clinician_patient_count(profile_id: str, db: AsyncSession) -> int:
    """Distinct patients this clinician is responsible for — as their primary practitioner, the
    owner of a treatment plan, or the holder of a live access grant. A clinician with any of
    these must not be deleted: doing so would leave those patients with no clinician."""
    from sqlalchemy import text as sql_text

    result = await db.execute(
        sql_text(
            "SELECT count(*) FROM ("
            "  SELECT id AS pid FROM patient_profiles WHERE primary_practitioner_id = :pp"
            "  UNION"
            "  SELECT patient_id FROM treatment_plans WHERE practitioner_id = :pp"
            "  UNION"
            "  SELECT patient_id FROM patient_access_grants"
            "   WHERE practitioner_id = :pp AND revoked_at IS NULL"
            ") t"
        ),
        {"pp": profile_id},
    )
    return int(result.scalar() or 0)


async def _delete_practitioner_cascade(user_id: str, db: AsyncSession) -> None:
    """Delete a clinician account.

    Refuses (409) if the clinician still has patients — the admin must reassign them first.
    Once they have none, their authored notes are moved to each patient's current clinician
    (Peter's call: keep the notes rather than delete them), their own access artifacts are
    cleared, and the account is removed.
    """
    from sqlalchemy import text as sql_text

    profile_row = (await db.execute(
        sql_text("SELECT id FROM practitioner_profiles WHERE user_id = :uid"),
        {"uid": user_id},
    )).first()
    if not profile_row:
        # No practitioner profile — nothing references it; just remove the role and user.
        await db.execute(sql_text("DELETE FROM user_roles WHERE user_id = :uid"), {"uid": user_id})
        await db.execute(sql_text("DELETE FROM users WHERE id = :uid"), {"uid": user_id})
        return
    pp = str(profile_row[0])

    if await _clinician_patient_count(pp, db) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This clinician still has patients assigned. Reassign their patients to "
                "another clinician before deleting the account."
            ),
        )

    # Move authored content to each patient's current clinician. These columns are NOT NULL, so
    # a row can only move if its patient still has a clinician; any that can't are caught below.
    for table in ("session_notes", "clinical_formulations", "action_plans", "session_recordings"):
        await db.execute(
            sql_text(
                f"UPDATE {table} AS t SET practitioner_id = pp.primary_practitioner_id "
                "FROM patient_profiles pp "
                "WHERE t.patient_id = pp.id AND t.practitioner_id = :pp "
                "AND pp.primary_practitioner_id IS NOT NULL"
            ),
            {"pp": pp},
        )

    # Nullable historical markers on the patient row — clear them.
    for column in (
        "recording_consent_practitioner_id",
        "closed_by_practitioner_id",
        "progress_shared_by_practitioner_id",
    ):
        await db.execute(
            sql_text(f"UPDATE patient_profiles SET {column} = NULL WHERE {column} = :pp"),
            {"pp": pp},
        )

    # If any authored content is left, its patient has no clinician to receive it — stop cleanly
    # rather than 500 on the NOT NULL foreign key.
    remaining = (await db.execute(
        sql_text(
            "SELECT "
            "(SELECT count(*) FROM session_notes WHERE practitioner_id = :pp) + "
            "(SELECT count(*) FROM clinical_formulations WHERE practitioner_id = :pp) + "
            "(SELECT count(*) FROM action_plans WHERE practitioner_id = :pp) + "
            "(SELECT count(*) FROM session_recordings WHERE practitioner_id = :pp)"
        ),
        {"pp": pp},
    )).scalar() or 0
    if int(remaining) > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Some of this clinician's notes belong to a patient who has no clinician "
                "assigned. Assign a clinician to that patient, then delete."
            ),
        )

    # The clinician's own access artifacts, and grants they granted/revoked for others.
    await db.execute(
        sql_text("DELETE FROM patient_access_log WHERE practitioner_id = :pp OR user_id = :uid"),
        {"pp": pp, "uid": user_id},
    )
    await db.execute(
        sql_text("DELETE FROM patient_access_grants WHERE practitioner_id = :pp"),
        {"pp": pp},
    )
    for column in ("granted_by_practitioner_id", "revoked_by_practitioner_id"):
        await db.execute(
            sql_text(f"UPDATE patient_access_grants SET {column} = NULL WHERE {column} = :pp"),
            {"pp": pp},
        )
    await db.execute(
        sql_text("DELETE FROM messages WHERE sender_user_id = :uid OR recipient_user_id = :uid"),
        {"uid": user_id},
    )

    await db.execute(sql_text("DELETE FROM practitioner_profiles WHERE id = :pp"), {"pp": pp})
    await db.execute(sql_text("DELETE FROM user_roles WHERE user_id = :uid"), {"uid": user_id})
    await db.execute(sql_text("DELETE FROM users WHERE id = :uid"), {"uid": user_id})


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: uuid.UUID,
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import text as sql_text

    if user_id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete your own admin account",
        )

    uid = str(user_id)

    user_result = await db.execute(
        sql_text("SELECT id FROM users WHERE id = :uid"),
        {"uid": uid},
    )
    if not user_result.first():
        raise HTTPException(status_code=404, detail="User not found")

    role_result = await db.execute(
        sql_text("SELECT role FROM user_roles WHERE user_id = :uid LIMIT 1"),
        {"uid": uid},
    )
    role_row = role_result.first()
    role = role_row[0] if role_row else None

    if role == "patient":
        pp_result = await db.execute(
            sql_text("SELECT id FROM patient_profiles WHERE user_id = :uid"),
            {"uid": uid},
        )
        pp_row = pp_result.first()
        if pp_row:
            await _delete_patient_cascade(pp_row[0], db)
        else:
            await db.execute(
                sql_text("DELETE FROM user_roles WHERE user_id = :uid"),
                {"uid": uid},
            )
            await db.execute(
                sql_text("DELETE FROM users WHERE id = :uid"),
                {"uid": uid},
            )
    elif role == "practitioner":
        await _delete_practitioner_cascade(uid, db)
    else:
        await db.execute(
            sql_text("DELETE FROM user_roles WHERE user_id = :uid"),
            {"uid": uid},
        )
        await db.execute(
            sql_text("DELETE FROM users WHERE id = :uid"),
            {"uid": uid},
        )

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
            "status": o.status,
            "suspended": o.suspended_at is not None,
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
    """A new practice. With an admin email, that person is sent a setup link and the practice stays
    in setup until they finish it. Without one, the practice is active straight away."""
    admin_email = (request.admin_email or "").lower().strip()
    if admin_email and await practice_service.email_in_use(db, admin_email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with that email already exists.",
        )

    org = await practice_service.create_practice(
        db, request.name, org_status="setting_up" if admin_email else "active",
    )
    org_id = org.id
    if admin_email:
        owner, _ = await practice_service.create_member(
            db, org_id, admin_email, name="", role=practice_service.CLINICIAN, is_admin=True,
        )
        await practice_service.send_setup_link(
            db, owner, org_id, purpose="practice_owner",
            intro=f"Your practice, {request.name}, has been set up on Float.",
            created_by_user_id=admin.id,
        )
    else:
        await db.commit()
    return {
        "id": str(org_id),
        "name": request.name,
    }


class OrganizationSuspendRequest(BaseModel):
    suspended: bool


@router.put("/organizations/{org_id}/suspended")
async def set_organization_suspended(
    org_id: uuid.UUID,
    request: OrganizationSuspendRequest,
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    """Suspend a practice, or let it back in. Nobody in a suspended practice can use Float. Letting
    it back in returns it to where it was: active, or still in setup."""
    org = await db.get(Organization, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Organization not found")
    if request.suspended:
        org.suspended_at = org.suspended_at or datetime.now(timezone.utc)
    else:
        org.suspended_at = None
    await db.commit()
    return {"id": str(org.id), "status": org.status, "suspended": org.suspended_at is not None}


@router.post("/clinicians")
async def create_clinician(
    request: CreateClinicianRequest,
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    email = request.email.lower().strip()

    # Check no existing user with this email
    existing_result = await db.execute(select(User).where(User.email == email))
    if existing_result.scalar_one_or_none() is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A user with that email already exists.",
        )

    try:
        org_uuid = uuid.UUID(request.organization_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid organization_id")

    org_result = await db.execute(
        select(Organization).where(Organization.id == org_uuid)
    )
    org = org_result.scalar_one_or_none()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    # Only the person setting a practice up can finish that setup, and nobody else there can use
    # Float until they do. Adding a clinician now would leave them locked out with no explanation.
    if org.status != "active":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This practice is still being set up. Add clinicians once its setup is finished.",
        )

    user, profile = await practice_service.create_member(
        db, org_uuid, email, request.name, practice_service.CLINICIAN,
    )
    profile_id = profile.id
    user_id = user.id
    org_name = org.name
    await practice_service.send_setup_link(
        db, user, org_uuid, purpose="colleague",
        intro=CLINICIAN_INVITE_INTRO, created_by_user_id=admin.id,
    )

    return {
        "id": str(profile_id),
        "name": request.name,
        "user_id": str(user_id),
        "email": email,
        "organization_id": str(org_uuid),
        "organization_name": org_name,
    }


@router.post("/clinicians/{user_id}/setup-link")
async def resend_clinician_setup_link(
    user_id: uuid.UUID,
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    """Send a new setup link to a clinician who has not chosen a password yet. The old link stops
    working."""
    profile = (await db.execute(
        select(PractitionerProfile).where(PractitionerProfile.user_id == user_id)
    )).scalar_one_or_none()
    user = await db.get(User, user_id)
    if profile is None or user is None:
        raise HTTPException(status_code=404, detail="Clinician not found")
    if not practice_service.awaiting_first_password(user):
        # Once they have a password of their own, a lost one goes through Reset password.
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This clinician has already set up their account. Use Reset password instead.",
        )

    await practice_service.send_setup_link(
        db, user, profile.organization_id, purpose="colleague",
        intro=CLINICIAN_INVITE_INTRO, created_by_user_id=admin.id,
    )
    return {"success": True}


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
            "organization_id": str(p.organization_id) if p.organization_id else None,
            "clinician": practitioner.name if practitioner else None,
            "clinician_id": str(p.primary_practitioner_id) if p.primary_practitioner_id else None,
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
    from sqlalchemy import text as sql_text

    pid = str(patient_id)

    exists_result = await db.execute(
        sql_text("SELECT id FROM patient_profiles WHERE id = :pid"),
        {"pid": pid},
    )
    if not exists_result.first():
        raise HTTPException(status_code=404, detail="Patient not found")

    await _delete_patient_cascade(patient_id, db)
    await db.commit()
    return {"success": True}


@router.get("/clinicians")
async def list_clinicians(
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    """Every clinician, for the reassign-patient picker. Carries the org so the UI can offer
    only same-org clinicians as targets."""
    profiles = (await db.execute(select(PractitionerProfile))).scalars().all()
    users_by_id = {u.id: u for u in (await db.execute(select(User))).scalars().all()}
    orgs_by_id = {o.id: o for o in (await db.execute(select(Organization))).scalars().all()}
    out = []
    for p in profiles:
        u = users_by_id.get(p.user_id)
        org = orgs_by_id.get(p.organization_id)
        out.append({
            "id": str(p.id),
            "name": p.name,
            "email": u.email if u else None,
            "organization_id": str(p.organization_id),
            "organization_name": org.name if org else None,
        })
    return out


class ReassignPatientRequest(BaseModel):
    clinician_id: str  # target practitioner_profile id


@router.post("/patients/{patient_id}/reassign")
async def reassign_patient(
    patient_id: uuid.UUID,
    request: ReassignPatientRequest,
    admin: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    """Move a patient's care to another clinician in the same organization: primary practitioner,
    the patient's treatment plans, and access grants (grant the target, revoke the previous
    clinician). Same-org only, so this can't move a patient across the org boundary."""
    from sqlalchemy import text as sql_text

    patient = (await db.execute(
        select(PatientProfile).where(PatientProfile.id == patient_id)
    )).scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    try:
        target_id = uuid.UUID(request.clinician_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid clinician_id")

    target = (await db.execute(
        select(PractitionerProfile).where(PractitionerProfile.id == target_id)
    )).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Clinician not found")
    if target.organization_id != patient.organization_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="A patient can only be reassigned to a clinician in the same organization.",
        )

    previous_id = patient.primary_practitioner_id
    if previous_id == target_id:
        return {"success": True}  # already this clinician's patient

    patient.primary_practitioner_id = target_id
    await db.execute(
        sql_text("UPDATE treatment_plans SET practitioner_id = :t WHERE patient_id = :pid"),
        {"t": str(target_id), "pid": str(patient_id)},
    )

    # Give the target a live grant if it has none; revoke the previous clinician's.
    existing = (await db.execute(
        sql_text(
            "SELECT 1 FROM patient_access_grants WHERE patient_id = :pid "
            "AND practitioner_id = :t AND revoked_at IS NULL"
        ),
        {"pid": str(patient_id), "t": str(target_id)},
    )).first()
    if not existing:
        await db.execute(
            sql_text(
                "INSERT INTO patient_access_grants "
                "(patient_id, practitioner_id, organization_id, created_at) "
                "VALUES (:pid, :t, :org, now())"
            ),
            {"pid": str(patient_id), "t": str(target_id), "org": str(patient.organization_id)},
        )
    if previous_id:
        await db.execute(
            sql_text(
                "UPDATE patient_access_grants SET revoked_at = now() "
                "WHERE patient_id = :pid AND practitioner_id = :prev AND revoked_at IS NULL"
            ),
            {"pid": str(patient_id), "prev": str(previous_id)},
        )

    await db.commit()
    return {"success": True}


# ─────────────────────────── JIT content ────────────────────────────
# Platform-wide tag vocabulary + tips library for the teen exposure screen.

class TagCreate(BaseModel):
    slug: str
    label: str


class TagUpdate(BaseModel):
    label: str | None = None
    is_active: bool | None = None


class JitTipPayload(BaseModel):
    title: str
    body: str
    always_show: bool = False
    display_order: int = 0
    is_active: bool = True
    audience: str = "teen"  # 'teen' (child exposure screen) | 'parent' (parent app)
    tag_ids: list[str] = []


def _tag_out(t: Tag) -> dict:
    return {"id": str(t.id), "slug": t.slug, "label": t.label, "is_active": t.is_active}


# ── Process checklist, per organization ──────────────────────────────────────
# Float-team managed (owner call, 2026-08-24): platform admin can do everything —
# add, edit, reorder, delete — and organizations cannot edit their own list.
class ChecklistItemIn(BaseModel):
    text: str
    link_icon: Optional[str] = None
    link_label: Optional[str] = None
    nav_label: Optional[str] = None
    nav_action: Optional[str] = None


class ChecklistItemPatch(BaseModel):
    text: Optional[str] = None
    link_icon: Optional[str] = None
    link_label: Optional[str] = None
    nav_label: Optional[str] = None
    nav_action: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None


class ChecklistReorder(BaseModel):
    ordered_ids: list[uuid.UUID]


@router.get("/organizations/{org_id}/checklist-items")
async def admin_list_checklist_items(
    org_id: uuid.UUID,
    _: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    rows = await checklist_items.list_items(db, org_id, include_inactive=True)
    return [checklist_item_out(r) for r in rows]


@router.post("/organizations/{org_id}/checklist-items", status_code=status.HTTP_201_CREATED)
async def admin_create_checklist_item(
    org_id: uuid.UUID,
    body: ChecklistItemIn,
    _: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    row = await checklist_items.create_item(db, org_id, body.model_dump())
    return checklist_item_out(row)


@router.put("/checklist-items/{item_id}")
async def admin_update_checklist_item(
    item_id: uuid.UUID,
    body: ChecklistItemPatch,
    _: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    row = await checklist_items.update_item(db, item_id, body.model_dump(exclude_unset=True))
    return checklist_item_out(row)


@router.delete("/checklist-items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def admin_delete_checklist_item(
    item_id: uuid.UUID,
    _: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    await checklist_items.delete_item(db, item_id)


@router.put("/organizations/{org_id}/checklist-items/reorder")
async def admin_reorder_checklist_items(
    org_id: uuid.UUID,
    body: ChecklistReorder,
    _: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    rows = await checklist_items.reorder_items(db, org_id, body.ordered_ids)
    return [checklist_item_out(r) for r in rows]


@router.get("/tags")
async def list_tags(
    _: User = Depends(get_admin_context), db: AsyncSession = Depends(get_db)
):
    rows = (await db.execute(select(Tag).order_by(Tag.label))).scalars().all()
    return [_tag_out(t) for t in rows]


@router.post("/tags")
async def create_tag(
    body: TagCreate, _: User = Depends(get_admin_context), db: AsyncSession = Depends(get_db)
):
    slug = body.slug.strip().lower()
    label = body.label.strip()
    if not slug or not label:
        raise HTTPException(status_code=400, detail="Slug and label are required")
    exists = (await db.execute(select(Tag).where(Tag.slug == slug))).scalar_one_or_none()
    if exists:
        raise HTTPException(status_code=409, detail="A tag with that slug already exists")
    tag = Tag(slug=slug, label=label)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return _tag_out(tag)


@router.put("/tags/{tag_id}")
async def update_tag(
    tag_id: uuid.UUID,
    body: TagUpdate,
    _: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    tag = (await db.execute(select(Tag).where(Tag.id == tag_id))).scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    if body.label is not None:
        tag.label = body.label.strip()
    if body.is_active is not None:
        tag.is_active = body.is_active
    await db.commit()
    await db.refresh(tag)
    return _tag_out(tag)


@router.delete("/tags/{tag_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tag(
    tag_id: uuid.UUID,
    _: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    tag = (await db.execute(select(Tag).where(Tag.id == tag_id))).scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    # ON DELETE CASCADE clears the tip/situation join rows.
    await db.delete(tag)
    await db.commit()


async def _tip_out(db: AsyncSession, tip: JitTip) -> dict:
    tag_ids = (
        await db.execute(select(JitTipTag.tag_id).where(JitTipTag.jit_tip_id == tip.id))
    ).scalars().all()
    return {
        "id": str(tip.id),
        "title": tip.title,
        "body": tip.body,
        "always_show": tip.always_show,
        "display_order": tip.display_order,
        "is_active": tip.is_active,
        "audience": tip.audience,
        "tag_ids": [str(t) for t in tag_ids],
    }


@router.get("/jit-tips")
async def list_jit_tips(
    _: User = Depends(get_admin_context), db: AsyncSession = Depends(get_db)
):
    tips = (
        await db.execute(select(JitTip).order_by(JitTip.display_order, JitTip.created_at))
    ).scalars().all()
    return [await _tip_out(db, t) for t in tips]


@router.post("/jit-tips")
async def create_jit_tip(
    body: JitTipPayload,
    _: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    if not body.title.strip() or not body.body.strip():
        raise HTTPException(status_code=400, detail="Title and body are required")
    tip = JitTip(
        title=body.title.strip(),
        body=body.body.strip(),
        always_show=body.always_show,
        display_order=body.display_order,
        is_active=body.is_active,
        audience=body.audience,
    )
    db.add(tip)
    await db.flush()
    for tid in body.tag_ids:
        db.add(JitTipTag(jit_tip_id=tip.id, tag_id=uuid.UUID(tid)))
    await db.commit()
    await db.refresh(tip)
    return await _tip_out(db, tip)


@router.put("/jit-tips/{tip_id}")
async def update_jit_tip(
    tip_id: uuid.UUID,
    body: JitTipPayload,
    _: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    tip = (await db.execute(select(JitTip).where(JitTip.id == tip_id))).scalar_one_or_none()
    if not tip:
        raise HTTPException(status_code=404, detail="Tip not found")
    tip.title = body.title.strip()
    tip.body = body.body.strip()
    tip.always_show = body.always_show
    tip.display_order = body.display_order
    tip.is_active = body.is_active
    tip.audience = body.audience
    tip.updated_at = datetime.now(timezone.utc)
    await db.execute(delete(JitTipTag).where(JitTipTag.jit_tip_id == tip.id))
    for tid in body.tag_ids:
        db.add(JitTipTag(jit_tip_id=tip.id, tag_id=uuid.UUID(tid)))
    await db.commit()
    await db.refresh(tip)
    return await _tip_out(db, tip)


@router.delete("/jit-tips/{tip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_jit_tip(
    tip_id: uuid.UUID,
    _: User = Depends(get_admin_context),
    db: AsyncSession = Depends(get_db),
):
    tip = (await db.execute(select(JitTip).where(JitTip.id == tip_id))).scalar_one_or_none()
    if not tip:
        raise HTTPException(status_code=404, detail="Tip not found")
    await db.delete(tip)
    await db.commit()
