"""Which AI calls set a temperature, and to what.

From "Make the AI answer the same way each run" (docs/backlog.md, 2026-10-21). Each call was
measured with the AI test runner at the app's setting and at 0 before anything changed. The model
is replaced here, so nothing is spent.
"""
import asyncio
from types import SimpleNamespace

from app.services import combination_wording, insight_service, step_suggestion_service


class FakeClient:
    """Keeps each call's arguments and answers with `text`."""

    def __init__(self, text: str):
        self.calls = []
        self._text = text
        self.messages = self

    def create(self, **kwargs):
        self.calls.append(kwargs)
        return SimpleNamespace(content=[SimpleNamespace(type="text", text=self._text)],
                               stop_reason="end_turn")


class AsyncFakeClient(FakeClient):
    async def create(self, **kwargs):
        return FakeClient.create(self, **kwargs)


def test_suggested_rungs_send_temperature_zero():
    # At 0 the three runs of a situation agreed on 32 of 40 made-up cases, against 21 with no
    # temperature, and no check got worse. If this is changed, measure again first.
    client = FakeClient('{"suggestions": ["a", "b"], "variations": ""}')
    step_suggestion_service.ask_claude("context", client=client)
    assert step_suggestion_service.SUGGESTION_TEMPERATURE == 0.0
    assert client.calls[0]["temperature"] == 0.0


def test_step_sentences_send_no_temperature():
    # Step sentences run on Opus 5.5, which refuses any temperature but the default with a 400
    # (checked 2026-10-21). Sending one would turn every drafted sentence into the template.
    client = AsyncFakeClient("Answer a question in class")
    asyncio.run(combination_wording.ask_claude("Answering in class", "Sitting at the back", client=client))
    assert "temperature" not in client.calls[0]


def test_monitoring_analysis_sends_temperature_zero():
    # At 0 the three runs agreed more often (0.59 to 0.70 on 9 made-up families) and behavior types
    # held (126 of 144 against 127). Session note suggestions share this call. Measure again before
    # changing it.
    client = FakeClient('{"situations": []}')
    insight_service.request_extraction(client, "system", "entries")
    assert insight_service.EXTRACTION_TEMPERATURE == 0.0
    assert client.calls[0]["temperature"] == 0.0


def test_preliminary_report_sends_no_temperature():
    # The preliminary report was not measured at 0, so it keeps the default until it is.
    client = FakeClient("report")
    insight_service.request_report(client, "system", [], "entries")
    assert "temperature" not in client.calls[0]
