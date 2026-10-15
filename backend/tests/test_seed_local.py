"""The local demo data script, backend/seed_local.py.

It builds its rows through the models, so these tests are what notice when a migration leaves it
behind: a renamed or newly required column fails here in CI, not on someone's laptop the next
time they need demo data.
"""
import pytest
from sqlalchemy import func, select

from app.core.security import verify_password
from app.models.action_plan import ActionPlan
from app.models.downward_arrow import DownwardArrow
from app.models.experiment import Experiment
from app.models.patient import ParentPatientLink, PatientAccessGrant, PatientProfile
from app.models.session_note import SessionNote
from app.models.treatment import AvoidanceBehavior, TreatmentPlan, TriggerSituation
from app.models.user import User, UserRole
from seed_local import (
    ACCOUNTS, CHILD, CLINICIAN, PARENT, PASSWORD,
    NotALocalDatabase, require_local_database, seed,
)

COUNTED = [User, UserRole, PatientProfile, ParentPatientLink, PatientAccessGrant, TreatmentPlan,
           TriggerSituation, AvoidanceBehavior, DownwardArrow, Experiment, SessionNote, ActionPlan]


async def _counts(db) -> dict:
    return {m.__name__: (await db.execute(select(func.count()).select_from(m))).scalar_one()
            for m in COUNTED}


async def _user(db, email) -> User:
    return (await db.execute(select(User).where(User.email == email))).scalar_one()


# Why: each of the four accounts has to land with the role the sign-in code reads, or the app it is
# meant for will not open.
async def test_seed_makes_each_account_with_its_role(db):
    await seed(db)
    for account in ACCOUNTS:
        user = await _user(db, account.email)
        roles = (await db.execute(select(UserRole.role).where(UserRole.user_id == user.id))).scalars().all()
        assert roles == [account.role], account.email
        assert verify_password(PASSWORD, user.password_hash)


# Why: the item asks that running the script twice neither fails nor duplicates anything.
async def test_running_the_seed_twice_adds_nothing(db):
    await seed(db)
    first = await _counts(db)
    await seed(db)
    assert await _counts(db) == first


# Why: an account that exists but cannot reach its data is no use for screenshots. This walks each
# one through the real API — the clinician sees the child, the parent is linked to the child, the
# child is the child — so a missing grant, link or readiness flag shows up here.
async def test_each_account_reaches_its_own_app(api, db):
    await seed(db)

    api.sign_in_as(await _user(db, CLINICIAN.email))
    me = (await api.get("/auth/me")).json()
    assert me["role"] == "practitioner" and me["is_practitioner"] and me["setup_complete"]
    patients = await api.get("/patients")
    assert patients.status_code == 200
    assert CHILD.name in [p["name"] for p in patients.json()]

    api.sign_in_as(await _user(db, PARENT.email))
    me = (await api.get("/auth/me")).json()
    assert me["role"] == "parent" and me["patient_name"] == CHILD.name

    api.sign_in_as(await _user(db, CHILD.email))
    me = (await api.get("/auth/me")).json()
    assert me["role"] == "patient" and me["is_patient"] and me["patient_name"] == CHILD.name


# Why: the treatment content is what makes the screens look real. Counts match seed_demo.py, which
# it is copied from.
async def test_seed_builds_the_childs_treatment(db):
    await seed(db)
    child_user = await _user(db, CHILD.email)
    child = (await db.execute(select(PatientProfile).where(PatientProfile.user_id == child_user.id))).scalar_one()
    plan = (await db.execute(select(TreatmentPlan).where(TreatmentPlan.patient_id == child.id))).scalar_one()

    async def count(model, *where):
        return (await db.execute(select(func.count()).select_from(model).where(*where))).scalar_one()

    assert await count(TriggerSituation, TriggerSituation.treatment_plan_id == plan.id) == 3
    assert await count(AvoidanceBehavior, AvoidanceBehavior.treatment_plan_id == plan.id) == 5
    assert await count(DownwardArrow, DownwardArrow.patient_id == child.id) == 1
    assert await count(Experiment, Experiment.patient_id == child.id, Experiment.status == "completed") == 9
    assert await count(Experiment, Experiment.patient_id == child.id, Experiment.status == "committed") == 3
    assert await count(SessionNote, SessionNote.patient_id == child.id) == 3
    assert await count(ActionPlan, ActionPlan.patient_id == child.id) == 1


# Why: on Peter's laptop DATABASE_URL points at production. The script must refuse any host that
# is not this machine, before it connects.
@pytest.mark.parametrize("url", [
    "postgresql+asyncpg://u:p@junction.proxy.rlwy.net:51458/railway",
    "postgresql+asyncpg://u:p@db.example.com/float",
    "postgresql+asyncpg://u:p@localhost.example.com/float",
    "postgresql+asyncpg:///float_dev",
])
def test_seed_refuses_a_database_that_is_not_local(url):
    with pytest.raises(NotALocalDatabase):
        require_local_database(url)


@pytest.mark.parametrize("url", [
    "postgresql+asyncpg://float:float@localhost:5432/float_dev",
    "postgresql+asyncpg://float:float@127.0.0.1:55432/float_test",
])
def test_seed_accepts_a_local_database(url):
    require_local_database(url)
