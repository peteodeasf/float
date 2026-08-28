# Backlog

Work that is agreed but not started. Each item should be actionable without the conversation that
produced it — file paths, current behaviour, what changes, how to tell it worked.

---

## Granting and revoking a patient's clinicians — no UI

**Priority: high — the access change is deployed without it.** Raised 2026-08-28.

The grants themselves shipped on 2026-08-28 (`8aa62c4`, live in production). A clinician now sees a
patient because they hold a live grant, or because they are an institution admin. What did not ship
is any way to change that from the app.

**Today:** the API works and is tested —

- `GET /patients/{patient_id}/access` — who can open this patient
- `POST /patients/{patient_id}/access` — grant a colleague in the same institution
- `DELETE /patients/{patient_id}/access/{practitioner_id}` — revoke

— but nothing in `apps/web/` calls any of them. So access can only be changed with a direct API call
or by editing the database. **Nobody can hand a patient over from inside the product.** The backfill
gave every patient's primary practitioner a grant, so nothing is stuck today; it becomes a real
problem the first time a clinician needs cover, leaves, or transfers a case.

**What changes:** a section on the patient page listing who has access, with add and remove. The
clinician being added has to be picked from the same institution — there is no endpoint listing
colleagues yet, so that probably needs one.

**Rules already enforced by the backend, which the UI should reflect rather than re-implement:**
- You can only grant to a clinician in the patient's own institution (404 otherwise).
- You cannot revoke the last live grant — it would leave a patient nobody can open. The API returns
  409 with a message; the UI should not offer the action rather than surfacing the error.
- Institution admins are deliberately not listed as grants. They see everyone, and showing them here
  would imply they can be revoked from this screen.
- A revoked grant is kept, not deleted (`revoked_at`), so who had access when stays answerable.

**How to tell it worked:** a clinician can grant a colleague from the patient page, the colleague
sees that patient in their roster, and revoking removes it again. Backend behaviour is already
covered by `tests/test_patient_access_grants.py` — this is a frontend piece.

**Worth knowing:** two of the three clinicians in production are institution admins
(`user_roles.is_org_admin`), so grants restrict only one of them today. The boundary is only as tight
as who holds admin. That is a settings question, not a code one.

Plan and decisions: [`clinician-patient-access-grants.md`](plans/clinician-patient-access-grants.md).
Deferred from that work, still not urgent: expiring grants (`expires_at` plus one condition) for
time-limited cover, and reassigning a caseload when a clinician leaves.

---

## Reorder is silently broken — two routes are shadowed

**Priority: medium — user-visible, live now.** Raised 2026-08-28.

FastAPI matches routes in declaration order, and a UUID route sits above each of these:

- `PUT /ladders/{ladder_id}/rungs/reorder` (`backend/app/api/routers/ladders.py:72`) is shadowed by
  `PUT /ladders/{ladder_id}/rungs/{rung_id}` (line 55).
- `PUT /plans/{plan_id}/triggers/reorder` (`trigger_situations.py:82`) is shadowed by
  `PUT /{trigger_id}` (line 49).

So `"reorder"` is parsed as a rung or situation id, fails UUID validation, and returns 422.
Drag-to-reorder does nothing in the ladder and the plan builder. `accommodations.py` has the same
pair in the right order and works — use it as the model.

Found while verifying the security review; unrelated to it and pre-existing.

**Fix:** move each reorder declaration above the UUID route. Then add a test asserting each reorder
URL routes to its own handler, so a route added above them re-breaks visibly rather than silently.

---

## Arrow evaluation — nothing triggers the harvest

**Raised 2026-08-28. Blocked on real usage, not on work.**

`AI-dev/Arrow Eval/harvest.py` turns real downward-arrow chains into evaluation cases. Nothing runs
it. There is no schedule, no hook, no trigger — someone types the command or it does not happen.

That is deliberate for now: it reads only arrows created on or after 2026-08-28, and there are none.
It will keep finding nothing until the arrow is used in a real session. Automating a collector with
nothing to collect cannot be checked.

**The trigger to watch for:** the first real session that uses the downward arrow. Run the harvest
straight afterwards, while the session is fresh enough for Peter to say what the right question
would have been. His review is the part that makes a case worth anything; the script only gathers.

**When it earns automation:** once the queue has a backlog and the manual run is being missed. The
version that works unattended is a scheduled job on Railway, which sits next to the database
already. A local scheduled job only fires when Peter's laptop is on and will skip weeks in silence.
Do not put case collection into the app's own code — it is eval plumbing on a live clinician path.

**Also unfinished on the same tooling:**
- Six synthetic cases have no target question from Peter (draft-01, 02, 03, 09, 10, 14).
- draft-08's response ("Nobody likes me") is one he flagged as an unlikely thing for a child to say;
  it needs rewriting or dropping.
- Cases are compared to targets by exact string match, so "you're stuck" vs "get stuck" counts as a
  miss. Scoring against a rubric is the fix, and the rubric needs Dr. Walker.
- draft-12, 13 and 15 appear as examples inside the shipped prompt, so their matches prove nothing.
  See [`eval-cases-burned-by-putting-them-in-the-prompt.md`](solutions/eval-cases-burned-by-putting-them-in-the-prompt.md).

---

## Product review and backlog generation

**Owner: Peter. Not for Claude to generate.** Raised 2026-08-27.

The open-items list needs to come from Peter reviewing the product. Claude reading the source code
produces only the mechanical half — disabled buttons, TODOs, a table nothing writes to. It cannot
find a screen that works but confuses, a flow with too many steps, or something missing that was
expected. Those came from Peter looking at it all day ("it's a mess", "this is still loading up the
screen"), and nothing in the code would have surfaced them.

Any list Claude produces on its own will be partial and will read as more complete than it is.

## Smaller, already agreed

- **"Plan an experiment" is missing from the flat ladder.** It exists only in the situations view
  (`BehaviorPanel`), so an ungrouped rung cannot be reached. See
  [`flat-ladder-grouped-situations.md`](plans/flat-ladder-grouped-situations.md).
- **"Run AI review" has never done anything.** `run_ladder_review` reads `ladder_rungs`, which has
  zero rows in production. Decide what it should read now that rungs are behaviour rows.
- **Session mode still only asks "what do you do so it feels safer?"** — it should also be able to
  add a version-of-this-situation rung. Phase 3 of the flat-ladder plan.
- **`.claude/settings.local.json` has 279 allow entries** — worth pruning to patterns.
