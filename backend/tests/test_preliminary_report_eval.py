"""The preliminary report test tool must send the model what the app sends.

It drifted once: the tool kept writing the report straight from the raw log after the app moved to
writing it from the saved list. Scores from it then described a feature clinicians no longer had.
This runs the real route and the tool on the same log, with the same fake model, and compares.
"""
import importlib.util
import json
import uuid
from pathlib import Path

from tests.factories import grant_patient_to, make_org, make_plan, make_practitioner

PIPELINE_PATH = Path(__file__).resolve().parents[1] / "evals" / "preliminary_report" / "app_pipeline.py"
CASE_PATH = PIPELINE_PATH.parent / "cases" / "theo_social.json"


def _load_pipeline():
    spec = importlib.util.spec_from_file_location("preliminary_report_app_pipeline", PIPELINE_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# Three situations seen 1, 2 and 3 times, so the list's order shows up in the report's input, and a
# behavior given twice, so the merging does too. The counts are different on purpose: items seen
# equally often come back from Postgres in no fixed order (see docs/backlog.md, "The saved list's
# order is arbitrary among items seen equally often").
EXTRACTION = {
    "situations": [
        {
            "name": "Speaking in class",
            "fear_rating": 5,
            "behaviors": [
                {"type": "escape", "description": "Goes to the nurse"},
                {"type": "escape", "description": "goes to the nurse."},
            ],
            "accommodations": [{"description": "Emails the teacher to excuse him"}],
            "entries": [1],
        },
        {
            "name": "Ordering food",
            "fear_rating": 6,
            "behaviors": [{"type": "safety", "description": "Whispers his order to his mom"}],
            "accommodations": [{"description": "Mom orders for him"}],
            "entries": [2, 4],
        },
        {
            "name": "Parties",
            "behaviors": [{"type": "avoidance", "description": "Stays home"}],
            "accommodations": [],
            "entries": [3, 5, 6],
        },
    ]
}


def _fake_client(sent: list):
    class FakeMessages:
        def create(self, **kwargs):
            sent.append(kwargs)
            from app.api.routers.patients import EXTRACTION_SYSTEM_PROMPT
            # Reply by which prompt was sent, not by counting calls.
            body = json.dumps(EXTRACTION) if kwargs["system"] == EXTRACTION_SYSTEM_PROMPT else '{"situations": []}'
            return type("M", (), {"content": [type("T", (), {"text": body})()]})()

    class FakeClient:
        def __init__(self, **kwargs):
            self.messages = FakeMessages()

    return FakeClient


async def test_the_eval_sends_the_report_call_what_the_route_sends(api, db, monkeypatch):
    # Both calls, not just the report's: the list call's input and settings matter as much.
    from app.models.monitoring import MonitoringEntry, MonitoringForm

    pipeline = _load_pipeline()
    case = json.loads(CASE_PATH.read_text())

    org = await make_org(db)
    plan = await make_plan(db, org)
    patient = plan.patient
    clinician = await make_practitioner(db, org)
    await grant_patient_to(db, patient, clinician, owner=True)
    form = MonitoringForm(patient_id=patient.id, organization_id=org.id, access_token=str(uuid.uuid4()))
    db.add(form)
    await db.flush()
    for e in pipeline.entries_from_case(case):
        db.add(MonitoringEntry(
            monitoring_form_id=form.id,
            entry_date=e.entry_date,
            situation=e.situation,
            child_behavior_observed=e.child_behavior_observed,
            parent_response=e.parent_response,
            fear_thermometer=e.fear_thermometer,
            parent_words=e.parent_words,
            is_draft=False,
        ))
    await db.flush()

    from_route: list = []
    monkeypatch.setattr("anthropic.Anthropic", _fake_client(from_route))
    api.sign_in_as(clinician.user)
    r = await api.post(f"/patients/{patient.id}/monitoring/preliminary-report")
    assert r.status_code == 200, r.text

    from_eval: list = []
    await pipeline.run_case(_fake_client(from_eval)(), case)

    assert len(from_route) == len(from_eval) == 2
    assert from_eval == from_route
    # Guard against both being equal because both are empty or wrong.
    report_input = from_eval[1]["messages"][0]["content"]
    assert "Situation: Ordering food, rated 6/10 (recorded 2 times)" in report_input
    assert (report_input.index("Situation: Parties")
            < report_input.index("Situation: Ordering food")
            < report_input.index("Situation: Speaking in class"))
    assert report_input.lower().count("goes to the nurse") == 1  # given twice, merged into one
    assert "[1] Date: 2026-06-01" in report_input


async def test_an_eval_case_with_no_entries_written_up_keeps_the_parents_words():
    # A voice note Float could not write up reaches the model as the parent's own words. The tool
    # must carry that field through, or those entries would arrive as nothing but "N/A".
    pipeline = _load_pipeline()
    from app.services.insight_service import format_entries

    text, _ = format_entries(pipeline.entries_from_case(
        {"entries": [{"parent_words": "She cried at drop-off again", "date": "2026-07-04"}]}
    ))
    assert "[1] Date: 2026-07-04" in text
    assert "Parent's own words: She cried at drop-off again" in text
