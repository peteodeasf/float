/**
 * The Progress tab's reading of the action plans: each exposure's days, and how each went.
 * docs/plans/progress-tab-action-plan.md
 */
import type { ActionPlan } from '../api/action_plans'
import type { PlannedExperiment } from '../api/treatment'

/** done ✓, hard ◐ (tried, too hard), missed ✗ (the day passed, nothing recorded), soon ○. */
export type Attempt = 'done' | 'hard' | 'missed' | 'soon'

export interface Column {
  day: string // yyyy-mm-dd, local
  attempt: Attempt
  exp: PlannedExperiment
}

export interface Counts { tried: number; done: number; hard: number; missed: number; of: number }

/** yyyy-mm-dd in the viewer's own time, which is how plan dates are kept. */
export function localDay(iso: string): string {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** The day an exposure belongs to: when it was done or found too hard, else when it is due. */
export function dayOf(e: PlannedExperiment): string | null {
  if (e.status === 'completed') return e.completed_date ? localDay(e.completed_date) : null
  if (e.status === 'too_hard') {
    const at = e.too_hard_at ?? e.scheduled_date
    return at ? localDay(at) : null
  }
  return e.scheduled_date ? localDay(e.scheduled_date) : null
}

export function attemptOf(e: PlannedExperiment, today: string): Attempt | null {
  if (e.status === 'completed') return 'done'
  if (e.status === 'too_hard') return 'hard'
  const day = dayOf(e)
  if (!day) return null // set up with no day and not done: no column
  return day < today ? 'missed' : 'soon'
}

/** Shared plans only, oldest first. */
export function sharedPlans(plans: ActionPlan[]): ActionPlan[] {
  return plans.filter(p => p.state !== 'draft').sort((a, b) => a.starts_on.localeCompare(b.starts_on))
}

/** The plan a day belongs to. On the day one ends and the next starts, the newer one. */
export function planForDay(day: string, plans: ActionPlan[]): ActionPlan | null {
  let found: ActionPlan | null = null
  for (const p of sharedPlans(plans)) if (day >= p.starts_on && day <= p.ends_on) found = p
  return found
}

/** A rung's exposures that fall in this plan, as columns in date order. */
export function columnsFor(rungId: string, plan: ActionPlan, plans: ActionPlan[], experiments: PlannedExperiment[], today: string): Column[] {
  const out: Column[] = []
  for (const e of experiments) {
    if (e.avoidance_behavior_id !== rungId) continue
    const day = dayOf(e)
    const attempt = attemptOf(e, today)
    if (!day || !attempt || planForDay(day, plans)?.id !== plan.id) continue
    out.push({ day, attempt, exp: e })
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.exp.created_at.localeCompare(b.exp.created_at))
}

export function countsOf(cols: Column[]): Counts {
  const n = (a: Attempt) => cols.filter(c => c.attempt === a).length
  const done = n('done'), hard = n('hard'), missed = n('missed')
  return { tried: done + hard, done, hard, missed, of: done + hard + missed }
}

/** Every rung on any shared plan, in the order it first appeared, with its name. */
export function exposureRungs(plans: ActionPlan[]): { id: string; name: string }[] {
  const seen = new Map<string, string>()
  for (const p of sharedPlans(plans)) {
    for (const i of p.items) {
      if (i.kind === 'exposure' && i.avoidance_behavior_id && !seen.has(i.avoidance_behavior_id)) {
        seen.set(i.avoidance_behavior_id, i.rung_name || i.label)
      }
    }
  }
  return [...seen].map(([id, name]) => ({ id, name }))
}

/** The plan the Progress tab opens on: the one running now, else the next, else the latest. */
export function planToShow(plans: ActionPlan[]): ActionPlan | null {
  // Newest first: on the day one plan ends and the next starts, both read as current.
  const shared = sharedPlans(plans).reverse()
  return shared.find(p => p.state === 'current') ?? shared.find(p => p.state === 'upcoming') ?? shared[0] ?? null
}
