# Monitoring: just say it

Peter, 2026-09-11: a faster, easier way for a parent to record a monitoring observation, alongside
the form. It should wow.

Today a parent types four boxes per observation (situation, what the child did, how they responded,
Fear Level), about 5 minutes a day for a week. The form stays. This adds a second way in.

## What the parent sees

**Peter, 2026-09-12: the parent just talks, and it goes.** The first version wrote the recording up
as observations and showed them to the parent to check and save. Peter: that is a form they may not
understand, and they should not have to review it. So there is no review screen.

On the monitoring page, above the form, a big **Tap and talk** button, and a smaller **Type a quick
note**. "Talk for up to a minute. That's it: it goes straight to your clinician."

**Recording.** "Tell us what happened": where you were, what the child did or said, what you did.
Bars move with their voice, and a timer counts up to 1:00. It stops by itself at one minute. Before
the first recording, one line: "Your recording is turned into text and then deleted. Only the text
is kept."

**Sending.** A couple of seconds while Google turns it into text.

**Got it, thanks.** "Your clinician will see it", and their words fading in, so they know it heard
them. Then one question: **"How upset was Sam?"** 1 to 10, one tap, or **Skip**. Tapping closes it.

**Their list** shows each recording or note as their own words, with the date, the Fear Level they
tapped, and **Delete** (it asks first) for one they did not mean to send. Not the situation, child
and parent boxes: what Float writes up is for the clinician.

**Type a quick note** works the same way, from typed text.

When it goes wrong:
- No speech heard: "We couldn't hear that. Try again, or type it." Nothing is saved.
- Google fails: "We couldn't turn that into text. Try again, or type it." Nothing is saved.
- Microphone blocked: how to allow it on their phone, and the typing option.

## What the clinician sees

In the monitoring report, observations arrive without the parent doing anything more. Each one
written up from a recording or note has a small mic mark and "The parent's words" under it, so the
clinician can check what Float made of it. The check that the write-up is right is the clinician's,
which is the rule for anything Float writes (STRATEGY.md: AI output is a draft a clinician confirms).

## How it works

1. The page records in the phone's browser. iPhone Safari records AAC in MP4; Chrome and Android
   record Opus in WebM. Google accepts both as they are, so nothing is converted.
2. `POST /monitor/{token}/notes/voice`, guarded by the form's token like the other monitoring
   routes. The server sends the recording to **Google Speech-to-Text** (V2, `chirp_3`, US region)
   and waits for the text. **The recording is not stored.** One minute is Google's limit for a
   quick request, which is why recordings stop at one minute. A typed note is
   `POST /monitor/{token}/notes/text` and skips Google.
3. The server saves the words as a **note** (`monitoring_notes`: the words, voice or note, the
   parent's date) and answers. That is when the parent sees "Got it".
4. After answering, the server asks Claude to write the note up as observations and saves them as
   ordinary entries (not drafts), each linked to the note and carrying the parent's words.
   **Nothing is lost:** if Claude fails, or finds no moment in it, the words are saved as one entry
   on their own, so the clinician still sees them and extraction still reads them.
5. The tap is `PUT /monitor/{token}/notes/{id}/fear`. It fills every moment in the note that has no
   number. A number the parent said stays. If the tap lands before Claude has finished, the
   write-up uses it.
6. Delete is `DELETE /monitor/{token}/notes/{id}`, which removes the note and everything written up
   from it. One deleted while Claude is still writing it up leaves nothing behind.

As well as the instructions to Claude, the server drops any Fear Level whose number is not in the
parent's words, and any date in the future or more than 14 days back becomes today.

**Database:** `monitoring_entries` has `parent_words`, `captured_by` (`form`, `voice` or `note`)
and `note_id`; the new table `monitoring_notes` holds what the parent said. Adds only; nothing is
dropped.

## Claude's instructions

- Keep the parent's own words. Tidy them; don't change what they mean.
- A new observation only for a separate moment.
- Situation: where and when. What the child did or said. What the parent did.
- **Fear Level only when the parent said a number from 1 to 10.** Words like "terrified" are not a
  number. Ratings must come from the source (`CONCEPTS.md`).
- Leave a part empty rather than invent it.
- Dates from the parent's own words, counted from their date; when unclear, today.

Same model as monitoring extraction (`claude-sonnet-4-6`). For Dr. Walker's review list: how a note
is split into situation, what the child did and what the parent did, now with no parent check; and
one tapped Fear Level applied to every moment in a note the parent gave no number for.

## Limits

The routes need no login and call paid services, so a leaked link could run up cost:
- At most one minute or 10 MB per recording, audio files only.
- At most 40 recordings or notes per form per day.
- Refused once the form is submitted, like the other monitoring routes.

Until Google is set up, the page offers only "Type a quick note" and the form.

## What Peter has to set up (I can't sign in)

Done on 2026-09-12, up to the Google account itself:

1. **A Google account for Float, not a personal one.** The HIPAA agreement is accepted for a whole
   Google organization, so it cannot sit beside family sharing and personal files. Google Workspace
   is not needed: **Cloud Identity Free** (workspace.google.com/signup/gcpidentity/welcome) is free,
   and gives peter@floatcbt.com as a sign-in with no mailbox. The domain is proved with a TXT record
   in Netlify DNS (Netlify → Domains → floatcbt.com → Add new record → TXT, name left blank).
2. **The HIPAA agreement.** admin.google.com as that account → Account settings → Legal and
   compliance. It asks "Are you a Covered Entity (or Business Associate of a Covered Entity)?" —
   **yes**: Float is a business associate of the clinicians who use it. Google treats a screenshot
   of the accepted state as the proof, so keep one. Float also needs its own agreement with each
   clinic; that is separate and already in the backlog.
3. The organization and the Cloud console appear by themselves the first time that account signs in
   to console.cloud.google.com. It takes a while, and the console says it cannot load until it is
   ready. If it stays that way: Admin console → Apps → Additional Google services → Google Cloud
   Platform must be on.
4. In the Cloud console: create a project, for example "float-speech", with a billing account.
5. APIs & Services → Library → turn on **Cloud Speech-to-Text API**.
6. IAM & Admin → Service Accounts → Create service account, for example "float-speech", with the
   role **Cloud Speech Client**.
7. On that account: Keys → Add key → Create new key → JSON. A file downloads. If Google refuses to
   create a key, the organization policy "Disable service account key creation" is on and has to
   be turned off for this project.
8. In Railway, service floatcbt → Variables: add `GOOGLE_SPEECH_CREDENTIALS` with the whole contents
   of that file. Railway redeploys and "Tap and talk" appears on the monitoring page.
9. Leave Google's "data logging" off, which is the default. Google says HIPAA customers must not
   turn it on.

Anthropic's HIPAA agreement is needed anyway for the existing extraction.

Cost: roughly 2 cents per minute of recording for Google, plus under a cent for Claude. To be
confirmed on Google's pricing page.

## Build order

1. **The server.** Columns, the two routes, Google and Claude, drafts, limits. Tests with Google and
   Claude faked. Security review: a new route with no login, and a child's details going to Google.
2. **The monitoring page.** Tap and talk, the recording screen, Here's what we heard, Type a quick
   note. The mic mark and the parent's words in the clinician's report.
3. **Getting back to it.**
   - Home screen icon. Float's app settings open "/" from a home screen icon, which would take
     the parent to a sign-in page instead of their monitoring link. The monitoring page takes those
     settings off while it is open, so the phone uses the page's own address. A tip on their list,
     until dismissed: on iPhone "Tap Share, then Add to Home Screen", on Android the browser's menu.
   - An evening email during the monitoring week, "Anything come up today?", with the link. It
     goes to the parent email on the patient's record and says nothing clinical. From 7pm where the
     parent lives, on the seven evenings after the form was sent; skipped on days they already
     added one; stops once they submit, the patient is closed, or they use the off link in the
     email. Their time zone comes from the monitoring page; before they have opened it, their
     clinician's is used.

## Not in this

- Words appearing on screen while the parent talks. That needs a live connection to Google and is
  a bigger build. Worth doing if this lands.
- A photo of a paper diary.
- Recording without opening Float (lock screen, Siri). That needs an iPhone app.

## Decided

Peter, 2026-09-11: one minute per recording, with record again to add more; keep only the text,
never the recording; step 3 is in this build.
