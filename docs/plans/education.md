# Education in Float: the four parts

> **Started 2026-11-20 with Peter**, while building the product overview for Dr. Walker
> (https://claude.ai/artifact/74tr99MGtkCho3beeKRqsd, private to Peter). This plan sets out what
> each kind of education is for and where it lives. It does not write any content: the clinical
> content is Dr. Walker's.

## The four parts (Peter, 2026-11-20)

| Part | Who reads it | What it is for | Where it lives | Today |
|---|---|---|---|---|
| **Guide** | Clinician | Walks the clinician through each stage of treatment in Float, for this patient. | Side panel on the patient page | Partly built |
| **Library** | Clinician | The deeper clinical guide: how to do exposure-based CBT using Float, with evidence, references and helpful outside resources. | Library in the clinician app | Not started (see below) |
| **Software help** | Clinician (mainly) | How to use each part of Float. Ordinary software help. | Not decided | Not started |
| **Patient and parent education** | Child, parent | Teaching content and videos served to the child and the parent in their apps. | Patient app, parent app | Mostly does not exist |

### Guide
Plan of record: [`clinician-guide.md`](clinician-guide.md). Six of seven stages have draft wording.
Ending treatment (relapse prevention) has none, and the other gaps are listed in that plan.

### Library
- **Today's eight modules do not count as content.** Peter: the current content is "really not
  correct ... almost not developed at all". The reading page, quizzes and progress ring work
  ([`education-redesign.md`](education-redesign.md)); the words need to be rewritten.
- **What it will hold:** the clinical method for exposure-based CBT using Float, plus the evidence
  behind it, references, and outside resources.
- **Videos for clinicians** sit here ([`videos.md`](videos.md), stage 1 is built).

### Software help
- Nothing exists. There is no help page and no help search.
- Module 8 of the current Library, "Using Float", and the product videos in `videos.md` are about how
  to use Float, so they may belong here instead.

### Patient and parent education
- Content served to the child and to the parent, in their own apps. Most of it does not exist.
- **Videos for families** go here: a clinician shares a video and the family watches it in their app
  ([`videos.md`](videos.md) stage 2, planned).
- **The tips** shown during an exposure (child) and for the accommodation being worked on (parent)
  already work, but the wording is placeholder or missing.
- The child's content has to read well for ages 8 to 17.

## Reference sheets (name not decided)

Peter, 2026-11-20. This replaces the backlog entry "Reference sheets for the parent and for the
child".

- **Made on request** from the patient's own data at the time, so the content changes as treatment
  goes on (for example a summary of monitoring early on, progress later).
- **One set of information, three views:** a clinician view, a parent view and a patient view. Any of
  the three can be made at any time.
- **In the clinician app** the clinician can view or export any of the three, for their own use.
- **In the patient app and the parent app,** each person sees their own view.
- **Needs a better name.** "Reference sheet" is a placeholder.
- What each view contains is waiting on Dr. Walker.

## Open questions for Peter

1. Who writes the Library, and is *Anxiety Relief for Kids* still its starting point?
2. What happens to the eight current modules until the Library is rewritten: hide them, or keep them
   marked as a draft?
3. Software help: written pages, short videos, help on each screen, or a mix? How does it differ from
   the guide's ⓘ pop-ups?
4. Do "Using Float" (module 8) and the product videos move to software help?
5. Patient and parent education: does the clinician choose what to send (as with videos), or does
   Float serve it by stage of treatment, or both?
6. Is patient and parent education built into today's web apps, or does it wait for the iOS and
   Android apps?
7. A name for the reference sheets.

## Gates

- **Clinical content:** every word in the Guide, the Library and patient and parent education is Dr.
  Walker's to write or sign off.
- **Who sees what:** the reference sheets show patient data in three views. The parent view must not
  show what the child keeps private (their own words, their ratings of each exposure; see
  [`parent-sees-child-progress.md`](parent-sees-child-progress.md)). Building them needs
  `/security-review` and Peter's review.
