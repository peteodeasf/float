# Videos — hosting, sharing and watching

> **Started 2026-11-19 with Peter.** Float's own videos: psychoeducation (the Worry Hill, the Candy
> Jar, the Fear Level…) and how to use the product. They are being made separately and will arrive
> in batches. They are Float's intellectual property: never public, never shareable outside Float.
> Replaces the backlog item "Put video into each app — clinician, child and parent".

## Decided (Peter, 2026-11-19)

- **Host on Mux,** with signed playback. Not on our own servers, not YouTube or Vimeo.
- **A family sees only the videos a clinician has shared with them.** Not a library of every family
  video.
- **The clinician sees whether each shared video was watched.** Yes or no; not how far they got.

## Who does what

1. **The Float team uploads** a video on an admin page, gives it a title and a short description,
   and says who it is for: clinicians, families, or both. Batches arrive over time, so uploading is
   one video at a time, as often as needed.
2. **A clinician sees every video** marked for clinicians or both, in the Library, and can play any
   of them full screen in a session.
3. **A clinician shares a video** marked for families or both with a patient's child, parent, or
   both, from the patient page.
4. **The child or parent watches it in their app.** They see only what was shared with them.
5. **The clinician sees, on the patient page, what was shared, when, and whether it was watched.**

## How the videos are kept private

- **No public address.** Every video on Mux has a signed playback policy: it plays only with a
  short-lived pass (a signed token) that our backend makes, after checking who is asking:
  - a clinician: any video marked for clinicians or both;
  - a child or parent: only a video shared with them, by a clinician who may see that patient.
- **A pass runs out** a few hours after it is made (long enough to watch; the exact number is set
  when building). A link copied out of the app stops working.
- **Plays only on Float's sites.** Mux can refuse playback from any other website (its playback
  restrictions, by referring site).
- **No download button** in the player.
- **What none of this stops:** someone recording their screen. Only heavy copy protection (DRM)
  makes that harder, at real cost and complexity. Not now; revisit if a video turns up outside Float.

## HIPAA

The videos are not patient data. **Who watched what is.**

- **Mux never gets a name, email or patient id.** The pass names only the video. Viewer details
  are not sent to Mux's analytics. The record of who a video was shared with and who watched it
  stays in Float's database.
- **Mux does see the viewer's IP address,** as any website does. Whether an IP address plus "watched
  a video about anxiety" counts as patient data is a question for whoever advises on HIPAA. No Mux
  page found on 2026-11-19 said whether Mux signs a BAA. **Ask Mux before the first real family**,
  with the other BAAs (Compliance, in `docs/backlog.md`).
- Pre-launch, test data only, so this does not block building.

## What gets built

**Backend**
- `videos`: title, description, audience (`clinician` / `family` / `both`), Mux asset and playback
  ids, status (`uploading` / `ready` / `failed`), length, order, published or not.
- `video_shares`: one row per video, patient and recipient (`child` or `parent`): who shared it,
  when, and when it was watched (empty until then). Sharing with both makes two rows.
- **Upload:** the admin page asks our backend for a one-time Mux upload address, and the browser
  sends the file straight to Mux. Big files never pass through Railway.
- **Mux tells us when a video is ready** (a webhook, checked with Mux's signature), and we save its
  playback id and length.
- **Routes**, each behind the existing role checks:
  - admin: create (upload address), edit, publish, delete;
  - clinician: list videos; a pass for one; share with a patient; list a patient's shares;
  - child and parent: list what was shared with them; a pass for one of those; mark watched.
- **"Watched"** is set when the player reaches the end, or 90% of the way.

**Apps**
- **Admin:** a Videos page — upload, title, audience, publish, order.
- **Clinician:** a Videos section in the Library, with full-screen play for sessions. On the
  patient page, a way to share and the list of what was shared and watched (where exactly: question
  below).
- **Child and parent apps:** a Videos list on the home screen, newest first, with a mark on ones
  not watched yet. Tapping one plays it full screen.
- **Player:** Mux's own web player.

**Secrets** (Peter sets them in Railway; never in the repo): Mux API token, signing key, webhook
secret. For building and testing on the Mac mini, a separate Mux **development** environment's keys,
so the mini never holds the production ones.

## In stages

1. **Upload, and play in the Library for clinicians.** Test with Peter's draft videos.
2. **Share with a family, watch in the child and parent apps, and "watched" on the patient page.**
3. **Later, not planned yet:** a video linked from a guide goal (for example "Teach the Worry Hill"),
   a notice to the family when something is shared, and the question from the old backlog item of
   whether a child should watch a video right before an exposure.

**Gate:** `/security-review` on stages 1 and 2 (new access paths for all three roles).

## Open questions for Peter

1. **Where on the patient page** are videos shared from and listed? Suggestion: a **Videos** tab,
   after Case Summary.
2. **The Mux account:** Peter creates it (production and development environments) and puts the
   production keys in Railway. Development keys come to the mini as environment variables, the way
   `ANTHROPIC_API_KEY` does.
3. **Product videos** (how to use Float): for clinicians only, or for families too? The audience
   setting covers either; this is about what to upload first.
