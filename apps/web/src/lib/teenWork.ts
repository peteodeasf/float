/**
 * Where each step on the child's ladder has got to, and what they're working on now.
 *
 * The home is the ladder (Peter, 2026-09-10): each step shows its own state, and tapping it is how
 * it gets set up. The Progress tab lists what's current. Both read the same two things — the
 * ladder's steps and the pending exposures — so the rules live here once.
 *
 * Plan: docs/plans/teen-home-ladder-and-session-setup.md
 */

export type PendingExperiment = {
  id: string
  status: string
  scheduled_date: string | null
  scheduled_time_bucket?: string | null
  avoidance_behavior_id?: string | null
  plan_description?: string | null
}

export type LadderRung = {
  id: string
  name: string
  dt: number | null
  status: 'mastered' | 'in_progress' | 'not_started'
  situation_name: string | null
  is_recommended: boolean
  experiments: Array<{ id: string; status: string }>
}

/**
 * - done: mastered. Ticked, and nothing to tap.
 * - setup: an exposure is committed to a day. Tapping opens it.
 * - started: set up with the clinician, and waiting on the child. Tapping finishes it.
 * - open: nothing pending. Tapping sets one up.
 */
export type StepState = {
  kind: 'done' | 'setup' | 'started' | 'open'
  exp?: PendingExperiment
  /** Completed exposures on this step — shown on an open step that has been done before. */
  timesDone: number
}

const at = (e: PendingExperiment) =>
  e.scheduled_date ? new Date(e.scheduled_date).getTime() : Number.POSITIVE_INFINITY

function startOfTomorrow(now: Date): number {
  const d = new Date(now)
  d.setHours(24, 0, 0, 0)
  return d.getTime()
}

export function stepState(rung: LadderRung, pending: PendingExperiment[]): StepState {
  const timesDone = (rung.experiments ?? []).filter(e => e.status === 'completed').length
  if (rung.status === 'mastered') return { kind: 'done', timesDone }

  const mine = pending.filter(e => e.avoidance_behavior_id === rung.id)
  const committed = mine.filter(e => e.status === 'committed').sort((a, b) => at(a) - at(b))[0]
  if (committed) return { kind: 'setup', exp: committed, timesDone }

  const planned = mine.find(e => e.status === 'planned')
  if (planned) return { kind: 'started', exp: planned, timesDone }

  return { kind: 'open', timesDone }
}

/** Committed exposures whose day is today, or earlier and still not done. Soonest first. */
export function dueToday(pending: PendingExperiment[], now: Date): PendingExperiment[] {
  const cutoff = startOfTomorrow(now)
  return pending
    .filter(e => e.status === 'committed' && e.scheduled_date && at(e) < cutoff)
    .sort((a, b) => at(a) - at(b))
}

/** Committed exposures for a later day. */
export function comingUp(pending: PendingExperiment[], now: Date): PendingExperiment[] {
  const cutoff = startOfTomorrow(now)
  return pending
    .filter(e => e.status === 'committed' && at(e) >= cutoff)
    .sort((a, b) => at(a) - at(b))
}

/** Set up with the clinician and waiting for the child's part. */
export function waitingOnChild(pending: PendingExperiment[]): PendingExperiment[] {
  return pending.filter(e => e.status === 'planned').sort((a, b) => at(a) - at(b))
}

/** What puts a dot on the Progress tab: something due today, or something waiting on them. */
export function waitingCount(pending: PendingExperiment[], now: Date): number {
  return dueToday(pending, now).length + waitingOnChild(pending).length
}

const BUCKET: Record<string, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' }

/** "Today · Morning", "Fri 11 · Morning", or "Fri 11" when no time of day was picked. */
export function whenLabel(e: PendingExperiment, now: Date): string {
  if (!e.scheduled_date) return 'No day yet'
  const d = new Date(e.scheduled_date)
  const day =
    d.toDateString() === now.toDateString()
      ? 'Today'
      : `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`
  const bucket = e.scheduled_time_bucket ? BUCKET[e.scheduled_time_bucket] ?? e.scheduled_time_bucket : null
  return bucket ? `${day} · ${bucket}` : day
}
