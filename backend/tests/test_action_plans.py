"""Action plans: saving them whole, their dates, checking in, and who sees what.

docs/plans/action-plans-build.md
"""
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.models.experiment import AccommodationBehavior, Experiment
from app.models.tool import Tool

from tests.factories import (
    grant_patient_to, make_org, make_patient, make_plan, make_practitioner, make_rung, make_situation,
)
from tests.test_role_boundary import _parent_of


async def _family(db):
    org = await make_org(db)
    child = await make_patient(db, org)
    plan = await make_plan(db, org, patient=child)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, child, clinician, owner=True)
    parent = await _parent_of(db, org, child)
    situation = await make_situation(db, plan, name="Lunch")
    rung = await make_rung(db, situation=situation, name="Eat lunch in the cafeteria", dt=5, behavior_type="scenario")
    acc = AccommodationBehavior(treatment_plan_id=plan.id, organization_id=org.id,
                                name="Checks homework every night", status="started")
    tool = Tool(name="The worry hill", summary="A short video", is_published=True)
    # Set up in session with High confidence, so it can go on a plan.
    ready = Experiment(patient_id=child.id, organization_id=org.id, avoidance_behavior_id=rung.id,
                       status="planned", confidence_level="high", prediction="They'll stare",
                       distress_thermometer_expected=5, bip_before=70)
    db.add_all([acc, tool, ready])
    await db.flush()
    return {"org": org, "child": child, "clinician": clinician, "parent": parent,
            "rung": rung, "acc": acc, "tool": tool, "setup": ready}


def _lines(f):
    return [
        {"kind": "exposure", "avoidance_behavior_id": str(f["rung"].id), "text": "Eat lunch in the cafeteria on Tuesday", "note": "With Sam"},
        {"kind": "tool", "tool_id": str(f["tool"].id), "note": "Watch it twice"},
        {"kind": "tool", "text": "Squeeze a stress ball"},
        {"kind": "accommodation", "accommodation_behavior_id": str(f["acc"].id)},
        {"kind": "parent_instruction", "text": "Acknowledge once", "note": "Parent only note"},
        {"kind": "parent_instruction", "text": "Praise trying", "share_with_child": True},
        {"kind": "reward", "text": "Pick the movie", "reward_for": "Lunch"},
    ]


async def _create(api, f, **extra):
    api.sign_in_as(f["clinician"].user)
    r = await api.post(f"/patients/{f['child'].id}/action-plans", json={"items": _lines(f), **extra})
    assert r.status_code == 201, r.text
    return r.json()


def _by_kind(plan, kind):
    return [i for i in plan["items"] if i["kind"] == kind]


async def test_a_plan_is_saved_whole_and_runs_a_week_by_default(api, db):
    f = await _family(db)
    plan = await _create(api, f)
    assert plan["starts_on"] == date.today().isoformat()
    assert plan["ends_on"] == (date.today() + timedelta(days=7)).isoformat()
    assert plan["state"] == "current"
    assert [i["kind"] for i in plan["items"]] == ["exposure", "tool", "tool", "accommodation", "parent_instruction", "parent_instruction", "reward"]
    await db.refresh(f["rung"])
    assert f["rung"].name == "Eat lunch in the cafeteria"  # rewording on the plan leaves the ladder alone


async def test_the_family_sees_it_as_soon_as_it_is_saved(api, db):
    f = await _family(db)
    await _create(api, f)
    api.sign_in_as(f["child"].user)
    mine = (await api.get("/patient/action-plan")).json()
    assert [(i["kind"], i["label"]) for i in mine["items"]] == [
        ("exposure", "Eat lunch in the cafeteria on Tuesday"), ("tool", "The worry hill"),
        ("tool", "Squeeze a stress ball"), ("parent_instruction", "Praise trying"), ("reward", "Pick the movie"),
    ]
    assert "Parent only note" not in str(mine) and "check_note" not in str(mine)
    api.sign_in_as(f["parent"])
    assert len((await api.get("/parent/action-plan")).json()["items"]) == 7


async def test_an_exposure_needs_a_high_set_up_to_go_on(api, db):
    f = await _family(db)
    f["setup"].confidence_level = "medium"
    await db.flush()
    api.sign_in_as(f["clinician"].user)
    r = await api.post(f"/patients/{f['child'].id}/action-plans", json={"items": _lines(f)})
    assert r.status_code == 422 and "High" in r.text


async def test_edit_keeps_ticks_on_kept_lines_and_drops_removed_ones(api, db):
    f = await _family(db)
    plan = await _create(api, f)
    reward = _by_kind(plan, "reward")[0]
    await api.put(f"/action-plan-items/{reward['id']}/tick", json={"done": True})
    await api.put(f"/action-plan-items/{reward['id']}/check-note", json={"note": "Given Friday"})

    # The child has done the exposure since; it stays on the plan without a new set-up.
    f["setup"].status = "completed"
    await db.flush()
    keep = [{**line, "id": item["id"]} for line, item in zip(_lines(f), plan["items"]) if line["kind"] in ("exposure", "reward")]
    r = await api.put(f"/action-plans/{plan['id']}", json={"items": keep, "ends_on": (date.today() + timedelta(days=3)).isoformat()})
    assert r.status_code == 200, r.text
    saved = r.json()
    assert [i["kind"] for i in saved["items"]] == ["exposure", "reward"]
    assert saved["ends_on"] == (date.today() + timedelta(days=3)).isoformat()
    kept = _by_kind(saved, "reward")[0]
    assert (kept["done"], kept["done_by"], kept["check_note"]) == (True, "clinician", "Given Friday")


async def test_an_empty_plan_is_refused(api, db):
    f = await _family(db)
    api.sign_in_as(f["clinician"].user)
    assert (await api.post(f"/patients/{f['child'].id}/action-plans", json={"items": []})).status_code == 422


async def test_a_new_plan_closes_the_one_still_running(api, db):
    f = await _family(db)
    first = await _create(api, f, starts_on=(date.today() - timedelta(days=3)).isoformat())
    second = await _create(api, f)
    plans = (await api.get(f"/patients/{f['child'].id}/action-plans")).json()
    by_id = {p["id"]: p for p in plans}
    # It ends the day the new one starts, so what is recorded at that session counts for it too.
    assert by_id[first["id"]]["ends_on"] == date.today().isoformat()
    assert by_id[second["id"]]["state"] == "current"
    api.sign_in_as(f["child"].user)
    assert (await api.get("/patient/action-plan")).json()["id"] == second["id"]


async def test_a_closed_plan_can_be_checked_in_on_but_not_edited(api, db):
    f = await _family(db)
    old = await _create(api, f, starts_on=(date.today() - timedelta(days=10)).isoformat(),
                        ends_on=(date.today() - timedelta(days=3)).isoformat())
    assert old["state"] == "closed"
    reward = _by_kind(old, "reward")[0]
    assert (await api.put(f"/action-plan-items/{reward['id']}/tick", json={"done": True})).status_code == 200
    r = await api.put(f"/action-plans/{old['id']}", json={"items": [{"kind": "reward", "text": "x"}]})
    assert r.status_code == 409


async def test_family_ticks_tools_and_rewards_only(api, db):
    f = await _family(db)
    plan = await _create(api, f)
    tool = _by_kind(plan, "tool")[0]
    acc = _by_kind(plan, "accommodation")[0]
    reward = _by_kind(plan, "reward")[0]

    api.sign_in_as(f["child"].user)
    r = await api.put(f"/patient/action-plan-items/{tool['id']}/tick", json={"done": True})
    assert r.status_code == 200
    assert (await api.put(f"/patient/action-plan-items/{acc['id']}/tick", json={"done": True})).status_code == 404

    api.sign_in_as(f["parent"])
    r = await api.put(f"/parent/action-plan-items/{reward['id']}/tick", json={"done": True})
    assert r.status_code == 200

    api.sign_in_as(f["clinician"].user)
    saved = (await api.get(f"/patients/{f['child'].id}/action-plans")).json()[0]
    ticks = {i["id"]: (i["done"], i["done_by"]) for i in saved["items"]}
    assert ticks[tool["id"]] == (True, "child") and ticks[reward["id"]] == (True, "parent")
    assert saved["done_count"] == 2


async def test_another_family_cannot_tick(api, db):
    f = await _family(db)
    plan = await _create(api, f)
    reward = _by_kind(plan, "reward")[0]
    g = await _family(db)
    api.sign_in_as(g["parent"])
    assert (await api.put(f"/parent/action-plan-items/{reward['id']}/tick", json={"done": True})).status_code == 404
    api.sign_in_as(g["child"].user)
    assert (await api.put(f"/patient/action-plan-items/{reward['id']}/tick", json={"done": True})).status_code == 404


async def test_an_exposure_is_done_once_recorded_by_the_child_or_the_clinician(api, db):
    f = await _family(db)
    plan = await _create(api, f)
    exposure = _by_kind(plan, "exposure")[0]
    assert exposure["done"] is False
    assert (await api.put(f"/action-plan-items/{exposure['id']}/tick", json={"done": True})).status_code == 422

    after = {"feared_outcome_occurred": False, "what_happened": "Nothing much", "distress_thermometer_actual": 3,
             "bip_after": 30, "what_learned": "It was fine"}
    api.sign_in_as(f["child"].user)
    assert (await api.put(f"/patient/experiments/{f['setup'].id}/after", json=after)).status_code == 200

    api.sign_in_as(f["clinician"].user)
    r = await api.post(f"/patients/{f['child'].id}/exposures/{f['rung'].id}/record", json=after)
    assert r.status_code == 201, r.text

    saved = (await api.get(f"/patients/{f['child'].id}/action-plans")).json()[0]
    ex = _by_kind(saved, "exposure")[0]
    assert ex["done"] is True
    assert [rec["recorded_by"] for rec in ex["recordings"]] == ["child", "clinician"]
    assert ex["recordings"][0]["fear_expected"] == 5.0 and ex["recordings"][0]["fear_felt"] == 3.0
    # The clinician's recording copied the set-up answers into a new exposure.
    rows = (await db.execute(select(Experiment).where(Experiment.avoidance_behavior_id == f["rung"].id))).scalars().all()
    assert len(rows) == 2 and all(r.prediction == "They'll stare" for r in rows)


async def test_recordings_outside_the_plan_dates_do_not_count(api, db):
    f = await _family(db)
    plan = await _create(api, f)
    f["setup"].status = "completed"
    f["setup"].completed_date = datetime.now(timezone.utc) - timedelta(days=20)
    await db.flush()
    api.sign_in_as(f["clinician"].user)
    saved = (await api.get(f"/patients/{f['child'].id}/action-plans")).json()[0]
    assert _by_kind(saved, "exposure")[0]["done"] is False


async def test_a_clinician_cannot_record_another_childs_step(api, db):
    f = await _family(db)
    g = await _family(db)
    api.sign_in_as(f["clinician"].user)
    after = {"feared_outcome_occurred": False, "what_happened": "x", "distress_thermometer_actual": 3, "bip_after": 30, "what_learned": "x"}
    r = await api.post(f"/patients/{f['child'].id}/exposures/{g['rung'].id}/record", json=after)
    assert r.status_code == 404


# ── Drafts: docs/plans/action-plan-drafts.md ─────────────────────────────────

async def test_a_draft_can_be_empty_or_unfinished_and_the_family_never_sees_it(api, db):
    f = await _family(db)
    f["setup"].confidence_level = "medium"
    await db.flush()
    api.sign_in_as(f["clinician"].user)
    r = await api.post(f"/patients/{f['child'].id}/action-plans", json={"items": [], "draft": True})
    assert r.status_code == 201, r.text
    plan = r.json()
    assert plan["state"] == "draft"
    unfinished = [
        {"kind": "exposure", "avoidance_behavior_id": str(f["rung"].id)},  # not set up with High yet
        {"kind": "reward", "text": ""},
        {"kind": "tool", "text": ""},
    ]
    r = await api.put(f"/action-plans/{plan['id']}", json={"items": unfinished, "draft": True})
    assert r.status_code == 200, r.text
    assert r.json()["state"] == "draft" and len(r.json()["items"]) == 3

    api.sign_in_as(f["child"].user)
    assert (await api.get("/patient/action-plan")).json() is None
    api.sign_in_as(f["parent"])
    assert (await api.get("/parent/action-plan")).json() is None


async def test_sharing_a_draft_checks_every_line(api, db):
    f = await _family(db)
    f["setup"].confidence_level = "medium"
    await db.flush()
    plan = await _create(api, f, draft=True)
    assert plan["state"] == "draft"

    r = await api.post(f"/action-plans/{plan['id']}/share")
    assert r.status_code == 422 and "High" in r.text and "Eat lunch in the cafeteria on Tuesday" in r.text

    f["setup"].confidence_level = "high"
    await db.flush()
    r = await api.post(f"/action-plans/{plan['id']}/share")
    assert r.status_code == 200, r.text
    assert r.json()["state"] == "current"
    assert (await api.post(f"/action-plans/{plan['id']}/share")).status_code == 409
    api.sign_in_as(f["child"].user)
    assert (await api.get("/patient/action-plan")).json()["id"] == plan["id"]


async def test_a_blank_line_blocks_sharing(api, db):
    f = await _family(db)
    api.sign_in_as(f["clinician"].user)
    r = await api.post(f"/patients/{f['child'].id}/action-plans",
                       json={"items": [{"kind": "reward", "text": "", "reward_for": "Lunch"}], "draft": True})
    plan = r.json()
    r = await api.put(f"/action-plans/{plan['id']}", json={"items": [{"kind": "reward", "text": ""}]})
    assert r.status_code == 422 and "Write what it is" in r.text
    saved = (await api.get(f"/patients/{f['child'].id}/action-plans")).json()[0]
    assert saved["state"] == "draft"


async def test_a_draft_does_not_end_the_running_plan_until_it_is_shared(api, db):
    f = await _family(db)
    first = await _create(api, f, starts_on=(date.today() - timedelta(days=3)).isoformat())
    draft = await _create(api, f, draft=True)
    by_id = {p["id"]: p for p in (await api.get(f"/patients/{f['child'].id}/action-plans")).json()}
    assert by_id[first["id"]]["ends_on"] == (date.today() + timedelta(days=4)).isoformat()
    api.sign_in_as(f["child"].user)
    assert (await api.get("/patient/action-plan")).json()["id"] == first["id"]

    api.sign_in_as(f["clinician"].user)
    assert (await api.post(f"/action-plans/{draft['id']}/share")).status_code == 200
    by_id = {p["id"]: p for p in (await api.get(f"/patients/{f['child'].id}/action-plans")).json()}
    assert by_id[first["id"]]["ends_on"] == date.today().isoformat()


async def test_the_family_cannot_tick_a_drafts_lines(api, db):
    f = await _family(db)
    plan = await _create(api, f, draft=True)
    tool = _by_kind(plan, "tool")[0]
    reward = _by_kind(plan, "reward")[0]
    api.sign_in_as(f["child"].user)
    assert (await api.put(f"/patient/action-plan-items/{tool['id']}/tick", json={"done": True})).status_code == 404
    api.sign_in_as(f["parent"])
    assert (await api.put(f"/parent/action-plan-items/{reward['id']}/tick", json={"done": True})).status_code == 404


async def test_saving_a_shared_plan_as_draft_does_not_hide_it(api, db):
    f = await _family(db)
    plan = await _create(api, f)
    keep = [{**line, "id": item["id"]} for line, item in zip(_lines(f), plan["items"])]
    r = await api.put(f"/action-plans/{plan['id']}", json={"items": keep, "draft": True})
    assert r.status_code == 200 and r.json()["state"] == "current"
