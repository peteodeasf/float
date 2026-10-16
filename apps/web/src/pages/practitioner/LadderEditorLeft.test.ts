// What a situation row says is left on it.
//
// A ladder is built over several sessions (Peter, 2026-10-15), so each situation has to say what is
// still to do without anyone remembering. docs/plans/ladder-combinations.md

import { describe, expect, it } from 'vitest'

import { nextArrowOn, removeStepLabel, whatIsLeft } from './SessionPage'
import type { AvoidanceBehavior, DownwardArrow } from '../../api/treatment'

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
    const step = row({ id: 'c1', behavior_type: 'combination', without_behavior_id: 'b1', distress_thermometer_when_refraining: 5 })
    expect(whatIsLeft([safety, step], [arrow('c1', 'They will laugh.')])).toEqual([])
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
      row({ id: 'c1', behavior_type: 'combination', without_behavior_id: 'b1' }),
      row({ behavior_type: 'scenario' }),
    ], [arrow('c1', 'They will laugh.')])).toEqual(['2 steps not scored'])
  })

  it('says one in the singular', () => {
    expect(whatIsLeft([row({}), row({ behavior_type: 'scenario' })]))
      .toEqual(['1 safety behaviour has no step yet', '1 step not scored'])
  })

  it('does not count a step this screen does not show', () => {
    // A sub-step under another step, from the older builder. Nothing here can score it, so the
    // header must not ask for it.
    expect(whatIsLeft([row({ behavior_type: 'scenario', parent_behavior_id: 'x' })])).toEqual([])
  })
})

function arrow(rungId: string, fear: string | null, by = 'practitioner'): DownwardArrow {
  return {
    id: 'a-' + rungId, trigger_situation_id: null, rung_id: rungId, arrow_steps: [],
    feared_outcome: fear, feared_outcome_approved: false, bip_derived: null, facilitated_by: by,
    created_at: '', updated_at: '',
  }
}

describe('the downward arrow on each step', () => {
  const low = row({ id: 'low', behavior_type: 'combination', without_behavior_id: 's1', distress_thermometer_when_refraining: 3 })
  const high = row({ id: 'high', behavior_type: 'combination', without_behavior_id: 's2', distress_thermometer_when_refraining: 7 })
  const safety = [row({ id: 's1' }), row({ id: 's2' })]

  it('suggests the lowest-scored step first', () => {
    expect(nextArrowOn([...safety, high, low], [])).toBe('low')
  })

  it('moves on once that one has a feared outcome', () => {
    expect(nextArrowOn([...safety, high, low], [arrow('low', 'They will laugh.')])).toBe('high')
  })

  it('does not count an arrow that never reached a feared outcome', () => {
    expect(nextArrowOn([...safety, high, low], [arrow('low', null)])).toBe('low')
  })

  it("does not count the parent's arrow", () => {
    expect(nextArrowOn([...safety, high, low], [arrow('low', 'They will laugh.', 'parent')])).toBe('low')
  })

  it('says how many arrows are left', () => {
    expect(whatIsLeft([...safety, high, low], [arrow('low', 'They will laugh.')]))
      .toEqual(['1 downward arrow to do'])
  })

  it('has nothing to suggest when every step is done', () => {
    expect(nextArrowOn([...safety, low], [arrow('low', 'They will laugh.')])).toBeNull()
  })
})

describe('easier versions under a step', () => {
  it('counts an unscored easier version under a combination', () => {
    const safety = row({ id: 's1' })
    const step = row({ id: 'c1', behavior_type: 'combination', without_behavior_id: 's1', distress_thermometer_when_refraining: 5 })
    const easier = row({ behavior_type: 'scenario', parent_behavior_id: 'c1' })
    expect(whatIsLeft([safety, step, easier], [arrow('c1', 'They will laugh.')])).toEqual(['1 step not scored'])
  })

  it('says what removing a step takes with it', () => {
    expect(removeStepLabel(false, 0)).toBe('Remove step')
    expect(removeStepLabel(true, 0)).toBe('Remove step, its arrow')
    expect(removeStepLabel(true, 2)).toBe('Remove step, 2 easier versions and its arrow')
  })
})

describe('while the arrows are loading', () => {
  it('says nothing about arrows rather than calling a finished one "to do"', () => {
    const safety = row({ id: 's1' })
    const step = row({ id: 'c1', behavior_type: 'combination', without_behavior_id: 's1', distress_thermometer_when_refraining: 5 })
    expect(whatIsLeft([safety, step], undefined)).toEqual([])
  })
})
