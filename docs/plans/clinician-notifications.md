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

**An event** is a thing worth telling someone about. The three above already exist as computed
reasons; they are the starting list, not the list. Extending it is Peter's, and it is the sort of
thing that should come from using the product rather than from reading the code.

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
