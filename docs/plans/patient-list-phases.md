# The patient list: phases, closing a patient, and a filter

**Planned 2026-08-31** from Peter's review. Not started.

## Why the progress column stopped moving

It is not the checklist. `computeProgress` in `DashboardPage.tsx:22` works from four setup steps,
and **step three can never complete**:

```
p.has_consultation_1_note && p.has_parent_da
```

`has_parent_da` is true only when a downward arrow exists with `facilitated_by = 'parent'`
(`patients.py:344`). **Nothing in the app ever creates one.** Every path that makes an arrow —
the arrow mode, the situation arrow, the old Plan-tab form — writes `'practitioner'`. So every
patient sticks at "Setup · Step 3 of 4" no matter what the clinician does.

Worth keeping in mind while replacing it: a progress indicator built from a long conjunction of
flags fails silently the moment one flag stops being set. The replacement should be derived from
state that visibly changes.

## Phases

Peter's list, with names that read like a clinician's sentence rather than a workflow diagram:

| Phase | True when |
|---|---|
| **New** | nothing has happened yet |
| **Monitoring** | a monitoring form has been sent |
| **Assessment** | monitoring entries are in, or a session note exists — and there is no plan yet |
| **Planning** | a treatment plan exists but is not active |
| **In treatment** | the plan is active |
| **Closed** | the clinician has closed the patient |

Each is a single observable fact, not a conjunction. A patient moves forward because something
happened, and one thing failing to be recorded cannot freeze the whole column.

**Derived, not stored** — except Closed, which is a deliberate act and has to be recorded.

Peter's original wording was monitoring / initial sessions / planning / experiments. "Assessment"
covers the initial sessions and the formulation that comes out of them, and "In treatment" says
what the phase is rather than naming one activity inside it. His call.

## Closing a patient

A closed patient keeps everything. All their data stays readable — this is finishing treatment, not
deleting anyone.

**Where it lives:** a field on the patient, not on the plan. A patient can have more than one plan
over time, and closing is about the person's care ending.

Two things to decide, and both are Peter's:

- **Can a closed patient be reopened?** Treatment restarting is ordinary in this field.
- **Does closing change what the child and parent see?** Their apps read a plan by status. Closing
  the patient without deciding this could silently empty a child's app, or leave it running for
  someone no longer in treatment.

The second one matters more than it looks and should be settled before this ships.

## The filter

A control at the top of the list, filtering by phase. The roster is already scoped to the patients
a clinician has been granted, so this filters within that.

Worth deciding: **does the list hide closed patients by default?** A clinician with two years of
finished cases does not want them in the way, and "closed" is the one phase people will want out of
sight — which is an argument for the filter defaulting to everything except closed.

## Order of work

1. **Phases**, replacing the stuck progress column. Standalone and fixes something visibly broken.
2. **The filter**, once there are phases to filter by.
3. **Closing**, after the two questions above are answered.

## How to tell it worked

- A patient who has had a monitoring form sent and entries returned reads "Assessment", not
  "Setup · Step 3 of 4".
- Moving a patient forward in real use moves the phase, without anyone editing a checklist.
- A closed patient is still fully readable.
- The filter shows only the phase chosen, and there is a test that a patient in each phase lands in
  the right one.
