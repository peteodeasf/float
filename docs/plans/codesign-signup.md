# Co-design sign-up

**Date:** 2026-10-19 · **Status:** building

Peter, 2026-10-19. The co-design one-pager (November 2026) has a QR code to
floatcbt.com/codesign. That page becomes the whole sign-up: it carries the one-pager's content, a
teen signs up for one date from each week, and their parent is emailed for permission.

## What the one-pager says (the page matches it)

- Ages 13–17 · Virtual · Paid. Calling all students · November 2026.
- "Help design an app for teens. Get paid for your ideas." Two relaxed, virtual group chats.
- $60 for joining both sessions.
- What is Float? / What we'll chat about (three items).
- Pick one date from each week. 45–60 min · on video · open discussion.
  - Session one · your thoughts: Tue Nov 3, Wed Nov 4, Thu Nov 5.
  - Session two · your ideas: Tue Nov 10, Wed Nov 11, Thu Nov 12.
- Sign up by Friday, October 30. A parent or guardian's permission is needed. Questions?
  sally@floatcbt.com.

## Decided (Peter, 2026-10-19)

- Every session is at **12pm Eastern**.
- **Teen email is required**, so we can contact them. Parent name and email are required too.
- The permission text is a **placeholder** for now. Peter has a draft and will supply it.
- **No automatic reminders.** The team chases by hand.
- A sign-up **holds its two seats for 3 days**. If the parent has not given permission by then,
  the seats are free again.
- **Sally sends the meeting invites and the payment herself.** Float does not send video links or
  handle money.

## Not decided — placeholder used

- **Seats per session: 8.** Peter has not given a number. It is one value per date in the database,
  so it can change without code.

## What happens

1. The teen fills in the page: first name, last name, age (13–17), email, parent's name and
   email, one date from week 1 and one from week 2. Dates that are full cannot be picked.
2. Float saves the sign-up and emails:
   - the **parent** a permission request with a link;
   - the **teen**, saying they are signed up and their parent has been asked.
3. The parent opens the link: a page on floatcbt.com showing the teen's first name, the two dates,
   and the permission text, with their name typed in and an "I give permission" button.
4. Float records the permission (name typed, date and time) and emails the parent and the teen
   that it is confirmed and that Sally will send the meeting invites.
5. Sally sees every sign-up in the admin dashboard, grouped by date: teen, parent, permission
   (waiting, given, or seats released after 3 days).

Sign-ups close at the end of Friday, October 30, Eastern time. After that the form says so and the
server refuses new ones.

### Seats

A date's seats taken = sign-ups with permission given + sign-ups still inside their 3 days. A
permission that arrives after the 3 days is still recorded. If a chosen date has filled up in the
meantime, the admin list marks that sign-up as over the limit, and Sally sorts it out by hand.

## Data

Two new tables, kept apart from the waitlist and from patient records. These are not patients.

- `codesign_sessions`: week (1 or 2), starts_at (time zone aware), seats.
- `codesign_signups`: the teen's and parent's details, the two chosen sessions, a permission
  token, permission given at and the name typed, created at.

The six sessions are added by the migration. Additive only: two new tables, nothing dropped.

## Access

- Public, no login: list the dates with seats left; sign up; open and give permission with the
  link's token. The same anti-bot check as the waitlist (hidden field + time on page).
- The permission page shows only the teen's first name and the two dates. Not the teen's email,
  age or surname.
- The list of sign-ups is admin only.
- `/security-review` before merge: new public routes holding minors' contact details.

## Build

1. Backend: models, migration, routes, emails, tests.
2. floatcbt.com/codesign: new content and form; a permission page at /codesign/permission/.
3. Admin dashboard: a Co-design section.
4. Deploy: merge the backend (Railway runs the migration), then upload the website.
