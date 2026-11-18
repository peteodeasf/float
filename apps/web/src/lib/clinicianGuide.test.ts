import { describe, it, expect } from 'vitest'
import { guideFor, type GuideInput } from './clinicianGuide'

// docs/plans/clinician-guide.md. These test where the guide places a patient and what it picks
// out of their data, not the wording, which is draft content.

const base: GuideInput = {
  childName: 'Sam Rivera', phase: null, monitoringSent: true, monitoringEntries: 9, hasCaseSummary: true,
  summarySituations: [{ name: 'School drop-off', fear: 7 }, { name: 'Ordering at a restaurant', fear: 5 }],
  summaryBehaviors: 3, parentResponses: ['Writes out his plan for the day'],
  ladderSituations: [
    { name: 'School drop-off', fear: 7, fearedOutcome: null },
    { name: 'Ordering at a restaurant', fear: 5, fearedOutcome: 'He will be laughed at' },
  ],
  rungs: 0, nickname: null, exposuresDone: 0, entries: [],
}

describe('where the guide places a patient', () => {
  it('before the first meeting while there is no Case Summary', () => {
    const g = guideFor({ ...base, hasCaseSummary: false, monitoringEntries: 1 })
    expect(g.stage).toBe('before')
    expect(g.next.title).toMatch(/at least 3/)
  })

  it('tells the clinician to send monitoring when it has not been sent', () => {
    expect(guideFor({ ...base, hasCaseSummary: false, monitoringSent: false }).next.title).toMatch(/Send the monitoring/)
  })

  it('in part 1 of the parent meeting until every situation has a feared outcome', () => {
    const g = guideFor(base)
    expect([g.stage, g.part]).toEqual(['parent_meeting', 1])
    expect(g.goals.map(x => x.state)).toEqual(['done', 'done', 'done', 'todo'])
    expect(g.next.title).toBe('Find what Sam fears will happen: school drop-off')
  })

  it('in part 2 once part 1 is done, whether in the same meeting or a second one', () => {
    const g = guideFor({ ...base, ladderSituations: base.ladderSituations.map(s => ({ ...s, fearedOutcome: 'x' })) })
    expect([g.stage, g.part]).toEqual(['parent_meeting', 2])
  })

  it('moves on as the work is done: nickname, rungs, exposures, maintenance', () => {
    expect(guideFor({ ...base, nickname: 'Worry Bug' }).stage).toBe('parent_child')
    expect(guideFor({ ...base, nickname: 'Worry Bug', rungs: 3 }).stage).toBe('child_first')
    expect(guideFor({ ...base, rungs: 3, exposuresDone: 2 }).stage).toBe('weekly')
    expect(guideFor({ ...base, phase: 'maintenance', exposuresDone: 9 }).stage).toBe('ending')
  })
})

describe('examples from the patient', () => {
  it('picks out two parents who rated the same situation differently', () => {
    const g = guideFor({ ...base, entries: [
      { situation: 'School drop-off', who: 'Maria', fear: 8 },
      { situation: 'school drop-off ', who: 'Luis', fear: 6 },
    ] })
    const k = g.know.find(x => x.title.startsWith('When parents see it differently'))!
    expect(k.example).toBe('School drop-off: Maria rated it 8, Luis rated it 6.')
  })

  it('leaves the example out when the parents agree', () => {
    const g = guideFor({ ...base, entries: [
      { situation: 'School drop-off', who: 'Maria', fear: 7 },
      { situation: 'School drop-off', who: 'Luis', fear: 7 },
    ] })
    expect(g.know.find(x => x.title.startsWith('When parents see it differently'))!.example).toBeUndefined()
  })

  it("uses the patient's first name", () => {
    expect(guideFor(base).goals[1].title).toBe("Sam's behaviors in each situation")
  })
})
