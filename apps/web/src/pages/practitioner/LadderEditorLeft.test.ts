// What the ladder editor works out from the rows. docs/plans/situation-editor-behaviours-first.md

import { describe, expect, it } from 'vitest'

import { arrowDoneOn, avoidsTheSituation, behaviorHint, rungHint } from './ladderEditor'
import type { DownwardArrow } from '../../api/treatment'

function arrow(rungId: string, fear: string | null, by = 'practitioner'): DownwardArrow {
  return {
    id: 'a-' + rungId, trigger_situation_id: null, rung_id: rungId, arrow_steps: [],
    feared_outcome: fear, feared_outcome_approved: false, bip_derived: null, facilitated_by: by,
    created_at: '', updated_at: '',
  }
}

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

describe('the hints inside a situation', () => {
  // Issue #77: the fixed hints were about a classroom whatever the situation. They now name the
  // situation, first, so a name of any shape still reads as a sentence.
  it('names the situation in the behavior hint', () => {
    expect(behaviorHint('Soccer practice after school '))
      .toBe('Soccer practice after school: something they do to feel safer')
  })

  it('names the situation in the rung hint', () => {
    expect(rungHint('Sleepover at a friend\'s house')).toBe('Sleepover at a friend\'s house, made a little easier')
  })
})
