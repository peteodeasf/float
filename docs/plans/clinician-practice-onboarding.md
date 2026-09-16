# Practice and clinician onboarding — plan

**Planned 2026-09-16.** Steps 1 and 2 done.
**Gate:** `/security-review` before any part ships. All of it touches sign-in and who can see
which patients (non-negotiable #2).

## Goal

A practice can get from "never heard of Float" to "first family using it" without Float doing
setup work by hand. The clinician is guided through it, and nothing touching a patient happens
until the practice has accepted the terms and BAA.

Serves the "basic clinician platform" priority in `STRATEGY.md`.

## Decided

**Peter, 2026-09-16:**

- **How a practice starts.** At launch, a practice requests access and Float approves it. After
  approval the practice does its own setup. It must be easy to switch to full self-serve later,
  where anyone can sign up without approval.
- **Solo clinicians and group practices, both at launch.** The table in "Solo and group
  practices" is agreed as the starting point.
- **The BAA is accepted in the app.** The lawyer-written text is still needed. It also depends
  on the open question in `docs/backlog.md` of whether Float is a covered entity or a business
  associate.
- **An office manager who isn't a clinician can set up a practice.** They see patient names and
  which clinician has each patient, can give a clinician access, and can't open any record. See
  "Office managers" below.
- **First-run guidance stays simple for now.** A setup checklist and short explanations where
  they're needed. See step 5. A sample family comes later.

## Office managers

Today "practice admin" and "clinician" are the same person. Every clinician screen and endpoint
(115 of them) needs a clinician profile, and a practice admin sees every patient in the practice.
An office manager breaks both assumptions.

- **A new role: practice manager.** No clinician profile. Every clinician endpoint already
  refuses someone without one, so a manager is locked out of patient screens by default.
- **Their own small area:** colleagues (invite, make admin, remove), Settings → Your clinic,
  and the BAA. Not the patient list, sessions, education or anything clinical.
- **Setup:** the request form asks "Are you a clinician or an office manager?" A manager's
  details screen has no credentials field.
- **The manager must invite at least one clinician** before the practice can treat anyone. That
  is the first item on their checklist.
- **"Admin sees every patient" applies only to clinician admins.** A manager is not treating
  anyone. HIPAA expects staff to see only what their job needs.
- **What a manager sees of patients** (Peter, 2026-09-16). When a clinician leaves, someone has
  to hand their patients to another clinician. A manager sees each patient's name and which
  clinician has them, and can give a clinician access, but can't open any record. Every view and
  change is logged.
- **A clinician who also runs the practice** stays a clinician admin, as today.
- `/security-review` is required. This adds a role that can hand out access to patient records.



Float stores both the same way: a practice with one or more clinicians. There is no "practice
type" field. What differs is what each person sees and does.

| | Solo clinician | Group practice: the person who sets it up | Group practice: a colleague |
|---|---|---|---|
| How they get in | Request access, approved by Float | Request access, approved by Float | Invited by a practice admin |
| Setup screens | All four | All four | Password and own details only |
| Accepts the BAA | Yes, for the practice | Yes, for the practice, confirming they're allowed to sign for it | No. The practice already has |
| Accepts the terms of use | Yes | Yes | Yes, for themselves |
| Practice admin | Yes, automatically | Yes, automatically | No, unless an admin makes them one |
| Which patients they see | All of their own | Every patient in the practice (decided 2026-08-28) | Only patients they add, or are given access to |
| Setup checklist | No "invite a colleague" item | Includes "invite a colleague" | No invite item. No practice details |
| Settings → Your clinic | Visible | Visible | Hidden |

Things only a group practice needs, all done by a practice admin:

- **Invite a colleague.** A solo clinician can do this too, from Settings. That's how a solo
  practice becomes a group practice. Nothing needs converting.
- **Make a colleague an admin**, so someone can cover. The last admin can't remove their own
  admin status.
- **Remove a colleague.** Their account stops working. Their patients stay in the practice, and
  an admin gives another clinician access to them. Nothing is deleted.

The practice size given on the request form only decides whether the owner's checklist shows
"invite a colleague".

## What exists today

- Only a Float admin can create a practice (`POST /admin/organizations`) or a clinician
  (`POST /admin/clinicians`), in the admin app.
- A new clinician gets a **temporary password in a plain email**. The clinician app never checks
  `must_change_password`, so they can keep using that password indefinitely.
- The admin form for a new practice asks for an admin email, but the backend ignores it. Nothing
  in the app can make someone a practice admin (`is_org_admin`). Only a script sets it.
- The waitlist is not part of onboarding (Peter, 2026-09-16: not fit for that purpose). Access
  requests are a separate thing and don't touch it.
- No signup page, terms or BAA step, billing, email verification, or MFA.
- The only guidance a new clinician sees: "No patients yet. Add your first patient to get started."
- Production email is sent from `notifications@send.floatcbt.com`. `send.floatcbt.com` is the
  domain verified in Resend, so any sender address must end in `@send.floatcbt.com`.

## The flow

### 1. Request access

A public page: "Request access for your practice."

Asks for: your name, your email, your credentials (e.g. LCSW, PhD), practice name, US state,
roughly how many clinicians.

The page always shows the same confirmation, whether or not the email already has an account.
Otherwise the form tells a stranger which emails are Float users.

### 2. Float approves (approval mode only)

A new "Access requests" list in the Float admin app. The waitlist stays as it is.
Float can approve or decline each request.

Approving creates the practice with status **setting up**, creates the user, and emails a
**setup link**. It doesn't send a temporary password. Declining sends nothing automatically.

### 3. The setup link

- Works once, and expires after 7 days. Float admin can send a new one.
- The database stores only a hash of the link's token, not the token itself.
- Clicking it proves the person owns the email address, so no separate verification step is
  needed.

### 4. Practice setup — four short screens

1. **Choose a password.**
2. **Your details:** name, credentials, phone. Pre-filled from the request.
3. **Your practice:** name, state, phone.
4. **Terms and BAA:** read and accept. Records the user, the document version and the time.

The person who finishes setup becomes the practice's admin (`is_org_admin`). Their practice
status becomes **active**.

**Nobody can use the clinician app until setup is finished** (Peter, 2026-09-16). Not the
patient list, not settings, not education. This is checked on the backend, not only hidden in
the app:

- Every clinician endpoint refuses a user whose own setup isn't finished, or whose practice isn't
  active. Only the setup screens' own endpoints work.
- Signing in before setup is finished goes straight back to the next unfinished setup screen.
  Someone who chose a password on screen 1 and closed the tab carries on from screen 2.
- A colleague (step 6) is held the same way until their own setup is done: password, their
  details, and accepting the terms of use. The practice has already accepted the BAA, so they
  don't see it.
- A suspended practice is refused the same way.

### 5. First run: the clinician home screen

**Peter, 2026-09-16: keep this simple for now.** Detailed design comes later.

He agreed these principles, which the simple version follows and the later design builds on:

- Get the clinician to see Float working for them as early as possible.
- Learn by doing real work, not by watching a tour.
- A short checklist, three to five items, that ticks off as the work gets done.
- Every empty screen says what will appear there and gives the one action that fills it.
- Help appears the first time someone uses a feature, not all at the start.
- One or two questions up front so the guidance fits the person.
- Follow up with clinicians who stall. There is no scheduler, so this is manual for now.

**Not known yet:** which moment shows a new clinician Float is worth using. It decides what a
sample family shows first and what the checklist leads to. Left open until the detailed design.

**The simple version:**

A setup checklist replaces the "No patients yet" empty state. Each item ticks itself off based
on what's actually in the database. Nothing is ticked by hand.

- Your details are complete
- Invite a colleague (group practices; can be skipped)
- Read "How Float works" (links to the existing clinician education)
- Add your first patient
- Send the first monitoring form to a parent

The checklist can be hidden once the first patient is added.

Short explanations sit where people act. For example, on "Invite parent": what the parent
receives, what they can see, and that the child isn't connected until the parent consents.

### 6. Invite colleagues

A new section in Settings → Your clinic, visible only to practice admins. The admin enters a
name and email, and the colleague gets a setup link. Their setup is a password, their own
details, and accepting the terms of use.

A new colleague sees no patients until someone grants them access. That's how access grants
already work. The invite screen should say this plainly.

### 7. Switching to full self-serve

A single setting: `PRACTICE_SIGNUP_MODE` = `approval` or `open`, set as a Railway variable.

- **approval:** the request form saves a request, and Float approves it (step 2).
- **open:** the same form creates the practice and sends the setup link immediately.

Everything from the setup link onward is identical in both modes. The switch changes one branch
in one endpoint.

Open mode also needs, before it's switched on:
- A limit on how many requests one IP address or email can send.
- A way for Float admin to suspend a practice.

## Data changes

| Change | What it holds |
|---|---|
| New `access_requests` table | name, email, clinician or office manager, credentials, practice name, state, practice size, status (new / approved / declined), reviewed by, reviewed at, the practice it became |
| `organizations.status` | setting up / active / suspended. Existing practices become active. |
| New `setup_links` table | user, practice, purpose (practice owner / colleague), token hash, expires at, used at, created by |
| New `agreement_acceptances` table | practice, user, document (terms / BAA), version, accepted at. One row per acceptance, so a new BAA version adds a row rather than overwriting the old one. |

All migrations add things. None drop data.

## Also fixed along the way

- **Temporary passwords for clinicians.** The admin "New clinician" button sends a setup link
  instead. This also fixes the clinician app never asking a new clinician to change the password.
- **The ignored admin email** on the new-practice form. It becomes the practice owner, who gets
  the setup link.

## Not in this plan

- **Billing.** No paying clinicians yet.
- **MFA for clinicians.** Likely expected by practices handling patient records. Needs its own
  plan.
- **SSO** (signing in with Google or Microsoft).
- **One clinician in several practices.** Today a clinician belongs to one practice.
- **Checking licence or NPI numbers.** Credentials stay free text.
- **Parents and children still get temporary passwords by email.** Moving them to setup links
  would reuse the same `setup_links` table. Separate follow-up.

## Order of work

1. **Check production email sends from a verified domain.** **Done 2026-09-16.**
2. **Setup links**, replacing clinician temporary passwords in the existing admin flow. Works
   on its own and removes the current gap. **Built 2026-09-16.** The admin Users list offers
   "Resend setup link" to a clinician who was sent a link and hasn't used it. Clinicians made
   before this still sign in with whatever password they have; nothing forces them to change it.
3. **Practice status and terms/BAA acceptance**, plus the backend check that blocks the whole
   clinician app until setup is finished. Uses placeholder text until the lawyer's version exists.
4. **Request access page, admin approval list, and the four setup screens.**
5. **Invite, promote and remove colleagues** from Settings.
6. **The practice manager role**: its own area, patient names and assigned clinician only, and
   giving a clinician access. `/security-review` before it ships.
7. **Setup checklist and in-place explanations** on the clinician home screen.
8. **The self-serve switch**, with rate limits and practice suspension.
9. **Sample family.** Separate plan. Its example situations and ladder need Dr. Walker's review.

## How to tell it worked

- A request submitted with an email that already has an account shows the same message as a new one.
- A setup link works once. A second click, or a click after 7 days, shows "this link has expired"
  and a way to ask for a new one.
- A user who hasn't finished setup is refused by every clinician endpoint, even when calling the
  API directly, and signing in takes them back to the next unfinished setup screen.
- A colleague who has just finished setup sees an empty patient list, not the practice's patients.
- A clinician who isn't a practice admin can't see or call the invite-colleague function.
- A practice manager is refused by every clinician endpoint, sees only patient names and assigned
  clinicians, and each of those views is in the access log.
- With `PRACTICE_SIGNUP_MODE=open`, a request produces a setup email with no admin step. With
  `approval`, it doesn't.
- Accepting a new BAA version keeps the record of the old one.
