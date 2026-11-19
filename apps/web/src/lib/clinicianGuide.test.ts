import { describe, it, expect } from 'vitest'
import { guideFor, goalKey, movedOnKey, type GuideInput } from './clinicianGuide'

// docs/plans/clinician-guide.md. These test where the guide places a patient, which goals tick
// themselves, and what it picks out of their data, not the wording, which is a draft.

const base: GuideInput = {
  childName: 'Sam Rivera', phase: null, monitoringSent: true, monitoringEntries: 9, hasCaseSummary: true,
  summarySituations: [{ name: 'School drop-off', fear: 7 }, { name: 'Ordering at a restaurant', fear: 5 }],
  summaryBehaviors: 3, parentResponses: ['Writes out his plan for the day'],
  ladderSituations: [
    { name: 'School drop-off', fear: 7, fearedOutcome: null, behaviors: 2 },
    { name: 'Ordering at a restaurant', fear: 5, fearedOutcome: 'He will be laughed at', behaviors: 1 },
  ],
  rungs: 3, rungsRated: 0, nickname: null, exposuresPlanned: 0, exposuresDone: 0, highConfidence: false,
  accommodations: 0, accommodationsChildRated: 0, entries: [], ticks: {},
}
const partOneDone: GuideInput = { ...base, ladderSituations: base.ladderSituations.map(s => ({ ...s, fearedOutcome: 'x' })) }
const tickAll = (keys: string[]) => Object.fromEntries(keys.map(k => [k, true]))

describe('where the guide places a patient', () => {
  it('before the first meeting while there is no Case Summary', () => {
    const g = guideFor({ ...base, hasCaseSummary: false, monitoringEntries: 1 })
    expect(g.stage).toBe('before')
    expect(g.next.why).toMatch(/once there are 3/)
  })

  it('tells the clinician to send monitoring when it has not been sent', () => {
    expect(guideFor({ ...base, hasCaseSummary: false, monitoringSent: false }).next.title).toMatch(/Send the monitoring form/)
  })

  it('in part 1 of the parent meeting until every situation has a feared outcome', () => {
    const g = guideFor(base)
    expect([g.stage, g.part]).toEqual(['parent_meeting', 1])
    expect(g.goals.map(x => x.done)).toEqual([true, true, true, false])
    expect(g.next.title).toBe('Find what Sam fears will happen: school drop-off')
  })

  it('in part 2 once part 1 is done', () => {
    const g = guideFor(partOneDone)
    expect([g.stage, g.part]).toEqual(['parent_meeting', 2])
  })

  it('a ladder with rungs no longer skips ahead: rungs are behaviors, written in the parent meeting', () => {
    expect(guideFor({ ...partOneDone, rungs: 5, rungsRated: 5 }).stage).toBe('parent_meeting')
  })

  it('jumps ahead when later work shows in the data', () => {
    expect(guideFor({ ...base, nickname: 'Worry Bug' }).stage).toBe('parent_child')
    expect(guideFor({ ...base, exposuresPlanned: 1 }).stage).toBe('child_first')
    expect(guideFor({ ...base, exposuresPlanned: 2, exposuresDone: 1 }).stage).toBe('weekly')
    expect(guideFor({ ...base, phase: 'maintenance', exposuresDone: 9 }).stage).toBe('ending')
  })
})

describe('the clinician ticks what Float cannot see', () => {
  it('part 2 goals are ticked by the clinician, and all ticked moves the guide on', () => {
    const part2 = guideFor(partOneDone).goals
    expect(part2.every(g => g.byClinician)).toBe(true)
    const g = guideFor({ ...partOneDone, ticks: tickAll(part2.map(x => x.key)) })
    expect(g.stage).toBe('parent_child')
  })

  it('a tick saved under its key shows as done', () => {
    const key = goalKey('parent_meeting.2', 'cbt')
    const g = guideFor({ ...partOneDone, ticks: { [key]: true } })
    expect(g.goals.find(x => x.key === key)!.done).toBe(true)
  })

  it('the clinician can move on at any time, and unticked goals follow along', () => {
    const g = guideFor({ ...base, ticks: { [movedOnKey('parent_meeting.1')]: true } })
    expect([g.stage, g.part]).toEqual(['parent_meeting', 2])
    expect(g.movedOnFrom).toBe(movedOnKey('parent_meeting.1'))
    expect(g.earlier.map(x => [x.from, x.title])).toEqual([['Parent meeting, part 1', 'Find what Sam fears will happen']])
  })

  it('does not list goals from stages the data skipped past', () => {
    const g = guideFor({ ...partOneDone, nickname: 'Worry Bug', exposuresPlanned: 2, exposuresDone: 1 })
    expect(g.stage).toBe('weekly')
    expect(g.earlier).toEqual([])
  })

  it('offers Go back only when it would take the guide back', () => {
    const moved = { [movedOnKey('parent_meeting.1')]: true }
    expect(guideFor({ ...base, ticks: moved }).movedOnFrom).toBe(movedOnKey('parent_meeting.1'))
    // Part 1 is done by its goals anyway, so undoing the move-on changes nothing.
    expect(guideFor({ ...partOneDone, ticks: moved }).movedOnFrom).toBeUndefined()
  })

  it('weekly sessions repeat, so their structure is not ticked and there is no move-on', () => {
    const g = guideFor({ ...base, exposuresPlanned: 1, exposuresDone: 1 })
    expect(g.goals).toEqual([])
    expect(g.routine?.length).toBe(4)
    expect(g.moveOn).toBeUndefined()
  })
})

describe('the parent and child meeting', () => {
  const atSession2 = { ...base, nickname: null, ticks: { [movedOnKey('parent_meeting.1')]: true, [movedOnKey('parent_meeting.2')]: true } }

  it('the nickname ticks itself when it is saved on the plan', () => {
    const goal = (d: GuideInput) => guideFor(d).goals.find(g => g.key === goalKey('parent_child', 'nickname'))!
    expect(goal(atSession2).done).toBe(false)
    expect(goal({ ...atSession2, nickname: 'Worry Bug' }).done).toBe(true)
  })

  it('the child rating the accommodations shows only with accommodations, and does not hold the stage', () => {
    expect(guideFor(atSession2).goals.some(g => g.key.endsWith('accommodation-ratings'))).toBe(false)
    const d = { ...atSession2, nickname: 'Worry Bug', accommodations: 4, accommodationsChildRated: 1 }
    const rating = guideFor(d).goals.find(g => g.key.endsWith('accommodation-ratings'))!
    expect([rating.done, rating.canWait]).toEqual([false, true])
    const others = guideFor(d).goals.filter(g => g.byClinician).map(g => g.key)
    const after = guideFor({ ...d, ticks: { ...d.ticks, ...tickAll(others) } })
    expect(after.stage).toBe('child_first')
    expect(after.earlier.some(g => g.key.endsWith('accommodation-ratings'))).toBe(true)
  })
})

describe("the child's first session", () => {
  const atSession3 = { ...base, nickname: 'Worry Bug', exposuresPlanned: 1 }

  it('ticks rung Fear Levels, the first exposure and high confidence from the data', () => {
    const g = guideFor({ ...atSession3, rungsRated: 3, highConfidence: true })
    const byKey = (k: string) => g.goals.find(x => x.key === goalKey('child_first', k))!
    expect([byKey('rungs').done, byKey('first-exposure').done, byKey('confidence').done]).toEqual([true, true, true])
    expect(byKey('arrow').byClinician).toBe(true)
    expect(byKey('practice').byClinician).toBe(true)
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
    expect(guideFor(base).goals[1].title).toBe("Find Sam's behaviors in each situation")
  })
})
