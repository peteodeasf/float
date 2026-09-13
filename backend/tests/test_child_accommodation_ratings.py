"""The child rates the accommodations on the plan; the clinician chooses who sees it.

Peter, 2026-09-10: only what is on the plan; the clinician can choose to show the child's ratings to
the parent. Peter, 2026-09-13: the child rates only in session, with the clinician. Sending them to
the child's app to rate alone was removed.
Plan: docs/plans/accommodation-conversation.md
"""
from tests.factories import grant_patient_to, make_org, make_patient, make_plan, make_practitioner
from tests.test_role_boundary import _parent_of


async def _family(api, db):
    org = await make_org(db)
    child = await make_patient(db, org, name="Sam Rivera")
    plan = await make_plan(db, org, patient=child)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, child, clinician, owner=True)
    parent = await _parent_of(db, org, child)

    api.sign_in_as(clinician.user)
    base = f"/plans/{plan.id}/accommodations"
    # The clinician's own guess on the first; the child must not be shown it as theirs.
    a1 = (await api.post(base, json={"name": "Lies down with them until asleep",
                                     "distress_min": 5, "distress_max": 5})).json()
    a2 = (await api.post(base, json={"name": "Answers for them at the doctor's"})).json()
    return dict(org=org, child=child, plan=plan, clinician=clinician, parent=parent,
                base=base, a1=a1, a2=a2)


async def test_in_session_the_clinician_types_the_childs_rating(api, db):
    f = await _family(api, db)
    api.sign_in_as(f["clinician"].user)
    r = await api.put(f"{f['base']}/{f['a2']['id']}/child-rating", json={"rating_min": 2, "rating_max": 4})
    assert r.status_code == 200, r.text
    assert (r.json()["distress_min"], r.json()["distress_max"]) == (2, 4)
    assert r.json()["child_rated_at"] is not None


async def test_a_clinician_without_access_cannot_rate(api, db):
    f = await _family(api, db)
    colleague = await make_practitioner(db, f["org"])
    api.sign_in_as(colleague.user)
    r = await api.put(f"{f['base']}/{f['a1']['id']}/child-rating", json={"rating_min": 2, "rating_max": 4})
    assert r.status_code in (403, 404)
    r = await api.put(f"/patients/{f['child'].id}/accommodation-ratings-sharing", json={"shared": True})
    assert r.status_code in (403, 404)


async def test_the_parent_sees_the_childs_rating_only_when_the_clinician_shows_it(api, db):
    f = await _family(api, db)
    api.sign_in_as(f["clinician"].user)
    await api.put(f"{f['base']}/{f['a1']['id']}/child-rating", json={"rating_min": 5, "rating_max": 9})

    async def parent_view():
        api.sign_in_as(f["parent"])
        r = await api.get("/parent/accommodations")
        assert r.status_code == 200, r.text
        assert "distress" not in r.text
        return {a["id"]: (a["child_rating_min"], a["child_rating_max"]) for a in r.json()}

    assert await parent_view() == {f["a1"]["id"]: (None, None), f["a2"]["id"]: (None, None)}

    api.sign_in_as(f["clinician"].user)
    r = await api.put(f"/patients/{f['child'].id}/accommodation-ratings-sharing", json={"shared": True})
    assert r.status_code == 200 and r.json()["accommodation_ratings_shared_at"] is not None
    # The child's own rating comes through; a clinician's guess on an unrated one does not.
    assert await parent_view() == {f["a1"]["id"]: (5, 9), f["a2"]["id"]: (None, None)}

    api.sign_in_as(f["clinician"].user)
    await api.put(f"/patients/{f['child'].id}/accommodation-ratings-sharing", json={"shared": False})
    assert await parent_view() == {f["a1"]["id"]: (None, None), f["a2"]["id"]: (None, None)}


async def test_the_childs_app_has_no_way_to_rate_them_any_more(api, db):
    f = await _family(api, db)
    api.sign_in_as(f["child"].user)
    assert (await api.get("/patient/accommodations-to-rate")).status_code == 404
    r = await api.put(f"/patient/accommodations/{f['a1']['id']}/rating", json={"rating_min": 1, "rating_max": 1})
    assert r.status_code in (404, 405)
    api.sign_in_as(f["clinician"].user)
    assert (await api.post(f"{f['base']}/ask-child")).status_code in (404, 405)


async def test_a_score_the_clinician_types_over_the_childs_is_the_clinicians(api, db):
    """The review found an edited score kept the child's mark and was shown as theirs."""
    f = await _family(api, db)
    api.sign_in_as(f["clinician"].user)
    await api.put(f"{f['base']}/{f['a1']['id']}/child-rating", json={"rating_min": 5, "rating_max": 9})

    r = await api.put(f"{f['base']}/{f['a1']['id']}", json={"distress_min": 2, "distress_max": 2})
    assert r.status_code == 200, r.text
    assert r.json()["child_rated_at"] is None
