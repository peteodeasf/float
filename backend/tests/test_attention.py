"""What needs a clinician's attention on a patient — the same list on the patient list and page.

Peter, 2026-09-11: the list's three reasons, a missed weekly check-in, an exposure marked too hard,
and what is new (the child finished rating, the parent named accommodations). Not "Gave in", not
unanswered messages. Plan: docs/plans/clinician-notifications.md
"""
from datetime import date, datetime, time, timedelta, timezone

from app.models.experiment import AccommodationBehavior, AccommodationCheckin, Experiment
from app.services.attention_service import attention_for
from app.services.insight_service import parent_named_accommodation, situation_insight_for

from tests.factories import grant_patient_to, make_org, make_patient, make_plan, make_practitioner, make_situation
from tests.test_role_boundary import _parent_of

NOW = datetime.now(timezone.utc)


async def _patient(db, plan_status="setup"):
    org = await make_org(db)
    child = await make_patient(db, org, name="Sam Rivera")
    plan = await make_plan(db, org, patient=child)
    plan.status = plan_status
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, child, clinician, owner=True)
    await db.flush()
    return org, child, plan, clinician


def _kinds(reasons):
    return [r["kind"] for r in reasons]


def _exp(org, child, **kw):
    return Experiment(patient_id=child.id, organization_id=org.id, plan_description="Say hi to Jack", **kw)


async def test_an_exposure_whose_day_passed_with_nothing_recorded(db):
    org, child, _, _ = await _patient(db)
    db.add_all([
        _exp(org, child, status="committed", scheduled_date=NOW - timedelta(days=2)),
        _exp(org, child, status="planned", scheduled_date=NOW - timedelta(days=3)),
        _exp(org, child, status="completed", scheduled_date=NOW - timedelta(days=2)),
        _exp(org, child, status="committed", scheduled_date=NOW + timedelta(days=2)),
    ])
    await db.flush()

    [overdue] = [r for r in await attention_for(db, child) if r["kind"] == "overdue"]
    assert overdue["tone"] == "problem"
    assert overdue["text"] == "2 exposures passed with nothing recorded"
    assert [i["name"] for i in overdue["items"]] == ["Say hi to Jack", "Say hi to Jack"]


async def test_an_active_plan_with_nothing_done_this_week(db):
    org, child, _, _ = await _patient(db, plan_status="active")
    assert "no_activity" in _kinds(await attention_for(db, child))

    db.add(_exp(org, child, status="completed", completed_date=NOW - timedelta(days=1),
                created_at=NOW - timedelta(days=20)))
    await db.flush()
    assert "no_activity" not in _kinds(await attention_for(db, child))


async def _focus(db, org, plan, child, added_days_ago):
    parent = await _parent_of(db, org, child)
    focus = AccommodationBehavior(treatment_plan_id=plan.id, organization_id=org.id,
                                  name="Lies down with them until asleep", is_weekly_focus=True,
                                  status="started", created_at=NOW - timedelta(days=added_days_ago))
    db.add(focus)
    await db.flush()
    return parent, focus


def _last_monday() -> date:
    today = NOW.date()
    return today - timedelta(days=today.weekday()) - timedelta(days=7)


async def test_no_weekly_check_in_last_week(db):
    org, child, plan, _ = await _patient(db)
    parent, focus = await _focus(db, org, plan, child, added_days_ago=30)
    assert "checkin_missed" in _kinds(await attention_for(db, child))

    db.add(AccommodationCheckin(treatment_plan_id=plan.id, accommodation_id=focus.id,
                                parent_user_id=parent.id, organization_id=org.id,
                                week_start=_last_monday(), answer="mostly"))
    await db.flush()
    assert "checkin_missed" not in _kinds(await attention_for(db, child))


async def test_not_for_a_focus_that_has_not_had_a_full_week(db):
    org, child, plan, _ = await _patient(db)
    await _focus(db, org, plan, child, added_days_ago=0)
    assert "checkin_missed" not in _kinds(await attention_for(db, child))


async def test_gave_in_is_not_a_reason(db):
    """Peter is still unsure about "Gave in", so it is not flagged."""
    org, child, plan, _ = await _patient(db)
    parent, focus = await _focus(db, org, plan, child, added_days_ago=30)
    db.add(AccommodationCheckin(treatment_plan_id=plan.id, accommodation_id=focus.id,
                                parent_user_id=parent.id, organization_id=org.id,
                                week_start=_last_monday(), answer="gave_in"))
    await db.flush()
    assert _kinds(await attention_for(db, child)) == []


async def test_an_exposure_marked_too_hard_this_week(db):
    org, child, _, _ = await _patient(db)
    db.add_all([
        _exp(org, child, status="too_hard", too_hard_at=NOW - timedelta(days=2)),
        _exp(org, child, status="too_hard", too_hard_at=NOW - timedelta(days=12)),
    ])
    await db.flush()

    [too_hard] = [r for r in await attention_for(db, child) if r["kind"] == "too_hard"]
    assert too_hard["text"] == "Marked 1 exposure too hard this week"


async def test_new_the_child_finished_rating(db):
    org, child, plan, _ = await _patient(db)
    rated = NOW - timedelta(days=1)
    db.add_all([
        AccommodationBehavior(treatment_plan_id=plan.id, organization_id=org.id, name="A",
                              child_rating_requested_at=NOW - timedelta(days=3), child_rated_at=rated),
        AccommodationBehavior(treatment_plan_id=plan.id, organization_id=org.id, name="B",
                              child_rating_requested_at=NOW - timedelta(days=3), child_rated_at=None),
    ])
    await db.flush()
    assert "ratings_done" not in _kinds(await attention_for(db, child))

    b = [a for a in (await db.execute(__import__("sqlalchemy").select(AccommodationBehavior).where(
        AccommodationBehavior.treatment_plan_id == plan.id))).scalars() if a.name == "B"][0]
    b.child_rated_at = rated
    await db.flush()
    [done] = [r for r in await attention_for(db, child) if r["kind"] == "ratings_done"]
    assert done["tone"] == "new"


async def test_new_the_parent_named_accommodations(db):
    org, child, plan, _ = await _patient(db)
    situation = await make_situation(db, plan, name="Bedtime")
    sit = await situation_insight_for(db, patient_id=child.id, organization_id=org.id, situation=situation)
    await parent_named_accommodation(db, patient_id=child.id, organization_id=org.id,
                                     situation_insight=sit, name="Leaves the hall light on", user_id=None)
    await db.flush()

    [named] = [r for r in await attention_for(db, child) if r["kind"] == "parent_named"]
    assert named["text"] == "The parent named 1 accommodation: see the suggestions"
    assert named["tone"] == "new"


async def test_problems_come_before_what_is_new(db):
    org, child, plan, _ = await _patient(db, plan_status="active")
    db.add(AccommodationBehavior(treatment_plan_id=plan.id, organization_id=org.id, name="A",
                                 child_rating_requested_at=NOW - timedelta(days=3),
                                 child_rated_at=NOW - timedelta(days=1)))
    await db.flush()
    tones = [r["tone"] for r in await attention_for(db, child)]
    assert tones == sorted(tones, key=lambda t: t != "problem")
    assert "problem" in tones and "new" in tones


async def test_a_closed_patient_needs_nothing(db):
    org, child, _, _ = await _patient(db, plan_status="active")
    child.closed_at = NOW
    await db.flush()
    assert await attention_for(db, child) == []


async def test_the_list_and_the_page_agree(api, db):
    org, child, plan, clinician = await _patient(db, plan_status="active")
    # Set up weeks ago, so it is not itself this week's activity.
    db.add(_exp(org, child, status="committed", scheduled_date=NOW - timedelta(days=2),
                created_at=NOW - timedelta(days=20)))
    await db.flush()

    api.sign_in_as(clinician.user)
    page = (await api.get(f"/patients/{child.id}/attention")).json()
    [row] = [p for p in (await api.get("/patients")).json() if p["id"] == str(child.id)]
    assert row["attention"] == page
    assert {"overdue", "no_activity"} <= set(_kinds(page))


async def test_a_clinician_without_access_sees_nothing(api, db):
    org, child, _, _ = await _patient(db)
    colleague = await make_practitioner(db, org)
    api.sign_in_as(colleague.user)
    assert (await api.get(f"/patients/{child.id}/attention")).status_code in (403, 404)
