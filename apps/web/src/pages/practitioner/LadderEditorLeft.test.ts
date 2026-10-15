// What a situation row says is left on it.
//
// A ladder is built over several sessions (Peter, 2026-10-15), so each situation has to say what is
// still to do without anyone remembering. docs/plans/ladder-combinations.md

import { describe, expect, it } from 'vitest'

import { whatIsLeft } from './SessionPage'
import type { AvoidanceBehavior } from '../../api/treatment'

function row(over: Partial<AvoidanceBehavior>): AvoidanceBehavior {
  return {
    id: Math.random().toString(36).slice(2),
    trigger_situation_id: 's1',
    name: 'x',
    description: null,
    behavior_type: 'safety',
    distress_thermometer_when_refraining: null,
    behavior_library_id: null,
    parent_behavior_id: null,
    without_behavior_id: null,
    created_at: '2026-10-15T00:00:00Z',
    ...over,
  }
}

describe('whatIsLeft', () => {
  it('says nothing when nothing is left', () => {
    const safety = row({ id: 'b1' })
    const step = row({ behavior_type: 'combination', without_behavior_id: 'b1', distress_thermometer_when_refraining: 5 })
    expect(whatIsLeft([safety, step])).toEqual([])
  })

  it('counts safety behaviours with no step', () => {
    expect(whatIsLeft([row({}), row({})])).toEqual(['2 safety behaviours have no step yet'])
  })

  it('does not ask for a step for an avoidance', () => {
    // Peter, 2026-10-15: "It's avoiding the situation."
    expect(whatIsLeft([row({ behavior_type: 'avoidance' })])).toEqual([])
  })

  it('counts unscored steps of both kinds', () => {
    const safety = row({ id: 'b1' })
    expect(whatIsLeft([
      safety,
      row({ behavior_type: 'combination', without_behavior_id: 'b1' }),
      row({ behavior_type: 'scenario' }),
    ])).toEqual(['2 steps not scored'])
  })

  it('says one in the singular', () => {
    expect(whatIsLeft([row({}), row({ behavior_type: 'scenario' })]))
      .toEqual(['1 safety behaviour has no step yet', '1 step not scored'])
  })
})
