# Co-design sign-up

**Date:** 2026-10-19, updated 2026-10-21 · **Status:** building

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
- The permission text was a **placeholder** at first. Peter supplied the real form on 2026-10-21:
  see "Permission form" below.
- **No automatic reminders.** The team chases by hand.
- A sign-up **holds its two seats for 3 days**. If the parent has not given permission by then,
  the seats are free again.
- **Sally sends the meeting invites and the payment herself.** Float does not send video links or
  handle money.

## Seats per session

- **6 seats per session** (Peter, 2026-10-21). It was 8 as a placeholder. It is one value per date
  in the database, so it can change without code.

## What happens

1. The teen fills in the page: first name, last name, age (13–17), email, parent's name and
   email, one date from week 1 and one from week 2. Dates that are full cannot be picked.
2. Float saves the sign-up and emails:
   - the **parent** a permission request with a link;
   - the **teen**, saying they are signed up and their parent has been asked.
3. The parent opens the link: a page on floatcbt.com with the full permission form, the teen's
   first name and two dates filled in. The parent answers their part, and the teen's agreement is
   filled in below it (see "Permission form" below).
4. Float records every answer, the date and time, and which version of the form was shown. It
   emails the parent a copy of the form with all the answers, and emails the teen.
5. Sally sees every sign-up in the admin dashboard, grouped by date: teen, parent, status
   (waiting, confirmed, declined, or seats released after 3 days), and what was agreed.

Sign-ups close at the end of Friday, October 30, Eastern time. After that the form says so and the
server refuses new ones.

### Seats

A date's seats taken = confirmed sign-ups + sign-ups still inside their 3 days with no answer yet.
A declined sign-up frees its seats at once. A
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

## Permission form (Peter, 2026-10-21)

Peter supplied the form on 2026-10-21 as a Word document. This is its text with his edits of the
same day:

- "[Your child does not need any experience with anxiety to take part.]" is a plain sentence.
- "[Float / the school / the organization hosting the session]" is "Float".
- The two session dates are the ones this teen chose, at 12pm Eastern.
- "Group size: 5 other teens" is "Up to 5 other teens, ages 13 to 17".

Everything else is word for word. The text the page shows is kept in one place,
`backend/app/services/codesign_form.py`. The page fetches it from the server, and the copy emailed
to the parent is built from the same text. Each answered form stores a version label for the
wording it was shown.

### How the paper form becomes a web page

- **The parent says yes or no** to each of the three permission lines. All three must be answered.
- **"By signing, I confirm..."** becomes a checkbox the parent must tick.
- **The signature is the parent's typed full name.** The date and time are recorded by the server.
- **"Phone and email"** is two fields. The email field is optional on the page: blank means the
  address the link was sent to. The page cannot show that address, because the link alone must not
  reveal the parent's email (see Access).
- **"Child's name"** shows the teen's first name. **"Child's age"** is not shown, for the same
  reason. The emailed copy has both, because it goes to the parent who typed them.
- **The teen agreement is on the same page, below.** Peter: "The teen signs with the parent, or the
  parent signs on behalf of the teen. They're under 18, so there needs to be parental consent." So
  the page says who filled it in: the teen with their parent, or the parent on the teen's behalf.
  The teen's typed full name is their signature.

### What the answers mean

- **Confirmed:** the parent said yes to taking part and the teen said yes to taking part. The seats
  are kept.
- **Declined:** either said no. The seats are freed at once. The teen will not take part.
- **Recording allowed** only when the parent and the teen both said yes to recording.
- **Quotes allowed** is the parent's answer to the quotes line.
- One answer per link. A second submission changes nothing; the first one stands. To change an
  answer, the parent emails Sally.

### The form text

> **Float Co-Design Session: Parent/Guardian Permission**
>
> **About this session**
>
> We are asking your permission for your child to take part in a Float co-design session. Please
> read this form and ask us any questions before you decide.
>
> Float is a company building an app to help children and teens work through anxiety together
> with their therapist and parents. The app is still in development and is not yet used with
> patients.
>
> In a co-design session, young people share their ideas and opinions to help us design the app.
> Your child does not need any experience with anxiety to take part.
>
> The session is run by the Float team.
>
> **What your child will do**
>
> Your child will take part in two online focus groups with other teens their age, led by the
> Float team. We will ask for their opinions on:
>
> - The apps they love, and why
> - What feels supportive to them in stressful situations, and what doesn't
> - Their own ideas for how Float should look and work
>
> **Date and time:** Session 1: *(the teen's week 1 date)* at 12pm Eastern. Session 2: *(the
> teen's week 2 date)* at 12pm Eastern.
> **Location:** Online. We will email you the link before each session.
> **Length:** 45-60 minutes per session
> **Group size:** Up to 5 other teens, ages 13 to 17
> **Adults present:** Float team members
>
> Your child can share as much or as little as they like.
>
> **Taking part is voluntary**
>
> You decide whether your child can take part. Your child also decides. If either of you says no,
> your child will not take part.
>
> - Your child can skip any question or activity.
> - Your child can take a break or stop at any time, for any reason.
> - You can withdraw your permission at any time.
> - Saying no or stopping will not affect your child's relationship with Float.
>
> If your child stops, we will delete their notes and recordings if you ask us to.
>
> **Possible discomforts**
>
> Some teens may feel shy sharing ideas in a group. Your child can skip any activity or take a
> break, and a staff member will check in if they seem uncomfortable.
>
> **Recording and privacy**
>
> We will take written notes and photos of the work the group creates, such as sketches and sticky
> notes. We will only audio or video record the session if you and your child agree below.
>
> - Only the Float team will see notes, photos and recordings.
> - We use first names only during the session. We remove names from notes and anything we write
>   up.
> - We do not sell or share this information with anyone outside Float.
>
> We will ask everyone in the group to keep what others say private. We cannot promise that every
> participant will do so.
>
> **How we use your child's ideas**
>
> We will use the ideas, feedback and sketches from the session to design and improve Float. By
> agreeing to this form, you agree that Float may use these ideas in its products without further
> payment or credit beyond the thank-you gift.
>
> We will not use your child's name, face or voice in any public material. If you agree below, we
> may use short quotes with no name attached in presentations about Float.
>
> **Thank-you gift and questions**
>
> Your child will receive $60 at the end of the second session. They will receive it even if they
> stop early.
>
> If you have questions before, during or after the session, contact Sally McCarthy at
> sally@floatcbt.com.
>
> We will give you a copy of this form to keep.
>
> **Parent or guardian permission**
>
> Child's name: *(the teen's first name)*
>
> Please check one box for each line. *(Yes / No)*
>
> - I give permission for my child to take part in the co-design session.
> - The session may be audio or video recorded.
> - Float may use short quotes from my child, with no name attached, in presentations about Float.
>
> ☐ I confirm that I am this child's parent or legal guardian, I am at least 18 years old, I have
> read this form, and I have had the chance to ask questions.
>
> Parent or guardian name *(typed; this is the signature)* · Relationship to child · Phone · Email
> · Best number to reach you during the session
>
> **Teen agreement**
>
> To be read with your teen and signed by them.
>
> *(Added, Peter 2026-10-21:)* The teen fills this in with their parent, or the parent fills it in
> on the teen's behalf.
>
> We are asking you to help us design an app for young people. You will do some activities with a
> small group and share your ideas and opinions.
>
> - Your parent said it is OK to ask you, but it is your choice.
> - You can skip any question, take a break, or stop at any time. No one will be upset.
> - We will only record the session if you and your parent agree.
> - We keep what you say within the Float team and do not use your name. If you tell us that you
>   or someone else might be seriously hurt, we will have to tell your parent.
> - You can ask questions at any time.
>
> *(Yes / No)*
>
> - I want to take part in the co-design session.
> - It is OK to record the session.
>
> Your name *(typed; this is the signature)* · Completed by: the teen, with their parent / the
> parent, on the teen's behalf
