# Float

## Product Brief

**Internal Working Document  —  Dr. Bridget Walker & Pete O'Dea  —  April 2026**

---

## 1. The Problem

Anxiety disorders are the most common mental health problem in children and adolescents — affecting as many as one in three teens. CBT is the gold standard treatment, and its central component is structured, graduated exposure work. But the specific exposure-based model that actually produces results is practiced by only a small number of specialists nationwide.

Most practitioners — school social workers, school psychologists, community therapists — either lack proper training in exposure-based CBT or are using approaches that feel therapeutic but have significantly weaker outcomes. Many practitioners who believe they are delivering CBT are not using the exposure-based model that works. Others know the gap exists and refer to specialists, but availability is severely limited.

The result is a large and growing population of anxious children and teens who are not getting the treatment that would help them. This is not primarily a supply problem — it is a knowledge and method problem.

Parents are a critical and underutilized part of the treatment picture. Research shows that family accommodation — parental and sibling behaviors that reduce a child's distress — actively maintains and worsens anxiety over time. This is nearly universal: 95–100% of parents of anxious youth engage in accommodation behaviors regularly, often daily. Most parents don't know this, and most treatment models don't address it systematically.

---

## 2. The Solution

Float is a practitioner-led clinical platform that puts Dr. Walker's proven CBT model in the hands of every school social worker and community therapist treating anxious children and teens.

The platform does not replace the practitioner. It equips them — giving them the structure, tools, and between-session infrastructure to deliver outcomes that currently require specialist expertise. Dr. Walker's clinical model is encoded into the platform's logic, guiding practitioners through every phase from initial referral to treatment completion.

Float connects three participants in the treatment: the practitioner, the parent, and the child or teen. The practitioner configures and monitors treatment. The parent is an active therapeutic agent with their own tools and behavioral targets. The child does the between-session therapeutic work using the platform. Float is the connective tissue between all three.

---

## 3. The Clinical Foundation

Float is built on Dr. Bridget Walker's CBT program for anxiety and related disorders in children, adolescents, and young adults, developed and refined through over 25 years of clinical practice. The model is documented in three published books:

- **Anxiety Relief for Kids, 2nd Edition** (New Harbinger, 2026)
- **Social Anxiety Relief for Teens** (New Harbinger, 2021)
- **Anxiety Relief for Kids** (New Harbinger, 2017)

The model centers on a structured process applied across anxiety disorder presentations. The core clinical sequence for each trigger situation is:

1. Build a trigger situations list with Distress Thermometer (DT) ratings for each situation
2. Select the situation with the lowest DT rating that occurs frequently
3. Identify the avoidance and safety behaviors the child relies on in that situation
4. Assess the child's DT for being in the trigger situation while refraining from each behavior — each of these ratings becomes a rung on the exposure ladder
5. Use the Downward Arrow technique on each rung to identify the child's feared outcome
6. Arrange the rungs from lowest to highest DT — the resulting Exposure Ladder guides the exposure sequence
7. Begin exposures at the bottom rung (lowest DT), climbing each rung until mastery, then moving to the next
8. Once a ladder is complete, move to the next trigger situation and repeat

**Belief in Prediction (BIP)** is derived from the Downward Arrow: after identifying the child's most feared outcome, ask how strongly they believe that outcome will occur (0–100%).

**OCD/ERP** follows the same workflow with Exposure and Response Prevention substituted for standard exposure. Included in scope — no separate workflow required at this stage.

---

## 4. Dr. Walker's Clinical Workflow

This section documents Dr. Walker's actual practice workflow that Float must support. This is the reference implementation — the workflow other clinicians will follow.

### Phase 0 — Referral and intake

A child or teen is referred to Dr. Walker. An email address is acquired. Float records the referral and the patient enters `referred` status.

### Phase 1 — Pre-consultation monitoring

Dr. Walker sends a monitoring form to the parent. Float generates the email with a link to the form, or Dr. Walker can copy the link and send it herself. The parent monitors their child's anxiety for one week and submits the completed form in Float.

The monitoring form captures: trigger situations observed, behaviors noticed, distress levels, context. These become the raw material for the first consultation.

Float generates a **pre-consultation report** from the monitoring form data for Dr. Walker to reference in the first meeting.

### Phase 2 — Consultation 1 (parents only)

A one-hour consultation with both parents if possible. The child is not present.

In this meeting Dr. Walker:
- Reviews the monitoring form report
- Assesses the type of anxiety presentation
- Educates parents about CBT — including the parental accommodation role and the Nickname concept
- Captures in-session notes (free text, practitioner-only)
- Takes no platform actions — this is an assessment and education session

At the end of this session, Dr. Walker sends follow-up educational content to the parents.

### Phase 3 — Parent decision to proceed

The parent reconnects with Dr. Walker and confirms they want to move forward. This triggers scheduling of the follow-up meeting with the child.

### Phase 4 — Consultation 2 (child/teen + parents)

A follow-up meeting with the child or teen and parents present (age-dependent).

In this meeting Dr. Walker:
- Reviews educational content with the child using examples from the monitoring form and prior notes
- Introduces and explains the Distress Thermometer and other key concepts
- Discusses the Rewards system with parents
- Creates a **Nickname** for the anxiety with the child
- Captures in-session notes

The only action item from this session: the child starts using the Nickname.

### Phase 5 — Consultation 3 (first clinical work)

The session focused on what to work on. This is where clinical configuration begins.

In this meeting Dr. Walker:
- Reviews monitoring form data and additional parent input
- Uses examples to explain how the exposure process works
- Records trigger situations with DT ratings
- Selects the lowest DT situation that occurs frequently
- For that situation, identifies avoidance and safety behaviors
- Records DT ratings for refraining from each behavior
- Picks one S&A behavior with the lowest DT
- Plans the first exposure (confidence level, BIP, scheduling)
- Generates an **action plan for the child/teen**
- Generates an **action plan for the parent**

The exposure ladder for one situation is built in this session. Additional situations may be added. Additional ladders may be built over subsequent sessions.

### Phase 6 — Active treatment (between-session exposure work)

The child works through the treatment plan between sessions. The exposure workflow:

1. **Define** — exposure defined with the clinician in session
2. **Commit** — child explicitly commits to doing the exposure (not just scheduled — committed)
3. **Schedule** — practitioner reviews proposed times; specific times and days, not vague intentions
4. **Adjust** — if the child finds it too hard, there is an adjust flow to make it more manageable before attempting
5. **Record** — child records results after the exposure
6. **Accountability** — did they do it or not; practitioner notified either way

Message flow: practitioner can message the child to ask how they can make it more manageable.

### Phase 7 — Weekly sessions

Typically weekly from the first exposure onward. Each session reviews experiment results, updates the plan, and prepares the next exposure. The pre-session brief surfaces what happened since last time.

---

## 5. The Clinical Toolkit

All tools are accessible to practitioners, parents, and children/teens. None are practitioner-only. Practice exercises available for each user type.

### Psychoeducation tools
- **Distress Thermometer (DT)** — 0–10 scale. Preferred over SUDS because it captures discomfort and dislike, not just fear.
- **Worry Hill** — habituation curve; explains why staying in a situation reduces distress over time
- **Candy Jar** — metaphor for building new non-threatening memories through exposures
- **Nickname the Fear** — child labels their anxiety to maintain objectivity

### Cognitive tools
- **Downward Arrow** — structured drill-down to surface the root feared outcome per rung. Therapeutic value on its own. Psychoeducation module required for all users.
- **Mottoes** — cognitive correction phrases used between sessions
- **Thought Bubbles** — visual tool for identifying thinking errors
- **Guided Discovery** — structured questioning for parents and practitioners

### Assessment and monitoring tools
- **Monitoring form** — sent to parents pre-consultation via Float-generated email link. Parent logs daily observations over one week or more as individual entries. Each entry captures: date, situation (trigger context), what the parent observed about the child, how the parent responded, and the parent's Fear Thermometer estimate (1–10) of the child's distress. The "how I responded" field is the primary source of accommodation behavior data. Parent-estimated distress, not child-reported. Feeds the pre-consultation report.
- **Trigger Situation List** — all situations rated with DT
- **Parent Monitoring Worksheet** — ongoing observation during treatment
- **Child Monitoring Worksheet** — self-monitoring for older children and teens

### Exposure planning and execution tools
- **Avoidance and Safety Behaviors Worksheet** — inventory of behaviors per trigger situation with DT ratings for refraining
- **Exposure Ladder** — rungs arranged from lowest to highest DT
- **BIP** — 0–100% belief in feared outcome, derived from Downward Arrow
- **Before Exposure Worksheet** — plan, prediction, BIP, expected DT, tempting behaviors, confidence level
- **After Exposure Worksheet** — did the feared outcome occur, actual DT, what learned, updated BIP
- **Action Plan** — practitioner-authored session document, one per session, numbered sequentially (#1, #2, #3...). Written directly to the patient in plain language with the anxiety nickname woven throughout. Contains specific exposures to attempt, behaviors to resist, coping tools, cognitive strategies, and (for younger children) parent instructions embedded inline. Not auto-generated — authored by the practitioner in session and published to the patient when ready. Each plan builds on the previous session's plan.
- **Action Plan (parent view)** — for younger children, parent instructions from the action plan are surfaced in the parent view. For teens and young adults, the plan is addressed primarily to the patient.
- **Commit action** — explicit patient commitment to attempt the exposure
- **Adjust flow** — if too hard: lower the difficulty before attempting, with practitioner message support

### Parent tools
- **Accommodation Behaviors Worksheet** — identifies parental and sibling accommodation behaviors with DT ratings
- **Accommodation Ladder** — gradual reduction plan arranged lowest to highest DT
- **Parent Module sequence**: monitor → gradual reduction plan → non-accommodating responses → accept child's anxiety → express confidence child can cope

### Motivation tools
- **Rewards system** — structured incentive planning; discussed with parents in consultation 2
- **Hassles list** — how does anxiety get in the way of what you want to do

### Session management tools
- **Session notes** — free text, practitioner-only, attached to each session; referenced in subsequent sessions
- **Pre-consultation report** — generated from the parent monitoring worksheet data; surfaces highest DT situations, most frequent situations, and most common parent responses (early signal of accommodation patterns). Used by Dr. Walker as reference material in consultation 1.
- **Pre-session brief** — BIP trend, DT trend, experiment results, open flags, recommended focus

### OCD/ERP tools
Same workflow as exposure, with ERP substituted. Included in scope — no separate flow required at this stage.

---

## 6. Patient Status Model

```
referred
  → monitoring (monitoring form sent, awaiting parent submission)
  → consulting (consultation 1 complete, education sent)
  → deciding (parent considering whether to proceed)
  → setup (consultation 3 begun, treatment plan being configured)
  → active (first exposure committed, between-session work underway)
  → maintenance
  → complete
```

---

## 7. Platform Structure

### Practitioner experience
- Caseload view with status indicators and alerts
- Patient view with pre-session brief, session notes, monitoring form data
- Configuration: trigger situations, behaviors, Downward Arrow, ladder builder, ladder review
- Monitoring form generation and delivery
- Action plan generation (child + parent)
- Messaging

### Parent experience
- Monitoring form (pre-consultation)
- Psychoeducation content
- Accommodation module
- Child plan visibility (configurable)
- Notifications and messaging

### Child / teen experience
- Psychoeducation content
- My plan and current ladder
- Experiment flow: commit → schedule → attempt → record
- Adjust flow if too hard
- Messaging with practitioner

### Educational content
Three streams: practitioner training, parent psychoeducation, child/teen psychoeducation. Exercises and quizzes for practitioners. Format and sequencing to be defined with Dr. Walker.

---

## 8. Scope

**Initial focus:** Social anxiety, following Dr. Walker's workflow exactly.

**OCD/ERP:** Same workflow, included in scope. No separate implementation required at this stage.

**Young adults:** Same patient experience as teens.

**Action plan format:** Template to be defined once Dr. Walker provides examples.

**Monitoring form:** Form design to be confirmed once Dr. Walker provides the form.

---

## 9. Open Questions

- Monitoring form — awaiting Dr. Walker's form to finalize field structure
- Action plan format — awaiting examples from Dr. Walker
- Minimum age for independent mobile use vs. parent-mediated
- Parent visibility level definitions — exact scope of full/summary/minimal
- Downward Arrow psychoeducation module format and sequencing
- Practitioner training content scope beyond Downward Arrow
- Rewards system — how configured, by whom, at what stage
- Check-in frequency configuration options
- Hassles list — timing and workflow

---

## 10. Next Steps

- Dr. Walker provides monitoring form → finalize field structure
- Dr. Walker provides action plan examples → finalize template
- Dr. Walker reviews platform workflow diagram and confirms clinical sequence
- Dr. Walker reviews web dashboard and provides feedback
- Continue platform build based on aligned workflow

---

*Float — Internal Working Document — v0.6 — April 2026*
