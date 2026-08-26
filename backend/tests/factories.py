"""Minimal row builders.

Only what a ladder test needs: an org, a patient, a plan, situations, rungs. Everything is added
to the caller's session and flushed, never committed — the `db` fixture rolls the whole test back.
"""
import uuid

from app.models.organization import Organization
from app.models.patient import PatientProfile, PractitionerProfile
from app.models.treatment import TreatmentPlan, TriggerSituation, AvoidanceBehavior
from app.models.user import User, UserRole


async def make_org(db) -> Organization:
    org = Organization(name=f"Test Org {uuid.uuid4().hex[:6]}", type="clinic", settings={})
    db.add(org)
    await db.flush()
    return org


async def _make_user(db, org, role: str) -> User:
    """A user plus its role row — the org and role live on `user_roles`, not on `users`."""
    u = User(
        email=f"{role}-{uuid.uuid4().hex[:8]}@test.invalid",
        password_hash="not-a-real-hash",
    )
    db.add(u)
    await db.flush()
    db.add(UserRole(user_id=u.id, organization_id=org.id, role=role))
    await db.flush()
    return u


async def make_plan(db, org) -> TreatmentPlan:
    """A plan, with the patient and practitioner rows it cannot exist without."""
    pat_user = await _make_user(db, org, "patient")
    patient = PatientProfile(user_id=pat_user.id, organization_id=org.id, name="Test Patient")
    prac_user = await _make_user(db, org, "practitioner")
    practitioner = PractitionerProfile(
        user_id=prac_user.id, organization_id=org.id, name="Test Clinician"
    )
    db.add_all([patient, practitioner])
    await db.flush()

    plan = TreatmentPlan(
        patient_id=patient.id,
        organization_id=org.id,
        practitioner_id=practitioner.id,
        status="active",
    )
    db.add(plan)
    await db.flush()
    return plan


async def make_situation(db, plan, name="A hard thing", dt=5, is_placeholder=False) -> TriggerSituation:
    s = TriggerSituation(
        treatment_plan_id=plan.id,
        organization_id=plan.organization_id,
        name=name,
        distress_thermometer_rating=dt,
        is_placeholder=is_placeholder,
    )
    db.add(s)
    await db.flush()
    return s


async def make_rung(db, situation=None, plan=None, name="a rung", dt=4,
                    behavior_type="safety", parent=None) -> AvoidanceBehavior:
    org_id = (situation or plan).organization_id
    b = AvoidanceBehavior(
        trigger_situation_id=situation.id if situation else None,
        treatment_plan_id=(plan.id if plan else (situation.treatment_plan_id if situation else None)),
        organization_id=org_id,
        name=name,
        behavior_type=behavior_type,
        distress_thermometer_when_refraining=dt,
        parent_behavior_id=parent.id if parent else None,
    )
    db.add(b)
    await db.flush()
    return b
