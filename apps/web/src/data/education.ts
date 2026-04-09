export interface QuizQuestion {
  id: string
  question: string
  options: string[]
  correctIndex: number
  explanation: string
}

export interface Exercise {
  id: string
  title: string
  vignette: string
  tasks: string[]
  modelAnswer: string
}

export interface EducationModule {
  id: string
  number: number
  title: string
  estimatedMinutes: number
  description: string
  sections: {
    heading: string
    content: string
  }[]
  quiz?: QuizQuestion[]
  exercise?: Exercise
}

export const clinicianModules: EducationModule[] = [
  {
    id: 'understanding-anxiety',
    number: 1,
    title: 'Understanding Anxiety',
    estimatedMinutes: 10,
    description: 'The anxiety cycle, avoidance as maintenance, and why exposure works.',
    sections: [
      {
        heading: 'Why anxiety exists',
        content: `Anxiety is not a disorder — it is a normal, adaptive human response. The anxiety system exists to protect us. When the brain detects a threat, it triggers a cascade of physical and psychological responses that prepare us to fight, flee, or freeze.

The problem is that in anxious children and teens, this threat-detection system is miscalibrated. It fires in response to situations that are not genuinely dangerous — social situations, school, food, illness, uncertainty. The child experiences real physiological arousal (racing heart, stomach upset, difficulty breathing, muscle tension) in response to a perceived threat that an outside observer would not consider dangerous.

This is not weakness, manipulation, or attention-seeking. The child is genuinely distressed. Their brain is telling them they are in danger. Your job — and Float's job — is to help them recalibrate that system.`
      },
      {
        heading: 'The anxiety cycle',
        content: `Understanding the anxiety cycle is the foundation of everything you will do with Float.

The cycle has four stages:

1. **Trigger** — a situation, thought, sensation, or object activates the anxiety system. For a socially anxious teen, this might be being called on in class. For a child with contamination fears, it might be touching a doorknob.

2. **Anxiety response** — the child experiences distress: racing heart, stomach upset, catastrophic thinking ("everyone will laugh at me," "I will get sick and die"). The brain is screaming danger.

3. **Avoidance or safety behavior** — the child escapes, avoids, or uses a behavior that reduces the distress in the short term. They stay home from school. They wash their hands. A parent provides reassurance. The distress drops.

4. **Reinforcement** — because avoidance worked (the distress dropped), the brain learns: avoidance = safety. The next time the trigger appears, the anxiety fires faster and stronger. The avoided situations expand. The safety behaviors multiply.

This is the core mechanism of anxiety maintenance. **Avoidance is not the solution — it is the problem.** Every time a child avoids, the anxiety gets stronger.`
      },
      {
        heading: 'The habituation curve — Worry Hill',
        content: `Anxiety cannot stay at peak intensity indefinitely. Left alone — without avoidance, without escape — anxiety will rise, peak, and then fall on its own. This is habituation.

The Worry Hill is a visual representation of this curve. Show it to every child, every parent, every clinician you work with. It explains why exposure works:

- If the child stays in the situation (does not avoid), anxiety peaks and then comes down
- If the child escapes, they never learn that anxiety comes down on its own
- Each time the child stays on the hill, the peak gets lower and the descent gets faster

The therapeutic goal is not to eliminate anxiety — it is to teach the child that they can tolerate anxiety, that it will pass, and that the feared outcome usually does not occur.`
      },
      {
        heading: 'Key takeaway',
        content: `Anxiety is maintained by avoidance. Treatment works by systematically, gradually reducing avoidance — exposing the child to feared situations while preventing escape and safety behaviors. The child learns through direct experience that the feared outcome does not occur, that anxiety peaks and passes, and that they are capable of coping.`
      }
    ],
    quiz: [
      {
        id: 'm1q1',
        question: 'What is the primary mechanism that maintains and worsens anxiety over time?',
        options: ['Genetic predisposition', 'Avoidance of feared situations', 'Parental overprotection', 'Traumatic experiences'],
        correctIndex: 1,
        explanation: 'Avoidance prevents the child from learning that anxiety will pass on its own and that the feared outcome does not occur. Each avoidance reinforces the anxiety cycle.'
      },
      {
        id: 'm1q2',
        question: 'According to the habituation curve, what happens to anxiety if a child stays in a feared situation without escaping?',
        options: ['It stays at peak intensity', 'It continues to increase', 'It rises, peaks, and then falls on its own', 'It immediately decreases'],
        correctIndex: 2,
        explanation: 'The Worry Hill shows that anxiety cannot stay at peak intensity indefinitely. If the child stays in the situation, anxiety will peak and naturally come down — this is habituation.'
      },
      {
        id: 'm1q3',
        question: 'A child with social anxiety refuses to answer questions in class. Each time they avoid, what happens to the anxiety?',
        options: ['It gradually decreases over time', 'It stays the same', 'It gets stronger and fires faster next time', 'It becomes less specific'],
        correctIndex: 2,
        explanation: 'Avoidance reinforces the anxiety cycle. The brain learns that avoidance = safety, so the next time the trigger appears, the anxiety fires faster and stronger.'
      },
      {
        id: 'm1q4',
        question: 'Which of the following is NOT an avoidance behavior?',
        options: ['Staying home from school on presentation day', 'Sitting at the back of the cafeteria to avoid being noticed', 'Practicing a feared situation repeatedly with increasing difficulty', 'Asking a parent to call the school to explain an absence'],
        correctIndex: 2,
        explanation: 'Practicing a feared situation with increasing difficulty is graduated exposure — the opposite of avoidance. The other options are all forms of avoidance or safety behavior.'
      },
      {
        id: 'm1q5',
        question: 'The Worry Hill is used to explain:',
        options: ['Why children should avoid situations that make them anxious', 'Why anxiety will peak and fall if the child stays in the situation', 'How to rate distress on a 1-10 scale', 'The role of genetics in anxiety disorders'],
        correctIndex: 1,
        explanation: 'The Worry Hill visually demonstrates habituation — that anxiety rises, peaks, and falls on its own if the child stays in the situation without escaping.'
      }
    ]
  },
  {
    id: 'family-accommodation',
    number: 2,
    title: 'Family Accommodation',
    estimatedMinutes: 10,
    description: 'How well-meaning parent behaviors maintain anxiety, and how to address them.',
    sections: [
      {
        heading: 'What accommodation is',
        content: `Family accommodation refers to any behavior by a parent, sibling, or other family member that is intended to reduce a child's anxiety or prevent distress. It is extraordinarily common — research shows that 95-100% of parents of anxious children engage in accommodation behaviors regularly, often daily.

Accommodation takes many forms:

**Facilitated avoidance** — the parent helps the child avoid the feared situation. Calling the school to excuse an absence. Driving a different route to avoid a feared location. Canceling social plans because the child is anxious.

**Providing reassurance** — answering the child's anxious questions repeatedly. "Are you sure nobody is sick at school?" "I promise you won't throw up." Reassurance reduces anxiety briefly but increases it over time because it teaches the child that they cannot tolerate uncertainty without external help.

**Modifying family routines** — the family stops eating certain foods because of the child's contamination fears. Siblings are asked not to mention illness. Dinner conversation is restricted to avoid anxiety triggers.

**Participating in rituals** — for OCD presentations, a parent may check locks with the child, repeat phrases until they "feel right," or perform reassurance rituals that the child demands.

**Sibling accommodation** — a sibling sleeps in the same room, provides reassurance, accompanies the child to feared situations, or modifies their own behavior to prevent the anxious child's distress.`
      },
      {
        heading: 'Why accommodation maintains anxiety',
        content: `Accommodation feels kind. Every parent who accommodates is doing so out of love and a genuine desire to relieve their child's suffering. This is important to understand and to communicate — accommodation is not bad parenting. It is a natural response to a child in distress.

But accommodation has the same effect as avoidance. It:
- Prevents the child from learning that they can tolerate anxiety
- Prevents the child from learning that the feared outcome does not occur
- Signals to the child (and their brain) that the situation is genuinely dangerous — if it weren't, why would the parent be protecting them?
- Increases the child's reliance on external regulation, reducing their capacity to self-regulate

The reduction in accommodation is not a separate treatment — it is part of the exposure work. As the child climbs the exposure ladder, the parent simultaneously climbs their own accommodation ladder, gradually withdrawing the behaviors that have been maintaining the anxiety.`
      },
      {
        heading: 'How to introduce this to parents',
        content: `This conversation requires care. Parents often feel blamed when accommodation is raised. Frame it clearly:

- "What you have been doing makes complete sense. Any loving parent would do the same."
- "Accommodation is not causing the anxiety. The anxiety was there first, and accommodation is your natural response to it."
- "We now know that gradually reducing accommodation is one of the most important things you can do to help your child recover."
- "This doesn't mean suddenly stopping everything. We will build a gradual plan, just like we build a gradual plan for your child."`
      },
      {
        heading: 'The accommodation ladder',
        content: `The parent module in Float is built on the same ladder principle as the exposure ladder. Each accommodation behavior is given a DT rating — the child's estimated distress if the parent stopped doing it. The behaviors are arranged from lowest to highest distress and reduced gradually, starting at the bottom.

This approach accomplishes two things:
1. It makes accommodation reduction manageable and predictable for both parent and child
2. It ensures the reduction is gradual enough that the child can tolerate it`
      },
      {
        heading: 'Key takeaway',
        content: `Family accommodation is nearly universal and well-intentioned. It maintains anxiety by preventing the child from learning to tolerate distress. Addressing accommodation is not optional — it is a central component of treatment. Float's parent module provides the structure to do this systematically.`
      }
    ],
    quiz: [
      {
        id: 'm2q1',
        question: 'Approximately what percentage of parents of anxious children engage in accommodation behaviors?',
        options: ['30-40%', '50-60%', '70-80%', '95-100%'],
        correctIndex: 3,
        explanation: 'Research shows that 95-100% of parents of anxious children engage in accommodation behaviors regularly, often daily. It is nearly universal.'
      },
      {
        id: 'm2q2',
        question: 'A parent repeatedly reassures their child that "nothing bad will happen." Over time, this:',
        options: ['Reduces anxiety permanently', 'Has no effect on anxiety', 'Increases anxiety because the child cannot tolerate uncertainty without help', 'Only affects OCD presentations'],
        correctIndex: 2,
        explanation: 'Reassurance reduces anxiety briefly but increases it over time because it teaches the child that they cannot tolerate uncertainty without external help.'
      },
      {
        id: 'm2q3',
        question: 'When introducing accommodation reduction to parents, the most important framing is:',
        options: ['"You have been making your child\'s anxiety worse"', '"What you have been doing makes sense, and we now know gradual reduction helps"', '"You need to stop all accommodation immediately"', '"Accommodation only matters for severe cases"'],
        correctIndex: 1,
        explanation: 'Parents often feel blamed when accommodation is raised. Frame it as a natural response that can be gradually adjusted, not as a mistake.'
      },
      {
        id: 'm2q4',
        question: 'The accommodation ladder is:',
        options: ['A list of all the child\'s feared situations', 'A list of parent behaviors arranged from lowest to highest child distress for refraining', 'A checklist of parenting skills to develop', 'A rating of how accommodating the parent is overall'],
        correctIndex: 1,
        explanation: 'Like the exposure ladder, the accommodation ladder arranges behaviors by DT for refraining, starting reduction with the easiest behaviors first.'
      },
      {
        id: 'm2q5',
        question: 'Sibling accommodation:',
        options: ['Is rare and usually not clinically significant', 'Does not affect treatment outcomes', 'Is common and should be addressed as part of the family accommodation work', 'Only occurs in families with multiple anxious children'],
        correctIndex: 2,
        explanation: 'Sibling accommodation is common — siblings may sleep in the same room, provide reassurance, or modify their behavior. It should be identified and addressed.'
      }
    ]
  },
  {
    id: 'assessment-tools',
    number: 3,
    title: 'Assessment Tools',
    estimatedMinutes: 15,
    description: 'The Distress Thermometer, trigger situations, avoidance behaviors, and DT for refraining.',
    sections: [
      {
        heading: 'The Distress Thermometer',
        content: `The Distress Thermometer (DT) is the primary assessment tool in Float. It is a 0-10 scale on which the child rates their level of distress, discomfort, anxiety, or unease in a given situation or when contemplating a given action.

**Why DT, not SUDS?**

SUDS (Subjective Units of Distress Scale) is the traditional clinical measure. Float uses Distress Thermometer for an important reason: some anxious children do not present with overt fear. They present with discomfort, dislike, avoidance of things that feel "wrong," or physical sensations (stomach aches, nausea) without being able to label the experience as fear or anxiety. DT captures this broader range of experience.

When introducing the DT to a child:
- "Zero means you feel completely calm and relaxed — like you're watching your favorite show"
- "Ten means the worst distress you can imagine — like an emergency"
- "We're going to use this scale a lot. It helps us understand how hard different things are for you and track how things change over time"

For younger children, consider using a visual thermometer or a faces scale alongside the numbers.`
      },
      {
        heading: 'Building the trigger situation list',
        content: `The first clinical task in Float is building a comprehensive list of situations that trigger anxiety in the child. This list becomes the foundation for treatment planning.

**How to gather the information:**
- Start with the parent's monitoring worksheet — they have been observing their child for a week before consultation 1
- Ask the parent directly: "What situations consistently cause distress for your child?"
- Ask the child (if present and age-appropriate): "What things do you try to avoid? What makes you feel that uncomfortable feeling?"
- Consider all domains: school, social, home, health, sleep, food, transportation, public places

**Assigning DT ratings:**
For each situation on the list, ask the child to rate their DT: "If you were in this situation right now, what would your DT be?"

Note that DT ratings are the child's subjective experience — there are no right or wrong answers. Two children with the same diagnosis may have very different DT ratings for the same situation.

**Selecting the starting situation:**
The first exposure ladder is built around the situation that:
1. Has the **lowest DT rating** on the list
2. **Occurs frequently** in the child's life — a rare situation cannot be practiced regularly enough

This combination — low distress and frequent opportunity — maximizes early success and builds confidence for harder work ahead.`
      },
      {
        heading: 'Identifying avoidance and safety behaviors',
        content: `For the selected trigger situation, the next task is identifying every avoidance behavior and safety behavior the child uses in that situation.

**Avoidance behaviors** — things the child does to escape or avoid the situation entirely:
- Refusing to go to school
- Leaving the cafeteria early
- Asking to be excused from presentations
- Not answering the phone

**Safety behaviors** — things the child does while in the situation to reduce anxiety without fully confronting it:
- Sitting at the end of the table away from others
- Wearing headphones
- Keeping eyes down
- Texting a parent for reassurance
- Carrying medication "just in case" (when not medically necessary)

Safety behaviors are more subtle than avoidance but equally important. They prevent the child from learning that they can tolerate the full situation.`
      },
      {
        heading: 'DT for refraining',
        content: `For each avoidance or safety behavior, ask the child: "What would your DT be if you were in the trigger situation but did NOT do this behavior?"

This rating — the DT for refraining from the behavior — becomes the distress rating for that rung on the exposure ladder.

For example:
- Trigger: Eating in the cafeteria
- Behavior: Sitting alone at the end of the table
- DT for refraining (sitting near other students): 6

This tells you exactly how hard it will be for the child to give up that behavior, and where it belongs on the ladder.`
      }
    ],
    exercise: {
      id: 'ex3',
      title: 'Build a Trigger List',
      vignette: `Maya is a 14-year-old who has been avoiding school increasingly over the past year. Her parents report that she often complains of stomach aches in the morning. She has a small friend group but has stopped accepting social invitations. She spends most of her time at home. When she does attend school, she eats lunch alone or not at all.

Her parent's monitoring worksheet noted the following situations:
- Monday: Maya refused to go to school. Said she felt sick. Parents let her stay home. DT estimated 9.
- Tuesday: Maya attended school but came home immediately after last period without attending an after-school club she had previously joined. DT estimated 7.
- Wednesday: Lunch — Maya sat in the library alone rather than the cafeteria. DT estimated 6.
- Thursday: A classmate texted asking if she wanted to hang out. Maya didn't respond. Parent noticed she seemed anxious reading the text. DT estimated 8.
- Friday: Class presentation. Maya was excused at her request. DT estimated 10.`,
      tasks: [
        'List at least 4 trigger situations for Maya based on the monitoring data',
        'Assign a DT rating to each situation',
        'Identify which situation you would select as the starting point and explain why',
        'For that situation, list at least 2 avoidance or safety behaviors Maya might be using'
      ],
      modelAnswer: `**Trigger situations:**
1. Eating in the cafeteria (DT 6) — avoids by eating in the library alone
2. Attending after-school clubs (DT 7) — avoids by leaving immediately after last period
3. Responding to social invitations (DT 8) — avoids by not responding to texts
4. Attending school at all (DT 9) — avoids by staying home citing illness
5. Class presentations (DT 10) — avoids by requesting to be excused

**Starting situation:** Eating in the cafeteria (DT 6)
This has the lowest DT and occurs daily, making it ideal for frequent practice and early success.

**Avoidance/safety behaviors for cafeteria:**
- Eating in the library instead of the cafeteria (avoidance)
- Sitting alone at an empty table (safety behavior)
- Wearing headphones to signal unavailability (safety behavior)
- Skipping lunch entirely (avoidance)
- Texting parent during lunch for reassurance (safety behavior)`
    }
  },
  {
    id: 'downward-arrow',
    number: 4,
    title: 'The Downward Arrow',
    estimatedMinutes: 15,
    description: 'Identifying core feared outcomes, BIP measurement, and therapeutic value.',
    sections: [
      {
        heading: 'What the Downward Arrow is',
        content: `The Downward Arrow is a structured facilitation technique used to identify the child's most feared outcome — the core belief driving their anxiety. It is one of the most important tools in the model.

Many anxious children (and adults) cannot initially articulate what they are actually afraid of. They know the situation makes them anxious, but they describe it in surface terms: "I just don't want to go," "It feels wrong," "I might feel sick." The Downward Arrow drills below the surface to find the specific feared consequence.

**Why this matters:**
The feared outcome identified through the Downward Arrow becomes:
1. The **prediction** the child tests in each exposure
2. The basis for the **BIP (Belief in Prediction)** rating
3. The measure of therapeutic progress — as the feared outcome consistently fails to occur, BIP decreases

Without a clear feared outcome, exposures lack a specific hypothesis to test. The child may complete the exposure but not learn anything because they weren't tracking whether a specific prediction came true.`
      },
      {
        heading: 'How to facilitate it',
        content: `The Downward Arrow is a series of questions, each drilling deeper into the feared consequence. The structure is:

> "If [surface fear] happened, what would that mean? What would happen next? And then what? What would that mean for you?"

Continue until you reach an outcome that is:
- **Core** — it cannot be drilled further without reaching existential territory
- **Observable** — it is something that could in principle be confirmed or disconfirmed by observation
- **Catastrophic in the child's mind** — it represents what they most fear

Common core feared outcomes include:
- "I will be completely alone and have no friends"
- "Everyone will think I'm weird and reject me"
- "I will get sick and die"
- "I will fail and never succeed at anything"
- "I will lose control completely"
- "My parents will be disappointed in me forever"

**The practitioner must approve the feared outcome.** Before recording it in Float, confirm that you have drilled down far enough. A surface outcome like "kids will stare at me" is not drilled far enough. An outcome like "I will be permanently rejected and never have friends" is appropriately drilled.`
      },
      {
        heading: 'Example facilitation',
        content: `Child: Maya (social anxiety, eating in the cafeteria)

> **Clinician:** "If you sat near other students in the cafeteria, what are you afraid would happen?"
> **Maya:** "They'd stare at me"
> **Clinician:** "And if they stared at you, what would that mean? What would happen?"
> **Maya:** "They'd think I'm weird"
> **Clinician:** "And if they thought you were weird, what then?"
> **Maya:** "They'd tell everyone. The whole school would know"
> **Clinician:** "And then what? What would happen if the whole school thought you were weird?"
> **Maya:** "No one would want to be around me. I'd have no friends"
> **Clinician:** "And what would that mean for you — to have no friends?"
> **Maya:** "I'd be completely alone. Like, forever. I'd never have anyone"

**Feared outcome:** "I will be completely alone and have no friends — ever"

This is an appropriate feared outcome. It is core, catastrophic, and specific enough to test.`
      },
      {
        heading: 'BIP — Belief in Prediction',
        content: `Once the feared outcome is identified and approved, ask:

> "How strongly do you believe this will happen — that if you sit near students in the cafeteria, you will end up completely alone with no friends ever? If 100% means you're completely certain it will happen, and 0% means you're certain it won't, where are you?"

This is the BIP. It is recorded before each exposure and after each exposure.

**What BIP tells you:**
- A BIP of 80% means the child is nearly certain the feared outcome will occur. This is useful — it sets up a testable hypothesis.
- A BIP of 10% after 5 exposures means the child's belief in the catastrophic outcome has collapsed. This is the therapeutic change you are tracking.
- Persistent high BIP despite repeated non-occurrence of the feared outcome is a clinical signal — the child may be engaging in post-hoc rationalization or the exposure conditions may need adjustment.`
      },
      {
        heading: 'The therapeutic value of the Downward Arrow itself',
        content: `Dr. Walker notes that the Downward Arrow has therapeutic value on its own — independent of the exposures it sets up. When the child articulates and examines their core feared outcome, they engage in a mild form of exposure. They are thinking about the thing they most fear rather than avoiding all thoughts of it. Many children find that hearing their own feared outcome stated clearly reduces its power.

The Downward Arrow also communicates to the child that you understand what is really driving their anxiety — not the surface situation, but the core fear. This is deeply validating.`
      }
    ],
    exercise: {
      id: 'ex4',
      title: 'Facilitate a Downward Arrow',
      vignette: `Jake, age 11, has a strong fear of making mistakes in school. He is academically capable but spends hours on homework, erases constantly, and has meltdowns when he gets answers wrong on tests. His avoidance behavior is refusing to answer questions in class unless he is "100% sure" of the answer.

You are beginning to build his exposure ladder. Before you can assign a BIP, you need to identify the feared outcome for the rung: "Answer a question in class when not 100% sure of the answer."`,
      tasks: [
        'Write at least 4 question-response pairs showing your facilitation of the Downward Arrow with Jake',
        'State the final feared outcome you would record',
        'Estimate Jake\'s BIP for that feared outcome based on the case',
        'Explain why you consider the feared outcome "drilled far enough"'
      ],
      modelAnswer: `**Downward Arrow facilitation:**

> **Clinician:** "If you answered a question in class and got it wrong, what are you afraid would happen?"
> **Jake:** "The other kids would laugh"
> **Clinician:** "And if they laughed, what would that mean? What would happen next?"
> **Jake:** "The teacher would think I'm not smart"
> **Clinician:** "And if the teacher thought you weren't smart, then what?"
> **Jake:** "She'd tell my parents. They'd be really disappointed"
> **Clinician:** "And if your parents were disappointed, what would that mean for you?"
> **Jake:** "They'd realize I'm not good enough. They'd stop believing in me"
> **Clinician:** "And what would that mean — if they stopped believing in you?"
> **Jake:** "I'd be a failure. Like, at everything. Forever"

**Feared outcome:** "I will be a complete failure and my parents will stop believing in me"

**Estimated BIP:** 75% — Jake's behavior (hours on homework, meltdowns) suggests strong conviction.

**Why this is drilled far enough:** The outcome is core (cannot drill further without existential territory), catastrophic in Jake's mind, and specific enough to test — after answering a question wrong, did his parents actually stop believing in him? Observable and disconfirmable.`
    }
  },
  {
    id: 'exposure-ladder',
    number: 5,
    title: 'Building the Exposure Ladder',
    estimatedMinutes: 12,
    description: 'Arranging behaviors into rungs, the AI review, and common construction errors.',
    sections: [
      {
        heading: 'From behaviors to rungs',
        content: `The exposure ladder is built directly from the avoidance and safety behaviors identified for a given trigger situation. Each behavior becomes a rung. The DT rating for refraining from that behavior is the rung's distress rating.

**The ladder is arranged from lowest to highest DT — bottom to top.**

The bottom rung is the easiest (lowest DT). Treatment begins at the bottom. The child works upward, achieving mastery at each rung before moving to the next.

This ordering is not arbitrary. It reflects a fundamental principle of exposure therapy: start where success is most likely, build confidence and self-efficacy, then tackle harder challenges from a position of strength.`
      },
      {
        heading: 'What mastery means',
        content: `A child has achieved mastery at a rung when they can complete the exposure with minimal distress — DT of 2 or below, with BIP significantly reduced. There is no fixed number of repetitions required. Some children achieve mastery in 2-3 exposures. Others need 10 or more.

The signal to move up the ladder is not the passage of time — it is the child's actual experience. BIP decreasing, DT dropping, the child reporting that the situation "doesn't feel as scary anymore."`
      },
      {
        heading: 'The AI ladder review',
        content: `Float's AI review system checks each ladder against clinical parameters before exposures begin. It flags:

- **Starting rung too high** — if the bottom rung has a DT above 4, the ladder may need more rungs below it
- **Gaps between rungs too large** — a jump from DT 3 to DT 8 with nothing in between is too steep
- **Too few rungs** — a ladder with only 1 or 2 rungs lacks gradation
- **Missing Downward Arrow** — each rung should have an associated feared outcome before exposures begin
- **Unresolved flags** — the practitioner must review and address all flags before activating the plan

The AI review is a clinical quality check, not a replacement for clinical judgment. You may override a flag if you have a clinical reason — the system will ask you to document your reasoning.`
      },
      {
        heading: 'Common ladder construction errors',
        content: `**Including the same behavior at multiple rungs without meaningful gradation**
Not helpful: Rung 1: "Sit in cafeteria" / Rung 2: "Sit in cafeteria again"
Helpful: Rung 1: "Sit at end of cafeteria table" / Rung 2: "Sit in the middle of the table" / Rung 3: "Sit near the most social group"

**Starting too high**
If the child's lowest-DT behavior has a refraining DT of 7+, look harder for lower-DT behaviors. There is almost always a smaller step that the child can manage.

**Mixing trigger situations on a single ladder**
Each ladder should address one trigger situation. Behaviors from different situations may look similar but involve different feared outcomes — keep them separate.

**Not enough specificity in behavior descriptions**
"Be more social" is not a behavior. "Initiate a conversation with one classmate at lunch" is a behavior. Specificity matters because it makes the exposure plannable and the outcome measurable.`
      }
    ],
    exercise: {
      id: 'ex5',
      title: 'Build an Exposure Ladder',
      vignette: `Sophie, age 16, has social anxiety centered on being judged negatively by peers. Her trigger situation is "eating lunch in the school cafeteria."

Through assessment, you have identified the following avoidance and safety behaviors with DT ratings for refraining:

| Behavior | DT for refraining |
|---|---|
| Eating in the cafeteria at all (vs. eating alone in the library) | 8 |
| Sitting at a table with other students (vs. an empty table) | 6 |
| Making eye contact with students at the table | 5 |
| Responding when spoken to (vs. looking at phone) | 4 |
| Initiating conversation with a student at the table | 9 |
| Eating without headphones in | 3 |

The Downward Arrow has been completed. Feared outcome: "I will be permanently rejected by everyone and end up completely friendless."`,
      tasks: [
        'Build Sophie\'s exposure ladder — arrange the behaviors from lowest to highest DT',
        'Identify any gaps that concern you and suggest an additional rung to fill them',
        'What would be Sophie\'s first exposure, and what would a well-planned version of it look like?'
      ],
      modelAnswer: `**Sophie's exposure ladder (bottom to top):**
1. Eating without headphones in (DT 3)
2. Responding when spoken to instead of looking at phone (DT 4)
3. Making eye contact with students at the table (DT 5)
4. Sitting at a table with other students instead of an empty table (DT 6)
5. Eating in the cafeteria instead of the library (DT 8)
6. Initiating conversation with a student at the table (DT 9)

**Gap concern:** The jump from DT 6 to DT 8 is significant. Consider adding an intermediate rung such as "Sitting at a table adjacent to other students" (estimated DT 7).

**First exposure (well-planned):**
Sophie will eat lunch in the cafeteria on Tuesday at 12:15pm at her usual table. She will remove her headphones for the entire lunch period (approximately 25 minutes). She will not put them back in even if she feels anxious. Her phone will be in her bag. BIP recorded before. After lunch, she records: did the feared outcome occur, actual DT, updated BIP, what she learned.`
    }
  },
  {
    id: 'planning-exposures',
    number: 6,
    title: 'Planning and Running Exposures',
    estimatedMinutes: 15,
    description: 'Before and after worksheets, scheduling, and knowing when to move up the ladder.',
    sections: [
      {
        heading: 'The before-exposure worksheet',
        content: `Every exposure in Float is planned before it happens. Vague intentions ("I'll try to sit near people this week") do not work. The exposure must be:

- **Specific** — exactly what the child will do, where, and with whom
- **Scheduled** — a specific day and time, not "sometime this week"
- **Reviewed** — the clinician confirms the plan before the child attempts it

The before-exposure worksheet captures:

**Plan description** — what exactly will happen: "On Tuesday at lunch, I will sit at the table by the window where there are already students, not the empty table at the back."

**Prediction** — the child's feared outcome for this specific exposure (from the Downward Arrow)

**BIP** — how strongly the child believes the feared outcome will occur this time (0-100%)

**Expected DT** — what distress level does the child anticipate during the exposure?

**Tempting behaviors** — what safety behaviors might the child be tempted to use? Naming them in advance makes them easier to resist: "I'll want to get out my phone and text my mom."

**Confidence level** — low, medium, or high. Low confidence is worth exploring before the exposure happens.`
      },
      {
        heading: 'Scheduling exposures',
        content: `Exposures must be planned for specific times and days. This is not optional. The research on between-session practice is clear: scheduled, specific exposures are completed far more often than vague intentions.

Dr. Walker's guidance: work with the child to identify 2-3 specific times per day or week when the exposure can happen naturally. Lunch at school happens every day — this is an ideal exposure vehicle. A social event happening on Saturday is a scheduled opportunity.

If a child misses a planned exposure, Float notifies you. Follow up — not to express disappointment, but to problem-solve: "What got in the way? Was it harder than expected? Do we need to adjust?"`
      },
      {
        heading: 'The after-exposure worksheet',
        content: `After each exposure, the child records:

**Did the feared outcome occur?** This is the most important question. It must be answered in observable terms — not "it felt like it was going to happen" but "did X actually happen, yes or no." Anxious children may try to answer this question based on how they felt rather than what actually happened. Redirect to the observable.

**Actual DT** — how high did the distress actually get? Typically lower than predicted. This gap between predicted and actual is itself therapeutic.

**Updated BIP** — how strongly does the child now believe the feared outcome will occur? The goal is to see this number drop over repeated exposures.

**What I learned** — in the child's own words, what did they learn from this exposure? This consolidates the learning and builds the narrative of competence.`
      },
      {
        heading: 'When to move to the next rung',
        content: `Move when:
- DT during the exposure has dropped significantly from the first attempt
- BIP has dropped significantly
- The child says it "doesn't feel that hard anymore"

Do not wait for DT to reach zero. Some residual anxiety is normal and expected. The goal is mastery and habituation, not the complete absence of distress.`
      }
    ],
    exercise: {
      id: 'ex6',
      title: 'Plan an Exposure',
      vignette: `Sophie, age 16 (continued from Module 5), has agreed to attempt the first rung of her ladder: eating without headphones in the cafeteria.

Her feared outcome (from Downward Arrow): "I will be permanently rejected and end up completely friendless."
Her BIP for this exposure: 55%
Her expected DT: 5`,
      tasks: [
        'Write a complete before-exposure plan for Sophie as you would enter it into Float (plan description — specific, scheduled)',
        'What tempting behaviors should you discuss with her in advance?',
        'What will you say to Sophie to prepare her for the distress peak?',
        'After the exposure, Sophie reports: DT reached 4, feared outcome did not occur, BIP is now 30%. What do you say to her? What is your next clinical step?'
      ],
      modelAnswer: `**Before-exposure plan:**
Plan description: "On Tuesday, April 15 at 12:15pm, Sophie will eat lunch in the cafeteria at her usual table. She will put her headphones in her bag before entering and not take them out for the entire lunch period (~25 minutes)."

**Tempting behaviors to discuss:**
- Putting one earbud in "just to have music"
- Keeping headphones around her neck as a comfort object
- Looking at her phone the entire time to avoid engaging
- Leaving early if anxiety peaks

**Preparing for the distress peak:**
"Your anxiety will probably go up when you first sit down without headphones. That's completely expected — remember the Worry Hill? It will rise, peak, and come back down. You don't need to do anything except stay. The hardest part is usually the first 5 minutes."

**After-exposure response:**
"That's incredible work, Sophie. Your BIP went from 55% to 30% — that means your brain is already updating its prediction. The feared outcome didn't happen. Your DT peaked at 4, which is lower than the 5 you expected. What does that tell you?"

Next clinical step: Plan 2-3 more exposures at this rung to solidify mastery, then move to Rung 2 (responding when spoken to).`
    }
  },
  {
    id: 'parent-module',
    number: 7,
    title: 'The Parent Module',
    estimatedMinutes: 15,
    description: 'Five stages of parent work: monitor, plan, practice, accept, express confidence.',
    sections: [
      {
        heading: 'Overview',
        content: `The parent module runs in parallel with the child's exposure work. It has five stages, which are addressed in order:

1. **Monitor** — identify accommodation behaviors systematically
2. **Plan** — develop a gradual reduction plan (the accommodation ladder)
3. **Practice** — generate and rehearse non-accommodating responses
4. **Accept** — develop the ability to accept the child's anxiety without becoming distressed or punitive
5. **Express confidence** — communicate to the child that you believe they can cope`
      },
      {
        heading: 'Stage 1 — Monitoring accommodation',
        content: `Before parents can reduce accommodation, they need to identify it clearly. The monitoring worksheet (completed before consultation 1) is the starting point. But parents often under-report accommodation because it feels so normal and natural.

Use direct questions:
- "When your child is distressed, what do you typically do?"
- "Does your child ask you for reassurance? How often? What do you say?"
- "Have you changed any family routines or habits because of your child's anxiety?"
- "Does your child ever ask you to do something for them that they used to do themselves?"

Build a comprehensive list. Include both active accommodation (providing reassurance, facilitating avoidance) and passive accommodation (not insisting on things the child avoids, allowing rituals).`
      },
      {
        heading: 'Stage 2 — The accommodation ladder',
        content: `For each accommodation behavior, ask the child: "What would your DT be if Mom/Dad stopped doing this?"

Arrange the behaviors from lowest to highest DT — exactly like the exposure ladder. The parent begins reducing at the bottom, working upward in parallel with the child's exposure work.

This synchronization is important. As the child's DT for a situation decreases through exposure, the parent's accommodation reduction for related behaviors becomes more manageable.`
      },
      {
        heading: 'Stage 3 — Non-accommodating responses',
        content: `Parents need specific language to replace accommodating responses. Role-playing is essential — knowing what to say in the abstract is very different from being able to say it calmly when your child is distressed.

**Instead of reassurance:** "I know this feels hard. I believe you can handle it."

**Instead of facilitating avoidance:** "I know you're anxious about this. We've talked about how facing it helps more than avoiding it. I'm not going to help you avoid it, but I'm here."

**When the child escalates:** Stay calm. Do not argue about whether the threat is real. Validate the feeling, not the belief: "I can see you're really distressed right now. That's hard. And I still believe you can get through this."

The key phrase — used consistently — is: **"I know this is hard for you. I believe you can cope."**`
      },
      {
        heading: 'Stage 4 — Accepting the child\'s anxiety',
        content: `Many parents become distressed, frustrated, or angry when their child is anxious. This is understandable but counterproductive. A parent who communicates distress about the child's anxiety signals that the situation is genuinely dangerous.

Parents need to develop the capacity to be a calm, stable presence when their child is distressed. This does not mean being cold or dismissive — it means regulating their own emotional response so they can respond therapeutically rather than reactively.

Practical guidance for parents:
- "Your child's anxiety is not an emergency, even when it feels like one"
- "Your calm is contagious, just as your anxiety is contagious"
- "You do not have to fix this right now. You just have to be present"`
      },
      {
        heading: 'Stage 5 — Expressing confidence',
        content: `The final stage is actively communicating confidence in the child's ability to cope. This is not cheerleading or minimizing — it is a specific, targeted message delivered at moments of distress:

"I know this is hard. I've seen you do hard things before. I believe you can handle this."

Research shows that parental expressed confidence is independently therapeutic. Children internalize their parents' beliefs about their capacity. A parent who consistently communicates "I believe you can cope" is building the child's self-efficacy directly.`
      }
    ],
    exercise: {
      id: 'ex7',
      title: 'Parent Response Practice',
      vignette: `Jamie, age 9, has a fear of contamination. Every morning, he asks his mother to confirm that nothing in his lunch is "contaminated" before he eats. His mother typically spends 5-10 minutes reassuring him, listing each item, confirming it is safe. This has been going on for 8 months.

As part of the parent module, Jamie's mother needs to begin reducing this accommodation. The DT for Jamie if his mother stops the morning reassurance ritual is rated at 6.`,
      tasks: [
        'Write 3 non-accommodating responses his mother could use when Jamie asks for reassurance about his lunch',
        'Anticipate Jamie\'s escalation — what might he do when she doesn\'t reassure him? How should she respond?',
        'What would you say to prepare his mother for the difficulty of this change?',
        'How does this accommodation reduction connect to Jamie\'s exposure ladder work?'
      ],
      modelAnswer: `**Non-accommodating responses:**
1. "I packed your lunch with care, just like always. I know you can handle eating it."
2. "I can see you're worried about your lunch. That's your anxiety talking. I believe you can eat it."
3. "We talked about this with Dr. Walker — I'm not going to go through each item anymore. I know this is hard, and I know you can cope."

**Anticipating escalation:**
Jamie may: refuse to eat, cry, become angry, try to get reassurance from another family member, or have a stomach ache. His mother should stay calm, acknowledge his distress ("I can see this is really hard for you"), but not provide the reassurance. She can say: "I'm here. I love you. And I know you can do this."

**Preparing his mother:**
"This is going to be one of the hardest things you do in this process. Jamie will be distressed, and every instinct will tell you to reassure him. But each time you hold steady, you are teaching him that he can tolerate uncertainty — and that is exactly what he needs to learn. It will get easier."

**Connection to exposure ladder:**
The accommodation reduction mirrors Jamie's exposure work. As Jamie's DT for contamination-related exposures decreases, the morning ritual will become less charged. The parent work and child work reinforce each other — both are building Jamie's capacity to tolerate uncertainty.`
    }
  },
  {
    id: 'using-float',
    number: 8,
    title: 'Using Float',
    estimatedMinutes: 8,
    description: 'The patient lifecycle, key workflows, and getting the most out of the platform.',
    sections: [
      {
        heading: 'The patient lifecycle in Float',
        content: `Every patient in Float moves through a defined sequence of stages:

**Referred** — patient created in Float, referral recorded

**Monitoring** — monitoring form sent to parent, observations collected over ~1 week

**Consulting** — consultation sessions, session notes captured, education sent to parent

**Setup** — treatment plan configured: trigger situations, behaviors, Downward Arrow, exposure ladder

**Active** — exposures underway, between-session data flowing, pre-session briefs available

**Maintenance** — exposure ladder complete, generalization work underway

**Complete** — treatment goals achieved`
      },
      {
        heading: 'Key workflows',
        content: `**Starting a new patient:**
1. Create patient and send monitoring form
2. Review monitoring form report before consultation 1
3. Capture session notes during consultations 1 and 2
4. In consultation 3: add trigger situations, build behavior list, facilitate Downward Arrow, build exposure ladder
5. Run AI ladder review and resolve flags
6. Activate plan — patient receives access to the teen app

**Between sessions:**
- Teen completes exposures via the app
- You receive completion notifications
- Missed exposure notifications prompt follow-up
- Pre-session brief generated before each session

**Session preparation:**
- Open patient and read pre-session brief
- Review BIP and DT trends on progress charts
- Review session notes from previous sessions
- Review action plan from previous session
- Prepare new action plan during/after session`
      },
      {
        heading: 'Support',
        content: `If you encounter a clinical situation that Float doesn't handle well, or you have feedback on the platform, use the feedback button in the bottom right of any page. We read every submission.`
      }
    ]
  }
]
