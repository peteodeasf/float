import { describe, it, expect } from 'vitest'
import type { ActionPlan, ActionPlanItem } from '../api/action_plans'
import type { PlannedExperiment } from '../api/treatment'
import { attemptOf, columnsFor, countsOf, exposureRungs, planForDay, planToShow } from './planProgress'

const at = (day: string, hour = 19) => new Date(`${day}T${String(hour).padStart(2, '0')}:00:00`).toISOString()

const exp = (over: Partial<PlannedExperiment>): PlannedExperiment => ({
  id: Math.random().toString(36).slice(2), ladder_rung_id: null, avoidance_behavior_id: 'r1', status: 'committed',
  scheduled_date: null, completed_date: null, plan_description: null, confidence_level: 'high',
  bip_before: null, bip_after: null, distress_thermometer_expected: null, distress_thermometer_actual: null,
  feared_outcome_occurred: null, what_learned: null, behavior_name: null, situation_name: null,
  trigger_situation_id: null, created_at: '2026-11-01T00:00:00Z', ...over,
})

const item = (over: Partial<ActionPlanItem>): ActionPlanItem => ({
  id: Math.random().toString(36).slice(2), kind: 'exposure', label: 'Eat lunch', note: null, reward_for: null,
  done: false, done_by: null, done_at: null, avoidance_behavior_id: 'r1', rung_name: 'Eat lunch in the cafeteria', ...over,
})

const plan = (id: string, starts_on: string, ends_on: string, state: ActionPlan['state'], items: ActionPlanItem[] = [item({})]): ActionPlan =>
  ({ id, patient_id: 'p', session_number: 1, starts_on, ends_on, state, done_count: 0, items })

const TODAY = '2026-12-04'
const FIRST = plan('a', '2026-11-13', '2026-11-27', 'closed')
const NOW = plan('b', '2026-11-27', '2026-12-11', 'current')
const DRAFT = plan('c', '2026-12-11', '2026-12-25', 'draft')
const PLANS = [NOW, FIRST, DRAFT]

describe('each day of an exposure', () => {
  it('is done, too hard, not done or coming up', () => {
    expect(attemptOf(exp({ status: 'completed', completed_date: at('2026-12-01') }), TODAY)).toBe('done')
    expect(attemptOf(exp({ status: 'too_hard', too_hard_at: at('2026-12-02') }), TODAY)).toBe('hard')
    expect(attemptOf(exp({ scheduled_date: at('2026-12-03') }), TODAY)).toBe('missed')
    expect(attemptOf(exp({ scheduled_date: at('2026-12-04') }), TODAY)).toBe('soon')
    // Set up with no day and not done yet: no column.
    expect(attemptOf(exp({}), TODAY)).toBeNull()
  })

  it('belongs to the newer plan on the day one ends and the next starts, and never to a draft', () => {
    expect(planForDay('2026-11-27', PLANS)?.id).toBe('b')
    expect(planForDay('2026-11-20', PLANS)?.id).toBe('a')
    expect(planForDay('2026-12-20', PLANS)).toBeNull()
  })
})

describe('an exposure on a plan', () => {
  const exps = [
    exp({ status: 'completed', scheduled_date: at('2026-11-30'), completed_date: at('2026-11-30') }),
    exp({ scheduled_date: at('2026-12-01') }),
    exp({ status: 'too_hard', scheduled_date: at('2026-12-02'), too_hard_at: at('2026-12-02', 18), too_hard_reason: 'Too many people' }),
    exp({ status: 'completed', completed_date: at('2026-12-03') }),
    exp({ scheduled_date: at('2026-12-07') }),
    exp({ status: 'completed', completed_date: at('2026-11-20') }), // the earlier plan
    exp({ avoidance_behavior_id: 'r2', status: 'completed', completed_date: at('2026-12-01') }), // another rung
  ]

  it('has a column per day in the plan, in order', () => {
    const cols = columnsFor('r1', NOW, PLANS, exps, TODAY)
    expect(cols.map(c => [c.day, c.attempt])).toEqual([
      ['2026-11-30', 'done'], ['2026-12-01', 'missed'], ['2026-12-02', 'hard'], ['2026-12-03', 'done'], ['2026-12-07', 'soon'],
    ])
  })

  it('counts tried as done plus too hard, out of the days that have passed', () => {
    expect(countsOf(columnsFor('r1', NOW, PLANS, exps, TODAY))).toEqual({ tried: 3, done: 2, hard: 1, missed: 1, of: 4 })
  })
})

describe('which plans', () => {
  it('opens on the plan running now', () => {
    expect(planToShow(PLANS)?.id).toBe('b')
    expect(planToShow([FIRST])?.id).toBe('a')
  })

  it('lists every exposure on a shared plan once, drafts left out', () => {
    const later = plan('d', '2026-12-11', '2026-12-25', 'upcoming', [item({}), item({ avoidance_behavior_id: 'r2', rung_name: 'Say hi' })])
    const draftOnly = plan('e', '2026-12-25', '2027-01-08', 'draft', [item({ avoidance_behavior_id: 'r3', rung_name: 'Draft only' })])
    expect(exposureRungs([FIRST, NOW, later, draftOnly])).toEqual([
      { id: 'r1', name: 'Eat lunch in the cafeteria' }, { id: 'r2', name: 'Say hi' },
    ])
  })
})
