"""What the child's app gets: one ladder, easiest first, and which rung to do next.

Peter, 2026-09-01: the child picks a rung, not a situation and then a behaviour inside it. The
ladder is on for them or it is not — all of it. One rung can be marked as the one their clinician
suggests, and they can still do any of the others.

Plan: docs/plans/exposure-ladder-sub-situations.md
"""
from app.models.treatment import AvoidanceBehavior

from tests.factories import make_org, make_patient, make_plan, make_situation


async def _ladder(db, org, *, active: bool, rungs: list[tuple[str, str, float | None]]):
    """A patient with a plan, one situation, and the given (name, type, score) rungs."""
    patient = await make_patient(db, org)
    plan = await make_plan(db, org, patient=patient)
    plan.ladder_active = active
    situation = await make_situation(db, plan, name="School drop off")
    made = []
    for name, btype, dt in rungs:
        b = AvoidanceBehavior(
            trigger_situation_id=situation.id, organization_id=org.id,
            treatment_plan_id=plan.id, name=name, behavior_type=btype,
            distress_thermometer_when_refraining=dt,
        )
        db.add(b)
        made.append(b)
    await db.flush()
    return patient, plan, made


async def test_the_ladder_is_one_flat_list_easiest_first(api, db):
    org = await make_org(db)
    patient, _, _ = await _ladder(db, org, active=True, rungs=[
        ("Walk in on my own", "scenario", 7),
        ("Wave from the gate", "scenario", 3),
        ("Walk to the door with mum", "scenario", 5),
    ])

    api.sign_in_as(patient.user)
    body = (await api.get("/patient/ladder")).json()

    assert [r["name"] for r in body["rungs"]] == [
        "Wave from the gate", "Walk to the door with mum", "Walk in on my own",
    ]


async def test_an_unscored_rung_goes_last_not_first(api, db):
    """A missing score is not a zero. Treating it as one would put it at the top of the ladder,
    which is where they start."""
    org = await make_org(db)
    patient, _, _ = await _ladder(db, org, active=True, rungs=[
        ("Not scored yet", "scenario", None),
        ("Wave from the gate", "scenario", 3),
    ])

    api.sign_in_as(patient.user)
    names = [r["name"] for r in (await api.get("/patient/ladder")).json()["rungs"]]

    assert names == ["Wave from the gate", "Not scored yet"]


async def test_an_observation_never_reaches_the_child(api, db):
    """"Complained of stomach pain" is not something a child can go and face."""
    org = await make_org(db)
    patient, _, _ = await _ladder(db, org, active=True, rungs=[
        ("Wave from the gate", "scenario", 3),
        ("Complained of stomach pain", "observation", 4),
    ])

    api.sign_in_as(patient.user)
    names = [r["name"] for r in (await api.get("/patient/ladder")).json()["rungs"]]

    assert names == ["Wave from the gate"]


async def test_the_ladder_being_off_means_the_child_has_nothing(api, db):
    org = await make_org(db)
    patient, _, _ = await _ladder(db, org, active=False, rungs=[
        ("Wave from the gate", "scenario", 3),
    ])

    api.sign_in_as(patient.user)
    body = (await api.get("/patient/ladder")).json()

    assert body["rungs"] == []
    assert body["plan"]["ladder_active"] is False


async def test_the_recommended_rung_is_marked_and_the_rest_are_not(api, db):
    org = await make_org(db)
    patient, plan, made = await _ladder(db, org, active=True, rungs=[
        ("Wave from the gate", "scenario", 3),
        ("Walk in on my own", "scenario", 7),
    ])
    plan.recommended_rung_id = made[1].id
    await db.flush()

    api.sign_in_as(patient.user)
    rungs = (await api.get("/patient/ladder")).json()["rungs"]

    marked = [r["name"] for r in rungs if r["is_recommended"]]
    assert marked == ["Walk in on my own"]
    # Advice, not a lock — everything is still there to choose from.
    assert len(rungs) == 2


async def test_a_rung_carries_its_situation_as_a_label(api, db):
    """The situation is a quiet label on a rung, not a folder the child opens first."""
    org = await make_org(db)
    patient, _, _ = await _ladder(db, org, active=True, rungs=[
        ("Wave from the gate", "scenario", 3),
    ])

    api.sign_in_as(patient.user)
    rung = (await api.get("/patient/ladder")).json()["rungs"][0]

    assert rung["situation_name"] == "School drop off"


async def test_a_rung_from_another_plan_cannot_be_recommended(api, db):
    """Without the check a clinician could point one child's app at another child's step, and the
    child's ladder would read it out."""
    from tests.factories import make_practitioner, grant_patient_to

    org = await make_org(db)
    mine = await make_plan(db, org)
    theirs = await make_plan(db, org)
    their_situation = await make_situation(db, theirs, name="Their situation")
    their_rung = AvoidanceBehavior(
        trigger_situation_id=their_situation.id, organization_id=org.id,
        treatment_plan_id=theirs.id, name="Their step", behavior_type="scenario",
        distress_thermometer_when_refraining=4,
    )
    db.add(their_rung)
    await db.flush()

    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, mine.patient, clinician, owner=True)

    api.sign_in_as(clinician.user)
    r = await api.request("PUT", f"/patients/{mine.patient.id}/plan/{mine.id}", json={
        "recommended_rung_id": str(their_rung.id),
    })

    assert r.status_code == 404
