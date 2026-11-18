# Case summary refreshes on its own — plan

> **Planned 2026-11-18 (Peter).** Replaces the 2026-10-21 rule in
> [`session-suggestions.md`](session-suggestions.md) that nothing runs on approval.

## What Peter asked for

- The case summary updates by itself when a new monitoring entry comes in or a session note is added.
- The **Re-analyze with AI** button on the Case Summary tab is renamed **AI Refresh**.
- The **Analyze session with AI** button on each session note goes away "for now".
- Refresh after **every** entry, with no waiting period: "those kinds of lags are going to be confusing".
- Updating the ladder builder suggestions without a button press is approved. It is noted for
  Dr. Walker's review.

## What happens

**A monitoring entry is saved** (the parent's form, or a spoken or typed quick note once it is
written up). If the log has at least 3 entries, the monitoring analysis runs in the background. It
is the same two model calls as the button: rebuild the suggestion list, then rewrite the summary
from it. What sessions added is kept, as now.

**A session note is saved approved, or approved later.** A typed note is approved when saved. A note
from a recording is a draft until the clinician approves it. Either way, once it is approved and not
empty, the session analysis runs in the background.

**An approved note's text or date is edited.** It is analyzed again. Its block in the summary is
replaced, not added to, so a line taken out of the note comes out of the summary. (Its suggestions
in the ladder builder stay; removing those is not part of this change.)

**Several things arrive close together.** One patient's analyses run one at a time. Anything that
arrives while one is running is done straight after it, together: two entries during one run cause
one more run, which reads both. No timer.

**AI Refresh** runs the monitoring analysis now (when there are 3 or more entries), and analyzes any
approved note that is not in the summary yet or changed since it was analyzed. That is the retry if a
background run failed. It shows once there are 3 entries or any approved note.

**While a background run is going,** the Case Summary tab says "Updating the case summary…", and the
page picks up the new summary when it finishes.

## Not changed

- What either analysis reads or writes, or the prompts.
- Drafts from recordings are still never read until approved.
- Deleting a note still takes its additions out of the summary.
- Who can see what. The new status route uses the same patient access check as every other
  clinician route on a patient.

## Limits

- Which runs are in progress is held in the server's memory. Railway runs one server process, so
  this is accurate. A restart mid-run loses that run; AI Refresh picks it up.
- A failed background run is logged (the kind of failure only, no patient text) and leaves the
  summary as it was.

## Also in this change (Peter, 2026-11-18)

- A plain statement at the top of the Case Summary of how it is built and when it updates.
- Clearer formatting: a count by each heading, "Fear Level" over the situation numbers, the
  situation part of a behavior in bold ("Getting ready for school: …"), and "from session" as a
  small tag. "Last updated" sits under the title.

## Dr. Walker review queue

- **The ladder builder's suggestions now update without anyone pressing a button.** Every new
  monitoring entry, and every approved session note, rebuilds the suggested situations and behaviors
  the clinician picks from. The clinician's earlier decisions on suggestions are kept, and nothing
  goes on the plan until the clinician adds it. Peter approved this 2026-11-18. It is a change to
  what the clinician is shown while building a ladder, so it is logged here for her.
