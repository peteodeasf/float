# Education in Float: the four parts

> **Started 2026-11-20 with Peter**, while building the product overview for Dr. Walker
> (https://claude.ai/artifact/74tr99MGtkCho3beeKRqsd, private to Peter). This plan sets out what
> each kind of education is for and where it lives. It does not write any content: the clinical
> content is Dr. Walker's.

## The four parts (Peter, 2026-11-20)

| Part | Who reads it | What it is for | Where it lives | Today |
|---|---|---|---|---|
| **Guide** | Clinician | Walks the clinician through each stage of treatment in Float, for this patient. | Side panel on the patient page | Partly built |
| **Library** | Clinician | The deeper clinical guide: how to do exposure-based CBT using Float, with evidence, references and helpful outside resources. | Library in the clinician app | Partly built: being rewritten from the book |
| **Software help** | Clinician (mainly) | How to use each part of Float. Ordinary software help. | Not decided | Not started |
| **Patient and parent education** | Child, parent | Teaching content and videos served to the child and the parent in their apps. | Patient app, parent app | Mostly does not exist |

### Guide
Plan of record: [`clinician-guide.md`](clinician-guide.md). Six of seven stages have draft wording.
Ending treatment (relapse prevention) has none, and the other gaps are listed in that plan.

### Library
- **The content is translated from Dr. Walker's book, *Anxiety Relief for Kids*, and she reviews
  it** (Peter, 2026-11-20). Today's eight modules are a first pass that is "really not correct". They
  stay, and are reorganized and rewritten, not thrown away. The reading page, quizzes and progress
  ring work ([`education-redesign.md`](education-redesign.md)).
- **What it will hold:** the clinical method for exposure-based CBT using Float, plus the evidence
  behind it, references, and outside resources.
- **Videos for clinicians** sit here ([`videos.md`](videos.md), stage 1 is built).

### Software help
- Nothing exists. There is no help page and no help search.
- **Written pages, plus help on each screen** (Peter, 2026-11-20). Short videos maybe later.
- **Moves here from elsewhere:** module 8 of the current Library, "Using Float", and the videos on
  how to use Float (`videos.md` calls these product videos; they are mainly for clinicians).

### Patient and parent education
- Content served to the child and to the parent, in their own apps. Most of it does not exist.
- **In today's web apps too,** not only the future iOS and Android apps (Peter, 2026-11-20).
- **How content reaches the family:** Float will support both the clinician choosing what to send
  and Float serving it by stage of treatment. To start, the clinician chooses (Peter, 2026-11-20).
- **Videos for families** go here: a clinician shares a video and the family watches it in their app
  ([`videos.md`](videos.md) stage 2, planned).
- **The tips** shown during an exposure (child) and for the accommodation being worked on (parent)
  already work, but the wording is placeholder or missing.
- The child's content has to read well for ages 8 to 17.

## Progress reports (were "reference sheets")

Peter, 2026-11-20. This replaces the backlog entry "Reference sheets for the parent and for the
child".

- **Made on request** from the patient's own data at the time, so the content changes as treatment
  goes on (for example a summary of monitoring early on, progress later).
- **One set of information, three views:** a clinician view, a parent view and a patient view. Any of
  the three can be made at any time.
- **In the clinician app** the clinician can view or export any of the three, for their own use.
- **In the patient app and the parent app,** each person sees their own view.
- **What they are:** a combination of the action plan and progress (Peter, 2026-11-20).
- **Name: Progress report** (Peter, 2026-11-20). Replaces "reference sheet".
- What each view contains is waiting on Dr. Walker.

## Decided 2026-11-20

Peter's answers to the first open questions are written into the sections above: the Library is
rewritten from the book and Dr. Walker reviews it; the current modules are kept and reorganized;
software help is written pages plus help on each screen; "Using Float" and the how-to videos move to
software help; the clinician chooses what education to send, to start; education goes into the web
apps too; reference sheets are renamed progress reports.

## Gates

- **Clinical content:** every word in the Guide, the Library and patient and parent education is Dr.
  Walker's to write or sign off.
- **Who sees what:** progress reports show patient data in three views. The parent view must not
  show what the child keeps private (their own words, their ratings of each exposure; see
  [`parent-sees-child-progress.md`](parent-sees-child-progress.md)). Building them needs
  `/security-review` and Peter's review.
