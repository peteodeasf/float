"""The review link: an unguessable token instead of a login.

The token is the whole of the authentication, so the thing to prove is that a wrong one gets
nothing, and that a right one saves every click without the reviewer submitting anything.
"""
import uuid

import pytest
from sqlalchemy import select

from app.models.review import ReviewRound, ReviewReviewer, ReviewMark

ITEMS = [
    {
        "key": "sit-1",
        "situation": "Eating lunch in the cafeteria",
        "rating": 6,
        "existing": ["Wears headphones so nobody talks to her"],
        "suggestions": [
            "Eat lunch in the cafeteria for ten minutes with your close friend",
            "Eat in the cafeteria with your friend, with no headphones",
        ],
        "note": "where you sit, how busy it is",
    },
]


async def _round(db, name="Dr. Walker", token="tok-good"):
    r = ReviewRound(slug=f"round-{uuid.uuid4().hex[:8]}", title="Would you show this?", items=ITEMS)
    db.add(r)
    await db.flush()
    reviewer = ReviewReviewer(round_id=r.id, name=name, token=token)
    db.add(reviewer)
    await db.flush()
    return r, reviewer


async def test_a_wrong_token_gets_nothing(api, db):
    await _round(db)
    r = await api.get("/review/not-the-token")
    assert r.status_code == 404


async def test_the_page_shows_the_suggestions(api, db):
    _, reviewer = await _round(db)
    r = await api.get(f"/review/{reviewer.token}")

    assert r.status_code == 200
    assert "Eating lunch in the cafeteria" in r.text
    assert "Eat in the cafeteria with your friend, with no headphones" in r.text
    assert "Wears headphones so nobody talks to her" in r.text
    # The reviewer's name is deliberately NOT on the page — it says "Test Data · Clinical Review"
    # instead, so the header does not read as addressed to one person.
    assert "Dr. Walker" not in r.text
    assert "Test Data" in r.text


async def test_a_mark_is_saved(api, db):
    _, reviewer = await _round(db)

    r = await api.post(f"/review/{reviewer.token}/mark",
                       json={"item_key": "sit-1:0", "choice": "show"})
    assert r.status_code == 204

    saved = (await db.execute(select(ReviewMark))).scalars().all()
    assert [(m.item_key, m.choice) for m in saved] == [("sit-1:0", "show")]


async def test_marking_again_overwrites(api, db):
    _, reviewer = await _round(db)
    await api.post(f"/review/{reviewer.token}/mark", json={"item_key": "sit-1:0", "choice": "show"})
    await api.post(f"/review/{reviewer.token}/mark", json={"item_key": "sit-1:0", "choice": "hide"})

    saved = (await db.execute(select(ReviewMark))).scalars().all()
    assert len(saved) == 1
    assert saved[0].choice == "hide"


async def test_a_null_choice_clears_the_mark(api, db):
    _, reviewer = await _round(db)
    await api.post(f"/review/{reviewer.token}/mark", json={"item_key": "sit-1:0", "choice": "show"})
    await api.post(f"/review/{reviewer.token}/mark", json={"item_key": "sit-1:0", "choice": None})

    assert (await db.execute(select(ReviewMark))).scalars().all() == []


async def test_an_unknown_choice_is_refused(api, db):
    _, reviewer = await _round(db)
    r = await api.post(f"/review/{reviewer.token}/mark",
                       json={"item_key": "sit-1:0", "choice": "maybe"})
    assert r.status_code == 400


async def test_marks_come_back_when_she_returns(api, db):
    _, reviewer = await _round(db)
    await api.post(f"/review/{reviewer.token}/mark", json={"item_key": "sit-1:1", "choice": "hide"})

    r = await api.get(f"/review/{reviewer.token}")
    assert 'data-key="sit-1:1" data-choice="hide"' in r.text


async def test_one_reviewer_cannot_see_anothers_marks(api, db):
    round_, walker = await _round(db, name="Dr. Walker", token="tok-walker")
    peter = ReviewReviewer(round_id=round_.id, name="Peter", token="tok-peter")
    db.add(peter)
    await db.flush()

    await api.post("/review/tok-walker/mark", json={"item_key": "sit-1:0", "choice": "show"})

    r = await api.get("/review/tok-peter")
    assert r.status_code == 200
    # Precisely: no suggestion ROW carries a choice. "data-choice" alone also appears in the
    # stylesheet, so asserting on the bare string passes for the wrong reason.
    assert 'data-key="sit-1:0" data-choice=' not in r.text
    assert 'data-key="sit-1:1" data-choice=' not in r.text


async def test_the_page_escapes_the_text_it_was_given(api, db):
    """Items are seeded from files we write, but the page is HTML and the text is data."""
    r = ReviewRound(slug=f"round-{uuid.uuid4().hex[:8]}", title="T", items=[{
        "key": "x", "situation": "<script>alert(1)</script>", "rating": 5,
        "existing": [], "suggestions": ["<img src=x onerror=alert(2)>"], "note": None,
    }])
    db.add(r)
    await db.flush()
    reviewer = ReviewReviewer(round_id=r.id, name="Dr. Walker", token="tok-esc")
    db.add(reviewer)
    await db.flush()

    page = (await api.get("/review/tok-esc")).text
    # The test is whether the browser would ever see a TAG, not whether the characters appear —
    # escaped text still contains the word "onerror", inertly.
    assert "<script>alert(1)</script>" not in page
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in page
    assert "<img src=x" not in page
    assert "&lt;img src=x onerror=alert(2)&gt;" in page


# --- her own suggestions ---------------------------------------------------------------

async def test_she_can_add_her_own(api, db):
    from app.models.review import ReviewAddition

    _, reviewer = await _round(db)
    r = await api.post(f"/review/{reviewer.token}/add",
                       json={"item_key": "sit-1", "body": "Eat with your friend in the library"})
    assert r.status_code == 201
    assert r.json()["body"] == "Eat with your friend in the library"

    saved = (await db.execute(select(ReviewAddition))).scalars().all()
    assert [a.body for a in saved] == ["Eat with your friend in the library"]


async def test_her_additions_come_back(api, db):
    _, reviewer = await _round(db)
    await api.post(f"/review/{reviewer.token}/add",
                   json={"item_key": "sit-1", "body": "Sit near the door"})

    page = (await api.get(f"/review/{reviewer.token}")).text
    assert "Sit near the door" in page


async def test_an_empty_addition_is_refused(api, db):
    _, reviewer = await _round(db)
    r = await api.post(f"/review/{reviewer.token}/add", json={"item_key": "sit-1", "body": "   "})
    assert r.status_code == 400


async def test_she_can_remove_her_own(api, db):
    from app.models.review import ReviewAddition

    _, reviewer = await _round(db)
    made = await api.post(f"/review/{reviewer.token}/add",
                          json={"item_key": "sit-1", "body": "Sit near the door"})
    addition_id = made.json()["id"]

    r = await api.request("DELETE", f"/review/{reviewer.token}/add/{addition_id}")
    assert r.status_code == 204
    assert (await db.execute(select(ReviewAddition))).scalars().all() == []


async def test_she_cannot_remove_someone_elses(api, db):
    from app.models.review import ReviewAddition

    round_, walker = await _round(db, name="Dr. Walker", token="tok-w2")
    peter = ReviewReviewer(round_id=round_.id, name="Peter", token="tok-p2")
    db.add(peter)
    await db.flush()

    made = await api.post("/review/tok-w2/add", json={"item_key": "sit-1", "body": "Hers"})
    r = await api.request("DELETE", f"/review/tok-p2/add/{made.json()['id']}")

    assert r.status_code == 404
    assert len((await db.execute(select(ReviewAddition))).scalars().all()) == 1


async def test_an_addition_is_escaped_on_the_page(api, db):
    _, reviewer = await _round(db)
    await api.post(f"/review/{reviewer.token}/add",
                   json={"item_key": "sit-1", "body": "<img src=x onerror=alert(1)>"})

    page = (await api.get(f"/review/{reviewer.token}")).text
    assert "<img src=x" not in page
    assert "&lt;img src=x onerror=alert(1)&gt;" in page


async def test_she_can_add_several_to_one_situation(api, db):
    from app.models.review import ReviewAddition

    _, reviewer = await _round(db)
    for body in ["Sit near the door", "Eat with one friend at the end table", "Ten minutes only"]:
        r = await api.post(f"/review/{reviewer.token}/add",
                           json={"item_key": "sit-1", "body": body})
        assert r.status_code == 201

    saved = (await db.execute(select(ReviewAddition))).scalars().all()
    assert len(saved) == 3

    page = (await api.get(f"/review/{reviewer.token}")).text
    for body in ["Sit near the door", "Eat with one friend at the end table", "Ten minutes only"]:
        assert body in page
