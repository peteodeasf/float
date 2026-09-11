# Monitoring: just say it

Peter, 2026-09-11: a faster, easier way for a parent to record a monitoring observation, alongside
the form. It should wow.

Today a parent types four boxes per observation (situation, what the child did, how they responded,
Fear Level), about 5 minutes a day for a week. The form stays. This adds a second way in.

## What the parent sees

On the monitoring page, above the form, a big **Tap and talk** button, and a smaller **Type a quick
note**.

**Recording.** "Tell us what happened: where you were, what Sam did or said, and what you did." Bars
move with their voice, and a timer counts up to 1:00. It stops by itself at one minute; they can
record again to add more. Before the first recording, one line: "Your recording is turned into text
and then deleted. Only the text is kept."

**Writing it up.** A few seconds of "Writing it up…".

**Here's what we heard.** One card per moment. If they talked about the school run and bedtime, that
is two cards. Each card has the date (from "this morning", "yesterday", "on Tuesday"), the situation,
what the child did and what the parent did, all filled in and all editable. Under each card, "What
you said": their own words.

**Fear Level is never guessed.** It is filled in only when the parent said a number. Otherwise the
card shows the 1–10 row with "How upset was Sam? Tap one."

**Save** keeps it. It then appears in their list like any other observation.

**Type a quick note** works the same way, from typed text instead of a recording.

When it goes wrong:
- No speech heard: "We couldn't hear that. Try again, or type it."
- Nothing about anxiety in it: "We didn't find a moment to record in that. Try again, or use the form."
- Microphone blocked: how to allow it on their phone, and the typing option.

## What the clinician sees

In the monitoring report, an observation made this way has a small mic mark and "The parent's
words" under it, so the clinician can check what Float made of it.

## How it works

1. The page records in the phone's browser. iPhone Safari records AAC in MP4; Chrome and Android
   record Opus in WebM. Google accepts both as they are, so nothing is converted.
2. The page uploads it to `POST /monitor/{token}/transcribe`, guarded by the form's token like the
   other monitoring routes. The server sends it to **Google Speech-to-Text** (V2, `chirp_3`, US
   region) and returns the text. **The recording is not stored.** One minute is Google's limit for
   a quick request, which is why recordings stop at one minute.
3. The page shows the parent their own words, word by word, while it sends them to
   `POST /monitor/{token}/write-up` with the parent's own date. The server asks Claude for the
   observations.
4. The server saves them as **drafts** on the form (`is_draft`, which already exists), with the
   parent's words and how they were captured. If the parent closes the page, nothing is lost; the
   draft is in their list.
5. Save turns a draft into an observation with the existing update route. Remove deletes a draft
   (`DELETE /monitor/{token}/entries/{id}`, drafts only). The clinician's report ignores drafts, as
   it does now.

A typed note skips step 2.

As well as the instructions to Claude, the server drops any Fear Level whose number is not in the
parent's words, and any date in the future or more than 14 days back becomes today.

**Database:** two new columns on `monitoring_entries`: `parent_words` (their transcript or typed
note) and `captured_by` (`form`, `voice` or `note`; existing rows are `form`). Adds columns only;
nothing is dropped.

## Claude's instructions

- Keep the parent's own words. Tidy them; don't change what they mean.
- A new observation only for a separate moment.
- Situation: where and when. What the child did or said. What the parent did.
- **Fear Level only when the parent said a number from 1 to 10.** Words like "terrified" are not a
  number. Ratings must come from the source (`CONCEPTS.md`).
- Leave a part empty rather than invent it.
- Dates from the parent's own words, counted from their date; when unclear, today.

Same model as monitoring extraction (`claude-sonnet-4-6`). How a note is split into situation, what
the child did and what the parent did is a clinical call, so it goes in Dr. Walker's review list.

## Limits

The new routes need no login and call paid services, so a leaked link could run up cost:
- At most one minute or 10 MB per recording, audio files only.
- At most 80 calls to Google or Claude per form per day, about 40 recordings.
- Refused once the form is submitted, like the other monitoring routes.

Until Google is set up, the page offers only "Type a quick note" and the form.

## What Peter has to set up (I can't sign in)

1. In the Google Cloud console (console.cloud.google.com), create a project, for example
   "float-speech", with a billing account attached.
2. Accept Google's HIPAA agreement for it. Google's page on this is
   cloud.google.com/security/compliance/hipaa. It is free and self-serve, and it is the first step
   of the hosting plan anyway (`hosting-for-real-patient-data.md`).
3. APIs & Services → Library → turn on **Cloud Speech-to-Text API**.
4. IAM & Admin → Service Accounts → Create service account, for example "float-speech", with the
   role **Cloud Speech Client**.
5. On that account: Keys → Add key → Create new key → JSON. A file downloads. If Google refuses to
   create a key, the organization policy "Disable service account key creation" is on and has to
   be turned off for this project.
6. In Railway, service floatcbt → Variables: add `GOOGLE_SPEECH_CREDENTIALS` with the whole contents
   of that file. Railway redeploys and "Tap and talk" appears on the monitoring page.
7. Leave Google's "data logging" off, which is the default. Google says HIPAA customers must not
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
