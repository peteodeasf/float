"""A child's or a parent's login cannot use the clinician app.

Peter, 2026-09-10: "i saw that i can log into the clinical portal with a teen login" and "check
parents cannot log into clinician portal also".

The route sweep (test_route_sweep.py) asks a child from ANOTHER family. That cannot catch this: a
child reading their own record through a clinician route shows only their own data, so no marker of
someone else's leaks. What matters here is the route itself — a clinician route must refuse a child
or a parent even when the ids are their own family's. Session notes, the formulation and the other
clinician-only records are the reason.
"""
from fastapi.routing import APIRoute

from app.models.patient import ParentPatientLink

from tests.factories import _make_user, make_org, make_patient, make_practitioner
from tests.test_route_sweep import PUBLIC, SELF_ONLY, _param_values, _path_params, _victim_world

# Routes meant for a child or a parent. Everything else is a clinician's or an admin's.
FAMILY_PREFIXES = ("/patient/", "/parent/", "/auth/", "/monitor/", "/review/")
# The child's own exposure routes in experiments.py, which sit outside /patient/. Each is guarded by
# that file's own patient check and scoped to the signed-in child.
CHILD_ROUTES = {
    "POST /rungs/{rung_id}/experiments",
    "GET /experiments/{experiment_id}",
    "PUT /experiments/{experiment_id}/before",
    "PUT /experiments/{experiment_id}/after",
    "PUT /experiments/{experiment_id}/skip",
}


def _clinician_routes():
    import app.main
    out = []
    for r in app.main.app.routes:
        if not isinstance(r, APIRoute):
            continue
        for method in sorted(r.methods - {"HEAD", "OPTIONS"}):
            key = f"{method} {r.path}"
            if key in PUBLIC or key in SELF_ONLY or key in CHILD_ROUTES:
                continue
            if r.path.startswith(FAMILY_PREFIXES) or r.path == "/health":
                continue
            out.append((method, r.path, key))
    return out


async def _parent_of(db, org, patient):
    parent = await _make_user(db, org, "parent")
    db.add(ParentPatientLink(parent_user_id=parent.id, patient_id=patient.id, organization_id=org.id))
    await db.flush()
    return parent


async def _got_through(api, w):
    params = _param_values(w)
    through, called = [], 0
    for method, path, key in _clinician_routes():
        url = path
        for name in _path_params(path):
            if params.get(name) is None:
                break
            url = url.replace("{" + name + "}", str(params[name]))
        else:
            try:
                r = await api.request(method, url, json={} if method in ("POST", "PUT", "PATCH") else None)
            except Exception:
                continue
            called += 1
            if r.status_code < 400:
                through.append(f"{key}  ->  {r.status_code}")
    return through, called


async def test_the_childs_own_login_is_refused_by_every_clinician_route(api, db):
    w = await _victim_world(db)
    api.sign_in_as(w["patient"].user)

    through, called = await _got_through(api, w)

    assert called > 50, called
    assert not through, "a child's login was let through:\n" + "\n".join(through)


async def test_the_parents_own_login_is_refused_by_every_clinician_route(api, db):
    w = await _victim_world(db)
    parent = await _parent_of(db, w["org"], w["patient"])
    api.sign_in_as(parent)

    through, called = await _got_through(api, w)

    assert called > 50, called
    assert not through, "a parent's login was let through:\n" + "\n".join(through)


async def test_me_says_who_is_a_clinician(api, db):
    """What the clinician app checks before letting a sign-in in."""
    org = await make_org(db)
    child = await make_patient(db, org)
    parent = await _parent_of(db, org, child)
    clinician = await make_practitioner(db, org)

    for user, expected in ((clinician.user, True), (child.user, False), (parent, False)):
        api.sign_in_as(user)
        r = await api.get("/auth/me")
        assert r.status_code == 200, r.text
        assert r.json()["is_practitioner"] is expected, (r.json()["role"], expected)
