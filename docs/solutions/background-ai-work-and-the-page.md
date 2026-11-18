# AI work that runs after the response, and how the page knows about it

**Problem.** The case summary now updates on its own after a new monitoring entry or session note
(docs/plans/case-summary-auto-refresh.md). The work runs after the response, using FastAPI's
`BackgroundTasks`. Three things were not obvious.

1. **The page asks too early.** Starlette runs background tasks only after the response is sent. A
   status check sent the moment a save comes back can arrive before the task has started, and gets
   "not updating". Fix: record the request in memory *inside the route, before returning*
   (`case_summary_service.schedule` calls `request()` first, then queues `drain`). The status route
   sees it straight away.

2. **Rapid saves overlap.** Every entry starts a run, and each run makes two model calls over the
   whole log. Two runs at once would rebuild the suggestion list at the same time. Fix: one run per
   patient at a time (`_busy`), and whatever arrives meanwhile is merged into one waiting request
   (`_waiting`), done straight after. No timer, so no lag. AI Refresh holds the same per-patient
   `asyncio.Lock`.

3. **The model calls block.** The Anthropic client is synchronous. Called directly in an `async`
   route, it stops the whole server for the length of the call. Fix: `asyncio.to_thread`. The old
   monitoring analysis route had this problem too.

4. **Watching "updating" is not enough on the page.** The page checked every 30 seconds and
   reloaded when "updating" went from on to off. A run takes 20–40 seconds, so one could start and
   finish between two checks and the page never reloaded (Peter, 2026-11-18: "monitoring data does
   not automatically refresh in the case summary"). Separately, AI Refresh kept its result in page
   state, which then hid every later automatic update. Fix: the status route also returns
   `changed_at` (the latest `generated_at` / `analyzed_at` in the summary), the page reloads
   whenever it moves, and the page always shows the saved summary.

**Limits.** The state is in the server's memory. Railway runs one `uvicorn` process
(`backend/railway.toml`), so it is complete. With more than one process, the status route and the
one-at-a-time rule would only see their own process. A request whose run never started counts as
"updating" for at most 10 minutes (`_STALE_SECONDS`).

**Tests.** The test `api` fixture makes background tasks use the test session
(`get_session_factory` override), and the in-memory transport waits for them. So a test can save an
entry and check the summary on the next line. See `backend/tests/test_case_summary_auto_refresh.py`.
