/**
 * Progress derivation for the teen surface.
 *
 * Everything here comes off the existing `/patient/ladder` payload — no new
 * endpoint — so the progress screens ship without waiting on a backend deploy.
 *
 * "Reflections logged" needs `what_learned`, which the ladder payload only
 * gained recently. `effortTiles` therefore falls back to `stepsMastered` when
 * the field is absent, so the screen is correct whichever order the frontend
 * and backend deploy in.
 */

export type LadderExperiment = {
  id: string
  status: string
  scheduled_date: string | null
  dt_actual: number | null
  bip_before: number | null
  bip_after: number | null
  feared_outcome_occurred: boolean | null
  /** Absent on payloads from before the field was exposed. */
  what_learned?: string | null
}

export type LadderBehavior = {
  id: string
  name: string
  status: string
  experiments: LadderExperiment[]
}

export type LadderSituation = {
  id: string
  name: string
  behaviors: LadderBehavior[]
}

/** Statuses that mean the teen committed to it, whatever happened next. */
const COMMITTED_STATES = ['committed', 'completed', 'too_hard']

export type Effort = {
  committed: number
  faced: number
  stepsMastered: number
  reflections: number
  situationsWorked: number
  /** True when the payload exposes `what_learned` at all. */
  hasReflectionData: boolean
}

/** The four counters shown on the effort card, in order. */
export function effortTiles(effort: Effort): Array<{ value: number; label: string }> {
  return [
    { value: effort.committed, label: 'times committed' },
    { value: effort.faced, label: 'experiments faced' },
    effort.hasReflectionData
      ? { value: effort.reflections, label: 'reflections logged' }
      : { value: effort.stepsMastered, label: 'steps mastered' },
    { value: effort.situationsWorked, label: 'situations worked' },
  ]
}

export function deriveEffort(situations: LadderSituation[]): Effort {
  let committed = 0
  let faced = 0
  let stepsMastered = 0
  let reflections = 0
  let situationsWorked = 0
  let hasReflectionData = false

  for (const situation of situations) {
    let situationHasCompleted = false
    for (const behavior of situation.behaviors ?? []) {
      if (behavior.status === 'mastered') stepsMastered++
      for (const experiment of behavior.experiments ?? []) {
        if (COMMITTED_STATES.includes(experiment.status)) committed++
        if ('what_learned' in experiment) hasReflectionData = true
        if (experiment.status === 'completed') {
          faced++
          situationHasCompleted = true
          if (experiment.what_learned && experiment.what_learned.trim()) reflections++
        }
      }
    }
    if (situationHasCompleted) situationsWorked++
  }

  return { committed, faced, stepsMastered, reflections, situationsWorked, hasReflectionData }
}

export type SituationTag = 'manageable' | 'getting there' | 'still scary' | 'just started'

export type SeriesPoint = {
  /** Belief the feared outcome will happen, 0–100. */
  bip: number
  /** How anxious it actually felt, 1–10. */
  dt: number | null
  /** Epoch ms, when known. */
  at: number | null
}

export type SituationProgress = {
  id: string
  name: string
  points: SeriesPoint[]
  tag: SituationTag
  improving: boolean
  /** True when there is enough history to plot a line. */
  plottable: boolean
}

/**
 * A situation's history, oldest first.
 *
 * Each point is one completed experiment: the belief it left them with
 * (`bip_after`, falling back to `bip_before`) and how anxious it actually felt.
 */
export function deriveSituationProgress(situation: LadderSituation): SituationProgress {
  const completed: LadderExperiment[] = []
  for (const behavior of situation.behaviors ?? []) {
    for (const experiment of behavior.experiments ?? []) {
      if (experiment.status === 'completed') completed.push(experiment)
    }
  }

  completed.sort((a, b) => {
    const at = a.scheduled_date ? new Date(a.scheduled_date).getTime() : 0
    const bt = b.scheduled_date ? new Date(b.scheduled_date).getTime() : 0
    return at - bt
  })

  const points: SeriesPoint[] = []
  for (const e of completed) {
    const bip = e.bip_after ?? e.bip_before
    if (bip == null) continue
    points.push({
      bip: Math.max(0, Math.min(100, Math.round(bip))),
      dt: e.dt_actual != null ? Math.round(e.dt_actual) : null,
      at: e.scheduled_date ? new Date(e.scheduled_date).getTime() : null,
    })
  }

  const latestDt = [...points].reverse().find(p => p.dt != null)?.dt ?? null
  let tag: SituationTag
  if (points.length === 0) tag = 'just started'
  else if (latestDt == null) tag = 'getting there'
  else if (latestDt <= 3) tag = 'manageable'
  else if (latestDt <= 6) tag = 'getting there'
  else tag = 'still scary'

  const improving =
    points.length >= 2 && points[points.length - 1].bip < points[0].bip

  return {
    id: situation.id,
    name: situation.name,
    points,
    tag,
    improving,
    plottable: points.length >= 2,
  }
}

/** Whole-week gap between the first and last point, for the x-axis label. */
export function weeksSpanned(points: SeriesPoint[]): number | null {
  const first = points.find(p => p.at != null)?.at
  const last = [...points].reverse().find(p => p.at != null)?.at
  if (first == null || last == null || last <= first) return null
  return Math.round((last - first) / (7 * 24 * 60 * 60 * 1000))
}

export function takeaway(progress: SituationProgress): string {
  const { points, improving } = progress
  if (points.length === 0) return 'No experiments logged here yet.'
  if (points.length === 1) {
    return `One experiment down. You're at ${points[0].bip}% — come back after the next one to see it move.`
  }
  const first = points[0].bip
  const last = points[points.length - 1].bip
  if (improving) {
    const weeks = weeksSpanned(points)
    const when = weeks && weeks > 0 ? `${weeks} week${weeks === 1 ? '' : 's'} ago` : 'at the start'
    return `You believed it ${first}% ${when}. Now ${last}% — and it keeps dropping every time you show up.`
  }
  return `You've faced this ${points.length} times. It's still hard — that's worth telling your clinician.`
}
