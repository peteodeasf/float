// The numbers on the "All done for now" screen.
//
// `deriveFearedOutcomes` is the one the child reads first, so it has to be honest about what was
// never answered. An unrecorded outcome is not a fear that came true, and it is not one that
// didn't — it is not part of the count at all.

import { describe, expect, it } from 'vitest'

import { deriveFearedOutcomes, type LadderSituation } from './teenProgress'

/** One situation holding one behaviour holding the given experiments. */
function situation(
  experiments: Array<{ status: string; feared_outcome_occurred: boolean | null }>
): LadderSituation {
  return {
    id: 's1',
    name: 'Talking to people',
    behaviors: [
      {
        id: 'b1',
        name: 'Ask a question in class',
        status: 'active',
        experiments: experiments.map((e, i) => ({
          id: `e${i}`,
          status: e.status,
          scheduled_date: null,
          dt_actual: null,
          bip_before: null,
          bip_after: null,
          feared_outcome_occurred: e.feared_outcome_occurred,
        })),
      },
    ],
  }
}

describe('deriveFearedOutcomes', () => {
  it('counts a completed experiment where the feared thing did not happen', () => {
    const result = deriveFearedOutcomes([
      situation([{ status: 'completed', feared_outcome_occurred: false }]),
    ])
    expect(result).toEqual({ checked: 1, didNotHappen: 1 })
  })

  it('counts one that did happen, without claiming it did not', () => {
    const result = deriveFearedOutcomes([
      situation([
        { status: 'completed', feared_outcome_occurred: false },
        { status: 'completed', feared_outcome_occurred: true },
      ]),
    ])
    expect(result).toEqual({ checked: 2, didNotHappen: 1 })
  })

  it('ignores a completed experiment where nothing was recorded', () => {
    const result = deriveFearedOutcomes([
      situation([
        { status: 'completed', feared_outcome_occurred: false },
        { status: 'completed', feared_outcome_occurred: null },
      ]),
    ])
    expect(result).toEqual({ checked: 1, didNotHappen: 1 })
  })

  it('ignores experiments the child never finished', () => {
    const result = deriveFearedOutcomes([
      situation([
        { status: 'committed', feared_outcome_occurred: false },
        { status: 'too_hard', feared_outcome_occurred: false },
        { status: 'planned', feared_outcome_occurred: null },
      ]),
    ])
    expect(result).toEqual({ checked: 0, didNotHappen: 0 })
  })

  it('is zero for a child with no ladder at all', () => {
    expect(deriveFearedOutcomes([])).toEqual({ checked: 0, didNotHappen: 0 })
  })
})
