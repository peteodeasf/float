"""Fill an empty LOCAL database with demo accounts and one family in treatment.

    cd backend
    python seed_local.py

Uses DATABASE_URL, the same as the app. Refuses to run unless the database host is localhost or
127.0.0.1 — on Peter's laptop `.env` points at production, and this must never write there.

What it makes: one practice with one clinician (an admin of the practice), a Float admin, and one
family — a teen ("Sarah Mitchell") and a parent, linked — with a treatment plan built from the
example content in seed_demo.py: situations, avoidance and safety behaviours, a downward arrow,
completed and upcoming experiments, session notes and an action plan.

Running it again changes nothing: every account is looked up by email first, and the treatment
content is only written when the child's plan is first made.

Built through the app's models rather than raw SQL, so a migration that renames a column breaks
this script in the tests (tests/test_seed_local.py) rather than on someone's laptop.
"""
import asyncio
import sys
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import urlsplit

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import hash_password
from app.models.action_plan import ActionPlan
from app.models.downward_arrow import DownwardArrow
from app.models.experiment import Experiment
from app.models.organization import Organization
from app.models.patient import (
    ParentPatientLink,
    PatientAccessGrant,
    PatientParentContact,
    PatientProfile,
    PractitionerProfile,
)
from app.models.session_note import SessionNote
from app.models.treatment import AvoidanceBehavior, TreatmentPlan, TriggerSituation
from app.models.user import User, UserRole

LOCAL_HOSTS = {"localhost", "127.0.0.1"}

PRACTICE_NAME = "Float Demo Practice"
FLOAT_ORG_NAME = "Float"

# For the local database only. Never used anywhere real.
PASSWORD = "LocalDemo2026!"


@dataclass(frozen=True)
class Account:
    email: str
    name: str
    role: str
    sign_in_at: str


CLINICIAN = Account("clinician.demo@example.com", "Dr. Alex Walker", "practitioner", "/login")
ADMIN = Account("admin.demo@example.com", "Float Admin", "admin", "/admin/login")
PARENT = Account("parent.demo@example.com", "Jennifer Mitchell", "parent", "/parent/login")
CHILD = Account("teen.demo@example.com", "Sarah Mitchell", "patient", "/teen/login")
ACCOUNTS = [CLINICIAN, ADMIN, PARENT, CHILD]


class NotALocalDatabase(Exception):
    pass


def require_local_database(url: str) -> None:
    """Refuse any database that is not on this machine. Raises NotALocalDatabase saying why."""
    host = urlsplit(url).hostname
    if host not in LOCAL_HOSTS:
        raise NotALocalDatabase(
            f"Refusing to seed: the database host is {host or 'not set'}, not localhost or "
            "127.0.0.1. This script writes demo accounts and must only ever run against a local "
            "database. Check DATABASE_URL."
        )


# ── Accounts ──────────────────────────────────────────────────────────────────

async def _org(db: AsyncSession, name: str) -> Organization:
    org = (await db.execute(select(Organization).where(Organization.name == name))).scalars().first()
    if org is None:
        org = Organization(name=name, type="clinic", settings={}, status="active")
        db.add(org)
        await db.flush()
    return org


async def _user(db: AsyncSession, account: Account, org: Organization, is_org_admin=False) -> User:
    """The account and its role in `org`. Left alone if it is already there."""
    user = (await db.execute(select(User).where(User.email == account.email))).scalar_one_or_none()
    if user is None:
        user = User(
            email=account.email,
            password_hash=hash_password(PASSWORD),
            # Past the clinician setup screens, so the clinician app opens straight away.
            setup_completed_at=datetime.now(timezone.utc),
            onboarding_flags=["details", "practice", "agreements"],
        )
        db.add(user)
        await db.flush()
    role = (await db.execute(select(UserRole).where(
        UserRole.user_id == user.id,
        UserRole.organization_id == org.id,
        UserRole.role == account.role,
    ))).scalar_one_or_none()
    if role is None:
        db.add(UserRole(user_id=user.id, organization_id=org.id, role=account.role,
                        is_org_admin=is_org_admin))
        await db.flush()
    return user


async def _one(db: AsyncSession, model, **where):
    stmt = select(model)
    for column, value in where.items():
        stmt = stmt.where(getattr(model, column) == value)
    return (await db.execute(stmt)).scalar_one_or_none()


async def seed(db: AsyncSession) -> list[Account]:
    """Add everything that is missing. Flushes but never commits — the caller decides."""
    practice = await _org(db, PRACTICE_NAME)
    float_org = await _org(db, FLOAT_ORG_NAME)

    await _user(db, ADMIN, float_org)

    clinician_user = await _user(db, CLINICIAN, practice, is_org_admin=True)
    clinician = await _one(db, PractitionerProfile, user_id=clinician_user.id)
    if clinician is None:
        clinician = PractitionerProfile(user_id=clinician_user.id, organization_id=practice.id,
                                        name=CLINICIAN.name, credentials="PhD")
        db.add(clinician)
        await db.flush()

    child_user = await _user(db, CHILD, practice)
    child = await _one(db, PatientProfile, user_id=child_user.id)
    if child is None:
        now = datetime.now(timezone.utc)
        child = PatientProfile(
            user_id=child_user.id,
            organization_id=practice.id,
            name=CHILD.name,
            age=16,
            gender="Female",
            parent_name=PARENT.name,
            parent_email=PARENT.email,
            teen_email=CHILD.email,
            teen_invited_at=now,
            child_connect_consent_at=now,
            consent_source="clinician",
            primary_practitioner_id=clinician.id,
        )
        db.add(child)
        await db.flush()
        db.add(PatientParentContact(patient_id=child.id, name=PARENT.name, email=PARENT.email,
                                    position=0))

    # The clinician sees the child because of this grant, as when a clinician adds a patient.
    if await _one(db, PatientAccessGrant, patient_id=child.id, practitioner_id=clinician.id,
                  revoked_at=None) is None:
        db.add(PatientAccessGrant(patient_id=child.id, practitioner_id=clinician.id,
                                  organization_id=practice.id))

    parent_user = await _user(db, PARENT, practice)
    if await _one(db, ParentPatientLink, parent_user_id=parent_user.id, patient_id=child.id) is None:
        db.add(ParentPatientLink(parent_user_id=parent_user.id, patient_id=child.id,
                                 organization_id=practice.id))
    await db.flush()

    if await _one(db, TreatmentPlan, patient_id=child.id) is None:
        await _treatment(db, practice, clinician, child)

    return ACCOUNTS


# ── Treatment: the example content from seed_demo.py ──────────────────────────

FEARED_OUTCOME = (
    "Everyone in school will find out I have no friends and nobody will ever want to be my friend."
)


def _at_noon(day: date) -> datetime:
    return datetime.combine(day, time(12), tzinfo=timezone.utc)


async def _treatment(db, practice, clinician, child) -> None:
    today = date.today()

    def days_ago(n: int) -> date:
        return today - timedelta(days=n)

    org_id = practice.id
    plan = TreatmentPlan(
        patient_id=child.id,
        organization_id=org_id,
        practitioner_id=clinician.id,
        status="active",
        nickname="The Voice",
        activated_at=datetime.now(timezone.utc),
        ladder_active=True,
    )
    db.add(plan)
    await db.flush()

    situations = {}
    for order, (key, name, dt, active) in enumerate([
        ("cafeteria", "Eating lunch in the cafeteria", 6, True),
        ("raising_hand", "Raising hand to answer a question in class", 7, True),
        ("talking_new", "Talking to someone new at school", 8, False),
    ]):
        situations[key] = TriggerSituation(
            treatment_plan_id=plan.id, organization_id=org_id, name=name,
            distress_thermometer_rating=dt, is_active=active, display_order=order,
        )
    db.add_all(situations.values())
    await db.flush()

    behaviors = {}
    for key, situation, name, behavior_type, dt in [
        ("headphones", "cafeteria", "Wears headphones so nobody talks to her", "safety", 5),
        ("bathroom", "cafeteria", "Eats in the bathroom or library to avoid cafeteria", "avoidance", 8),
        ("friend", "cafeteria", "Only goes to cafeteria if a close friend is with her", "safety", 6),
        ("not_raise", "raising_hand", "Doesn't raise hand even when she knows the answer", "avoidance", 7),
        ("pretend", "raising_hand", "Pretends to look at notes to avoid eye contact with teacher", "safety", 5),
    ]:
        behaviors[key] = AvoidanceBehavior(
            trigger_situation_id=situations[situation].id, treatment_plan_id=plan.id,
            organization_id=org_id, name=name, behavior_type=behavior_type,
            distress_thermometer_when_refraining=dt,
        )
    db.add_all(behaviors.values())
    await db.flush()

    db.add(DownwardArrow(
        trigger_situation_id=situations["cafeteria"].id,
        patient_id=child.id,
        organization_id=org_id,
        arrow_steps=[
            {"question": "What will happen if you sit in the cafeteria without headphones?",
             "answer": "People will notice me sitting alone and stare at me."},
            {"question": "What will happen if people stare at you?",
             "answer": "They'll think I'm a loser with no friends."},
            {"question": "What will happen if they think you have no friends?",
             "answer": "They'll start talking about me and laughing behind my back."},
            {"question": "What will happen if they laugh behind your back?",
             "answer": "Everyone in school will find out and nobody will ever want to be my friend."},
        ],
        feared_outcome=FEARED_OUTCOME,
        feared_outcome_approved=True,
        bip_derived=75.0,
        facilitated_by="practitioner",
    ))

    # Three a week for three weeks: belief in the feared outcome falling from 75% to 20%.
    for n, bip_before, bip_after, dt_expected, dt_actual, learned in [
        (21, 75, 60, 6, 5, "It was really scary at first but I got through it. Nobody actually looked at me."),
        (19, 60, 55, 5, 4, "Easier than the first time. Still felt weird but I managed to stay the whole lunch."),
        (17, 55, 50, 5, 3, "Starting to think maybe people aren't watching me as much as I thought."),
        (14, 50, 45, 5, 4, "Sat a bit closer to other people today. Nothing bad happened."),
        (12, 45, 40, 4, 3, "The Voice said everyone would stare. Nobody did. The Voice was wrong again."),
        (10, 40, 35, 4, 2, "Made brief eye contact with someone and they just smiled. That was unexpected."),
        (7, 35, 30, 4, 3, "Sat right in the middle of the cafeteria. Heart was pounding but I stayed the whole lunch."),
        (5, 30, 25, 3, 2, "Someone sat near me and we didn't talk but it felt okay. Almost normal."),
        (3, 25, 20, 3, 2, "Starting to feel almost normal in there. Hard to believe this was so scary a few weeks ago."),
    ]:
        day = _at_noon(days_ago(n))
        db.add(Experiment(
            avoidance_behavior_id=behaviors["headphones"].id, patient_id=child.id,
            organization_id=org_id, status="completed",
            scheduled_date=day, completed_date=day,
            bip_before=bip_before, bip_after=bip_after, confidence_level="high",
            plan_description="Sit in the cafeteria without headphones for the full lunch period",
            prediction=FEARED_OUTCOME,
            distress_thermometer_expected=dt_expected, distress_thermometer_actual=dt_actual,
            feared_outcome_occurred=False, what_learned=learned,
        ))

    for n in (1, 3, 5):
        db.add(Experiment(
            avoidance_behavior_id=behaviors["headphones"].id, patient_id=child.id,
            organization_id=org_id, status="committed",
            scheduled_date=_at_noon(today + timedelta(days=n)),
            committed_at=datetime.now(timezone.utc),
            bip_before=20, confidence_level="high",
            plan_description="Make eye contact and smile at someone sitting nearby",
            prediction=FEARED_OUTCOME,
        ))

    for session_type, participants, n, content in [
        ("consultation_1", ["parent"], 35,
         "Session 1 — Parent only. Met with Sarah's mother, Jennifer. Jennifer described Sarah's anxiety as significantly impacting her school life — avoiding the cafeteria, refusing to attend school events, declining invitations from classmates. Identified 3 primary trigger situations. Introduced the CBT model and family accommodation concept. Jennifer acknowledged she has been allowing Sarah to eat lunch in her car on bad days. Discussed gradual reduction plan for accommodation. Sarah's nickname for her anxiety: 'The Voice'. Monitoring form reviewed — clear pattern of cafeteria and classroom avoidance."),
        ("consultation_2", ["parent", "patient"], 28,
         "Session 2 — Sarah and Jennifer. Introduced Sarah to the model. She was quiet initially but engaged when we discussed The Voice. Practiced the Distress Thermometer together — Sarah rated cafeteria at 6, raising hand at 7. Explained Worry Hill using the graphic. Sarah understood immediately — said 'so if I just stay, it goes down?' Completed first Downward Arrow for cafeteria situation together — feared outcome: 'Everyone will find out I have no friends and nobody will want to be my friend.' BIP set at 75%. Sarah agreed to try the headphones experiment 3x this week. Jennifer practiced non-accommodating response: 'I know this is hard. I believe you can do this.'"),
        ("weekly_session", ["parent", "patient"], 7,
         "Week 3 check-in. Sarah arrived looking noticeably more relaxed than previous sessions. Reviewed 9 completed experiments — BIP down from 75% to 20%, DT consistently dropping from 6 to 2-3. Sarah said 'The Voice is getting quieter.' Key insight this week: 'I realized nobody is actually watching me. I was the only one who thought they were.' Jennifer reported she has not allowed car lunches in 3 weeks — accommodation reduction on track. Sarah is ready to move to the next behavior. New action plan: eye contact and smile experiment 3x next week. Discussed moving to the raising hand situation once cafeteria ladder is complete — Sarah said she's actually looking forward to it."),
    ]:
        db.add(SessionNote(
            patient_id=child.id, organization_id=org_id, practitioner_id=clinician.id,
            session_type=session_type, participants=participants,
            session_date=days_ago(n), content=content,
        ))

    db.add(ActionPlan(
        patient_id=child.id, organization_id=org_id, practitioner_id=clinician.id,
        session_number=3, session_date=days_ago(7), visible_to_patient=True,
        content="""<p>Hi Sarah,</p>
<p>Great work this week — <strong>The Voice is getting quieter</strong> and your numbers show it. BIP down to 20%, fear level down to 2. That's real progress.</p>
<p><strong>Your experiments this week:</strong></p>
<ul>
<li>Monday, Wednesday, Friday at lunch — sit in the cafeteria as usual</li>
<li>This time: make eye contact with someone nearby and smile</li>
<li>You don't need to say anything — just a smile is enough</li>
</ul>
<p><strong>Your prediction to test:</strong> "Everyone will find out I have no friends and nobody will want to be my friend."</p>
<p>After each experiment, record what actually happened. Was The Voice right?</p>
<p>I believe you can do this.</p>
<p>— Dr. Walker</p>""",
    ))
    await db.flush()


# ── Running it ────────────────────────────────────────────────────────────────

def database_url() -> str:
    from app.core.config import settings
    return settings.ASYNC_DATABASE_URL or settings.DATABASE_URL


async def main() -> None:
    url = database_url()
    try:
        require_local_database(url)
    except NotALocalDatabase as e:
        sys.exit(str(e))

    engine = create_async_engine(url)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as db:
            accounts = await seed(db)
            await db.commit()
    finally:
        await engine.dispose()

    print(f"Seeded {urlsplit(url).hostname}{urlsplit(url).path}. Local accounts:\n")
    for a in accounts:
        print(f"  {a.role:<13} {a.email:<28} {PASSWORD}   sign in at {a.sign_in_at}")


if __name__ == "__main__":
    asyncio.run(main())
