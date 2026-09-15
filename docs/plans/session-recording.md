# Recording a session into Session Notes

Peter, 2026-09-13: the clinician records the session on their phone. It records the whole session,
turns it into text, works out who said what, and saves it on the patient's record as a session note,
tagged. Sessions can run 60 minutes or longer.

Built 2026-09-15. Peter tried it on his iPhone the same day: the normal path worked (record, stop, draft note). Agreed with Peter, 2026-09-13.

Checked before Peter's own test recording: a made-up three-voice session (74 seconds, voices generated on a
Mac) went through Google with the speakers correctly separated. The first run took about four
minutes; a second took 16 seconds.

## Decided (Peter, 2026-09-13)

- **Google Speech-to-Text** turns the recording into text and separates the speakers. The HIPAA
  agreement and account already exist from Just say it, and the recording never leaves Google.
- **Claude writes the note** in Float's structure. Not an AI scribe product.
- **The recording is deleted** once the transcript is saved.
- **The full transcript is kept** on the note.
- **Note structure, first pass:** what was covered; situations and exposures discussed, with any
  Fear Levels said; accommodations discussed; what was agreed for the week; anything to follow up.
  Dr. Walker's own template can replace it later.
- **Recording in the web app first.** A small recorder-only iPhone app comes later, if the screen-lock
  limit (below) is a real problem in sessions.
- Granola was considered and left out: no HIPAA agreement.

## What the clinician does

1. On their phone, in Float: the patient → **Record session**.
2. Before the first recording for that patient: **"Everyone in the session has agreed to it being
   recorded"**, with who agreed and when. See Consent.
3. Who is in the room: the child, the parent, or both.
4. **Start.** A large timer and a sound level. The screen stays on. **Pause**, and **Stop and save**.
5. After Stop: "Saving… you can close this." A few minutes later a **draft** note is in the
   patient's Session Notes.

## What lands in Session Notes

A note marked **Draft — from a recording**:
- **The note**, written by Claude from the transcript, in the structure above.
- **Tags**: participants from who spoke; a session tag (Initial, Consult, Weekly or Review) guessed
  from what was said. Both editable.
- **The transcript**: who said what. No times: `chirp_3` does not return them with speakers. Speakers named Clinician, Child and Parent, guessed
  by Claude from what each says. Rename a speaker with one tap and the whole transcript updates.
- **Approve** makes it a normal note.

The clinician is the check on what Float wrote (STRATEGY.md: AI output is a draft a clinician
confirms). Parents and children never see a transcript or a draft.

## The phone limit

An iPhone stops a web page recording when the screen locks or the clinician switches app. So the page
keeps the screen on, uploads a piece every 30 seconds so nothing recorded is lost, and after an
interruption says **"Recording stopped — tap to carry on"**, adding to the same session.

## How it works

1. **Recording.** The phone uploads a piece every 30 seconds. Float's server puts each piece in a
   private Google Cloud Storage bucket (Google's HIPAA agreement), never on Railway.
2. **Stop.** The server joins each stretch of recording's pieces into one audio file in the bucket,
   using Google Storage's own join. Each stretch (before and after "tap to carry on") is a separate
   file and is transcribed separately, so speaker numbers are per stretch ("2:1" is speaker 1 of the
   second stretch). No ffmpeg.
3. **Transcribing.** The server asks Google to transcribe that file in the bucket (Speech-to-Text V2,
   `chirp_3`, batch mode, speaker separation on, expecting two to four speakers). Batch mode takes
   files of up to eight hours.
4. **Waiting.** Google does not call back. The server checks the job every 20 seconds. If the server
   restarts meanwhile, the scheduled jobs service picks up any unfinished job on its next run (every 15 minutes). It gives up
   three hours after Google was asked. A recording with no new piece for two hours is stopped and saved.
   The jobs service needs `GOOGLE_SPEECH_CREDENTIALS`, `GOOGLE_RECORDINGS_BUCKET` and
   `ANTHROPIC_API_KEY`; without them it leaves recordings alone.
5. **The transcript.** Google returns words, each with a speaker number. Float groups them
   into turns.
6. **The note.** Claude (Sonnet 4.6) reads the transcript, with the child's first name and who was in the room, and
   returns the note, the tags, and a name for each speaker number.
7. **Saving.** The draft note is saved with the transcript. The recording is deleted from the bucket. A rule on the bucket also deletes anything older than two days, in case a
   delete is missed.
8. **If it fails** (no speech found, Google or Claude errors): the note shows what went wrong and
   **Try again**, while the recording is still in the bucket.

**Database:** session notes gain: draft or approved; how it was made (typed or recorded); the
transcript (speaker, words); the speaker names. The job's status is on a new table for a recording
while it is in progress. Adds only.

**Access:** as notes today, clinicians with access to the patient. Uploading pieces and stopping go
through the clinician's own sign-in and the same patient access check.

## What Peter sets up in Google (I can't sign in)

**Done 2026-09-13.** Bucket `float-session-recordings`; the Float service account
(`id-246-3153-3544-5423@float-speech.iam.gserviceaccount.com`) has Storage Object Admin on it; the
speech service's account (`service-897225650047@gcp-sa-speech.iam.gserviceaccount.com`) has Storage
Object Viewer; `GOOGLE_RECORDINGS_BUCKET` is set in Railway. The speech service's account did not
exist until created from Cloud Shell (shell.cloud.google.com) with
`gcloud beta services identity create --service=speech.googleapis.com --project=float-speech`;
before that, Google refused it as a principal.

**Tried on an iPhone 2026-09-15:** the normal path worked, so Safari's recording format goes through
Google. Not yet tried: screen lock and "tap to carry on", a full-length session, a failed upload.

In the same `float-speech` project:
1. **Cloud Storage → Create bucket**: a name like `float-session-recordings`, location **us**,
   public access prevention **on**, uniform access. Lifecycle rule: delete objects older than 2 days.
2. **Give the existing `float-speech` service account** the role **Storage Object Admin** on that
   bucket, so Float can write and delete.
3. **Give Google's speech service** read access to the bucket: principal
   `service-PROJECT_NUMBER@gcp-sa-speech.iam.gserviceaccount.com` (the project number is on the Cloud
   console's home page), role **Storage Object Viewer**. Results come back in Google's reply rather
   than as a file, so it only needs to read.
4. Railway: add `GOOGLE_RECORDINGS_BUCKET` with the bucket name. The key already in
   `GOOGLE_SPEECH_CREDENTIALS` is reused.

## Consent

Recording a child's therapy session needs the parent's consent and usually the child's agreement.
Some US states require everyone recorded to consent. Float records that the clinician confirmed
consent, who gave it and when, and shows it on the patient page. **Whether that is enough is a legal
question for Peter's lawyer.**

## Cost

Google prices per minute of audio; roughly a dollar per session hour for `chirp_3`, plus Claude's
note. To confirm on Google's pricing page before launch.

## Build order

1. **Check Google with a mock session.** Done with generated voices (above). A real 20-minute
   session recorded on a phone is still to try.
2. **The server**: pieces into the bucket, joining in the bucket, the Google job and checking it,
   Claude's note, tags and speaker names, the draft note, deleting the recording, retrying.
3. **Recording on the phone**: consent check, who is in the room, record, pause, pieces uploaded,
   carry on after an interruption.
4. **Session Notes**: the draft mark, the transcript with speaker names, rename a speaker, Approve,
   Try again.
5. **Security review**: recordings and transcripts of a child's therapy.

## Later

- **Upload a recording** made some other way (for example Voice Memos). Left out for now (Peter,
  2026-09-13).
- A recorder-only iPhone app, if the screen-lock limit matters in real sessions.
- Dr. Walker's note template.
- Suggestions for the ladder from what was said in sessions (session notes can already be a source).
