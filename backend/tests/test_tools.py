"""Tools and strategies: pages, examples, highlighting, what each family member sees, images.

docs/plans/tools-and-strategies.md
"""
from app.models.tool import Tool, ToolExample, ToolImage

from tests.factories import grant_patient_to, make_float_admin, make_org, make_patient, make_plan, make_practitioner
from tests.test_role_boundary import _parent_of


async def _family(db):
    org = await make_org(db)
    child = await make_patient(db, org, name="Sarah Mitchell")
    await make_plan(db, org, patient=child)
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, child, clinician, owner=True)
    parent = await _parent_of(db, org, child)
    return {"org": org, "child": child, "clinician": clinician, "parent": parent}


async def _page(db, name="Mottos", audience="both", published=True, examples=()):
    t = Tool(name=name, kind="strategy", audience=audience, summary=f"{name} summary", is_published=published)
    db.add(t)
    await db.flush()
    for pos, (n, how) in enumerate(examples):
        db.add(ToolExample(tool_id=t.id, name=n, how_used=how, position=pos))
    await db.flush()
    return t


# ── Admin ──

async def test_the_admin_writes_a_page_with_blocks_and_examples(api, db):
    api.sign_in_as(await make_float_admin(db))
    img = (await api.post("/admin/tool-images", files={"file": ("a.png", b"\x89PNG", "image/png")})).json()
    body = {
        "name": "Mottos", "kind": "strategy", "audience": "both", "summary": "Short sayings",
        "blocks": [{"type": "text", "text": "How mottos work"}, {"type": "image", "image_id": img["id"]},
                   {"type": "text", "text": "   "}],
        "examples": [{"name": "Wait and see", "how_used": "Say it, then find out"}, {"name": "Can't know"}],
    }
    r = await api.post("/admin/tools", json=body)
    assert r.status_code == 200, r.text
    page = r.json()
    assert [b["type"] for b in page["blocks"]] == ["text", "image"]
    assert [(e["name"], e["how_used"]) for e in page["examples"]] == [
        ("Wait and see", "Say it, then find out"), ("Can't know", None)]
    assert page["is_published"] is False

    # Editing keeps an example's id, so plans that picked it keep the link.
    wait = page["examples"][0]
    body["examples"] = [{"id": wait["id"], "name": "Wait and see", "how_used": "Changed"}]
    body["is_published"] = True
    page2 = (await api.put(f"/admin/tools/{page['id']}", json=body)).json()
    assert [(e["id"], e["how_used"]) for e in page2["examples"]] == [(wait["id"], "Changed")]


async def test_images_must_be_images_and_small(api, db):
    api.sign_in_as(await make_float_admin(db))
    r = await api.post("/admin/tool-images", files={"file": ("a.txt", b"hi", "text/plain")})
    assert r.status_code == 400
    r = await api.post("/admin/tool-images", files={"file": ("a.png", b"x" * (2 * 1024 * 1024 + 1), "image/png")})
    assert r.status_code == 400


async def test_a_clinician_cannot_use_the_admin_routes(api, db):
    f = await _family(db)
    api.sign_in_as(f["clinician"].user)
    assert (await api.get("/admin/tools")).status_code == 403


# ── Clinicians ──

async def test_clinicians_see_published_pages_only(api, db):
    f = await _family(db)
    await _page(db, "Mottos")
    await _page(db, "Draft page", published=False)
    api.sign_in_as(f["clinician"].user)
    names = [t["name"] for t in (await api.get("/tools")).json()]
    assert names == ["Mottos"]


async def test_highlighting_for_a_patient_and_seeing_who_opened_it(api, db):
    f = await _family(db)
    page = await _page(db, "Worry Hill")
    api.sign_in_as(f["clinician"].user)
    r = await api.put(f"/patients/{f['child'].id}/tool-highlights/{page.id}", json={"for_child": True, "for_parent": True})
    assert r.status_code == 200, r.text

    api.sign_in_as(f["child"].user)
    mine = (await api.get("/patient/tools")).json()
    assert mine[0]["name"] == "Worry Hill" and mine[0]["highlighted"] is True
    await api.get(f"/patient/tools/{page.id}")

    api.sign_in_as(f["clinician"].user)
    rows = (await api.get(f"/tools/{page.id}/highlights")).json()
    assert [(r["patient_name"], r["child_opened"], r["parent_opened"]) for r in rows] == [("Sarah Mitchell", True, False)]

    # Neither takes it off.
    await api.put(f"/patients/{f['child'].id}/tool-highlights/{page.id}", json={})
    assert (await api.get(f"/tools/{page.id}/highlights")).json() == []


async def test_a_clinician_sees_only_their_own_patients_highlights(api, db):
    f = await _family(db)
    page = await _page(db, "Worry Hill")
    api.sign_in_as(f["clinician"].user)
    await api.put(f"/patients/{f['child'].id}/tool-highlights/{page.id}", json={"for_child": True})

    colleague = await make_practitioner(db, f["org"])  # same clinic, no grant
    api.sign_in_as(colleague.user)
    assert (await api.get(f"/tools/{page.id}/highlights")).json() == []
    r = await api.put(f"/patients/{f['child'].id}/tool-highlights/{page.id}", json={"for_child": True})
    assert r.status_code in (403, 404)

    outsider = await make_practitioner(db, await make_org(db))
    api.sign_in_as(outsider.user)
    assert (await api.get(f"/tools/{page.id}/highlights")).json() == []


# ── The family ──

async def test_each_reader_sees_pages_written_for_them(api, db):
    f = await _family(db)
    await _page(db, "For both")
    await _page(db, "Parent only", audience="parent")
    await _page(db, "Child only", audience="child")
    await _page(db, "Draft", published=False)

    api.sign_in_as(f["child"].user)
    assert sorted(t["name"] for t in (await api.get("/patient/tools")).json()) == ["Child only", "For both"]
    api.sign_in_as(f["parent"])
    assert sorted(t["name"] for t in (await api.get("/parent/tools")).json()) == ["For both", "Parent only"]
    parent_only = next(t for t in (await api.get("/parent/tools")).json() if t["name"] == "Parent only")
    api.sign_in_as(f["child"].user)
    assert (await api.get(f"/patient/tools/{parent_only['id']}")).status_code == 404


async def test_a_highlight_for_the_parent_is_not_first_for_the_child(api, db):
    f = await _family(db)
    await _page(db, "Alpha")
    beta = await _page(db, "Beta")
    api.sign_in_as(f["clinician"].user)
    await api.put(f"/patients/{f['child'].id}/tool-highlights/{beta.id}", json={"for_parent": True})
    api.sign_in_as(f["parent"])
    assert [t["name"] for t in (await api.get("/parent/tools")).json()][0] == "Beta"
    api.sign_in_as(f["child"].user)
    rows = (await api.get("/patient/tools")).json()
    assert [t["highlighted"] for t in rows] == [False, False]


async def test_images_on_drafts_are_hidden_from_everyone_but_the_admin(api, db):
    f = await _family(db)
    img = ToolImage(content_type="image/png", data=b"png")
    db.add(img)
    await db.flush()
    draft = Tool(name="Draft", is_published=False, blocks=[{"type": "image", "image_id": str(img.id)}])
    db.add(draft)
    await db.flush()
    api.sign_in_as(f["child"].user)
    assert (await api.get(f"/tool-images/{img.id}")).status_code == 404
    draft.is_published = True
    await db.flush()
    r = await api.get(f"/tool-images/{img.id}")
    assert r.status_code == 200 and r.content == b"png"


# ── Action plans ──

async def _plan(api, f):
    api.sign_in_as(f["clinician"].user)
    return (await api.post(f"/patients/{f['child'].id}/action-plans", json={})).json()


async def test_a_plan_takes_an_example_or_one_written_for_it(api, db):
    f = await _family(db)
    mottos = await _page(db, "Mottos", examples=[("Wait and see", "Say it, then find out"), ("Can't know", None)])
    other = await _page(db, "Take 5", examples=[("Five minutes", None)])
    plan = await _plan(api, f)
    url = f"/action-plans/{plan['id']}/items"
    wait = (await api.get(f"/tools/{mottos.id}")).json()["examples"][0]

    r = await api.post(url, json={"kind": "tool", "tool_id": str(mottos.id), "tool_example_id": wait["id"]})
    assert r.status_code == 201, r.text
    r = await api.post(url, json={"kind": "tool", "tool_id": str(mottos.id), "text": "Brave, not perfect"})
    items = r.json()["items"]
    assert [(i["label"], i["tool_name"], i["example_how_used"]) for i in items] == [
        ("Wait and see", "Mottos", "Say it, then find out"),
        ("Brave, not perfect", "Mottos", None),
    ]
    # An example from another page is refused.
    other_ex = (await api.get(f"/tools/{other.id}")).json()["examples"][0]
    r = await api.post(url, json={"kind": "tool", "tool_id": str(mottos.id), "tool_example_id": other_ex["id"]})
    assert r.status_code == 404


async def test_a_draft_page_cannot_go_on_a_plan(api, db):
    f = await _family(db)
    draft = await _page(db, "Draft", published=False)
    plan = await _plan(api, f)
    r = await api.post(f"/action-plans/{plan['id']}/items", json={"kind": "tool", "tool_id": str(draft.id)})
    assert r.status_code == 404


async def test_a_parent_only_strategy_on_the_plan_is_not_shown_to_the_child(api, db):
    f = await _family(db)
    polite = await _page(db, "Polite ignoring", audience="parent")
    plan = await _plan(api, f)
    await api.post(f"/action-plans/{plan['id']}/items", json={"kind": "tool", "tool_id": str(polite.id)})
    await api.post(f"/action-plans/{plan['id']}/publish")
    api.sign_in_as(f["child"].user)
    assert (await api.get("/patient/action-plan")).json()["items"] == []
    api.sign_in_as(f["parent"])
    assert [i["label"] for i in (await api.get("/parent/action-plan")).json()["items"]] == ["Polite ignoring"]


async def test_a_child_cannot_load_an_image_from_a_parent_only_page(api, db):
    f = await _family(db)
    img = ToolImage(content_type="image/png", data=b"png")
    db.add(img)
    await db.flush()
    db.add(Tool(name="Polite ignoring", audience="parent", is_published=True,
                blocks=[{"type": "image", "image_id": str(img.id)}]))
    await db.flush()
    api.sign_in_as(f["child"].user)
    assert (await api.get(f"/tool-images/{img.id}")).status_code == 404
    api.sign_in_as(f["parent"])
    assert (await api.get(f"/tool-images/{img.id}")).status_code == 200
    api.sign_in_as(f["clinician"].user)
    assert (await api.get(f"/tool-images/{img.id}")).status_code == 200


async def test_a_bad_id_in_a_block_is_refused_not_a_crash(api, db):
    api.sign_in_as(await make_float_admin(db))
    r = await api.post("/admin/tools", json={"name": "X", "blocks": [{"type": "image", "image_id": "nope"}]})
    assert r.status_code == 422


async def test_a_written_in_line_reaches_the_child_but_a_parent_one_does_not(api, db):
    f = await _family(db)
    plan = await _plan(api, f)
    url = f"/action-plans/{plan['id']}/items"
    await api.post(url, json={"kind": "tool", "text": "Squeeze a stress ball"})
    await api.post(url, json={"kind": "tool", "text": "Count to ten before answering", "parent_only": True})
    await api.post(f"/action-plans/{plan['id']}/publish")
    api.sign_in_as(f["child"].user)
    assert [i["label"] for i in (await api.get("/patient/action-plan")).json()["items"]] == ["Squeeze a stress ball"]


async def test_a_parent_strategy_stays_hidden_from_the_child_after_its_page_is_deleted(api, db):
    f = await _family(db)
    polite = await _page(db, "Polite ignoring", audience="parent")
    plan = await _plan(api, f)
    await api.post(f"/action-plans/{plan['id']}/items", json={"kind": "tool", "tool_id": str(polite.id), "text": "Ignore the third ask"})
    await api.post(f"/action-plans/{plan['id']}/publish")
    await db.delete(polite)
    await db.flush()
    api.sign_in_as(f["child"].user)
    assert (await api.get("/patient/action-plan")).json()["items"] == []
