# Teen data testing — plan

> **Planned 2026-10-21** with Peter. **Built 2026-10-21.** What was worked out on the way:
> `docs/solutions/teen-data-testing-dates.md`.

## Why

The teen app is being redesigned through co-design, which will take 3–4 weeks. Until then the
clinician's Progress tab (today called "Exposures") cannot be tested, because nothing records
exposures. Peter, 2026-10-21: build a test page that records the teen's data, made so a tester can
find and set every value quickly, with everything else taken away.

## What it is

A separate page, **"Teen data testing"**, at its own address: `app.floatcbt.com/teen-test`.

- **It signs in as the teen**, with the teen's own account, and uses the same backend calls as the
  teen app. The clinician never writes the teen's data, so the boundary between clinician and
  child data stays as it is.
- **The current teen app is not changed.** It stays at `/teen` while the co-design work goes on.
- **Desktop first**, meant to sit beside the clinician's window. It should still work on a phone.
- The heading says **"Teen data testing"**.

## The page

One page. Sign-in at the top if not signed in, then:

1. **The child's ladder**, every rung in the order the clinician sees it, each showing its status
   (not set up, set up, scheduled, done, too hard, missed) and the situation it belongs to.
2. **Under each rung, every value the teen app can set**, as plain boxes and sliders, filled with
   sensible values so one press records a believable exposure:

   | Moment | Values |
   |---|---|
   | Picks a day | the day, and morning, afternoon or evening |
   | Before | what they predict will happen, belief 0–100%, expected Fear Level 1–10, how ready they feel |
   | After | did the feared thing happen, what happened, actual Fear Level 1–10, belief after 0–100%, what they learned |
   | **When it happened** | a date and time, today or earlier (back-dating, below) |

   Buttons: **Record done** and **Too hard** (with an optional reason).
3. **Start an exposure on a behavior** the child chooses, as the teen app allows.
4. **A message box** to the clinician.
5. **Fill in 3 weeks**: one button that makes a believable history for this child (below).

Nothing else from the teen app: no home screen, tips, plans, progress or education.

## Back-dating

Today the backend stamps a finished exposure with "now", and an exposure is only missed when its
day passes. To test weeks, streaks and charts, the page sets **when it happened**.

- The teen endpoints for finishing an exposure accept an optional date, **only when a test switch
  is on** (`TEEN_DATA_TESTING`, an environment setting on the backend). With it off they refuse a
  date, and the `/teen-test` page says it is switched off.
- The date may not be in the future.
- Turn the switch off before the first real family (see "Before launch").

## Fill in 3 weeks

One press creates, for the signed-in child only, over the past 21 days:

- about 2–3 exposures a week, working up the ladder from the easiest rung
- each with before and after values that look real: expected Fear Level near the rung's own, actual
  a little lower, both drifting down over the weeks; belief before and after dropping too
- one marked too hard, and one scheduled in the past and left undone, so it shows as missed
- text answers clearly made up ("Test entry: …"), so nobody mistakes them for a child's words

It runs through the same backend functions as recording by hand, so the clinician's side sees the
data exactly as it would see a real teen's. It only works with the test switch on. Pressing it twice
adds a second history, so the page warns first.

The tester then checks the Progress tab against what was made: the charts, streak, week strip and
averages.

## Before launch

- Turn `TEEN_DATA_TESTING` off on Railway and remove the `/teen-test` route, or leave the route
  showing "switched off". Back-dating must never be possible for a real teen.
- Peter to add this to the pre-launch list in `CLAUDE.md` ("Current stage"), which is his file.

## Also: "Exposures" becomes "Progress"

Peter, 2026-10-21: rename the clinician's Exposures tab to **Progress**. A separate, small item.

## Gates

- **`/security-review`**: it adds a way to write a child's exposure data with a chosen date, and a
  bulk write. Check it only ever touches the signed-in teen's own records, and only with the switch
  on.
- **Peter approves**: new screens (CODEOWNERS), with screenshots.
- No clinical logic changes: the values are the ones the teen app already records.

## Answered while building

- **Missed** is not stored. The clinician's Progress tab shows a set-up exposure whose day has
  passed as missed (`ExposuresTab.tsx`). So an exposure set up for a past day and never recorded
  shows as missed, with no backend change.
- **Yes**, the teen sees rungs only with "Visible to patient" on (`ladder_active`). The page says
  so, and Fill in 3 weeks refuses.
