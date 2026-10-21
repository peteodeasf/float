# Clinician app — feature checks

One line per check: **do this → this should happen.** If it doesn't, report it with Jam and say what
you expected. Built from the code on 2026-10-21. Plan: `docs/plans/ui-testing.md`.

Test **one area at a time** (A to F, below). Each section says what it needs set up first.

- **Keep one test family** for everything: make it in section 5 and reuse it. A 12-year-old with two
  parents, each with a `+` email of your own (`you+mom@gmail.com` arrives in your inbox).
- Open the parent's side in a **private browser window**, so you stay signed in as the clinician.

- Use made-up names only. Children are 8–17.
- Skip anything to do with the **teen app**: inviting a teen, and the teen's messages. It is being
  rebuilt.
- **Known problems** are listed under each screen. No need to report them again.
- Parent screens are at the end, for after the clinician app.

---

# Area A — Getting in, and patients

## 1. Sign in — `/login`
- [ ] Right email and password → lands on My patients.
- [ ] Wrong password → "Invalid email or password", and the password box is cleared.
- [ ] Forgot password? → reset form. Send reset link → the same message whatever email you type.
- [ ] The reset email arrives, its link opens a new-password page, and you can sign in with the new password.
- [ ] New password under 8 characters, or two that don't match → a clear message, nothing saved.
- [ ] Leave the app untouched for over an hour → you are signed out.

## 2. Settings — `/settings`
- [ ] Change your name → Save → "Saved." Reload: the new name is still there.
- [ ] Save is greyed out until you change something.
- [ ] Email can't be edited and says to ask Float.
- [ ] Change password: wrong current password → an error. Two new ones that don't match → "The two new passwords do not match."
- [ ] Change password properly → "Password changed." Sign out and back in with the new one.
- [ ] (Practice admin only) Your clinic: Invite someone → "Invitation sent", and they appear as "Invited, not set up yet".
- [ ] Resend link, Make admin, Remove admin, Remove (asks first) each do what they say. You can't remove yourself.

## 3. Top bar (every screen)
- [ ] Float logo, My Patients, Tools, Education and Settings each go to the right screen.
- [ ] Sign out → back to the sign-in page. The browser's back button doesn't get you back in.

## 4. My patients — `/dashboard`
- [ ] With no patients → "No patients yet" and an Add patient button.
- [ ] Each patient shows name, email, phase and last activity ("Today", "Yesterday", "3 days ago").
- [ ] Phase filter: each phase shows only those patients. "All open" hides closed ones.
- [ ] The count matches the rows shown, and says how many closed ones are hidden.
- [ ] Clicking a row opens that patient.
- [ ] Amber and teal tags under a name make sense for that patient.

## 5. Add patient — `/patients/new`
- [ ] Without name, email, age or gender → it refuses, and says what's missing.
- [ ] Age outside 1–99 → refused.
- [ ] Fill it in with two parents → Add patient → the new patient's page opens.
- [ ] Back on My patients, the new patient is there.
- [ ] A parent row left completely empty is ignored, not saved as a blank parent.
- [ ] Cancel and ← Back return to My patients without saving.

# Area B — The patient page and who can see it

**Needs:** the test family from section 5.

## 6. Patient page — header
- [ ] Name, age, gender and status read correctly.
- [ ] ⋯ → Edit profile: change age and anxiety type → Save → shown straight away, and still there after reload.
- [ ] Edit profile with the name cleared → Save is greyed out.
- [ ] ⋯ → Close treatment → asks first → status changes. ⋯ → Reopen treatment → back to open.
- [ ] Checklist N/M opens the checklist. Ticking an item updates N, and stays ticked after reload.
- **Known:** an item with an education link says "Education content coming soon".

## 7. Parent access panel (header → Parent)
- [ ] The parents added with the patient are listed, with "Has not signed in yet".
- [ ] Invite another parent with a new email → "Invitation sent". The email arrives with a temporary password.
- [ ] Invite the same email again → "already a parent of this child. Nothing was sent".
- [ ] Remove → asks first → gone from the list.
- [ ] "Parents can see the child's progress" on → "Shared since <date>". Off → the date goes.
- [ ] "Parents can see the child's ratings" on and off saves, and stays after reload.

## 8. Clinician access panel (header → Clinician)
- [ ] Lists who can open this patient. The owner is marked "Their clinician".
- [ ] Give another clinician access → Add → they appear. Remove → asks first → gone.
- [ ] Remove is greyed out for the owner, and when only one clinician is left. Hovering says why.
- [ ] Make their clinician → asks first → the badge moves.
- [ ] Signed in as a clinician who isn't the owner or an admin → the list is read-only, with an explanation.

# Area C — Monitoring and Analyze with AI

**Needs:** the test family, with both parents' emails. Do section 9, then P1 at the end (the
parent's form) to save some entries, then section 10.

## 9. Monitoring tab
- [ ] Before a form exists: two parent rows, prefilled from the parents' names and emails.
- [ ] Create monitoring form → each parent with an email gets one. Check the inbox.
- [ ] After that: status pill, "0 entries · sent today", one link per parent, and "not opened yet".
- [ ] Copy link → "Copied!", and the pasted link opens the parent's form.
- [ ] Once a parent opens the link, their row says "opened".
- [ ] Report sub-tab lists every entry the parents saved: date, situation, what they saw, how they responded, Fear Level.
- **Known:** the text by the button says it copies the link. It doesn't.
- **Known:** the "Email sent to …" confirmation may never show.

## 10. Analyze with AI (Monitoring → Case Summary)
**Needs:** at least 4 entries saved through the parent's form (P1), about different situations.
- [ ] With fewer than 3 entries → no button, and a message saying to add at least 3.
- [ ] With 3 or more → Analyze with AI → "Analyzing…" → a summary with Situations, Parental responses, Safety & avoidance behaviors, Treatment targets, and the date.
- [ ] Every situation in the summary is something the parent actually logged. Report any the parent never mentioned.
- [ ] Fear Levels in the summary match what the parent gave.
- [ ] Add another entry → the hint says there are new observations. Re-analyze → updated.
- [ ] Nothing was added to the plan automatically.

# Area D — The ladder and the downward arrow

**Needs:** the test family, ideally after area C, so the ladder editor has suggestions from the
monitoring log.

## 11. Plan tab — getting started
- [ ] No plan yet → "Create treatment plan" → the plan appears.
- [ ] + Add nickname → type → Save (or Enter) → shown. Edit it → Esc cancels.
- [ ] Case Summary sub-tab shows the same AI summary as the Monitoring tab.

## 12. Ladder editor (Plan → Build ladder / Edit ladder)
- [ ] Add situation → type → Add (or Enter) → it appears. The panel stays open for the next one.
- [ ] Suggested situations (from the monitoring log) → tap one to add it. ✕ removes the suggestion for good.
- [ ] Click a situation's name to rename it. Change its Fear Level. ✕ asks Remove / Keep.
- [ ] Situations sort by Fear Level, and "Start here" marks the first one with no rungs.
- [ ] Open a situation → add a safety behavior → it appears.
- [ ] Suggested behaviors from the log → tap to add.
- [ ] **AI step sentences:** each new safety behavior gets "Drafting…", then a step sentence.
- [ ] Each step sentence reads as one clear thing the child does, and makes sense with its behavior.
- [ ] Reword a step sentence, give it a Fear Level, remove one.
- [ ] Done is greyed out while drafting. Done → saved view.
- [ ] Add rung → type one → Add.
- [ ] **AI suggested rungs:** Show suggested rungs → "Thinking of easier versions…" → 2 to 5 suggestions. Tap one to add it.
- [ ] The suggestions are easier versions of this situation, with no repeats, and nothing invented that the family never mentioned.
- [ ] Save ladder → "Checking the ladder…" → closes, or shows "Before you finish" with Keep editing / Save ladder.
- [ ] ⛶ Full screen → the same editor full screen. Exit full screen → back where you were.
- **Known:** the ladder check only checks the numbers, and says so.

## 13. Ladder (Plan → Ladder, after saving)
- [ ] All rungs in one list, easiest first. Rungs without a Fear Level are at the bottom.
- [ ] Click a rung to rename it. Enter saves, Esc cancels.
- [ ] Change a Fear Level → still there after reload.
- [ ] ✕ asks Remove? → gone.
- [ ] Hide situations / Show situations works, and is remembered after reload.
- [ ] "Visible to patient" can't be turned on with no rungs, and says why.

## 14. Downward arrow (a step's DA button, or Tools)
- [ ] Opens on the right situation and step. "Let's start" the first time only.
- [ ] Type the starting worry → the AI suggests a next question. You can edit it before using it.
- [ ] Type the answer → send → the next question. "thinking…" while waiting.
- [ ] Each question follows from the last answer, and doesn't put words in the child's mouth.
- [ ] That's the bottom ✓ → a cleaned-up feared outcome → edit → That's it — save.
- [ ] Back on the ladder, the step shows ✓ DA.
- [ ] Leave halfway and come back → your steps are still there.
- [ ] Tools → pick a patient → type a situation → Start → the same flow. The new arrow appears under Recent downward arrows.

# Area E — Exposures and accommodations

**Needs:** a saved ladder with a few rungs (area D), and one downward arrow done.

## 15. Set it up (a rung's "Set it up")
- [ ] The fear is prefilled from the downward arrow.
- [ ] Save is greyed out until there's a fear and a readiness choice, and a day and time if "Pick a day now".
- [ ] Save → the rung shows "Scheduled · <day · time>" or "Set up · day at home".
- [ ] "Tell them to do this one next" on two rungs → only the last one keeps "Do this next".
- [ ] Set up a rung that's already set up → the banner warns it sets up another exposure.

## 16. Accommodations (Plan → Accommodations)
**Needs:** situations on the ladder. Parent suggestions appear only if the parent used their form or app.
- [ ] Without a plan → says to create the plan on the Ladder tab first.
- [ ] Build plan → add an accommodation with a name and Fear Level from (to is optional) → it appears.
- [ ] Add is greyed out without a name and a from-level.
- [ ] Rename one, change its range, remove one (asks first).
- [ ] Suggestions from the parent's form show as chips → tap to add. ✕ removes the suggestion for good.
- [ ] Plan it → Working on it → Save → the row says so. (The parent should now see it on their home screen.)
- [ ] Child ratings → pick a range for each → Done → saved.
- [ ] Save plan → leaves edit mode, and everything is still there after reload.

## 17. Exposures tab
**Needs:** at least one accommodation (section 16) to set up an experiment with the parent.
- [ ] With no completed exposures → "No completed exposures yet…".
- [ ] Week strip: ‹ › change week. Clicking a day shows what was planned or done.
- [ ] Set one up with the parent → Save is greyed out until accommodation, day, time and fear are filled → Save → it appears under "The parent's experiments".
- **Known:** the parent app has no screen for these experiments yet.

# Area F — Sessions, recording, chat, education

**Needs:** the test family. Section 19 needs a phone. Section 20 needs a parent signed in to the
parent app (invite email, private window).

## 18. Sessions tab
- [ ] + Add note → Save is greyed out until there's text and Parent or Patient is picked.
- [ ] Add a tag, including your own → Save → the note shows date, who, tags.
- [ ] Click a note to expand it. ⋯ → Edit → Update. ⋯ → Delete → asks first.
- [ ] With more than 3 notes, the Who and Tag filters appear and work.
- **Known:** "Analyze session with AI" is greyed out and says "Coming soon".

## 19. Record a session — phone
- [ ] Record session → first time: consent box. Continue is greyed out until it's ticked and filled.
- [ ] Pick who's in the session → Start recording → timer runs, level bars move when you talk.
- [ ] Pause / Resume.
- [ ] Lock the phone mid-recording → "Recording stopped" → Tap to carry on.
- [ ] Stop and save → "Saved" → Back. Sessions tab shows "Being written up", then a draft note.
- [ ] The draft note sounds like what was said. Transcript → speaker names can be changed.
- [ ] Approve note → it's no longer a draft.
- [ ] Delete a recording → asks first.

## 20. Chat tab (parent threads only)
- [ ] Each parent has their own thread. Send → the message appears.
- [ ] The parent's reply appears within a few seconds, with an unread count until opened.

## 21. Education — `/education`
- [ ] Start here → the first module. Section links jump to the right place.
- [ ] Quiz: answer, Next question, See my score, Try again, Mark module complete.
- [ ] Back on the list, the module says Done.
- **Known:** progress is only kept in this browser.

---

# Parent app — after the clinician app

P1 is also used in area C. The rest (P2–P7) come after the clinician areas.

## P1. Monitoring form (the emailed link; no account)
- [ ] The link opens with the clinician's and child's names. A broken link → "not valid or has expired".
- [ ] Permission checkbox → "Thank you — permission recorded", and it locks.
- [ ] Write: date (no future dates), Fear Level, the three boxes → Save observation → "Observation saved", and the form clears.
- [ ] Tap & Talk (phone): talk for up to a minute → "Got it" → How upset? → pick or Skip.
- [ ] Type a quick note instead → Send.
- [ ] Observations shows everything saved. A note can be deleted (asks first).
- [ ] The clinician's Monitoring tab shows the same entries.
- **Known:** "Get the link sent to me again" says it was sent, but nothing is sent.

## P2. Sign in and password
- [ ] The invite email's temporary password signs in → set your own password → Home.
- [ ] Forgot password? works as it does for the clinician.
- **Known:** setting a password here allows 6 characters. Everywhere else it's 8.

## P3. Home
- [ ] Before the clinician shares the plan → "hasn't shared … plan with you yet".
- [ ] After: upcoming exposures, with your accommodations under each.
- [ ] How did it go? → write → Save → "Saved ✓". The clinician sees it on Plan → Accommodations.

## P4. "What do you do when <child> is anxious?"
- [ ] One question per screen. Back works.
- [ ] Yes/No, how hard, anything else → each saves.
- [ ] What you add shows to the clinician as a suggestion, not on the plan.

## P5. Progress
- [ ] An accommodation set to "Working on it" asks "did you hold the line?" → answer → "Your clinician will see it" → Change works.
- [ ] Child's progress only shows once the clinician turns sharing on.

## P6. Chat
- [ ] Send a message → the clinician sees it in that parent's thread. A reply comes back.

## P7. Treatment closed
- [ ] After the clinician closes treatment, every parent screen shows "All done for now".
