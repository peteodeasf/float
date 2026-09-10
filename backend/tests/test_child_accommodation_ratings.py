"""The child rates the accommodations on the plan; the clinician chooses who sees it.

Peter, 2026-09-10: only what is on the plan, sent by the clinician; the child never sees the
parent's estimate; the clinician can choose to show the child's ratings to the parent.
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


async def _ask(api, f):
    api.sign_in_as(f["clinician"].user)
    r = await api.post(f"{f['base']}/ask-child")
    assert r.status_code == 200, r.text
    return r.json()


async def _to_rate(api, f):
    api.sign_in_as(f["child"].user)
    r = await api.get("/patient/accommodations-to-rate")
    assert r.status_code == 200, r.text
    return r


async def test_nothing_reaches_the_child_until_the_clinician_sends_it(api, db):
    f = await _family(api, db)
    assert (await _to_rate(api, f)).json() == []


async def test_once_sent_the_child_sees_them_without_the_clinicians_guess(api, db):
    f = await _family(api, db)
    await _ask(api, f)

    rows = (await _to_rate(api, f)).json()
    assert [(r["name"], r["rated"], r["rating_min"]) for r in rows] == [
        ("Lies down with them until asleep", False, None),
        ("Answers for them at the doctor's", False, None),
    ]


async def test_the_child_rates_one_and_the_clinician_sees_it_as_theirs(api, db):
    f = await _family(api, db)
    await _ask(api, f)
    api.sign_in_as(f["child"].user)
    r = await api.put(f"/patient/accommodations/{f['a1']['id']}/rating", json={"rating_min": 5, "rating_max": 9})
    assert r.status_code == 200, r.text

    api.sign_in_as(f["clinician"].user)
    rows = {a["id"]: a for a in (await api.get(f["base"])).json()}
    assert (rows[f["a1"]["id"]]["distress_min"], rows[f["a1"]["id"]]["distress_max"]) == (5, 9)
    assert rows[f["a1"]["id"]]["child_rated_at"] is not None
    assert rows[f["a2"]["id"]]["child_rated_at"] is None


async def test_the_child_never_sees_the_parents_estimate(api, db):
    f = await _family(api, db)
    from app.models.experiment import AccommodationBehavior
    acc = await db.get(AccommodationBehavior, __import__("uuid").UUID(f["a1"]["id"]))
    acc.parent_estimate_min, acc.parent_estimate_max = 2, 3
    await db.flush()
    await _ask(api, f)

    r = await _to_rate(api, f)
    assert "parent_estimate" not in r.text and "estimate" not in r.text


async def test_the_rating_is_checked(api, db):
    f = await _family(api, db)
    await _ask(api, f)
    api.sign_in_as(f["child"].user)
    url = f"/patient/accommodations/{f['a1']['id']}/rating"
    for bad in ({"rating_min": 8, "rating_max": 3}, {"rating_min": 0, "rating_max": 3},
                {"rating_min": 3, "rating_max": 11}):
        assert (await api.put(url, json=bad)).status_code == 422, bad


async def test_one_not_sent_cannot_be_rated(api, db):
    f = await _family(api, db)
    api.sign_in_as(f["child"].user)
    r = await api.put(f"/patient/accommodations/{f['a1']['id']}/rating", json={"rating_min": 4, "rating_max": 4})
    assert r.status_code == 404, r.text


async def test_not_another_familys(api, db):
    f = await _family(api, db)
    other = await _family(api, db)
    await _ask(api, other)
    api.sign_in_as(f["child"].user)
    r = await api.put(f"/patient/accommodations/{other['a1']['id']}/rating", json={"rating_min": 4, "rating_max": 4})
    assert r.status_code == 404, r.text


async def test_sending_again_sends_only_the_new_ones(api, db):
    f = await _family(api, db)
    first = {a["id"]: a["child_rating_requested_at"] for a in await _ask(api, f)}
    a3 = (await api.post(f["base"], json={"name": "Texts them every hour at a sleepover"})).json()

    again = {a["id"]: a["child_rating_requested_at"] for a in await _ask(api, f)}
    assert again[f["a1"]["id"]] == first[f["a1"]["id"]]
    assert again[a3["id"]] is not None


async def test_in_session_the_clinician_types_the_childs_rating(api, db):
    f = await _family(api, db)
    api.sign_in_as(f["clinician"].user)
    r = await api.put(f"{f['base']}/{f['a2']['id']}/child-rating", json={"rating_min": 2, "rating_max": 4})
    assert r.status_code == 200, r.text
    assert (r.json()["distress_min"], r.json()["distress_max"]) == (2, 4)
    assert r.json()["child_rated_at"] is not None


async def test_a_clinician_without_access_cannot_send_or_rate(api, db):
    f = await _family(api, db)
    colleague = await make_practitioner(db, f["org"])
    api.sign_in_as(colleague.user)
    assert (await api.post(f"{f['base']}/ask-child")).status_code in (403, 404)
    r = await api.put(f"{f['base']}/{f['a1']['id']}/child-rating", json={"rating_min": 2, "rating_max": 4})
    assert r.status_code in (403, 404)
    r = await api.put(f"/patients/{f['child'].id}/accommodation-ratings-sharing", json={"shared": True})
    assert r.status_code in (403, 404)


async def test_the_parent_sees_the_childs_rating_only_when_the_clinician_shows_it(api, db):
    f = await _family(api, db)
    await _ask(api, f)
    api.sign_in_as(f["child"].user)
    await api.put(f"/patient/accommodations/{f['a1']['id']}/rating", json={"rating_min": 5, "rating_max": 9})

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


async def test_a_parent_cannot_use_the_childs_rating_routes(api, db):
    f = await _family(api, db)
    await _ask(api, f)
    api.sign_in_as(f["parent"])
    assert (await api.get("/patient/accommodations-to-rate")).status_code == 403
    r = await api.put(f"/patient/accommodations/{f['a1']['id']}/rating", json={"rating_min": 1, "rating_max": 1})
    assert r.status_code == 403


async def test_a_score_the_clinician_types_over_the_childs_is_the_clinicians(api, db):
    """The review found an edited score kept the child's mark and was shown as theirs."""
    f = await _family(api, db)
    await _ask(api, f)
    api.sign_in_as(f["child"].user)
    await api.put(f"/patient/accommodations/{f['a1']['id']}/rating", json={"rating_min": 5, "rating_max": 9})

    api.sign_in_as(f["clinician"].user)
    r = await api.put(f"{f['base']}/{f['a1']['id']}", json={"distress_min": 2, "distress_max": 2})
    assert r.status_code == 200, r.text
    assert r.json()["child_rated_at"] is None

    [row] = [r for r in (await _to_rate(api, f)).json() if r["id"] == f["a1"]["id"]]
    assert (row["rated"], row["rating_min"]) == (False, None)

