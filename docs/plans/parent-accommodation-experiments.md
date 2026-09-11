# Parent accommodation experiments

**Agreed with Peter 2026-09-11.** Building.

From the backlog and Peter's July parent plan (`float_parent_experience_plan.md` §2): *"The parent
object is the accommodation. Situation → parent accommodation → experiment to reduce it. The
replacement response is a tip on the experiment."* The same stages as the child's exposure: agree
it, predict, do it, say how it went — or say it was too hard.

## What exists now that the July plan did not have

- **The weekly focus** — one accommodation the parent works on this week, set by the clinician.
- **The weekly check-in** — once a week, "did you hold the line?", about the focus. It replaced
  logging each moment (Peter, 2026-09-10).
- **Accommodation states** — not started, started, stopped.
- **The parent's estimate and the child's rating** of how hard stopping each one would be.

## The proposal

An experiment is **one planned attempt** at not doing the accommodation: *"On Tuesday at bedtime I'll
say goodnight and leave, instead of lying down with Sam until she's asleep."*

**Before** — one question per screen in the parent app, or one sheet in a parent session (like the
child's exposure setup):

1. Which accommodation — the weekly focus, unless the clinician says otherwise.
2. When — a day and a time of day.
3. What you'll do instead — the replacement, which is where the tip goes.
4. What are you afraid will happen?
5. How strongly do you believe that will happen? (0–100%)
6. How upset do you expect them to be? (Fear Level)
7. How ready do you feel?

**After:**

1. Did you do it? — Yes / Partly / Not this time. ("Not this time" in place of "I gave in", which
   Peter is still unsure about on the check-in.)
2. What happened?
3. How upset were they, really? (Fear Level)
4. Did what you were afraid of happen?
5. What did you learn?

The after questions also ask **"How strongly do you believe it now?"** (0–100%), as the child's
record does — belief before and after is how the prediction is seen to change.

**Not this time** skips the rest and asks, optionally, "What made it too hard?".

**"What will you do instead?"** shows any parent tips for that accommodation's situation as ideas —
where the July plan put the tip. **"How upset do you expect them to be?"** starts from the estimate
the parent gave in the accommodation conversation.

**Shared between parents.** Every parent linked to the child sees and can record the family's
experiments, as the July plan has it for accommodations.

**Who sees it:** the parent and the clinician. The Parent Accommodations panel lists the parent's
experiments and how each went. The child sees nothing of it.

## Questions for Peter

1. ~~**How does it sit with the weekly check-in?**~~ **Decided 2026-09-11: keep both.** The
   experiment is the planned attempt with a prediction; the check-in is the week's summary.
2. ~~**Only the weekly focus, or any accommodation on the plan?**~~ **Decided 2026-09-11: any.**
   Peter: *"they choose to work on more than one and we shouldn't limit that."* The before-question
   becomes "Which one?", starting on the weekly focus if there is one.
3. ~~**Set up by whom?**~~ **Decided 2026-09-11: both**, like the child's — the parent at home, or
   in a parent session with the clinician typing.
4. ~~**The questions above.**~~ **Agreed 2026-09-11** ("yes looks solid"), in the detail below. Clinical
   wording — on Dr. Walker's list.

**Still open:** whether the weekly focus should allow more than one accommodation, with the check-in
asking about each. Asked 2026-09-11, not answered; the experiments do not depend on it.

## Build order

1. The server: the table, the parent's routes, the clinician's routes. Tests; security review.
2. The parent app: setting one up (one question per screen) and saying how it went; a list on the
   home.
3. The clinician app: the parent's experiments on the Parent Accommodations panel; setting one up in
   a parent session.

All three built 2026-09-11. Peter decided the same day that the weekly focus can be more than one
accommodation, with the check-in asking about each (docs/plans/weekly-checkin.md).

## Not in this

- **Telling the child.** The book has the parent tell the child the plan, with a supportive
  statement. Float has nothing for that yet.
- Reminders for a parent's experiment day. The jobs service could add one later.

## Checks

`/security-review`: a parent writes, and the clinician reads, the parent's own experiments; the
child must see none of it.
