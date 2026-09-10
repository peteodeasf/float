# The parent's weekly check-in

From the backlog (Peter, 2026-08-31): once a week the parent answers one question about their focus
accommodation — **held every time / mostly / gave in**. It is what tells the clinician whether the
parent is ready to move to the next accommodation, not a status report.

Peter, 2026-09-10: it **replaces** logging each moment. Logging every moment is the part parents do
not keep up.

## What the parent sees

On the parent home, inside the focus card: *"This week, did you hold the line?"* with three
answers of equal weight — **Every time**, **Mostly**, **I gave in**. Once answered it says what they
said, and they can change it until the week is over. The "I held the line / I gave in" buttons for
each moment are gone.

The week runs Monday to Sunday in the parent's own time. The app works out the Monday and sends it;
the server accepts this week's Monday or last week's, so a parent answering on a Monday morning about
the week before is not refused.

One answer per parent, per accommodation, per week. Two parents each answer for themselves.

## What the clinician sees

On the Parent Accommodations panel, "Recent parent logs" becomes **Weekly check-ins**: each week,
which accommodation, and the answer. "Gave in" is red. The parent's email shows when more than one
parent has answered.

The clinician decides when the parent moves on. The app does not move the focus by itself.

## When the treatment is closed

The parent's closing screen counted moments they held. It now counts the weeks they held the line,
every time or mostly.

## Left for later

- The old moments table (`accommodation_moments`) stays in the database. Nothing writes to it or
  reads it any more. Dropping it is a later clean-up.
- No reminder to answer. There is no scheduler (backlog).
- A "gave in" answer does not yet put a dot on the clinician's patient list.

## Checks

`/security-review`: a new place a parent writes and a clinician reads. Tests cover: the answer is
checked; only this week or last; only the family's own accommodations; a closed patient's parent
cannot write; a clinician without access cannot read; deleting an accommodation takes its answers
with it; the moment routes are gone.
