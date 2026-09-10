import { describe, it, expect } from 'vitest'
import {
  stepState, dueToday, comingUp, waitingOnChild, waitingCount, whenLabel,
  type LadderRung, type PendingExperiment,
} from './teenWork'

// Thursday 10 September 2026, 10:00 local.
const NOW = new Date(2026, 8, 10, 10, 0, 0)
const day = (d: number, h = 9) => new Date(2026, 8, d, h, 0, 0).toISOString()

const rung = (over: Partial<LadderRung> = {}): LadderRung => ({
  id: 'r1', name: 'Make eye contact with John', dt: 6, status: 'not_started',
  situation_name: 'Eye contact in the hall', is_recommended: false, experiments: [], ...over,
})
const exp = (over: Partial<PendingExperiment> = {}): PendingExperiment => ({
  id: 'e1', status: 'committed', scheduled_date: day(11), scheduled_time_bucket: 'morning',
  avoidance_behavior_id: 'r1', plan_description: null, ...over,
})

describe('stepState', () => {
  it('a mastered step is done, whatever else is pending', () => {
    expect(stepState(rung({ status: 'mastered' }), [exp()]).kind).toBe('done')
  })

  it('a committed exposure makes the step set up, carrying the soonest one', () => {
    const later = exp({ id: 'late', scheduled_date: day(14) })
    const sooner = exp({ id: 'soon', scheduled_date: day(11) })
    const s = stepState(rung(), [later, sooner])
    expect(s.kind).toBe('setup')
    expect(s.exp?.id).toBe('soon')
  })

  it('a planned exposure means the clinician started it and it waits on the child', () => {
    expect(stepState(rung(), [exp({ status: 'planned' })]).kind).toBe('started')
  })

  it("another step's exposure does not count", () => {
    expect(stepState(rung(), [exp({ avoidance_behavior_id: 'other' })]).kind).toBe('open')
  })

  it('an open step remembers how many times it has been done', () => {
    const s = stepState(rung({ status: 'in_progress', experiments: [
      { id: 'a', status: 'completed' }, { id: 'b', status: 'completed' }, { id: 'c', status: 'too_hard' },
    ] }), [])
    expect(s).toEqual({ kind: 'open', timesDone: 2 })
  })
})

describe('what is due', () => {
  const today = exp({ id: 'today', scheduled_date: day(10, 16) })
  const overdue = exp({ id: 'overdue', scheduled_date: day(8) })
  const tomorrow = exp({ id: 'tomorrow', scheduled_date: day(11) })
  const planned = exp({ id: 'planned', status: 'planned', scheduled_date: day(10) })

  it('today includes later today and earlier days not yet done, soonest first', () => {
    expect(dueToday([tomorrow, today, overdue, planned], NOW).map(e => e.id)).toEqual(['overdue', 'today'])
  })

  it('coming up is committed and from tomorrow on', () => {
    expect(comingUp([tomorrow, today, planned], NOW).map(e => e.id)).toEqual(['tomorrow'])
  })

  it('waiting on the child is what the clinician started', () => {
    expect(waitingOnChild([tomorrow, planned]).map(e => e.id)).toEqual(['planned'])
  })

  it('the Progress dot counts what is due today and what waits on them', () => {
    expect(waitingCount([tomorrow, today, planned], NOW)).toBe(2)
    expect(waitingCount([tomorrow], NOW)).toBe(0)
  })
})

describe('whenLabel', () => {
  it('says Today for today', () => {
    expect(whenLabel(exp({ scheduled_date: day(10, 16), scheduled_time_bucket: 'afternoon' }), NOW)).toBe('Today · Afternoon')
  })
  it('names the weekday and date otherwise', () => {
    expect(whenLabel(exp({ scheduled_date: day(11) }), NOW)).toBe('Fri 11 · Morning')
  })
  it('leaves the time off when none was picked', () => {
    expect(whenLabel(exp({ scheduled_date: day(11), scheduled_time_bucket: null }), NOW)).toBe('Fri 11')
  })
  it('says so when there is no day yet', () => {
    expect(whenLabel(exp({ scheduled_date: null }), NOW)).toBe('No day yet')
  })
})
