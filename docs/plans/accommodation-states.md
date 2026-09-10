# Where each accommodation has got to

From the backlog (Peter, 2026-08-31): an accommodation needs a state the clinician can see and
change. Three states: **not started, started, stopped.** Built 2026-09-10.

## Today

`status` on `AccommodationBehavior` is set to "active" when an accommodation is created and nothing
reads or writes it after that.

## What changes

- The three states replace "active". A new accommodation is **not started**.
- The clinician sets the state on each row of the Parent Accommodations panel. Nothing else changes
  it except the rule below.
- **Making an accommodation the parent's focus marks it started.** That includes a stopped one: the
  backlog's case is an accommodation that has come back, which the clinician finds out about in
  session and moves back to the focus. Moving the focus on leaves the old one as it was; the
  clinician marks it stopped when it is.
- The app does not detect drift and does not try (backlog). Nothing asks the parent about an old
  accommodation again.

## Existing rows

Every row says "active", which never meant anything. The migration sets the current focus to
**started** and every other row to **not started**. All data is test data; nothing is dropped.

## Not changed

The parent app. It shows the focus and lists the others, as before. Whether a parent should see
which ones are stopped is a separate question.

## Clinical note

"Making it the focus marks it started" is a rule about accommodations, so it goes in the Dr. Walker
log. It follows the backlog's description rather than anything she has said.
