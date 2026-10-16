// What the ladder editor works out from the rows, kept out of SessionPage.tsx so that file only
// exports components (React Fast Refresh needs that). docs/plans/ladder-combinations.md

import type { DownwardArrow } from '../../api/treatment'
import type { AvoidanceBehavior, DownwardArrow } from '../../api/treatment'
import { BEHAVIOR_TYPE_COMBINATION, BEHAVIOR_TYPE_SAFETY, BEHAVIOR_TYPE_SCENARIO } from './patient/shared'
import { dtOf } from './sessionKit'

/** What is still to do on a situation, in a few words each. Empty when nothing is. */
export function whatIsLeft(behaviors: AvoidanceBehavior[], arrows?: DownwardArrow[]): string[] {
  const safety = behaviors.filter(b => b.behavior_type === BEHAVIOR_TYPE_SAFETY)
  const withStep = new Set(
    behaviors.filter(b => b.behavior_type === BEHAVIOR_TYPE_COMBINATION).map(b => b.without_behavior_id),
  )
  const noStep = safety.filter(b => !withStep.has(b.id)).length
  // Only steps this screen shows, so every one it counts can be found and scored here: those on
  // the situation itself, and easier versions under a combination.
  const combinationIds = new Set(
    behaviors.filter(b => b.behavior_type === BEHAVIOR_TYPE_COMBINATION).map(b => b.id),
  )
  const unscored = behaviors.filter(b =>
    (b.behavior_type === BEHAVIOR_TYPE_COMBINATION || b.behavior_type === BEHAVIOR_TYPE_SCENARIO)
    && (!b.parent_behavior_id || combinationIds.has(b.parent_behavior_id))
    && dtOf(b.distress_thermometer_when_refraining) == null,
  ).length
  // A combination's arrow is done once it has landed on a feared outcome. It does not all have to
  // happen in one session (Peter, 2026-10-15), which is why this is counted.
  const arrowsToDo = arrows === undefined ? 0 : behaviors.filter(b =>
    b.behavior_type === BEHAVIOR_TYPE_COMBINATION && !arrowDoneOn(b.id, arrows),
  ).length
  const out: string[] = []
  if (noStep) out.push(`${noStep} safety ${noStep === 1 ? 'behaviour has' : 'behaviours have'} no step yet`)
  if (unscored) out.push(`${unscored} ${unscored === 1 ? 'step' : 'steps'} not scored`)
  if (arrowsToDo) out.push(`${arrowsToDo} downward ${arrowsToDo === 1 ? 'arrow' : 'arrows'} to do`)
  return out
}

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
/**
 * The combination to do the downward arrow on next: lowest score first, among those not done.
 * Dr. Walker, via Peter, 2026-10-15: start with the safety behaviours, lowest first. Every
 * combination is a safety behaviour's, so this is lowest score first. Advice, not a lock.
 */
export function nextArrowOn(behaviors: AvoidanceBehavior[], arrows: DownwardArrow[]): string | null {
  const todo = behaviors
    .filter(b => b.behavior_type === BEHAVIOR_TYPE_COMBINATION && !arrowDoneOn(b.id, arrows))
    .sort((a, b) =>
      (dtOf(a.distress_thermometer_when_refraining) ?? 99) - (dtOf(b.distress_thermometer_when_refraining) ?? 99))
  return todo[0]?.id ?? null
}

/** A suggestion read out of an approved session note, rather than (or as well as) the monitoring
 *  log. docs/plans/session-suggestions.md */
export const fromASession = (item: { sources?: string[] }) => (item.sources ?? []).includes('session_note')
