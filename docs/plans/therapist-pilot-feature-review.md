# Therapist pilot — feature review checklist

**Date:** 2026-10-02 · **Status:** review list, for Peter to scope the pilot

## Purpose

The first pilot is therapists only — **no real patients on the platform**. The therapist logs in,
explores the feature set with demo data, learns how Float works, and tells us whether it's
valuable. So this lists the **therapist-facing** features to decide in/out of the pilot and to test
before it starts. Everything here needs demo data to be worth showing (see the bottom).

**How to use:** mark each line **In / Out / Needs work** for the pilot.

---

## 1. Getting in and finding your way
- Clinician login (email + password); forgot/reset password.
- Organization name shown in the top bar; sign out.
- Top nav: **My Patients · Tools · Education · Settings**.
- Settings: edit your name, credentials and phone (these show on the patient page); change password.

## 2. Patient list (My Patients)
- List of your patients with their stage (new, monitoring, assessment, planning, in treatment,
  closed) and a "recommended focus" nudge per patient.
- Add a new patient.

## 3. Taking on a patient (onboarding)
- Create a patient record.
- Send / resend the **parent monitoring form**, or copy the link, so the family logs a week of
  observations before the first appointment.
- The **consultation checklist** (the 12-step process guide on the patient page).
- Invite the teen to their app (teen access); manage parent access.

## 4. Monitoring (what the family reported)
- **Report** tab: the monitoring entries, newest first, dated to the day recorded, with an "audio
  recorded" marker.
- **Case Summary** tab: the written summary of the picture so far (may start empty).
- View individual entries; send/resend the form.
- "Just say it" voice/text capture on the family side → written up as observations the therapist
  reads.
- AI extraction: situations, behaviours and accommodations pulled from monitoring into
  **suggestions** the therapist can add to the plan (nothing is added automatically).

## 5. Assessment — the downward arrow
- Downward arrow on a situation inside the plan: the guided "what happens next" chain to the feared
  outcome, with AI-phrased probes the therapist can reword before asking (confirm-first).
- **Ad-hoc downward arrow** (Tools): run one on its own, off the ladder, from a typed situation.

## 6. Planning — the plan builder (Plan tab)
- Trigger situations with fear ratings (distress thermometer).
- **Exposure ladder**: rungs and smaller sub-situations.
- **Accommodation ladder**: the parent's accommodations with a "how hard if they stopped" fear
  range.
- Step **suggestions** generated from the monitoring data while building.
- "Patient can view" switch — controls what the child sees of the ladder.
- Activate the plan.

## 7. Sessions
- **Session mode**: the in-session, co-located interview flow (therapist + child) for capturing
  situations and behaviours.
- Session notes.
- Record a session.
- **AI session analysis** — placeholder button today; decide if it's shown in the pilot.

## 8. Exposures (the child's work)
- Experiments list: scheduled vs completed.
- Stats: completed exposures, completed/scheduled, average fear change, average belief-in-prediction
  change, longest streak.
- Calendar day detail: predicted vs actual fear and belief for each exposure.

## 9. Parent collaboration
- Clinician ↔ parent chat.
- Accommodation states the therapist sets (not started / working on it / stopped).
- Weekly check-in review (how consistently the parent held the focus accommodation).
- Progress-sharing switch (lets the parent see the child's progress).

## 10. Communication
- Chat tab: messaging with the teen and with the parent; unread counts.

## 11. Education (therapist psychoeducation)
Eight modules in five groups: Foundations (understanding anxiety, family accommodation),
Assessment (assessment tools, downward arrow), Treatment (exposure ladder, planning exposures),
Working with parents, and "The app" (using Float day to day).

## 12. Tools
- Ad-hoc downward arrow (first tool; the menu is built to hold more).

---

## Seeing the family's side — IN (Peter, 2026-10-02)
The pilot therapist **does** see the child app and the parent app — they can't judge the clinician
tools without knowing what the family experiences. Caveat: the family apps are about to be heavily
redesigned; the pilot shows the **current** versions, so frame them to the therapist as "what's
there today," not the final design.

## Demo patient staging — AGREED (Peter, 2026-10-02)
No real patients, so demo patients are staged to exercise each feature. Agreed shape, 3–4 patients:
1. **Monitoring-only** (like the existing "Maya Chen") — a week of monitoring + extracted
   suggestions, nothing on the plan yet. Shows sections 4–5.
2. **In planning** — situations entered, a downward arrow or two done, ladder and accommodations
   half-built. Shows sections 5–6.
3. **In treatment** — full ladder + accommodations, a run of completed exposures (so the charts and
   streak have data), session notes, parent chat. Shows sections 6–10.
4. Optional: a **closed** patient, to show the full arc.

Plus demo parent/teen accounts so the therapist can preview the family apps.

**Building this data is a separate backlog item** (not to be done now) — see the Admin section of
`docs/BACKLOG.md`, "Demo patients for the therapist pilot."

## Decisions / likely out of scope for the pilot
- **AI session analysis** — placeholder, not functional.
- **Education content maturity** — modules exist; confirm they're pilot-ready.
- **Reminders** — not built (no scheduler); don't put it in front of them as if it works.
- **Admin setup** (creating orgs/clinicians, parent tips, waitlist) — platform-admin work, not the
  therapist's experience; it's how we'll stand up the demo accounts, not something they review.
- **Two-parent accounts, rewards** — on the backlog, not built.
- Housekeeping: the practitioner idle auto-logoff is relaxed to 60 min for testing — fine for a
  demo pilot, restore to 15 before real patients.
