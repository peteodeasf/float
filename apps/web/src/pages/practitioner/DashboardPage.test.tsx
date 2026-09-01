// What the patient list says about each patient.
//
// The progress column is the reason these exist. Peter reported it stopped updating; it turned out
// step three can never complete, so every patient is stuck. That is written down here as a failing
// expectation rather than a note, so it cannot be quietly forgotten when the column is replaced by
// phases.

import { describe, expect, it } from 'vitest'

import { filterByPhase, needsAttentionReasons, phaseLabel, relativeActivityLabel } from './DashboardPage'
import type { Patient } from '../../api/patients'

/** A patient with nothing done. Each test turns on only what it is about. */
function patient(over: Partial<Patient> = {}): Patient {
  return {
    id: 'p1',
    name: 'Test Child',
    email: 'child@example.com',
    phone_number: null,
    created_at: '2026-01-01T00:00:00Z',
    last_activity_at: null,
    has_monitoring_form: false,
    situation_count: 0,
    has_consultation_1_note: false,
    has_parent_da: false,
    has_consultation_2_note: false,
    has_patient_da: false,
    has_active_situation_with_behaviors: false,
    plan_status: null,
    teen_invited: false,
    completed_experiment_count: 0,
    has_weekly_note: false,
    overdue_experiment_count: 0,
    active_plan_with_no_recent_activity: false,
    monitoring_entries_count: 0,
    monitoring_form_sent: false,
    checklist_checked_items: {},
    phase: 'new',
    phase_label: 'New',
    closed_at: null,
    ...over,
  } as Patient
}

describe('the phase column', () => {
  it('shows what the server said', () => {
    expect(phaseLabel(patient({ phase: 'monitoring', phase_label: 'Monitoring' }))).toBe('Monitoring')
  })

  it('does not recompute the phase in the browser', () => {
    // The old column was four conditions chained with `and` in this file, and one of them could
    // never become true — every patient sat at "Setup · Step 3 of 4" and nothing complained. The
    // phase is worked out on the server now, in one place, so the two cannot drift apart. This
    // test exists to stop anyone reintroducing the logic here: a patient whose facts look early
    // still reads whatever the server said.
    const p = patient({
      phase: 'in_treatment',
      phase_label: 'In treatment',
      has_monitoring_form: false,
      situation_count: 0,
    })
    expect(phaseLabel(p)).toBe('In treatment')
  })

  it('falls back to New rather than showing nothing', () => {
    expect(phaseLabel({ ...patient(), phase_label: undefined } as unknown as Patient)).toBe('New')
  })
})

describe('the phase filter', () => {
  const people = [
    patient({ id: 'a', phase: 'monitoring' }),
    patient({ id: 'b', phase: 'in_treatment' }),
    patient({ id: 'c', phase: 'closed' }),
  ]

  it('hides closed patients by default', () => {
    expect(filterByPhase(people, 'all').map(p => p.id)).toEqual(['a', 'b'])
  })

  it('shows closed patients when they are asked for', () => {
    expect(filterByPhase(people, 'closed').map(p => p.id)).toEqual(['c'])
  })

  it('shows one phase at a time', () => {
    expect(filterByPhase(people, 'in_treatment').map(p => p.id)).toEqual(['b'])
  })

  it('returns nothing rather than everything when a phase is empty', () => {
    expect(filterByPhase(people, 'planning')).toEqual([])
  })
})

describe('needs attention', () => {
  it('says nothing when there is nothing to say', () => {
    expect(needsAttentionReasons(patient())).toEqual([])
  })

  it('counts overdue experiments', () => {
    expect(needsAttentionReasons(patient({ overdue_experiment_count: 2 }))[0])
      .toContain('Overdue experiments (2)')
  })

  it('flags a monitoring form that has come back nearly empty', () => {
    const reasons = needsAttentionReasons(patient({
      monitoring_form_sent: true, monitoring_entries_count: 1,
    }))
    expect(reasons).toContain('Awaiting monitoring entries (1/3)')
  })

  it('does not nag once enough entries are in', () => {
    const reasons = needsAttentionReasons(patient({
      monitoring_form_sent: true, monitoring_entries_count: 3,
    }))
    expect(reasons.some(r => r.includes('Awaiting monitoring'))).toBe(false)
  })
})

describe('last activity', () => {
  it('says a dash when there has been none', () => {
    expect(relativeActivityLabel(null)).toBe('—')
  })

  it('says a dash rather than "Invalid Date" for nonsense', () => {
    expect(relativeActivityLabel('not a date')).toBe('—')
  })

  it('says Today for today', () => {
    expect(relativeActivityLabel(new Date().toISOString())).toBe('Today')
  })

  it('says Yesterday for yesterday', () => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    expect(relativeActivityLabel(d.toISOString())).toBe('Yesterday')
  })
})
