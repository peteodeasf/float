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

/** Lower-cases the first letter unless it starts an acronym or the word "I". */
function midSentence(situation: string): string {
  const s = situation.trim()
  const keep = /^(I\b|[A-Z]{2})/.test(s)
  return keep ? s : s.charAt(0).toLowerCase() + s.slice(1)
}
