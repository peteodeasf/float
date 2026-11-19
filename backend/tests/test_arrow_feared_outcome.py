"""The feared outcome drafted from the whole downward arrow. docs/plans/arrow-feared-outcome.md

The AI is replaced by a stand-in that records what it was sent, so the test checks that every
answer reaches it, not only the last one. No real AI call is made.
"""
import pytest

from app.api.routers.downward_arrows import FEARED_OUTCOME_SYSTEM_PROMPT
from tests.factories import make_org, make_patient, make_practitioner, _make_user

pytestmark = pytest.mark.asyncio

ARROW = {
    "starting_thought": "I'll forget what to say when I order.",
    "steps": [
        {"question": "What will happen if you forget?", "response": "The cashier will look at me weird."},
        {"question": "What will happen if the cashier looks at you weird?", "response": "I don't know."},
        {"question": "So, what will happen then?", "response": "Everyone in line will think I'm stupid."},
    ],
}


@pytest.fixture
def fake_ai(monkeypatch):
    sent = {}

    class _Msgs:
        def create(self, **kw):
            sent.update(kw)
            if sent.get("fail"):
                raise RuntimeError("down")
            class _C: text = sent.get("reply", '"I\'ll forget, the cashier will stare, and everyone will think I\'m stupid."')
            class _M: content = [_C()]
            return _M()

    class _Client:
        def __init__(self, *a, **kw):
            self.messages = _Msgs()

    import anthropic
    monkeypatch.setattr(anthropic, "Anthropic", _Client)
    return sent


async def test_every_answer_reaches_the_ai_and_the_draft_comes_back(api, db, fake_ai):
    api.sign_in_as((await make_practitioner(db, await make_org(db))).user)
    r = await api.post("/downward-arrows/feared-outcome", json=ARROW)
    assert r.status_code == 200, r.text
    # Quote marks around the model's answer are taken off.
    assert r.json()["feared_outcome"] == "I'll forget, the cashier will stare, and everyone will think I'm stupid."
    sent = fake_ai["messages"][0]["content"]
    assert fake_ai["system"] == FEARED_OUTCOME_SYSTEM_PROMPT
    for text in [ARROW["starting_thought"], *(s["response"] for s in ARROW["steps"])]:
        assert text in sent


async def test_when_the_ai_fails_the_screen_is_told(api, db, fake_ai):
    fake_ai["fail"] = True
    api.sign_in_as((await make_practitioner(db, await make_org(db))).user)
    r = await api.post("/downward-arrows/feared-outcome", json=ARROW)
    assert r.status_code == 502


async def test_children_and_parents_cannot_use_it(api, db, fake_ai):
    org = await make_org(db)
    for user in ((await make_patient(db, org)).user, await _make_user(db, org, "parent")):
        api.sign_in_as(user)
        assert (await api.post("/downward-arrows/feared-outcome", json=ARROW)).status_code in (401, 403)
    assert "messages" not in fake_ai
