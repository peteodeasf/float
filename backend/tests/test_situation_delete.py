"""Deleting a situation.

Regression cover for the bug that opened the 2026-08-21 session: deleting a situation that had
been worked on always failed. Nothing pointing at `trigger_situations` cascades in the schema, so
`db.delete(trigger)` raised an IntegrityError as soon as the situation had a behaviour, a ladder or
a downward arrow — and the UI had no error handler, so it looked like the button did nothing.

See docs/solutions/delete-fails-silently-no-fk-cascade.md.
"""
import pytest
from sqlalchemy import select

from app.models.treatment import AvoidanceBehavior, TriggerSituation
from app.models.ladder import ExposureLadder, LadderRung
from app.models.downward_arrow import DownwardArrow
from app.models.experiment import Experiment
from app.services.trigger_situation_service import delete_trigger
from tests.factories import make_org, make_plan, make_situation, make_rung


async def test_deletes_a_situation_with_no_dependents(db):
    org = await make_org(db)
    plan = await make_plan(db, org)
    s = await make_situation(db, plan)

    await delete_trigger(db, s.id, org.id)

    assert (await db.execute(
        select(TriggerSituation).where(TriggerSituation.id == s.id)
    )).scalar_one_or_none() is None


async def test_deletes_a_situation_that_has_behaviours(db):
    """The original bug: this raised IntegrityError before the fix."""
    org = await make_org(db)
    plan = await make_plan(db, org)
    s = await make_situation(db, plan)
    await make_rung(db, situation=s, name="hang out in the clubhouse")
    await make_rung(db, situation=s, name="go to the bathroom often")

    await delete_trigger(db, s.id, org.id)

    left = (await db.execute(
        select(AvoidanceBehavior).where(AvoidanceBehavior.trigger_situation_id == s.id)
    )).scalars().all()
    assert left == []


async def test_deletes_a_situation_with_sub_behaviours_ladder_and_arrow(db):
    """Every kind of dependent at once — the shape a real worked-on situation has."""
    org = await make_org(db)
    plan = await make_plan(db, org)
    s = await make_situation(db, plan)

    parent = await make_rung(db, situation=s, name="parent rung")
    await make_rung(db, situation=s, name="smaller step", parent=parent)

    ladder = ExposureLadder(trigger_situation_id=s.id, organization_id=org.id, status="not_started")
    db.add(ladder)
    await db.flush()
    db.add(LadderRung(ladder_id=ladder.id, organization_id=org.id,
                      avoidance_behavior_id=parent.id, rung_order=0))
    db.add(DownwardArrow(trigger_situation_id=s.id, organization_id=org.id,
                         arrow_steps=[], feared_outcome="everyone will laugh"))
    await db.flush()

    await delete_trigger(db, s.id, org.id)

    assert (await db.execute(select(ExposureLadder).where(
        ExposureLadder.trigger_situation_id == s.id))).scalars().all() == []
    assert (await db.execute(select(DownwardArrow).where(
        DownwardArrow.trigger_situation_id == s.id))).scalars().all() == []


async def test_keeps_experiment_history_and_only_unlinks_it(db):
    """Outcome data survives. Removing a rung must not erase what the child actually did."""
    org = await make_org(db)
    plan = await make_plan(db, org)
    s = await make_situation(db, plan)
    rung = await make_rung(db, situation=s)

    # Experiments reference a situation only through the behaviour, never directly.
    exp = Experiment(
        patient_id=plan.patient_id, organization_id=org.id,
        avoidance_behavior_id=rung.id, status="completed",
    )
    db.add(exp)
    await db.flush()
    exp_id = exp.id

    await delete_trigger(db, s.id, org.id)

    survivor = (await db.execute(select(Experiment).where(Experiment.id == exp_id))).scalar_one()
    assert survivor.avoidance_behavior_id is None
    assert survivor.status == "completed"   # the record itself is untouched


async def test_will_not_delete_another_organisations_situation(db):
    """Org scoping is a hard boundary — a 404, not a silent delete."""
    from fastapi import HTTPException

    org_a = await make_org(db)
    org_b = await make_org(db)
    plan = await make_plan(db, org_a)
    s = await make_situation(db, plan)

    with pytest.raises(HTTPException) as exc:
        await delete_trigger(db, s.id, org_b.id)
    assert exc.value.status_code == 404

    assert (await db.execute(
        select(TriggerSituation).where(TriggerSituation.id == s.id)
    )).scalar_one_or_none() is not None
