// What the ladder editor works out from the rows. docs/plans/situation-editor-behaviours-first.md

import { describe, expect, it } from 'vitest'

import { arrowDoneOn, avoidsTheSituation, removeBehaviourLabel, removeStepLabel } from './ladderEditor'
import type { DownwardArrow } from '../../api/treatment'

function arrow(rungId: string, fear: string | null, by = 'practitioner'): DownwardArrow {
  return {
    id: 'a-' + rungId, trigger_situation_id: null, rung_id: rungId, arrow_steps: [],
    feared_outcome: fear, feared_outcome_approved: false, bip_derived: null, facilitated_by: by,
    created_at: '', updated_at: '',
  }
}

describe('easier versions under a step', () => {
  it('says what removing a step takes with it', () => {
    expect(removeStepLabel(false, 0)).toBe('Remove step')
    expect(removeStepLabel(true, 0)).toBe('Remove step, its arrow')
    expect(removeStepLabel(true, 2)).toBe('Remove step, 2 easier versions and its arrow')
  })

  it('says the same when the safety behaviour itself is removed', () => {
    expect(removeBehaviourLabel(false, 0)).toBe('Remove it, its step')
    expect(removeBehaviourLabel(true, 1)).toBe('Remove it, its step, 1 easier version and its arrow')
  })
})

describe('the avoidance offered on every situation', () => {
  it('reads as a sentence', () => {
    expect(avoidsTheSituation('Being dropped off at school')).toBe('Avoids being dropped off at school')
  })

  it('keeps an acronym and the word I', () => {
    expect(avoidsTheSituation('PE lessons')).toBe('Avoids PE lessons')
    expect(avoidsTheSituation('I have to speak in class')).toBe('Avoids I have to speak in class')
  })
})

describe('whether a step shows ✓ DA', () => {
  it('is done once the arrow reaches a feared outcome', () => {
    expect(arrowDoneOn('c1', [arrow('c1', 'They will laugh.')])).toBe(true)
  })

  it('is not done for an arrow that stopped short', () => {
    expect(arrowDoneOn('c1', [arrow('c1', null)])).toBe(false)
  })

  it("does not count the parent's arrow", () => {
    expect(arrowDoneOn('c1', [arrow('c1', 'They will laugh.', 'parent')])).toBe(false)
  })

  it('does not count another step', () => {
    expect(arrowDoneOn('c1', [arrow('c2', 'They will laugh.')])).toBe(false)
  })
})
