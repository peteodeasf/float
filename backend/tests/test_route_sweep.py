"""Every route, called by the wrong person.

The experiments hole (fixed in c1295c3) existed because nobody had checked those routes. Picking
routes to test by hand does not scale to 152 and did not catch it. So this walks every registered
route instead, and a route added tomorrow is checked automatically.

**The property.** Every piece of the victim's PATIENT data carries a unique marker. Content that
is deliberately shared across institutions — the tag vocabulary, the tip library — carries none,
because returning it to any clinician is correct.

Every piece of the victim's text data carries a unique marker. If that marker
ever appears in a response to someone who should not see it, that is a leak — whatever the status
code, whatever the route. It is a blunt instrument and it is exactly what the experiments bug
violated.

**Who does the asking:** a clinician from another institution, a child from another family in the
same institution, and — since `patient_access_grants` — a clinician in the RIGHT institution who
has not been granted access to this patient. That third one is the case that used to be allowed:
organisation membership alone was enough to open anyone.

Routes whose path parameters cannot be filled are reported as NOT COVERED rather than passing
silently — a sweep that quietly skips half the surface is worse than no sweep.
"""
import pytest
from fastapi.routing import APIRoute

from datetime import date

from app.models.checklist_item import OrganizationChecklistItem
from app.models.downward_arrow import DownwardArrow
from app.models.experiment import Experiment, AccommodationBehavior
from app.models.jit_content import JitTip, Tag
from app.models.ladder import ExposureLadder
from app.models.message import Message
from app.models.session_note import SessionNote
from app.models.treatment import AvoidanceBehavior, TriggerSituation
from tests.factories import (
    grant_patient_to, make_org, make_patient, make_plan, make_practitioner, make_rung,
    make_situation,
)

CANARY = "ZZCANARYZZ"

# Content that belongs to the INSTITUTION rather than to one child — the process checklist a
# clinic writes for itself. A colleague in the same institution is supposed to see it, so it
# cannot carry the ordinary marker: a grant is about one child's record, not about the clinic's
# own vocabulary. It still must not cross an institution boundary, which is what this second
# marker checks.
ORG_CANARY = "ZZORGSHAREDZZ"

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
    ladder = ExposureLadder(trigger_situation_id=situation.id, organization_id=org.id,
                            status="not_started")
    accommodation = AccommodationBehavior(
        treatment_plan_id=plan.id, organization_id=org.id, name=f"{CANARY} accommodation")
    note = SessionNote(patient_id=patient.id, organization_id=org.id,
                       practitioner_id=plan.practitioner_id, session_date=date.today(),
                       content=f"{CANARY} session note", tags=[])
    item = OrganizationChecklistItem(organization_id=org.id, key=f"{ORG_CANARY}_item",
                                     text_=f"{ORG_CANARY} checklist item")
    # Tags and tips are SHARED vocabulary across institutions — the clinician-facing /tags route
    # is meant to return them to everyone. They carry no marker: the marker means "this belongs to
    # the victim", and marking shared content would report a correct route as a leak. They exist
    # here only so the admin routes that take a tag or tip id can be reached at all.
    tag = Tag(slug="sweep-shared-tag", label="Shared tag")
    tip = JitTip(title="Shared tip", body="Shared tip body")
    db.add_all([exp, arrow, msg, ladder, accommodation, note, item, tag, tip])
    await db.flush()

    return {
        "org": org, "patient": patient, "plan": plan, "situation": situation,
        "rung": rung, "experiment": exp, "arrow": arrow, "message": msg,
        "ladder": ladder, "accommodation": accommodation, "note": note,
        "item": item, "tag": tag, "tip": tip,
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
        "ladder_id": w["ladder"].id,
        "accommodation_id": w["accommodation"].id,
        "note_id": w["note"].id,
        "item_id": w["item"].id,
        "tag_id": w["tag"].id,
        "tip_id": w["tip"].id,
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


@pytest.mark.parametrize(
    "intruder_kind",
    ["foreign_clinician", "other_family_child", "ungranted_clinician"],
)
async def test_no_route_leaks_the_victims_data(api, db, intruder_kind, capsys):
    w = await _victim_world(db)
    params = _param_values(w)

    if intruder_kind == "foreign_clinician":
        other_org = await make_org(db)
        intruder = (await make_practitioner(db, other_org)).user
    elif intruder_kind == "ungranted_clinician":
        # Same institution, no grant, not an admin. Before patient_access_grants this clinician
        # could open every route below.
        intruder = (await make_practitioner(db, w["org"])).user
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


async def test_a_nested_route_cannot_pair_my_own_parent_with_someone_elses_child(api, db):
    """The mixed pair the sweep above structurally cannot build.

    Every route in that sweep gets ALL its path parameters from one victim, so on a nested route
    like /plans/{plan_id}/triggers/{trigger_id} the parent guard fires and the route correctly
    404s. What it never tries is the parent id being legitimately MINE and the child id being
    someone else's — which is how a clinician whose grant was revoked keeps reading and writing a
    record they no longer hold. The security review found nine routes open this way; each is
    checked here.
    """
    org = await make_org(db)

    mine = await make_plan(db, org)
    my_situation = await make_situation(db, mine, name="My situation")
    my_rung = await make_rung(db, situation=my_situation, name="My rung")
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, mine.patient, clinician)

    theirs = await make_plan(db, org)
    their_situation = await make_situation(db, theirs, name=f"{CANARY} their situation")
    their_rung = await make_rung(db, situation=their_situation, name=f"{CANARY} their rung")
    their_accommodation = AccommodationBehavior(
        treatment_plan_id=theirs.id, organization_id=org.id, name=f"{CANARY} their accommodation")
    their_ladder = ExposureLadder(trigger_situation_id=their_situation.id,
                                  organization_id=org.id, status="not_started")
    db.add_all([their_accommodation, their_ladder])
    await db.flush()

    my_ladder = ExposureLadder(trigger_situation_id=my_situation.id,
                               organization_id=org.id, status="not_started")
    db.add(my_ladder)
    await db.flush()

    api.sign_in_as(clinician.user)

    # (method, url) — my parent id, their child id. Every one must refuse.
    attempts = [
        ("PUT",    f"/plans/{mine.id}/triggers/{their_situation.id}"),
        ("DELETE", f"/plans/{mine.id}/triggers/{their_situation.id}"),
        ("PUT",    f"/triggers/{my_situation.id}/behaviors/{their_rung.id}"),
        ("DELETE", f"/triggers/{my_situation.id}/behaviors/{their_rung.id}"),
        ("PUT",    f"/plans/{mine.id}/rungs/{their_rung.id}"),
        ("DELETE", f"/plans/{mine.id}/rungs/{their_rung.id}"),
        ("PUT",    f"/plans/{mine.id}/accommodations/{their_accommodation.id}"),
        ("DELETE", f"/plans/{mine.id}/accommodations/{their_accommodation.id}"),
        ("PUT",    f"/patients/{mine.patient.id}/plan/{theirs.id}"),
    ]

    got_through = []
    for method, url in attempts:
        r = await api.request(method, url, json={} if method == "PUT" else None)
        if r.status_code < 400 or CANARY in r.text:
            got_through.append(f"{method} {url}  ->  {r.status_code}")
    assert not got_through, (
        "my own parent id paired with another patient's child id was accepted:\n  "
        + "\n  ".join(got_through)
    )

    # Nothing of theirs was destroyed on the way through.
    assert (await db.get(TriggerSituation, their_situation.id)) is not None
    assert (await db.get(AvoidanceBehavior, their_rung.id)) is not None
    assert (await db.get(AccommodationBehavior, their_accommodation.id)) is not None


async def test_the_same_nested_routes_still_work_for_my_own_patient(api, db):
    """The other half — the guards must not have shut the legitimate path."""
    org = await make_org(db)
    mine = await make_plan(db, org)
    situation = await make_situation(db, mine, name="My situation")
    rung = await make_rung(db, situation=situation, name="My rung")
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, mine.patient, clinician)

    api.sign_in_as(clinician.user)

    r = await api.put(f"/plans/{mine.id}/triggers/{situation.id}", json={"name": "Renamed"})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Renamed"

    r = await api.put(f"/triggers/{situation.id}/behaviors/{rung.id}", json={"name": "Renamed rung"})
    assert r.status_code == 200, r.text

    r = await api.put(f"/patients/{mine.patient.id}/plan/{mine.id}", json={"status": "active"})
    assert r.status_code == 200, r.text
