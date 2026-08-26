"""Every route, called by the wrong person.

The experiments hole (fixed in c1295c3) existed because nobody had checked those routes. Picking
routes to test by hand does not scale to 152 and did not catch it. So this walks every registered
route instead, and a route added tomorrow is checked automatically.

**The property.** Every piece of the victim's text data carries a unique marker. If that marker
ever appears in a response to someone who should not see it, that is a leak — whatever the status
code, whatever the route. It is a blunt instrument and it is exactly what the experiments bug
violated.

**Who does the asking:** a clinician from another institution, and a child from another family in
the same institution.

Routes whose path parameters cannot be filled are reported as NOT COVERED rather than passing
silently — a sweep that quietly skips half the surface is worse than no sweep.
"""
import pytest
from fastapi.routing import APIRoute

from app.models.downward_arrow import DownwardArrow
from app.models.experiment import Experiment
from app.models.message import Message
from tests.factories import (
    make_org, make_patient, make_plan, make_practitioner, make_rung, make_situation,
)

CANARY = "ZZCANARYZZ"

# Routes with no auth dependency at all. Each is deliberately public; this list is the record of
# that decision, which did not exist anywhere before.
PUBLIC = {
    "GET /health",
    "POST /auth/login",
    "POST /auth/refresh",
    "POST /auth/forgot-password",
    "POST /auth/reset-password",
    "POST /waitlist",
    # The monitoring form a parent opens from an emailed link. Guarded by an unguessable token in
    # the URL rather than a login.
    "GET /monitor/{access_token}",
    "POST /monitor/{access_token}/consent",
    "POST /monitor/{access_token}/entries",
    "PUT /monitor/{access_token}/entries/{entry_id}",
    "POST /monitor/{access_token}/submit",
}

# Acts on the caller, not on data named in the path.
SELF_ONLY = {"GET /auth/me", "PUT /auth/set-password", "POST /auth/logout"}


async def _victim_world(db):
    """One institution with a child whose every text field carries the marker."""
    org = await make_org(db)
    patient = await make_patient(db, org, name=f"{CANARY} Child")
    plan = await make_plan(db, org, patient=patient)
    situation = await make_situation(db, plan, name=f"{CANARY} situation")
    rung = await make_rung(db, situation=situation, name=f"{CANARY} rung")

    exp = Experiment(patient_id=patient.id, organization_id=org.id, status="planned",
                     plan_description=f"{CANARY} plan", prediction=f"{CANARY} prediction")
    arrow = DownwardArrow(trigger_situation_id=situation.id, organization_id=org.id,
                          arrow_steps=[], feared_outcome=f"{CANARY} feared outcome")
    msg = Message(organization_id=org.id, sender_user_id=patient.user.id,
                  recipient_user_id=patient.user.id, patient_id=patient.id,
                  content=f"{CANARY} message", message_type="general")
    db.add_all([exp, arrow, msg])
    await db.flush()

    return {
        "org": org, "patient": patient, "plan": plan, "situation": situation,
        "rung": rung, "experiment": exp, "arrow": arrow, "message": msg,
    }


def _param_values(w):
    """Path parameter name -> the victim's id. Anything absent makes a route uncoverable."""
    return {
        "patient_id": w["patient"].id,
        "plan_id": w["plan"].id,
        "treatment_plan_id": w["plan"].id,
        "trigger_id": w["situation"].id,
        "situation_id": w["situation"].id,
        "trigger_situation_id": w["situation"].id,
        "behavior_id": w["rung"].id,
        "rung_id": w["rung"].id,
        "experiment_id": w["experiment"].id,
        "message_id": w["message"].id,
        "arrow_id": w["arrow"].id,
        "org_id": w["org"].id,
        "organization_id": w["org"].id,
        "user_id": w["patient"].user.id,
    }


def _routes():
    import app.main
    out = []
    for r in app.main.app.routes:
        if not isinstance(r, APIRoute):
            continue
        for method in sorted(r.methods - {"HEAD", "OPTIONS"}):
            key = f"{method} {r.path}"
            if key in PUBLIC or key in SELF_ONLY:
                continue
            out.append((method, r.path, key))
    return out


@pytest.mark.parametrize("intruder_kind", ["foreign_clinician", "other_family_child"])
async def test_no_route_leaks_the_victims_data(api, db, intruder_kind, capsys):
    w = await _victim_world(db)
    params = _param_values(w)

    if intruder_kind == "foreign_clinician":
        other_org = await make_org(db)
        intruder = (await make_practitioner(db, other_org)).user
    else:
        # Same institution, different family — the case the experiments hole exposed.
        intruder = (await make_patient(db, w["org"], name="Other Family Child")).user

    api.sign_in_as(intruder)

    leaks, uncoverable, called = [], [], 0
    for method, path, key in _routes():
        url = path
        missing = False
        for name, value in [(n, params.get(n)) for n in _path_params(path)]:
            if value is None:
                missing = True
                break
            url = url.replace("{" + name + "}", str(value))
        if missing:
            uncoverable.append(key)
            continue

        try:
            r = await api.request(method, url, json={} if method in ("POST", "PUT", "PATCH") else None)
        except Exception:
            # A handler blowing up is not a leak. Noisy, but not this test's job.
            continue
        called += 1
        if CANARY in r.text:
            leaks.append(f"{key}  ->  {r.status_code}")

    with capsys.disabled():
        print(f"\n  [{intruder_kind}] called {called}, uncoverable {len(uncoverable)}, leaks {len(leaks)}")
        for u in uncoverable:
            print(f"      NOT COVERED  {u}")
        for l in leaks:
            print(f"      LEAK         {l}")

    assert not leaks, f"{len(leaks)} route(s) leaked the victim's data to {intruder_kind}:\n" + "\n".join(leaks)


def _path_params(path):
    import re
    return re.findall(r"\{([^}]+)\}", path)
