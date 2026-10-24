// What the ladder editor works out from the rows, kept out of SessionPage.tsx so that file only
// exports components (React Fast Refresh needs that). docs/plans/ladder-combinations.md

import type { DownwardArrow } from '../../api/treatment'

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

// ── The order things are shown in while the editor is open ───────────────────
// Peter, 2026-10-24: re-sorting by Fear Level the moment a score changes moves the thing you are
// working on, and you lose it. So the lists are sorted when they open and when you finish (Save
// ladder, Done), and in between they keep the order they were shown in.
// docs/plans/ladder-editor-stable-order.md

/** `now` (ids, already sorted) in the order already shown: the ones shown before keep their
 *  place, ones that are gone drop out, and new ones go at the end. */
export function keepOrder(shown: string[], now: string[]): string[] {
  const live = new Set(now)
  const kept = shown.filter(id => live.has(id))
  const have = new Set(kept)
  return [...kept, ...now.filter(id => !have.has(id))]
}

// One entry per list — a plan's situations, or one situation's steps — kept outside any component:
// the inline editor, full screen and the downward arrow are different routes, and going between
// them must not re-sort.
const shown = new Map<string, string[]>()

export const situationsList = (planId: string) => `situations:${planId}`
export const stepsList = (situationId: string) => `steps:${situationId}`

/** `sorted` in the order this list has been shown in so far (keepOrder). */
export function inShownOrder<T>(list: string, sorted: T[], idOf: (t: T) => string): T[] {
  const order = keepOrder(shown.get(list) ?? [], sorted.map(idOf))
  shown.set(list, order)
  const byId = new Map(sorted.map(t => [idOf(t), t]))
  return order.map(id => byId.get(id)!)
}

/** Forget a list's shown order, so it is next shown sorted: a situation's steps when it is opened
 *  and on Done. With no list, forget them all: on Save ladder, and when Edit ladder opens the
 *  editor. */
export function sortNextTime(list?: string): void {
  if (list) shown.delete(list)
  else shown.clear()
}

/** Lower-cases the first letter unless it starts an acronym or the word "I". */
function midSentence(situation: string): string {
  const s = situation.trim()
  const keep = /^(I\b|[A-Z]{2})/.test(s)
  return keep ? s : s.charAt(0).toLowerCase() + s.slice(1)
}
