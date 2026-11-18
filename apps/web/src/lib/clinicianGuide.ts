// The clinician guide: where this patient is in treatment, what to do next, and what to know.
// docs/plans/clinician-guide.md
//
// DRAFT CONTENT. Every sentence a clinician reads here is a first draft, written from the clinical
// notes of 2026-11-18. Change the words freely; the structure is what
// the code depends on.
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
  /** Situations on the plan, with the feared outcome from each one's downward arrow. */
  ladderSituations: { name: string; fear: number | null; fearedOutcome: string | null }[]
  rungs: number
  nickname: string | null
  exposuresDone: number
  /** Monitoring entries by who logged them, for spotting parents who see it differently. */
  entries: { situation: string | null; who: string | null; fear: number | null }[]
}

/** A goal is done, not done, or something Float cannot see (it happens in conversation). */
export type GoalState = 'done' | 'todo' | 'untracked'
export interface Goal { title: string; detail: string; state: GoalState }
export interface Know { title: string; body: string; example?: string }
export interface Next { title: string; why: string }
export interface Guide {
  stage: StageId
  /** For the parent meeting: which part. It may be one sitting or two. */
  part?: 1 | 2
  progress: string
  next: Next
  goals: Goal[]
  know: Know[]
  /** A line under the goals, such as where it is fine to stop. */
  note?: string
}

const first = (name: string) => (name || 'the child').split(' ')[0]

function stageOf(d: GuideInput): StageId {
  if (d.phase === 'maintenance' || d.phase === 'closed') return 'ending'
  if (!d.hasCaseSummary) return 'before'
  if (d.exposuresDone > 0) return 'weekly'
  if (d.rungs > 0) return 'child_first'
  if (d.nickname) return 'parent_child'
  return 'parent_meeting'
}

function partOneGoals(d: GuideInput): Goal[] {
  const situations = d.ladderSituations.length ? d.ladderSituations : d.summarySituations
  const rated = situations.filter(s => s.fear != null).length
  const withFear = d.ladderSituations.filter(s => (s.fearedOutcome || '').trim()).length
  const name = first(d.childName)
  return [
    {
      title: 'Trigger situations, with Fear Levels',
      detail: situations.length ? `${situations.length} situations, ${rated} rated` : 'None yet',
      state: situations.length > 0 && rated === situations.length ? 'done' : 'todo',
    },
    {
      title: `${name}'s behaviors in each situation`,
      detail: d.summaryBehaviors ? `${d.summaryBehaviors} so far` : 'None yet',
      state: d.summaryBehaviors > 0 ? 'done' : 'todo',
    },
    {
      title: 'How the parents respond',
      detail: d.parentResponses.length ? `${d.parentResponses.length} so far` : 'None yet',
      state: d.parentResponses.length > 0 ? 'done' : 'todo',
    },
    {
      title: `What ${name} fears will happen`,
      detail: d.ladderSituations.length ? `${withFear} of ${d.ladderSituations.length} situations` : 'Add the situations to the plan first',
      state: d.ladderSituations.length > 0 && withFear === d.ladderSituations.length ? 'done' : 'todo',
    },
  ]
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

export function guideFor(d: GuideInput): Guide {
  const stage = stageOf(d)
  const name = first(d.childName)
  const stageIndex = STAGES.findIndex(s => s.id === stage)

  if (stage === 'before') {
    const enough = d.monitoringEntries >= 3
    return {
      stage, progress: d.monitoringSent ? `${d.monitoringEntries} observations so far` : 'Monitoring not sent yet',
      next: !d.monitoringSent
        ? { title: 'Send the monitoring form to both parents', why: 'A week of observations from both parents is what the first meeting is built on.' }
        : enough
          ? { title: 'Review the Case Summary before the meeting', why: `It pulls ${name}'s trigger situations, behaviors and the parents' responses out of the log.` }
          : { title: 'Wait for at least 3 observations', why: 'The Case Summary builds itself once there are 3.' },
      goals: [
        { title: 'Monitoring sent', detail: d.monitoringSent ? 'Sent' : 'Not yet', state: d.monitoringSent ? 'done' : 'todo' },
        { title: 'A week of observations', detail: `${d.monitoringEntries} so far`, state: enough ? 'done' : 'todo' },
        { title: 'Case Summary ready', detail: 'Builds itself from 3 observations', state: d.hasCaseSummary ? 'done' : 'todo' },
      ],
      know: [
        { title: 'Ask both parents to monitor', body: 'Time both parents spend on the log pays off later. Each sees different moments.' },
        { title: 'You are looking for three things', body: 'The trigger situations, how the parents respond, and what the child does: safety and avoidance behaviors, and rituals.' },
      ],
    }
  }

  if (stage === 'parent_meeting') {
    const goals = partOneGoals(d)
    const partOneDone = goals.every(g => g.state === 'done')
    const differ = differingRatings(d)
    const preventive = d.parentResponses[0]
    if (!partOneDone) {
      const nextGoal = goals.find(g => g.state !== 'done')!
      const unrated = d.ladderSituations.find(s => !(s.fearedOutcome || '').trim())
      return {
        stage, part: 1, progress: `Part 1 of 2 · ${goals.filter(g => g.state === 'done').length} of 4 goals`,
        next: nextGoal.title.startsWith('What') && unrated
          ? { title: `Find what ${name} fears will happen: ${unrated.name.toLowerCase()}`, why: `Use the downward arrow with the parents.${unrated.fear != null ? ` Its Fear Level is ${unrated.fear}.` : ''}` }
          : { title: nextGoal.title, why: nextGoal.detail },
        goals,
        note: 'With all four done, it is a good place to stop if time is short. Part 2 can be its own meeting.',
        know: [
          { title: 'This is a consultation, not therapy', body: 'The parents decide afterwards whether to go ahead. Say so when you set the agenda.' },
          { title: 'Count responses that prevent anxiety too', body: 'Accommodation includes what parents do before anything goes wrong, like planning the day around the child.', example: preventive },
          { title: 'When parents see it differently, ask what each saw', body: 'Two ratings of the same situation are worth more than an average.', example: differ },
          { title: "Write the child's fears in the parents' words", body: `Without ${name} in the room, this is the parents' best guess. Check it with ${name} later.` },
        ],
      }
    }
    return {
      stage, part: 2, progress: 'Part 2 of 2',
      next: { title: 'Explain how CBT and exposures work, with their examples', why: `Use ${name}'s own situations, starting with the lowest Fear Level.` },
      goals: [
        { title: 'How CBT and exposures work', detail: 'In conversation', state: 'untracked' },
        { title: 'The nickname for the anxiety', detail: d.nickname ? d.nickname : 'Saved on the plan when chosen', state: d.nickname ? 'done' : 'todo' },
        { title: 'The Fear Level check-in', detail: 'In conversation', state: 'untracked' },
        { title: 'What accommodation is', detail: 'In conversation', state: 'untracked' },
        { title: 'What weekly sessions look like', detail: 'In conversation', state: 'untracked' },
      ],
      know: [
        { title: 'Use their examples, not textbook ones', body: 'Exposures make sense to parents when they hear them about their own child.', example: d.summarySituations[0] ? `Start from "${d.summarySituations[0].name}".` : undefined },
        { title: 'The nickname is said with acceptance', body: 'The child greets it ("Hi Worry Bug"). Parents ask "Is Worry Bug here?", then "What\'s your Fear Level?"' },
        { title: 'Accommodation and symptoms go together', body: 'The more parents accommodate, the more severe the anxiety tends to be. Reducing it comes after the child\'s first sessions.' },
      ],
    }
  }

  if (stage === 'weekly') {
    return {
      stage, progress: `${d.exposuresDone} exposure${d.exposuresDone === 1 ? '' : 's'} done`,
      next: { title: 'Go through last week\'s action plan, exposure by exposure', why: `Did what ${name} feared happen? Was it easier or harder than expected?` },
      goals: [
        { title: 'Check-in, about 5 minutes', detail: 'In conversation', state: 'untracked' },
        { title: "Go through last week's action plan", detail: 'In conversation', state: 'untracked' },
        { title: 'Build the next action plan', detail: 'Confidence must be high', state: 'untracked' },
        { title: 'Parent joins for the last 5 to 10 minutes', detail: 'In conversation', state: 'untracked' },
      ],
      know: [
        { title: "I'd rather it be too easy than too hard", body: 'Only give the plan when the child rates their confidence high. Otherwise make it easier and ask again.' },
        { title: 'Set when, not just what', body: 'Agree the days and times. Evenings are a bad time for hard things.' },
        { title: 'Praise the work, accept the setbacks', body: '"These things come up, and that is why we go over it carefully."' },
      ],
    }
  }

  // Stages with very little in the clinical notes so far.
  const drafts: Record<string, { next: Next; know: Know[] }> = {
    parent_child: {
      next: { title: `Meet ${name} with the parents`, why: 'The parent meeting is done.' },
      know: [{ title: 'Draft content', body: 'Guidance for this meeting is still to be written.' }],
    },
    child_first: {
      next: { title: `Build the ladder with ${name}, then the first exposure`, why: `${d.rungs} rung${d.rungs === 1 ? '' : 's'} on the ladder so far.` },
      know: [{ title: 'New things are practiced in session first', body: 'Anything new goes on the action plan only after it has been practiced with you. Float does not check this.' }],
    },
    ending: {
      next: { title: 'Plan the end of treatment', why: 'The patient is in maintenance or closed.' },
      know: [{ title: 'Draft content', body: 'Guidance for ending treatment is still to be written.' }],
    },
  }
  const draft = drafts[stage]
  return { stage, progress: STAGES[stageIndex].name, next: draft.next, goals: [], know: draft.know }
}

/** Short pop-up text for the ⓘ dots. DRAFT. */
export const INFO = {
  fearLevel: (d: GuideInput) => ({
    title: 'Fear Level',
    body: `How frightening a situation feels, 1 to 10. In the parent meeting these are the parents' estimates; ${first(d.childName)} gives their own later. The ladder starts with the lowest.`,
  }),
  safetyAvoidance: () => ({
    title: 'Safety or avoidance?',
    body: 'Avoidance: the child stays out of the situation. Safety behavior: the child goes in, but does something to feel safer. Float treats both the same: the situation without the behavior becomes a rung.',
  }),
}
