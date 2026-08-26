"""Can one patient reach another patient's data?

Owner's rule 3: a parent or child sees only their own family's data. Six routes are guarded by
`get_current_user` alone — any signed-in user passes — and they take an id straight from the URL:

    POST /rungs/{rung_id}/experiments
    GET  /experiments/{experiment_id}
    PUT  /experiments/{experiment_id}/before
    PUT  /experiments/{experiment_id}/after
    PUT  /experiments/{experiment_id}/skip
    PUT  /messages/{message_id}/read

Whether that is safe depends entirely on whether the handler checks ownership. These tests find
out, rather than reading the handlers and hoping.
"""
from app.models.experiment import Experiment
from tests.factories import make_org, make_plan, make_patient


async def _experiment_for(db, org, name):
    """A patient in `org` with one experiment of their own."""
    patient = await make_patient(db, org, name=name)
    exp = Experiment(patient_id=patient.id, organization_id=org.id, status="planned",
                     plan_description=f"{name}'s private plan")
    db.add(exp)
    await db.flush()
    return patient, exp


async def test_a_child_cannot_read_another_childs_experiment_same_institution(api, db):
    org = await make_org(db)
    _, victim_exp = await _experiment_for(db, org, "Victim Child")
    intruder, _ = await _experiment_for(db, org, "Intruder Child")

    api.sign_in_as(intruder.user)
    r = await api.get(f"/experiments/{victim_exp.id}")

    assert r.status_code != 200 or "private plan" not in r.text, (
        "a child read another child's experiment in the same institution"
    )


async def test_a_child_cannot_edit_another_childs_experiment(api, db):
    org = await make_org(db)
    _, victim_exp = await _experiment_for(db, org, "Victim Child")
    intruder, _ = await _experiment_for(db, org, "Intruder Child")

    api.sign_in_as(intruder.user)
    # A COMPLETE payload on purpose. An incomplete one returns 422 from validation, which looks
    # like protection and is not — that false pass hid this hole once already.
    r = await api.put(f"/experiments/{victim_exp.id}/before", json={
        "plan_description": "tampered",
        "prediction": "tampered",
        "bip_before": 50,
        "distress_thermometer_expected": 5,
        "confidence_level": "high",
    })
    assert r.status_code != 422, f"payload rejected by validation, so this proved nothing: {r.text[:200]}"

    await db.refresh(victim_exp)
    assert victim_exp.prediction != "tampered", (
        "a child wrote to another child's experiment"
    )


async def test_a_child_cannot_skip_another_childs_experiment(api, db):
    org = await make_org(db)
    _, victim_exp = await _experiment_for(db, org, "Victim Child")
    intruder, _ = await _experiment_for(db, org, "Intruder Child")

    api.sign_in_as(intruder.user)
    await api.put(f"/experiments/{victim_exp.id}/skip", json={})

    await db.refresh(victim_exp)
    assert victim_exp.status == "planned", (
        "a child changed the status of another child's experiment"
    )


async def test_a_child_cannot_read_an_experiment_from_another_institution(api, db):
    org_a = await make_org(db)
    _, victim_exp = await _experiment_for(db, org_a, "Victim Child")

    org_b = await make_org(db)
    intruder, _ = await _experiment_for(db, org_b, "Other Clinic Child")

    api.sign_in_as(intruder.user)
    r = await api.get(f"/experiments/{victim_exp.id}")

    assert r.status_code != 200 or "private plan" not in r.text, (
        "a child read an experiment from another institution"
    )


async def test_a_child_cannot_record_an_outcome_on_another_childs_experiment(api, db):
    org = await make_org(db)
    _, victim_exp = await _experiment_for(db, org, "Victim Child")
    intruder, _ = await _experiment_for(db, org, "Intruder Child")

    api.sign_in_as(intruder.user)
    r = await api.put(f"/experiments/{victim_exp.id}/after", json={
        "feared_outcome_occurred": True,
        "what_happened": "tampered",
        "distress_thermometer_actual": 9,
        "bip_after": 10,
        "what_learned": "tampered",
    })
    assert r.status_code != 422, f"payload rejected by validation, so this proved nothing: {r.text[:200]}"

    await db.refresh(victim_exp)
    assert victim_exp.what_happened != "tampered", (
        "a child recorded an outcome on another child's experiment"
    )


async def test_an_experiment_always_belongs_to_the_child_who_created_it(api, db):
    """`POST /rungs/{rung_id}/experiments` takes a rung id from the URL, but the handler uses the
    CALLER's patient id — so an experiment cannot be created on someone else's behalf. This test
    pins that, because the id in the path makes it look otherwise.

    Note: `rung_id` here means `ladder_rungs.id`, a table with zero rows in production, so this
    route cannot currently be used at all. See docs/plans/ladder-rung-shape.md.
    """
    from sqlalchemy import select
    from app.models.experiment import Experiment
    from app.models.ladder import ExposureLadder, LadderRung
    from tests.factories import make_plan, make_situation

    org = await make_org(db)
    victim = await make_patient(db, org, name="Victim Child")
    plan = await make_plan(db, org, patient=victim)
    situation = await make_situation(db, plan)
    ladder = ExposureLadder(trigger_situation_id=situation.id, organization_id=org.id,
                            status="not_started")
    db.add(ladder)
    await db.flush()
    rung = LadderRung(ladder_id=ladder.id, organization_id=org.id, rung_order=0)
    db.add(rung)
    await db.flush()

    intruder = await make_patient(db, org, name="Intruder Child")
    api.sign_in_as(intruder.user)
    r = await api.post(f"/rungs/{rung.id}/experiments", json={})

    made = (await db.execute(
        select(Experiment).where(Experiment.ladder_rung_id == rung.id)
    )).scalars().all()
    assert all(e.patient_id != victim.id for e in made), (
        f"an experiment was created against the victim (status {r.status_code})"
    )


async def test_a_child_cannot_mark_a_message_read(api, db):
    """This route is clinician-only — it refuses anyone without a practitioner profile."""
    from app.models.message import Message

    org = await make_org(db)
    child = await make_patient(db, org, name="A Child")
    msg = Message(organization_id=org.id, sender_user_id=child.user.id,
                  recipient_user_id=child.user.id, patient_id=child.id,
                  content="hello", message_type="general")
    db.add(msg)
    await db.flush()

    api.sign_in_as(child.user)
    r = await api.put(f"/messages/{msg.id}/read")

    assert r.status_code == 403
    await db.refresh(msg)
    assert msg.read_at is None
