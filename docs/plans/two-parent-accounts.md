# Two parent accounts for one child

Peter, 2026-09-15: a child can have two parent accounts. Both take part — both monitor, both answer
the weekly check-in, both get their own thread with the clinician.

Not built. The database already allows it; the app assumes one parent in several places.

## Decided (Peter, 2026-09-15)

- **A thread per parent.** The clinician has a separate conversation with each parent. Neither parent
  sees the other's messages.
- **Both parents answer the weekly check-in.** The clinician sees who has answered and who has not.
  A parent who never takes part is visible rather than hidden.
- **Both parents get the reminder emails**, and each parent can turn their own off.
- **A link each for the monitoring week, and the clinician sees which parent wrote each entry.**

## What is already true

- `parent_patient_links` is a many-to-many table: the unique constraint is on the pair, not on the
  child (`backend/app/models/patient.py:99-120`). **No migration is needed to have two parents.**
- The invite route already allows any number of parents per child
  (`backend/app/api/routers/patients.py:784-861`).
- Parent experiments are plan-scoped, and weekly check-ins are already recorded per parent
  (`backend/app/services/accommodation_service.py:185-212`).

## What breaks today, in the order it should be fixed

### 1. The clinician cannot see who a child's parents are — BUILT 2026-09-15 `S`

`TeenAccessPanel.tsx:289-308` is one "Parent's email" box with an Invite button. There is no list, no
way to remove a parent, and re-inviting an existing email **resets that parent's password**
(`patients.py:816-822`) — easy to do by accident when adding the second parent.

**Built:** the Parent panel lists each parent with their email, whether they have signed in, and
whether their reminder emails are off, with a Remove on each. Inviting an email that is already a
parent of this child does nothing and says so — it no longer resets their password. Removing
unlinks the parent and keeps their check-ins, messages and monitoring entries.
`GET /patients/{id}/parents`, `DELETE /patients/{id}/parents/{parent_user_id}`. A parent has no name
anywhere in Float, so the list shows the email.

### 2. Messages: a thread per parent — BUILT 2026-09-15 `M`

Today the clinician's reply picks whichever parent row comes back first
(`backend/app/api/routers/messages.py:159-167`), and the other parent gets a 403 when their app marks
it read (`parent.py:534-535`), silently and on every message.

**Built:** the Chat tab lists the child and then each parent, and each parent's messages are their
own. `GET`/`POST /patients/{id}/parents/{parent_user_id}/messages`; `GET /parent/messages` returns
only the signed-in parent's own. Sending to someone who is not a parent of the child is a 400.
The ids are in the path, not the query string — `tests/test_access_dependency_wiring.py` enforces
that, and it caught the first attempt.

### 3. The weekly check-in: both parents answer — BUILT 2026-09-15 `S`–`M`

`attention_service.py:117-131` treats a check-in from anyone as the week answered.

**Built:** the week is answered only when every linked parent has answered, and the flag on the
patient names the parent who has not ("No weekly check-in from dad@example.com last week"). With one
parent the wording is unchanged. The Experiments tab already showed which parent answered when more
than one had. Whether a lapse moves the family on is still the clinician's call.
**Gate:** clinical sign-off; pre-launch that is Peter's, and he asked for this on 2026-09-15.

### 4. Reminder emails: both parents, and each can turn their own off `M`

`reminder_jobs.py:236-237` and `:278-279` already send to every linked parent.

**Changes:** a tick box in the parent app, "Email me reminders", saved per parent and honoured by
both scheduled jobs. The monitoring week's evening email uses the same switch.

### 5. Monitoring: a link each, and who wrote what `M`

Today one form per child, one `parent_email`, one token
(`backend/app/api/routers/monitoring.py:90-101`, `app/models/monitoring.py:37-45`), and nothing on an
entry says who wrote it.

**Changes:** one form per parent for the same week, each with its own link and evening email; each
entry records which form it came from, so the clinician sees "Mum" or "Dad" on it. The extraction
reads all of the week's entries together, as now. Teachers and carers are a later step
(docs/backlog.md, "Monitoring by more than one person").
**Gate:** `/security-review` — a form link is an unguessable token with no login.

### 6. The accommodation conversation: an answer per parent `M`

`accommodation_conversation.py:107-115` stores "do you still do this?" and the parent's estimate on
the shared suggestion row, so the second parent overwrites the first, and `named_by_user_id`
(`insight.py:107`) credits whoever spoke first.

**Changes:** a row per parent per accommodation, and the clinician sees both answers side by side.
Where the two parents disagree, that is worth showing rather than averaging.
Peter, 2026-09-15: each parent answers separately.

### 7. The patient record's own parent fields `S`

`PatientProfile.parent_name / parent_email / parent_phone` (`patient.py:50-52`) are separate from the
link table and will drift. Decide whether they become the invite defaults only, or go.

## Questions, answered

All answered by Peter, 2026-09-15:

1. **"Parents can see the child's progress"** (the tick box under Parent on the patient page) stays
   one tick box covering both parents.
2. **The accommodation conversation:** each parent answers separately (item 6).
3. **The clinician can remove a parent.** Their check-ins, messages and experiments stay on the
   record.
4. **Each accommodation names the parent it belongs to**, so the child is rating the right thing when
   the clinician rates them together in session. The child's app still shows nothing about parents.

## Size

About two to three weeks in total. Items 1 to 3 are the ones that make two parents behave correctly
and are worth doing first; 4 to 6 are the fuller feature.

## How to tell it worked

A child with two parents: each parent sees only their own thread; the clinician sees two threads and
two check-in answers; both parents get their own monitoring link, and their entries are marked with
their name on the clinician's monitoring tab. Tests cover all of it — there is no test anywhere today
with two parents on one child.
