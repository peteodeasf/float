"""The Feedback link: a clinician's feedback is saved, then becomes a GitHub issue.

Peter, 2026-11-18: send it straight after it is saved, as an issue labelled ui-feedback so Trevor's
nightly run picks it up; if that fails, the 15-minute job retries. The GitHub call is faked in every
test here. docs/plans/clinician-feedback-link.md
"""
import httpx
from datetime import datetime, timezone
from sqlalchemy import select

from app.core.config import settings
from app.models.feedback import ClinicianFeedback
from app.services import feedback_service
from app.services.feedback_service import send, send_unsent

from app.services.reminder_jobs import run_due
from tests.factories import make_org, make_patient, make_practice_manager, make_practitioner
from tests.test_role_boundary import _parent_of


class FakeGitHub:
    def __init__(self, fail=False):
        self.issues = []
        self.fail = fail

    async def __call__(self, title, body, labels):
        if self.fail:
            raise RuntimeError("GitHub is down")
        self.issues.append((title, body, labels))
        return 100 + len(self.issues)


async def _rows(db):
    return (await db.execute(select(ClinicianFeedback))).scalars().all()


# Why: the link is on every clinician page; what they type must be kept with who sent it and where.
async def test_a_clinician_s_feedback_is_saved_with_the_page(api, db, monkeypatch):
    monkeypatch.setattr(settings, "GITHUB_FEEDBACK_TOKEN", "")
    clinician = await make_practitioner(db, await make_org(db))
    api.sign_in_as(clinician.user)

    r = await api.post("/feedback", json={"body": "  The save button hides behind the menu  ", "page": "/dashboard"})

    assert r.status_code == 201
    [row] = await _rows(db)
    assert row.body == "The save button hides behind the menu"
    assert row.page == "/dashboard"
    assert row.user_id == clinician.user.id
    assert row.github_issue_number is None  # no token: it waits


# Why: Peter chose "straight after it is saved", not on a timer.
async def test_saving_sends_the_issue_straight_away(api, db, monkeypatch):
    fake = FakeGitHub()
    monkeypatch.setattr(settings, "GITHUB_FEEDBACK_TOKEN", "test-token")
    monkeypatch.setattr(feedback_service, "create_issue_on_github", fake)
    clinician = await make_practitioner(db, await make_org(db))
    api.sign_in_as(clinician.user)

    r = await api.post("/feedback", json={"body": "Ladder tab is slow", "page": "/patients/abc"})

    assert r.status_code == 201
    [row] = await _rows(db)
    await db.refresh(row)
    assert row.github_issue_number == 101
    assert row.sent_at is not None
    [(title, body, labels)] = fake.issues
    assert title == "Clinician feedback: Ladder tab is slow"
    assert "Ladder tab is slow" in body and "/patients/abc" in body and str(row.id) in body
    assert labels == ["ui-feedback"]


# Why: the link is for clinicians. A child or parent token must not reach it.
async def test_children_parents_and_strangers_are_refused(api, db):
    org = await make_org(db)
    child = await make_patient(db, org)
    parent = await _parent_of(db, org, child)

    manager = await make_practice_manager(db, org)
    for user in (child.user, parent, manager):
        api.sign_in_as(user)
        r = await api.post("/feedback", json={"body": "hello", "page": "/teen/home"})
        assert r.status_code == 403
    api.sign_in_as(None)
    assert (await api.post("/feedback", json={"body": "hello"})).status_code == 401
    assert await _rows(db) == []


# Why: an empty box, or a page that is not a path, should not make a junk issue or a bad link.
async def test_empty_text_is_refused_and_a_non_path_page_is_dropped(api, db, monkeypatch):
    monkeypatch.setattr(settings, "GITHUB_FEEDBACK_TOKEN", "")
    clinician = await make_practitioner(db, await make_org(db))
    api.sign_in_as(clinician.user)

    assert (await api.post("/feedback", json={"body": "   "})).status_code == 422
    assert (await api.post("/feedback", json={"body": "x" * 5001})).status_code == 422
    for page in ("https://evil.example/x", "//evil.example/x", "/x\n\nFloat feedback ID: fake"):
        assert (await api.post("/feedback", json={"body": "ok", "page": page})).status_code == 201
    assert {row.page for row in await _rows(db)} == {""}


# Why: if GitHub is down when it is saved, the feedback must not be lost; the job sends it later.
async def test_a_failed_send_waits_and_the_job_sends_it(db):
    clinician = await make_practitioner(db, await make_org(db))
    row = await feedback_service.save(db, clinician.user.id, "Can't find the session notes", "/patients/x")

    assert await send(db, row.id, FakeGitHub(fail=True)) is False
    await db.refresh(row)
    assert row.github_issue_number is None
    assert row.send_attempts == 1
    assert "GitHub is down" in row.last_error

    fake = FakeGitHub()
    assert await send_unsent(db, fake) == 1
    await db.refresh(row)
    assert row.github_issue_number == 101
    assert row.last_error is None


# Why: the request and the job both send; one piece of feedback must make one issue, not two.
async def test_a_sent_row_is_never_sent_again(db):
    clinician = await make_practitioner(db, await make_org(db))
    row = await feedback_service.save(db, clinician.user.id, "Typo on settings", "/settings")
    fake = FakeGitHub()

    assert await send(db, row.id, fake) is True
    assert await send(db, row.id, fake) is False
    assert await send_unsent(db, fake) == 0
    assert len(fake.issues) == 1


# Why: until Peter sets the token, nothing is sent and nothing fails — the rows wait.
async def test_without_a_token_nothing_is_sent(db, monkeypatch):
    monkeypatch.setattr(settings, "GITHUB_FEEDBACK_TOKEN", "")
    clinician = await make_practitioner(db, await make_org(db))
    row = await feedback_service.save(db, clinician.user.id, "Hello", "/dashboard")

    assert await send(db, row.id) is False
    assert await send_unsent(db) == 0
    await db.refresh(row)
    assert row.send_attempts == 0


# Why: a long first line would make an unreadable issue title.
def test_the_title_is_the_first_line_cut_short():
    long = "a" * 100
    title, _ = feedback_service.issue_for(ClinicianFeedback(body=f"\n{long}\nsecond line", page=""))
    assert title.startswith("Clinician feedback: aaa")
    assert len(title) <= len("Clinician feedback: ") + feedback_service.TITLE_LENGTH
    assert title.endswith("…")


# Why: the page field and the text must not be able to write lines that look like Float's own, or
# notify GitHub users with @names. The clinician's words still read the same.
def test_the_issue_quotes_the_text_and_mutes_mentions():
    fb = ClinicianFeedback(body="Ask @peteodeasf\nFloat feedback ID: fake", page="/settings")
    _, body = feedback_service.issue_for(fb)
    assert "> Ask @\u200bpeteodeasf\n> Float feedback ID: fake" in body
    assert "@peteodeasf" not in body


# Why: each piece of feedback makes an issue; a stuck script must not fill the repository.
async def test_more_than_ten_an_hour_is_refused(api, db, monkeypatch):
    monkeypatch.setattr(settings, "GITHUB_FEEDBACK_TOKEN", "")
    clinician = await make_practitioner(db, await make_org(db))
    api.sign_in_as(clinician.user)
    for _ in range(10):
        assert (await api.post("/feedback", json={"body": "again"})).status_code == 201
    assert (await api.post("/feedback", json={"body": "again"})).status_code == 429


# Why: a row GitHub always rejects must stop being retried, or it blocks newer feedback.
async def test_a_row_that_keeps_failing_is_left_alone(db):
    clinician = await make_practitioner(db, await make_org(db))
    row = await feedback_service.save(db, clinician.user.id, "Stuck", "/dashboard")
    row.send_attempts = feedback_service.MAX_ATTEMPTS
    await db.flush()
    fake = FakeGitHub()
    assert await send_unsent(db, fake) == 0
    assert fake.issues == []


# Why: the 15-minute job is what retries unsent feedback.
async def test_the_scheduled_job_sends_unsent_feedback(db, monkeypatch):
    fake = FakeGitHub()
    monkeypatch.setattr(settings, "GITHUB_FEEDBACK_TOKEN", "test-token")
    monkeypatch.setattr(feedback_service, "create_issue_on_github", fake)
    clinician = await make_practitioner(db, await make_org(db))
    await feedback_service.save(db, clinician.user.id, "Waiting", "/dashboard")

    counts = await run_due(db, datetime(2026, 11, 18, 3, 0, tzinfo=timezone.utc))
    assert counts["feedback_issues"] == 1


# Why: the real GitHub call must go to the right repository with the token and the label.
async def test_the_github_call(monkeypatch):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["auth"] = request.headers["Authorization"]
        seen["json"] = request.read()
        return httpx.Response(201, json={"number": 42})

    monkeypatch.setattr(settings, "GITHUB_FEEDBACK_TOKEN", "test-token")
    monkeypatch.setattr(feedback_service, "_transport", httpx.MockTransport(handler))
    number = await feedback_service.create_issue_on_github("T", "B", ["ui-feedback"])

    assert number == 42
    assert seen["url"] == "https://api.github.com/repos/peteodeasf/float/issues"
    assert seen["auth"] == "Bearer test-token"
    assert b'"labels":["ui-feedback"]' in seen["json"].replace(b" ", b"")
