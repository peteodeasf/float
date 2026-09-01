# Telling a clinician something needs attention

**Planned 2026-09-01** from Peter's review. Not started.

## Today

**Float sends a clinician nothing.** All five emails go to patients, parents or new clinicians, and
each is triggered by someone deliberately clicking send. There is no digest, no alert, no summary.

The only thing that comes close is on the patient list: `needsAttentionReasons` in
`DashboardPage.tsx` already works out three reasons, and shows them as **a coloured dot with the
reason in a tooltip**. A clinician scanning their list sees dots and has to hover over each one.

The three it computes:

- an experiment is overdue
- an active plan with no activity this week
- a monitoring form sent and fewer than three entries back

There is also a `notifications` table, patient-scoped, that **no route reads**.

## What this is

Three channels, and they are not equal:

| | |
|---|---|
| **In the portal** | Visual indicators where the work is. Needs no delivery mechanism, and it is what a clinician sees every day. |
| **Email** | Resend is wired and working. |
| **SMS** | Twilio is wired, and used today only for the monitoring form. |

Peter, 2026-09-01: notification control is *"something we should scaffold for fleshing out later"*.

**So the scaffold is the events and the preferences, not a screen of switches.** A settings page
whose toggles control nothing is worse than no settings page — it tells a clinician they have
turned something off when nothing changed.

## The shape

**An event** is a thing worth telling someone about.

**The starting four** (Peter, 2026-09-01). All of them are the *absence* of something — a clinician
needs to know when nothing is happening, which is the opposite of what an alert usually does:

| Event | What it reads |
|---|---|
| **No monitoring entries in the past week** | A form has been sent and nothing has come back for seven days. `MonitoringEntry.created_at`. |
| **No exposure activity in the past week** | There is a live experiment — `planned` or `in_progress` — and nothing has moved on it for seven days. |
| **Nothing recorded on a scheduled exposure** | Its date has passed with nothing reported. Closest to what the list already computes as "overdue". |
| **No parent accommodation activity in the past week** | No `AccommodationMoment` logged in seven days. The column and its timestamp already exist. |

All four are computable from data that is already there. None of them needs new recording.

**Peter, 2026-09-01: these want review with Dr. Walker and feedback from clinicians before they are
treated as settled.** They are a starting point chosen by the person building the product, not a
clinical judgement about what a therapist should be interrupted for.

Worth noticing what is absent from the four, and deciding later rather than assuming: a child
marking an exposure too hard, a parent caving repeatedly on the accommodation they are working on,
and a message sitting unanswered. All three exist in the data.

**A preference** is one clinician, one event, one channel, on or off. That is the table to build
early, because everything else reads from it, and it is cheap to get right now and expensive to
retrofit.

**Delivery** is per channel and can arrive one at a time.

## Order of work

1. **Show the reasons in the portal properly.** They are already computed and already hidden in a
   tooltip. Surfacing them is the whole first step and needs no new machinery.
2. **The events and preferences model.** The scaffold Peter asked for.
3. **Email delivery**, since Resend already works.
4. **The settings screen**, once there is something for it to control.
5. **SMS**, last. It needs a scheduler, which does not exist, and A2P 10DLC registration — the same
   thing blocking teen reminders.

## Deliberately not first

**The settings screen.** It is the visible part and the tempting place to start, and it is the one
piece that cannot be honest until the rest exists.

## Open

**Which events.** Three exist. Peter's to extend, from use.

**Whether anything is push rather than pull.** An overdue experiment noticed on Monday is different
from one that emails on Saturday morning. What is worth interrupting someone for is a clinical
judgement as much as a product one.

**Digest or immediate.** Five emails in an afternoon is how a clinician turns all of them off.

## How to tell it worked

- A clinician opening the portal can see what needs attention without hovering over anything.
- Turning an event off in settings actually stops it arriving.
- A clinician gets nothing about a patient they have no access to.
