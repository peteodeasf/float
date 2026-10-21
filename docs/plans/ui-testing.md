# Testing the app's screens — plan

> **Planned 2026-10-21** with Peter. Not started.
>
> Scope: the **clinician app first, then the parent app.** The teen app is left out, because it is
> being redeveloped in the next few weeks (Peter, 2026-10-21).

## Goal

The screens are underused and undertested. Make testing quick for Peter and for a part-time tester
(2–3 hours a week), and make every finding end up in the backlog without retyping.

## What gets tested, in two phases

**Phase 1, now: each area works on its own.** Every button, form and AI action does what it says:
it saves, edits, deletes, shows a sensible empty state, and refuses bad input. Peter, 2026-10-21:
this has not been done properly yet, and comes before anything else. The list is
`docs/testing/clinician-app-checklist.md`, one line per check, built from the code on 2026-10-21.
Each section says what it needs set up first, so it can be tested on its own.

The checklist's sections are grouped into six areas, about one testing session each:

| Area | Checklist sections |
|---|---|
| A. Getting in, and patients | 1–5: sign in, settings, top bar, My patients, Add patient |
| B. The patient page and who can see it | 6–8: header, parent access, clinician access |
| C. Monitoring and Analyze with AI | 9–10, and P1 (the parent's monitoring form) |
| D. The ladder and the downward arrow | 11–14 |
| E. Exposures and accommodations | 15–17 |
| F. Sessions, recording, chat, education | 18–21 (recording needs a phone) |

At 2–3 hours a week, the tester covers about two areas a week, so the clinician app takes about
three weeks. Peter can take an area himself to go faster; area F suits a phone. The parent app's
remaining sections (P2–P7) follow.

**Phase 2, later: journeys.** A real task from start to finish, crossing several areas:
`docs/testing/clinician-journeys.md`. Not started until phase 1 has been through every area and
the bugs it found are fixed.

## Where to test

- The live app, `https://app.floatcbt.com`. It holds test data only until the first real user
  (`CLAUDE.md`, "Current stage").
- **Peter sets up the tester's account:** Settings → Your clinic → Invite someone, as a clinician.
  She adds made-up families herself. Made-up names only, children 8–17.
- **Parent screens need a second email.** Gmail's `+` trick gives as many as needed from one inbox:
  `name+parent1@gmail.com` arrives at `name@gmail.com`. Open the parent side in a private browser
  window, so the clinician stays signed in.
- Screens marked "phone" in the checklist (recording a session, the parent's quick voice note) need
  a real phone.

## Recording feedback

**Jam** (jam.dev), a free browser add-on. One click captures a screenshot or a short video with
voice, the page address and any errors. Each report becomes a GitHub issue labelled `ui-feedback`.
The tester does not need a GitHub account; Jam posts the issue.

Setup, once (Peter):
1. Make a Jam account and install the Chrome extension.
2. In Jam, connect GitHub, choose `peteodeasf/float`, and set the label `ui-feedback`.
3. Invite the tester to the Jam team. She installs the extension and signs in.

**Peter, on his phone:** screen-record with the microphone on while testing an area, and talk. Put
the recording in `~/feedback-inbox/` on the mini (AirDrop to the laptop, then copy over, or a shared
Drive folder). Trevor turns it into text on the mini (`whisper.cpp`, so the recording never leaves
the machine), then into a list of points, each with its screen and time.

One rule for both: **say what you expected and what happened.** "I pressed Save and nothing
changed" is a finding. "This feels off" is fine too, but say which screen.

## From feedback to the backlog

Weekly, or after each testing session:
1. Trevor reads the open `ui-feedback` issues and any new transcripts.
2. It merges duplicates and groups them by area.
3. It sorts each into: **bug** (it doesn't do what it says), **confusing** (it works, but people
   got lost), or **idea**.
4. It drafts backlog items to the backlog's standard, in one pull request, under a "From UI
   testing" heading. Each item links its issues.
5. Peter reads the pull request and moves what he wants into "Ready for agents". The loop builds
   them, with screenshots in each pull request, as now.
6. Trevor comments on each issue with the backlog item it went into, and closes it.

Screen changes keep waiting for Peter's approval (CODEOWNERS). Anything clinical goes to Dr.
Walker's list, as now.

## Trevor does the clicking nobody should have to

Two backlog items, after the first testing week shows which screens matter most:

- **Nightly screenshot tour.** Every clinician and parent screen, with demo data, at phone and
  desktop width, on one page. It also checks the screen-layout rules in `CLAUDE.md`. Peter scrolls
  one page instead of clicking through two apps.
- **Automatic checks** for the areas that matter most to the therapist pilot, once phase 1 has
  shown which, so a broken button is caught before a person finds it. Playwright, against
  `float_dev` with demo data, on the mini. Journey tests come with phase 2.

## This week

1. Peter: Jam setup (above), invite the tester to Float and Jam, send her the checklist.
2. Tester: areas A and B.
3. Peter: one area on the phone, talking. Area F suits it.
4. Trevor: triage at the end of the week, into one backlog pull request.

## Not known yet

- How long each area really takes. One session each is a guess; the first week will show it.
- Whether 2–3 hours a week covers the checklist in a reasonable time. It has 120 clinician
  checks and 19 parent checks.
