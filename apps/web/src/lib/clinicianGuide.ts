// The clinician guide: where this patient is in treatment, what to do next, and what to know.
// docs/plans/clinician-guide.md (see "Version 2" for the rules below).
//
// DRAFT CONTENT. The sentences a clinician reads are drafts written from Dr. Walker's notes
// (2026-11-18 and 2026-11-19). Change the words freely; the structure is what the code depends on.
//
// The guide never blocks (Peter, 2026-11-19). A goal Float can see ticks itself; any other goal the
// clinician ticks. The clinician can move on at any time. Goals left behind follow along.
//
// Pure functions of the patient's data, so the guide can be tested without a server.

export type StageId = 'before' | 'parent_meeting' | 'parent_child' | 'child_first' | 'weekly' | 'ending'

export const STAGES: { id: StageId; name: string }[] = [
  { id: 'before', name: 'Before the first meeting' },
  { id: 'parent_meeting', name: 'Parent meeting' },
  { id: 'parent_child', name: 'Parent and child meeting' },
  { id: 'child_first', name: "Child's first session" },
  { id: 'weekly', name: 'Weekly sessions' },
  { id: 'ending', name: 'Ending treatment' },
]

/** The guide's steps in order. The parent meeting has two parts, which may be one sitting or two. */
type Step = 'before' | 'parent_meeting.1' | 'parent_meeting.2' | 'parent_child' | 'child_first' | 'weekly' | 'ending'
const STEPS: Step[] = ['before', 'parent_meeting.1', 'parent_meeting.2', 'parent_child', 'child_first', 'weekly', 'ending']
const stageOfStep = (s: Step): StageId => s.split('.')[0] as StageId
const stepName = (s: Step) => s === 'parent_meeting.1' ? 'Parent meeting, part 1'
  : s === 'parent_meeting.2' ? 'Parent meeting, part 2'
  : STAGES.find(x => x.id === s)!.name
const moveOnLabel = (s: Step) => { const n = stepName(s); return `Move on to ${n.charAt(0).toLowerCase()}${n.slice(1)}` }

/** Where the clinician's ticks are saved: the patient's guide record (`/patients/{id}/guide-ticks`), under these keys. */
export const goalKey = (step: string, goal: string) => `guide:${step}.${goal}`
export const movedOnKey = (step: string) => `guide:moved-on.${step}`

/** What the guide reads about the patient. Everything here is already on the patient page. */
export interface GuideInput {
  childName: string
  phase: string | null
  monitoringSent: boolean
  monitoringEntries: number
  hasCaseSummary: boolean
  /** From the Case Summary. */
  summarySituations: { name: string; fear: number | null }[]
  summaryBehaviors: number
  parentResponses: string[]
  /** Situations on the plan, with the feared outcome from each one's downward arrow and how many
   *  behaviors (in Float, rungs) are written under it. */
  ladderSituations: { name: string; fear: number | null; fearedOutcome: string | null; behaviors: number }[]
  /** Rungs on the ladder, and how many have a Fear Level for doing the situation without the behavior. */
  rungs: number
  rungsRated: number
  nickname: string | null
  /** Exposures set up (any state), and done. */
  exposuresPlanned: number
  exposuresDone: number
  /** Whether any exposure was set up with high confidence. */
  highConfidence: boolean
  /** Accommodations on the parents' plan, and how many the child has rated. */
  accommodations: number
  accommodationsChildRated: number
  /** Monitoring entries by who logged them, for spotting parents who see it differently. */
  entries: { situation: string | null; who: string | null; fear: number | null }[]
  /** The clinician's ticks, from the patient's guide record. */
  ticks: Record<string, boolean>
}

export interface Goal {
  /** Where its tick is saved, for a goal the clinician ticks. */
  key: string
  title: string
  detail: string
  done: boolean
  /** True when the clinician ticks it; false when Float ticks it from the data. */
  byClinician: boolean
  /** Shown, but does not keep the stage open: it can wait for a later session. */
  canWait?: boolean
  /** What to say under "What to do next" when this is the next goal. */
  why?: string
  /** For a goal carried forward: the stage it came from. */
  from?: string
}
export interface Know { title: string; body: string; example?: string }
export interface Next { title: string; why: string }
export interface Guide {
  stage: StageId
  /** For the parent meeting: which part. */
  part?: 1 | 2
  progress: string
  next: Next
  goals: Goal[]
  /** Goals left unticked in earlier stages. */
  earlier: Goal[]
  /** For weekly sessions: the shape of every session. They repeat, so they are not ticked. */
  routine?: string[]
  know: Know[]
  /** A line under the goals, such as where it is fine to stop. */
  note?: string
  /** The key that moves on from this step, and the button's label. */
  moveOn?: { key: string; label: string }
  /** The key that brought the guide to this step, when the clinician moved on by hand. */
  movedOnFrom?: string
}

const first = (name: string) => (name || 'the child').split(' ')[0]

function goalsFor(step: Step, d: GuideInput): Goal[] {
  const name = first(d.childName)
  const tracked = (g: string, title: string, detail: string, done: boolean, why?: string, canWait?: boolean): Goal =>
    ({ key: goalKey(step, g), title, detail, done, byClinician: false, why, canWait })
  const ticked = (g: string, title: string, detail: string, why?: string): Goal =>
    ({ key: goalKey(step, g), title, detail, done: !!d.ticks[goalKey(step, g)], byClinician: true, why })

  switch (step) {
    case 'before': {
      const enough = d.monitoringEntries >= 3
      return [
        tracked('monitoring-sent', 'Send the monitoring form', d.monitoringSent ? 'Sent' : 'Not yet', d.monitoringSent,
          'A week of observations from the parents is what the first meeting is built on.'),
        tracked('observations', 'Wait for a week of observations', `${d.monitoringEntries} so far`, enough,
          'The Case Summary builds itself once there are 3.'),
        tracked('case-summary', 'Review the Case Summary before the meeting', d.hasCaseSummary ? 'Ready' : 'Builds itself from 3 observations', d.hasCaseSummary,
          `It pulls ${name}'s trigger situations, behaviors and the parents' responses out of the log.`),
      ]
    }
    case 'parent_meeting.1': {
      const situations = d.ladderSituations.length ? d.ladderSituations : d.summarySituations
      const rated = situations.filter(s => s.fear != null).length
      const withFear = d.ladderSituations.filter(s => (s.fearedOutcome || '').trim()).length
      return [
        tracked('situations', 'List the trigger situations, with Fear Levels', situations.length ? `${situations.length} situations, ${rated} rated` : 'None yet',
          situations.length > 0 && rated === situations.length),
        tracked('behaviors', `Find ${name}'s behaviors in each situation`, d.summaryBehaviors ? `${d.summaryBehaviors} so far` : 'None yet', d.summaryBehaviors > 0),
        tracked('responses', 'Find how the parents respond', d.parentResponses.length ? `${d.parentResponses.length} so far` : 'None yet', d.parentResponses.length > 0),
        tracked('feared-outcomes', `Find what ${name} fears will happen`,
          d.ladderSituations.length ? `${withFear} of ${d.ladderSituations.length} situations` : 'Add the situations to the plan first',
          d.ladderSituations.length > 0 && withFear === d.ladderSituations.length),
      ]
    }
    case 'parent_meeting.2':
      return [
        ticked('cbt', 'Explain how CBT and exposures work', 'Using their own examples', `Use ${name}'s own situations, starting with the lowest Fear Level.`),
        ticked('nickname', 'Explain what the nickname is for', `${name} chooses it at the next meeting`),
        ticked('fear-level', 'Explain the Fear Level check-in', 'Nickname first, then "What\'s your Fear Level?"'),
        ticked('accommodation', 'Explain what accommodation is', 'Reducing it comes after the child\'s first sessions'),
        ticked('weekly', 'Explain what weekly sessions look like', 'Once a week, with a short daily practice'),
        ticked('rewards', 'Explain rewards', 'The parents make a list that matters to the child'),
        ticked('script', `Give the parents the script for telling ${name}`, 'About the next meeting', 'The script is under "What to know".'),
      ]
    case 'parent_child': {
      const sits = d.ladderSituations
      const covered = sits.filter(s => s.behaviors > 0).length
      const goals: Goal[] = [
        ticked('help', `Ask what ${name} wants help with`, 'In their own words'),
        ticked('situations', `List ${name}'s own trigger situations`, 'Added to the plan', 'Use the monitoring to prompt, and write down what the child says.'),
        ticked('fear-level', 'Teach and practice the Fear Level', 'Practice on one of their own moments'),
        tracked('nickname', `Help ${name} choose a nickname`, d.nickname ? d.nickname : `${name} may decide later`, !!d.nickname,
          'Friendly, not scary. It can wait if the child wants to think about it.'),
        tracked('behaviors', 'Match the behaviors to each situation', sits.length ? `${covered} of ${sits.length} situations` : 'Add the situations first',
          sits.length > 0 && covered === sits.length, 'Safety behaviors, avoidance and rituals. Go down the list together, like detectives.'),
      ]
      if (d.accommodations > 0) {
        goals.push(tracked('accommodation-ratings', `${name} rates the accommodations`, `${d.accommodationsChildRated} of ${d.accommodations} · can wait for a later session`,
          d.accommodationsChildRated >= d.accommodations, 'In session, with you: Child ratings, in the parents\' plan.', true))
      }
      return goals
    }
    case 'child_first':
      return [
        ticked('check-in', 'Check in on the nickname and the Fear Level', '"Out of 10 times, how many did you use it?"'),
        ticked('worry-hill', 'Teach the Worry Hill', 'Watch the video together, then draw it'),
        ticked('candy-jar', 'Teach the Candy Jar', 'Why exposures work'),
        ticked('arrow', `Do the downward arrow with ${name}`, 'What they fear will happen, in their words', 'Check what the parents thought against what the child says.'),
        tracked('rungs', 'Get a Fear Level for each rung', d.rungs ? `${d.rungsRated} of ${d.rungs} rungs` : 'No rungs yet',
          d.rungs > 0 && d.rungsRated === d.rungs, 'Start with the situation with the lowest Fear Level. For each behavior: "What would it be without it?"'),
        tracked('first-exposure', 'Set up the first exposure', d.exposuresPlanned ? 'Set up' : 'The rung with the lowest Fear Level', d.exposuresPlanned > 0),
        ticked('practice', 'Practice it in session, 3 to 6 times', 'Until it feels more comfortable', 'Record the Fear Level each time. Keep going while it is above 4.'),
        tracked('confidence', 'Check confidence is high before doing it for real', d.highConfidence ? 'High' : 'Not yet', d.highConfidence,
          'If it is not high, make it easier and ask again.'),
      ]
    default:
      return []
  }
}

/** Two parents who logged the same situation with different Fear Levels. */
function differingRatings(d: GuideInput): string | undefined {
  const bySituation = new Map<string, { label: string; ratings: Map<string, number> }>()
  for (const e of d.entries) {
    if (!e.situation || !e.who || e.fear == null) continue
    const key = e.situation.trim().toLowerCase()
    const row = bySituation.get(key) ?? { label: e.situation.trim(), ratings: new Map<string, number>() }
    row.ratings.set(e.who, Math.max(row.ratings.get(e.who) ?? 0, e.fear))
    bySituation.set(key, row)
  }
  for (const { label, ratings } of bySituation.values()) {
    const pairs = [...ratings.entries()]
    const values = pairs.map(p => p[1])
    if (pairs.length >= 2 && Math.max(...values) - Math.min(...values) >= 2) {
      return `${label}: ${pairs.map(([who, f]) => `${who} rated it ${f}`).join(', ')}.`
    }
  }
  return undefined
}

/** The furthest step the data shows work has reached, whatever is ticked. */
function dataFloor(d: GuideInput): number {
  if (d.phase === 'maintenance' || d.phase === 'closed') return STEPS.indexOf('ending')
  if (d.exposuresDone > 0) return STEPS.indexOf('weekly')
  if (d.exposuresPlanned > 0) return STEPS.indexOf('child_first')
  if (d.nickname) return STEPS.indexOf('parent_child')
  return 0
}

function knowFor(step: Step, d: GuideInput): Know[] {
  const name = first(d.childName)
  switch (step) {
    case 'before':
      return [
        { title: 'Ask both parents to monitor for a week', body: 'Time both parents spend on the log pays off later. Each sees different moments.' },
        { title: 'You are looking for three things', body: 'The trigger situations, how the parents respond, and what the child does: safety and avoidance behaviors, and rituals.' },
      ]
    case 'parent_meeting.1':
      return [
        { title: 'This is a consultation, not therapy', body: 'The parents decide afterwards whether to go ahead. Say so when you set the agenda.' },
        { title: 'Count responses that prevent anxiety too', body: 'Accommodation includes what parents do before anything goes wrong, like planning the day around the child.', example: d.parentResponses[0] },
        { title: 'When parents see it differently, ask what each saw', body: 'Two ratings of the same situation are worth more than an average.', example: differingRatings(d) },
        { title: "Write the child's fears in the parents' words", body: `Without ${name} in the room, this is the parents' best guess. Check it with ${name} later.` },
      ]
    case 'parent_meeting.2':
      return [
        { title: 'Use their examples, not textbook ones', body: 'Exposures make sense to parents when they hear them about their own child.', example: d.summarySituations[0] ? `Start from "${d.summarySituations[0].name}".` : undefined },
        { title: 'The nickname is said with acceptance', body: 'The child greets it ("Hi Worry Bug"). Parents ask "Is Worry Bug here?", then "What\'s your Fear Level?"' },
        { title: 'Accommodation and symptoms go together', body: 'The more parents accommodate, the more severe the anxiety tends to be. Reducing it comes after the child\'s first sessions.' },
        { title: 'Rewards work best soon after', body: 'The parents list rewards that matter to the child, not what they think should be enough. Give them as soon after the task as possible.' },
        { title: 'What the parents can say to their child', body: '"We met with a person who knows how to help kids feel less worried and bothered by lots of things, sort of like a coach. We really liked what they had to say and thought you would like them. Would you be willing to meet them at least once?" If the child says no, a reward for coming with an open mind is fine.' },
      ]
    case 'parent_child':
      return [
        { title: 'Keep the get-to-know-you short', body: 'Up to 5 minutes: school, grade, favorite things. Ask if it is OK to redirect, and say CBT is more structured than other therapy they may have had.' },
        { title: 'Ask directly about fears', body: 'Talking about fears brings up anxiety. That is expected and a good sign. Say so, and that you will always go at their pace.' },
        { title: 'Listen without reassuring', body: 'Validate, be curious ("I\'m curious…"), and write down what the child says. Many kids have worries like these: more than 3 in 10.' },
        { title: 'If the answer is vague, dig a little', body: '"What do you worry will happen if you had to face it?" If they draw a blank, offer common fears. There is more time for this at the next session.' },
        { title: 'Teach the Fear Level with their own example', body: '1 is not worried at all, 10 is the most worried they have ever been. There are no wrong answers. Practice once or twice on a moment they pick.' },
        { title: 'The nickname is friendly', body: 'Examples other kids chose: Worry Bug, Mr. What-if, Panic Penguin, Belly Butterflies. It can wait if they want to think about it.' },
        { title: 'Ask about rituals too', body: 'Checking, washing, lining things up, praying, asking why, confessing a bad thought. Ask even if OCD is not on your radar.' },
      ]
    case 'child_first':
      return [
        { title: 'The Worry Hill', body: 'Use one of the child\'s own situations. A safety behavior at the top of the hill is like a stop sign: they never reach the other side, where the Fear Level comes down.' },
        { title: 'The Candy Jar', body: 'Scary memories are red candies. Each exposure where nothing terrible happens adds a green one. Enough green candies crowd out the red.' },
        { title: 'Building the ladder', body: 'Start from the situation with the lowest Fear Level. For each behavior, ask the Fear Level of doing the situation without it. Aim for at least 3 rungs, from low to high, without big jumps.' },
        { title: 'Ideally, without any of the behaviors', body: 'The goal is the situation without any of them. If that is 4 or below, ask how confident they are. If it is higher, break it into smaller steps: eye contact, then a smile, then saying hi.' },
        { title: 'Practice before the real thing', body: 'Anything new is practiced in session first. If it cannot be done in the room, role-play it or imagine it using all five senses.' },
        { title: 'Confidence must be high', body: 'If it is not, make it smaller, watch videos or photos of the situation, practice more, or go with the child.' },
      ]
    case 'weekly':
      return [
        { title: "I'd rather it be too easy than too hard", body: 'An exposure goes on the plan only when the child rates their confidence high. Otherwise make it easier and ask again.' },
        { title: 'Set when, not just what', body: 'Agree the days and times. Evenings are a bad time for hard things.' },
        { title: 'Praise the work, accept the setbacks', body: '"These things come up, and that is why we go over it carefully."' },
      ]
    default:
      return [{ title: 'To be written', body: 'Guidance for ending treatment is still to come.' }]
  }
}

/** How far the clinician has got by goals and moving on (`reached`), and where the guide shows the
 *  patient (`index`): never behind what the data shows. Weekly sessions only end when the patient
 *  moves to maintenance or is closed. */
function place(d: GuideInput, goalsByStep: Goal[][], ticks: Record<string, boolean>) {
  const stepDone = (i: number) => {
    if (ticks[movedOnKey(STEPS[i])]) return true
    const blocking = goalsByStep[i].filter(g => !g.canWait)
    return blocking.length > 0 && blocking.every(g => g.done)
  }
  let reached = 0
  while (reached < STEPS.indexOf('weekly') && stepDone(reached)) reached++
  return { reached, index: Math.max(reached, dataFloor(d)) }
}

export function guideFor(d: GuideInput): Guide {
  const goalsByStep = STEPS.map(s => goalsFor(s, d))
  const { reached, index } = place(d, goalsByStep, d.ticks)
  const step = STEPS[index]
  const stage = stageOfStep(step)
  const name = first(d.childName)

  const goals = goalsByStep[index]
  // Left behind in steps the clinician passed through. Steps the data skipped past (a patient who
  // was already doing exposures, say) are not listed, except a goal that can wait.
  const earlier = goalsByStep.slice(0, index).flatMap((gs, i) =>
    gs.filter(g => !g.done && (i < reached || g.canWait)).map(g => ({ ...g, from: stepName(STEPS[i]) })))

  const nextGoal = goals.find(g => !g.done && !g.canWait) ?? goals.find(g => !g.done)
  const unrated = d.ladderSituations.find(s => !(s.fearedOutcome || '').trim())
  const part = step === 'parent_meeting.1' ? 1 : step === 'parent_meeting.2' ? 2 : undefined
  let next: Next
  if (stage === 'weekly') {
    next = { title: 'Go through last week\'s action plan, exposure by exposure', why: `Did what ${name} feared happen? Was it easier or harder than expected?` }
  } else if (stage === 'ending') {
    next = { title: 'Plan the end of treatment', why: 'The patient is in maintenance or closed.' }
  } else if (nextGoal?.key === goalKey('parent_meeting.1', 'feared-outcomes') && unrated) {
    next = { title: `Find what ${name} fears will happen: ${unrated.name.toLowerCase()}`, why: `Use the downward arrow with the parents.${unrated.fear != null ? ` Its Fear Level is ${unrated.fear}.` : ''}` }
  } else if (nextGoal) {
    next = { title: nextGoal.title, why: nextGoal.why ?? nextGoal.detail }
  } else {
    next = { title: moveOnLabel(STEPS[index + 1]), why: 'Every goal for this stage is ticked.' }
  }

  const counted = goals.filter(g => !g.canWait)
  const progress = stage === 'weekly' ? `${d.exposuresDone} exposure${d.exposuresDone === 1 ? '' : 's'} done`
    : stage === 'ending' ? STAGES[STAGES.length - 1].name
    : `${part ? `Part ${part} of 2 · ` : ''}${counted.filter(g => g.done).length} of ${counted.length} goals`

  // "Go back" only when undoing the move-on would actually take the guide back.
  const prev = index > 0 ? STEPS[index - 1] : undefined
  const canGoBack = !!prev && !!d.ticks[movedOnKey(prev)]
    && place(d, goalsByStep, { ...d.ticks, [movedOnKey(prev)]: false }).index < index
  return {
    stage,
    part,
    progress,
    next,
    goals,
    earlier,
    routine: stage === 'weekly' ? [
      'Check-in, about 5 minutes: the week, the nickname, the Fear Level',
      "Go through last week's action plan, exposure by exposure",
      'Build the next action plan: each exposure set up with high confidence',
      'The parent joins for the last 5 to 10 minutes',
    ] : undefined,
    know: knowFor(step, d),
    note: step === 'parent_meeting.1' ? 'With all four done, it is a good place to stop if time is short. Part 2 can be its own meeting.' : undefined,
    moveOn: index < STEPS.indexOf('weekly') ? { key: movedOnKey(step), label: moveOnLabel(STEPS[index + 1]) } : undefined,
    movedOnFrom: canGoBack ? movedOnKey(prev!) : undefined,
  }
}

/** Short pop-up text for the ⓘ dots. DRAFT. */
export const INFO = {
  fearLevel: (d: Pick<GuideInput, 'childName'>) => ({
    title: 'Fear Level',
    body: `How frightening a situation feels, 1 to 10. In the parent meeting these are the parents' estimates; ${first(d.childName)} gives their own later. The ladder starts with the lowest.`,
  }),
  safetyAvoidance: () => ({
    title: 'Safety or avoidance?',
    body: 'Avoidance: the child stays out of the situation. Safety behavior: the child goes in, but does something to feel safer. Float treats both the same: the situation without the behavior becomes a rung.',
  }),
}
