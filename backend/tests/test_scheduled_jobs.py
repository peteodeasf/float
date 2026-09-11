"""The first scheduled jobs: when a reminder goes, to whom, and what it says.

Peter, 2026-09-10: email first; the child on the day of each exposure at the time they picked, the
parent once a week for the check-in, the missed-exposure check; nothing before 8am or after 8pm
where they live, and at most one a day. Plan: docs/plans/scheduled-jobs.md
"""
from datetime import date, datetime, timezone

from app.models.experiment import AccommodationBehavior, AccommodationCheckin, Experiment
from app.services import email_service
from app.services.reminder_jobs import off_token, run_due

from tests.factories import make_org, make_patient, make_plan, make_practitioner
from tests.test_role_boundary import _parent_of

UTC = timezone.utc
NEW_YORK = "America/New_York"  # four hours behind UTC in September


def at(day: int, hour: int, minute: int = 0) -> datetime:
    """A moment in September 2026, in UTC. The 10th is a Thursday, the 13th a Sunday."""
    return datetime(2026, 9, day, hour, minute, tzinfo=UTC)


class Outbox:
    def __init__(self):
        self.sent = []

    async def __call__(self, user, kind):
        self.sent.append((user.id, kind))
        return True


async def _child(db, tz=NEW_YORK, ladder_on=True, invited=True, name="Sam Rivera"):
    org = await make_org(db)
    child = await make_patient(db, org, name=name)
    plan = await make_plan(db, org, patient=child)
    plan.status = "active"
    plan.ladder_active = ladder_on
    child.user.timezone = tz
    if invited:
        child.teen_invited_at = at(1, 12)
    await db.flush()
    return org, child, plan


def _exposure(org, child, when, name="Make eye contact with John"):
    return Experiment(patient_id=child.id, organization_id=org.id, status="committed",
                      scheduled_date=when, scheduled_time_bucket="morning",
                      plan_description=name, prediction="He'll think I'm weird")


# ── The child ─────────────────────────────────────────────────────────────────

async def test_the_child_is_reminded_at_the_time_they_picked_and_only_once(db):
    org, child, _ = await _child(db)
    db.add(_exposure(org, child, at(10, 13)))  # 9am in New York
    await db.flush()

    early, due, later = Outbox(), Outbox(), Outbox()
    await run_due(db, at(10, 12, 55), early)
    await run_due(db, at(10, 13, 5), due)
    await run_due(db, at(10, 13, 20), later)

    assert early.sent == []
    assert due.sent == [(child.user.id, "child_exposure")]
    assert later.sent == []


async def test_not_before_8am_where_they_live(db):
    org, child, _ = await _child(db)
    db.add(_exposure(org, child, at(10, 11)))  # 7am in New York
    await db.flush()

    before, after = Outbox(), Outbox()
    await run_due(db, at(10, 11, 30), before)   # 7:30am
    await run_due(db, at(10, 12, 5), after)     # 8:05am
    assert before.sent == []
    assert after.sent == [(child.user.id, "child_exposure")]


async def test_not_after_8pm_where_they_live(db):
    org, child, _ = await _child(db)
    db.add(_exposure(org, child, at(10, 23, 30)))  # 7:30pm in New York
    await db.flush()

    late = Outbox()
    await run_due(db, at(11, 0, 10), late)  # 8:10pm
    assert late.sent == []


async def test_one_email_however_many_are_due(db):
    org, child, _ = await _child(db)
    db.add_all([_exposure(org, child, at(10, 13)), _exposure(org, child, at(10, 13, 30), "Say hi to Jack")])
    await db.flush()

    out = Outbox()
    await run_due(db, at(10, 14), out)
    assert out.sent == [(child.user.id, "child_exposure")]


async def test_who_gets_no_reminder(db):
    cases = [
        await _child(db, tz=None),               # no time zone recorded yet
        await _child(db, ladder_on=False),       # the clinician has the ladder switched off
        await _child(db, invited=False),         # never invited to the app
    ]
    off = await _child(db)
    off[1].user.reminder_emails_off_at = at(1, 12)   # turned reminder emails off
    closed = await _child(db)
    closed[1].closed_at = at(1, 12)                   # treatment closed
    cases += [off, closed]
    for org, child, _ in cases:
        db.add(_exposure(org, child, at(10, 13)))
    await db.flush()

    out = Outbox()
    await run_due(db, at(10, 13, 5), out)
    assert out.sent == []


# ── The parent ────────────────────────────────────────────────────────────────

async def _parent_with_focus(db):
    org, child, plan = await _child(db)
    parent = await _parent_of(db, org, child)
    parent.timezone = NEW_YORK
    focus = AccommodationBehavior(treatment_plan_id=plan.id, organization_id=org.id,
                                  name="Lies down with them until asleep", is_weekly_focus=True,
                                  status="started")
    db.add(focus)
    await db.flush()
    return org, plan, parent, focus


async def test_the_parent_is_reminded_on_sunday_evening(db):
    _, _, parent, _ = await _parent_with_focus(db)

    saturday, sunday_afternoon, sunday_evening = Outbox(), Outbox(), Outbox()
    await run_due(db, at(12, 22, 10), saturday)          # Saturday 6:10pm
    await run_due(db, at(13, 20, 10), sunday_afternoon)  # Sunday 4:10pm
    await run_due(db, at(13, 22, 10), sunday_evening)    # Sunday 6:10pm
    assert saturday.sent == [] and sunday_afternoon.sent == []
    assert sunday_evening.sent == [(parent.id, "parent_checkin")]


async def test_not_if_they_already_answered_this_week(db):
    org, plan, parent, focus = await _parent_with_focus(db)
    db.add(AccommodationCheckin(treatment_plan_id=plan.id, accommodation_id=focus.id,
                                parent_user_id=parent.id, organization_id=org.id,
                                week_start=date(2026, 9, 7), answer="mostly"))
    await db.flush()

    out = Outbox()
    await run_due(db, at(13, 22, 10), out)
    assert out.sent == []


async def _second_focus(db, org, plan):
    other = AccommodationBehavior(treatment_plan_id=plan.id, organization_id=org.id,
                                  name="Answers for them at the doctor's", is_weekly_focus=True,
                                  status="started")
    db.add(other)
    await db.flush()
    return other


async def test_two_focuses_still_mean_one_email(db):
    org, plan, parent, _ = await _parent_with_focus(db)
    await _second_focus(db, org, plan)

    out = Outbox()
    await run_due(db, at(13, 22, 10), out)
    assert out.sent == [(parent.id, "parent_checkin")]


async def test_with_two_focuses_answering_one_is_not_enough(db):
    org, plan, parent, focus = await _parent_with_focus(db)
    await _second_focus(db, org, plan)
    db.add(AccommodationCheckin(treatment_plan_id=plan.id, accommodation_id=focus.id,
                                parent_user_id=parent.id, organization_id=org.id,
                                week_start=date(2026, 9, 7), answer="mostly"))
    await db.flush()

    out = Outbox()
    await run_due(db, at(13, 22, 10), out)
    assert out.sent == [(parent.id, "parent_checkin")]


async def test_not_after_8pm_on_sunday_either(db):
    await _parent_with_focus(db)
    out = Outbox()
    await run_due(db, at(14, 0, 30), out)  # Sunday 8:30pm in New York
    assert out.sent == []


# ── What the emails say ───────────────────────────────────────────────────────

async def test_the_emails_say_nothing_clinical(db, monkeypatch):
    org, child, _ = await _child(db, name="Sam Rivera")
    db.add(_exposure(org, child, at(10, 13), name="Make eye contact with John"))
    parent_org, _, parent, _ = await _parent_with_focus(db)
    await db.flush()

    captured = []

    async def capture(**kwargs):
        captured.append(kwargs)
        return True

    monkeypatch.setattr(email_service, "send_reminder_email", capture)
    await run_due(db, at(10, 13, 5))   # the child's
    await run_due(db, at(13, 22, 10))  # the parent's

    assert len(captured) == 2
    for email in captured:
        words = " ".join(str(v) for k, v in email.items() if k != "to_email")
        for private in ("Sam", "Rivera", "eye contact", "John", "weird", "Lies down", "asleep"):
            assert private not in words, (private, email["subject"])
        assert "/reminders/off?token=" in email["off_link"]


async def test_the_off_link_turns_them_off(api, db):
    org, child, _ = await _child(db)
    r = await api.post("/reminders/off", json={"token": off_token(child.user.id)})
    assert r.status_code == 200, r.text
    await db.refresh(child.user)
    assert child.user.reminder_emails_off_at is not None

    bad = off_token(child.user.id)[:-4] + "0000"
    assert (await api.post("/reminders/off", json={"token": bad})).status_code == 400
    assert (await api.post("/reminders/off", json={"token": "nonsense"})).status_code == 400
    assert (await api.post("/reminders/off", json={"token": "abc.é"})).status_code == 400


# ── Time zones, and the old buttons ──────────────────────────────────────────

async def test_the_apps_record_the_time_zone(api, db):
    org, child, _ = await _child(db, tz=None)
    api.sign_in_as(child.user)
    r = await api.put("/auth/timezone", json={"timezone": "Europe/Dublin"})
    assert r.status_code == 200, r.text
    await db.refresh(child.user)
    assert child.user.timezone == "Europe/Dublin"
    assert (await api.put("/auth/timezone", json={"timezone": "Mars/Olympus"})).status_code == 422


async def test_the_manual_buttons_are_gone(api, db):
    org = await make_org(db)
    clinician = await make_practitioner(db, org)
    api.sign_in_as(clinician.user)
    for url in ("/admin/send-experiment-reminders", "/admin/detect-missed-experiments"):
        assert (await api.post(url)).status_code in (404, 405), url


# ── The parent, on the day of the child's exposure ────────────────────────────

async def _sharing_parent(db, sharing=True, with_focus=False):
    org, child, plan = await _child(db)
    parent = await _parent_of(db, org, child)
    parent.timezone = NEW_YORK
    if sharing:
        child.progress_shared_with_parent_at = at(1, 12)
    if with_focus:
        db.add(AccommodationBehavior(treatment_plan_id=plan.id, organization_id=org.id,
                                     name="Lies down with them until asleep", is_weekly_focus=True,
                                     status="started"))
    await db.flush()
    return org, child, plan, parent


async def test_the_parent_gets_a_heads_up_that_morning(db):
    org, child, _, parent = await _sharing_parent(db)
    db.add(_exposure(org, child, at(10, 18)))  # 2pm in New York
    await db.flush()

    before_eight, morning, child_time = Outbox(), Outbox(), Outbox()
    await run_due(db, at(10, 11, 55), before_eight)  # 7:55am
    await run_due(db, at(10, 12, 5), morning)        # 8:05am
    await run_due(db, at(10, 18, 5), child_time)     # 2:05pm
    assert before_eight.sent == []
    assert morning.sent == [(parent.id, "parent_exposure")]
    # The child's own comes at their time; the parent's is not sent again.
    assert child_time.sent == [(child.user.id, "child_exposure")]


async def test_not_unless_the_clinician_shares_the_childs_progress(db):
    org, child, _, parent = await _sharing_parent(db, sharing=False)
    db.add(_exposure(org, child, at(10, 18)))
    await db.flush()

    out = Outbox()
    await run_due(db, at(10, 12, 5), out)
    assert (parent.id, "parent_exposure") not in out.sent


async def test_not_for_an_exposure_on_another_day(db):
    org, child, _, parent = await _sharing_parent(db)
    db.add(_exposure(org, child, at(11, 18)))  # tomorrow
    await db.flush()

    out = Outbox()
    await run_due(db, at(10, 12, 5), out)
    assert out.sent == []


async def test_on_sunday_the_check_in_gets_the_days_reminder(db):
    org, child, plan, parent = await _sharing_parent(db, with_focus=True)
    db.add(_exposure(org, child, at(13, 18)))  # Sunday 2pm
    await db.flush()

    morning, evening = Outbox(), Outbox()
    await run_due(db, at(13, 12, 5), morning)   # Sunday 8:05am
    await run_due(db, at(13, 22, 10), evening)  # Sunday 6:10pm
    assert (parent.id, "parent_exposure") not in morning.sent
    assert (parent.id, "parent_checkin") in evening.sent


async def test_on_sunday_with_the_check_in_answered_the_heads_up_goes(db):
    org, child, plan, parent = await _sharing_parent(db, with_focus=True)
    db.add(_exposure(org, child, at(13, 18)))
    focus = (await db.execute(__import__("sqlalchemy").select(AccommodationBehavior).where(
        AccommodationBehavior.treatment_plan_id == plan.id))).scalar_one()
    db.add(AccommodationCheckin(treatment_plan_id=plan.id, accommodation_id=focus.id,
                                parent_user_id=parent.id, organization_id=org.id,
                                week_start=date(2026, 9, 7), answer="every_time"))
    await db.flush()

    out = Outbox()
    await run_due(db, at(13, 12, 5), out)
    assert (parent.id, "parent_exposure") in out.sent


async def test_the_parents_heads_up_says_nothing_clinical(db, monkeypatch):
    org, child, _, parent = await _sharing_parent(db)
    db.add(_exposure(org, child, at(10, 18), name="Make eye contact with John"))
    await db.flush()
    captured = []

    async def capture(**kwargs):
        captured.append(kwargs)
        return True

    monkeypatch.setattr(email_service, "send_reminder_email", capture)
    await run_due(db, at(10, 12, 5))
    [email] = captured
    words = " ".join(str(v) for k, v in email.items() if k != "to_email")
    for private in ("Sam", "Rivera", "eye contact", "John", "weird"):
        assert private not in words, private
    assert email["cta_link"].endswith("/parent/home")

