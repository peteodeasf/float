// What the ladder editor works out from the rows, kept out of SessionPage.tsx so that file only
// exports components (React Fast Refresh needs that). docs/plans/ladder-combinations.md

import type { DownwardArrow } from '../../api/treatment'

/** What removing a step takes with it, said on the button. */
export function removeStepLabel(arrowDone: boolean, easier: number): string {
  const also = [
    ...(easier ? [`${easier} easier ${easier === 1 ? 'version' : 'versions'}`] : []),
    ...(arrowDone ? ['its arrow'] : []),
  ]
  return also.length ? `Remove step, ${also.join(' and ')}` : 'Remove step'
}

/** What removing a safety behaviour takes with it: its step, and whatever the step takes. */
export function removeBehaviourLabel(arrowDone: boolean, easier: number): string {
  return removeStepLabel(arrowDone, easier).replace(/^Remove step/, 'Remove it, its step')
}

/** Whether this step's downward arrow has reached a feared outcome. */
export function arrowDoneOn(rungId: string, arrows: DownwardArrow[]): boolean {
  return arrows.some(a => a.rung_id === rungId && a.facilitated_by !== 'parent' && !!(a.feared_outcome ?? '').trim())
}

/** A suggestion read out of an approved session note, rather than (or as well as) the monitoring
 *  log. docs/plans/session-suggestions.md */
export const fromASession = (item: { sources?: string[] }) => (item.sources ?? []).includes('session_note')

/** The avoidance offered on every situation: staying away from it. "Avoids being dropped off at
 *  school". Lower-cases the first letter unless it starts an acronym or the word "I". */
export function avoidsTheSituation(situation: string): string {
  const s = situation.trim()
  const keep = /^(I\b|[A-Z]{2})/.test(s)
  return `Avoids ${keep ? s : s.charAt(0).toLowerCase() + s.slice(1)}`
}
