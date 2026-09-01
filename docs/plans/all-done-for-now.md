# "All done for now" — what a family sees after treatment is closed

**Planned 2026-09-01.** Finishes the closing feature shipped 2026-08-31
([`patient-list-phases.md`](patient-list-phases.md)).

## What is broken today

A clinician can close a patient, and the backend does switch the family off: every write is
refused. But **nothing in either app reads that**. `/auth/me` returns `treatment_closed`
(`auth.py:161`) and no frontend file mentions it.

So a closed child signs in, sees their normal home screen with their tasks on it, taps something,
and gets an error. The parent is the same. That is the whole defect.

There is a second, smaller problem. The teen and parent apps call `/auth/me` **only at login** and
cache the answer in `localStorage`. A family already signed in when their clinician closes them
would not notice until they signed in again. So this has to be read live, not from storage.

## What it should be

Peter, 2026-08-31:

- They can still sign in. They get in and find nothing to do.
- The message is **"All done for now."** Not "your treatment is over" — that reads like being
  discharged, and a closed patient can be reopened.
- **Put their progress on the screen**, not just the message: what they did, and the fears that did
  not come true. Ending on what they achieved beats ending on a notice.

## How

**No backend work.** `/auth/me` already reports it, and every number needed is already in payloads
the apps read today:

| | Where the numbers come from |
|---|---|
| **Child** | `/patient/ladder` — it already carries every experiment with `feared_outcome_occurred`, and `deriveEffort` in `lib/teenProgress.ts` already counts what they did. |
| **Parent** | `GET /parent/moments` — each logged moment records whether they held. |

**Where it goes:** the two route wrappers in `main.tsx`, `TeenProtectedRoute` and
`ParentProtectedRoute`. They already gate every screen in each app, so one check there covers
everything and nothing can be reached around it. They fetch `/auth/me` live and, when it says
closed, render the closing screen instead of the routed page.

Sign out stays available. Nothing else does.

## The scheduled exposure

Peter raised this: a child may have an exposure scheduled for tomorrow when their patient is closed.

**Nothing needs to happen to it.** The child cannot reach it — the app shows only the closing
screen — and the backend refuses the write anyway. There is no scheduler, so no reminder fires.
The row stays in the database, which is what reopening a patient needs.

## How to tell it worked

- A clinician closes a patient; the child reloads and sees "All done for now" with their numbers,
  not their tasks.
- The same for the parent.
- The clinician reopens; both apps go back to normal on reload.
- A child who was signed in the whole time sees it after a reload, without signing out.
