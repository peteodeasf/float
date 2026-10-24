// What the ladder editor works out from the rows, kept out of SessionPage.tsx so that file only
// exports components (React Fast Refresh needs that). docs/plans/ladder-combinations.md

import type { DownwardArrow, TriggerSituation } from '../../api/treatment'
import { dtOf } from './sessionKit'

/** Whether this step's downward arrow has reached a feared outcome. */
export function arrowDoneOn(rungId: string, arrows: DownwardArrow[]): boolean {
  return arrows.some(a => a.rung_id === rungId && a.facilitated_by !== 'parent' && !!(a.feared_outcome ?? '').trim())
}

/** The avoidance offered on every situation: staying away from it. "Avoids being dropped off at
 *  school". Lower-cases the first letter unless it starts an acronym or the word "I". */
export function avoidsTheSituation(situation: string): string {
  return `Avoids ${midSentence(situation)}`
}

// The hints in the two boxes inside a situation. They name the situation itself rather than give
// a made-up example: the fixed one was about a classroom, which read wrong under "Soccer practice
// after school" (Peter, 2026-10-22, issue #77). The situation goes first, so any name reads right.

/** The hint in the box for adding a behavior. "Soccer practice after school: something they do to
 *  feel safer". */
export function behaviorHint(situation: string): string {
  return `${situation.trim()}: something they do to feel safer`
}

/** The hint in the box for adding a rung. "Soccer practice after school, made a little easier". */
export function rungHint(situation: string): string {
  return `${situation.trim()}, made a little easier`
}

/** Lower-cases the first letter unless it starts an acronym or the word "I". */
function midSentence(situation: string): string {
  const s = situation.trim()
  const keep = /^(I\b|[A-Z]{2})/.test(s)
  return keep ? s : s.charAt(0).toLowerCase() + s.slice(1)
}

// ── The order things are listed in ───────────────────────────────────────────
// Peter, 2026-10-24: sorting by Fear Level while you edit made a situation jump away the moment you
// scored it. So the editor sorts when it opens and on Save ladder, and holds that order in between.
// Inside a situation, the same with its behaviors and rungs: sorted when it opens and on Done.

/** Lowest Fear Level first. Unscored situations sit at the end, in the order they were made,
 *  rather than counting as a zero and jumping the queue. */
export function byFearLevel(a: TriggerSituation, b: TriggerSituation): number {
  const x = dtOf(a.distress_thermometer_rating)
  const y = dtOf(b.distress_thermometer_rating)
  if (x == null && y == null) return (a.display_order ?? 0) - (b.display_order ?? 0)
  if (x == null) return 1
  if (y == null) return -1
  return x - y
}

/** The items in a held order: those already in it keep their places, new ones go at the end, and
 *  removed ones drop out. */
export function inHeldOrder<T>(items: T[], keyOf: (item: T) => string, held: string[]): T[] {
  const byKey = new Map(items.map(item => [keyOf(item), item]))
  const known = new Set(held)
  return [
    ...held.flatMap(key => byKey.get(key) ?? []),
    ...items.filter(item => !known.has(keyOf(item))),
  ]
}

// The orders held while the editor is open, for one plan: the situations, and the steps of each
// situation. Kept outside the screen because inline and full screen are two different screens, and
// going between them must not re-sort anything.
const heldByPlan = new Map<string, Map<string, string[]>>()

export function heldOrders(planId: string): Map<string, string[]> {
  let orders = heldByPlan.get(planId)
  if (!orders) heldByPlan.set(planId, orders = new Map())
  return orders
}
/** The editor is opened afresh: it starts from sorted lists. */
export const forgetHeldOrders = (planId: string) => { heldByPlan.delete(planId) }
export const SITUATIONS = 'situations'
export const stepsOf = (situationId: string) => `steps:${situationId}`
