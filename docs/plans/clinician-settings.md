# Clinician settings

**Planned 2026-09-01** from Peter's review. Not started. The Settings nav item exists and is
disabled.

## What this mostly is

Not new features. **Most of what belongs here already exists in the data and has nowhere to live** —
a clinician's own name and credentials, the clinic's consultation checklist, who else can open a
patient. Settings is the screen those things have been missing.

There is even an `organizations.settings` JSON column already on the model that **nothing reads**.

## Two halves

**Your account** — always visible.

**Your clinic** — only for an institution admin. That flag already exists (`UserRole.is_org_admin`)
and two of the three clinicians at Test School have it.

## Your account

| | Today |
|---|---|
| Name, credentials, phone | On `PractitionerProfile`. No way to edit any of them. |
| Email | On `User`. |
| Change password | Reset-by-email exists. Changing it while signed in does not. |
| Notifications | **Nothing to control yet.** All five emails Float sends go to patients, parents or new clinicians — a clinician receives nothing. Peter, 2026-09-01: build clinician notifications, and scaffold the control for later. See [`clinician-notifications.md`](clinician-notifications.md). This section of the settings page comes AFTER there is something for it to switch off. |

## Your clinic — for institution admins

### Who can open which patients

Access grants shipped 2026-08-28 with no interface at all. Per-patient it belongs on the patient
page; **who else in my clinic works with me** belongs here.

**Gate:** `/security-review`. This is the screen that hands out access to patient records.

### The consultation checklist

Already per-organisation (`OrganizationChecklistItem`), and today only editable from the Float admin
app. It is the clinic's own process and they cannot touch it.

An institution admin can view and edit their clinic's list.

### How long before it signs you out

Fifteen minutes, currently written into `IDLE_LIMIT_MS` in `apps/web/src/api/session.ts`. Clinics
have policies about this, and it is the kind of thing a security review asks about.

## Float admin decides what a clinic may change

**Peter, 2026-09-01, and this is the structural part.** Both clinic settings above are gated by a
switch Float controls:

> *"we will want float admin to be able to turn that on/off"* — the checklist
> *"ability to use this should also be controllable at float admin level"* — the sign-out timer

So a clinic setting has two states before it is usable: **Float has allowed this clinic to change
it**, and **the clinic has changed it**. A clinic that has not been allowed sees the value Float set
and cannot edit it.

This is the "feature flags / config" item from `docs/backlog.md` arriving with its first real use,
and it needs a screen in the Float admin app: a list of clinics and what each is allowed to control.

`organizations.settings` is where this lives.

**When Float turns a capability off for a clinic that had already changed it: revert and notify**
(Peter, 2026-09-01). The clinic's value goes back to Float's, and the clinic is told — a setting
silently changing underneath a clinic is worse than the change itself.

**There is no way to notify a clinician today.** The `notifications` table is patient-scoped and no
route reads it, so email is the only working channel. The cheapest honest version is a line on the
settings page the next time an admin opens it, saying Float has changed this back to the standard
setting. Email if that is not enough.

## Not in this

- **Clinic-specific tips.** Peter, 2026-09-01: not for now. Tips stay global.
- **Billing.** No paying clinicians yet.
- **How long a parent monitors.** Peter, 2026-09-01: they monitor until the appointment. No control
  needed. Worth knowing that three parent-facing places still say "about a week" — the monitoring
  SMS, the monitoring email, and the clinician's own screen — which tells a parent the wrong
  commitment when the appointment is three weeks out.

## Open

**How the clinic is told.** Float has no clinician-facing notification channel — see above. A line
on the settings page, an email, or both.

## Order of work

1. **Your account** — name, credentials, phone, email, password. Stands alone, no permissions to get
   wrong, and gives the page a reason to exist.
2. **The Float admin capability switches**, because both clinic settings depend on them.
3. **The consultation checklist** for institution admins.
4. **The sign-out timer.**
5. **Who can open which patients** — last, because it is the one where a mistake hands out access to
   a patient record. `/security-review` before it ships.

## How to tell it worked

- A clinician changes their own credentials and sees them on the patient page.
- An institution admin edits their clinic's checklist and a new patient gets the edited list.
- A clinician who is not an admin cannot see the clinic half at all — not disabled, absent.
- A clinic whose capability Float has turned off sees the value and cannot change it.
- A clinician cannot grant access to a patient they cannot open themselves.
