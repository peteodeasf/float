# Float — Strategy

> Starting draft, assembled from working context. Treat it as a living document —
> correct and extend it; every plan reads this first, so keep it true.

## What Float is

Float is a clinical tool for treating child/adolescent anxiety using evidence-based Cognitive Behavioral Therapy (CBT):
**exposure** (facing feared situations) paired with **reducing parental accommodations** and ensuring the parents support the child's treatment plan. It operationalizes a clinician's treatment model into software the whole family uses during the full treatment journey. It also provides embedded psychoeducation to all users of the system - clinicians, children and parents.

## Who it serves — three experiences

- **Child** — does the work: exposures, in-the-moment support, logging outcomes, tracking
  progress. The experience has to feel safe, supported and low-friction, not clinical or homework-y.
- **Parent** — reduces accommodation and supports the child without taking over; logs
  moments, gets tips.
- **Clinician** (therapist) — designs and supervises treatment: reviews logs, runs
  sessions, manages the plan, supports the family, responds to questions. The source of clinical truth. The clinician may not be an expert in CBT.

These are distinct products sharing a spine, not one UI with role flags. Data separation
between them is a hard boundary (see non-negotiables). Psychoeducation is provided for all users to support their use.

## Operating principles

- **Clinician-led, not algorithm-led.** The software encodes evidence-based CBT. Clinical logic changes require sign-off.
- **Integrated treatment experience.** Float isn't an adjunct that fills the gaps between
  appointments — it's the shared surface where the whole family runs treatment together,
  centered on effectively doing exposures across the full journey (in session and out),
  with timely, in-context support.
- **Low friction for the child.** Adherence dies on friction. Favor fewer steps, plain
  language, and reducing anxiety about using the app itself.
- **Enjoyable and playful.** Exposures are hard and frightening, and people avoid them — so
  the child's app has to make the experience feel fun and a bit like a game, so the child
  *wants* to show up and do the hard thing rather than feeling dragged through homework.
- **Preliminary until validated.** AI-assisted features (e.g. extraction) are editable
  drafts a clinician confirms — never auto-committed clinical decisions.
- **Evidence-based education.** Evidence-based clinical content delivered in an engaging and fun format and at the right time to effectively educate.

## Non-negotiables (also in CLAUDE.md)

1. Clinical logic ships only with clinician sign-off.
2. Parent / child / clinician data separation is a hard security boundary.
3. Data must be managed to meet HIPAA requirements.
4. Local `.env` → production Postgres; Railway auto-migrates on deploy. Migrations and
   pushes are production-affecting.

## Current priorities

<!-- Keep this short and current; detailed status lives in plans and personal memory. -->
- The "experiment flow" - how exposures are set up by the clinician (with child's input) and how the child (in their "app") does the exposures (and records their experience)
- The parent experience / parent "app"
- Monitoring data extraction algorithm
- The basic clinician platform
- Psychoeducation content plan — the evidence-based educational content across the three experiences, and when/how it's delivered

## Explicitly out of scope / deferred

- A DIY / self-guided CBT app experience for children. Float is clinician-led; it is not a
  direct-to-consumer, therapist-free self-help product.
