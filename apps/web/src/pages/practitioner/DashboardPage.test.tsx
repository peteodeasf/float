// What the patient list says about each patient.
//
// The progress column is the reason these exist. Peter reported it stopped updating; it turned out
// step three can never complete, so every patient is stuck. That is written down here as a failing
// expectation rather than a note, so it cannot be quietly forgotten when the column is replaced by
// phases.

import { describe, expect, it } from 'vitest'

import { computeProgress, needsAttentionReasons, relativeActivityLabel } from './DashboardPage'
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
    ...over,
  } as Patient
}

describe('the progress column', () => {
  it('starts at the first setup step', () => {
    expect(computeProgress(patient()).label).toContain('Step 1')
  })

  it('moves on once a monitoring form has been sent', () => {
    expect(computeProgress(patient({ has_monitoring_form: true })).label).toContain('Step 2')
  })

  it('IS STUCK at step 3, which is the bug Peter reported', () => {
    // Step 3 is `has_consultation_1_note && has_parent_da`. has_parent_da needs a downward arrow
    // recorded as facilitated by a PARENT — and nothing in the app ever creates one. Every path
    // writes 'practitioner'. So a clinician can do everything and the column never moves past here.
    const doneEverythingPossible = patient({
      has_monitoring_form: true,
      situation_count: 3,
      has_consultation_1_note: true,
      has_consultation_2_note: true,
      has_patient_da: true,
      has_active_situation_with_behaviors: true,
      plan_status: 'active',
      completed_experiment_count: 12,
      has_parent_da: false, // the flag nothing sets
    })

    expect(computeProgress(doneEverythingPossible).label).toContain('Step 3')
    expect(computeProgress(doneEverythingPossible).label).not.toContain('In treatment')
  })

  it('would reach treatment if that flag were ever set', () => {
    const p = patient({
      has_monitoring_form: true,
      situation_count: 1,
      has_consultation_1_note: true,
      has_parent_da: true,
      has_consultation_2_note: true,
      has_patient_da: true,
      has_active_situation_with_behaviors: true,
      plan_status: 'active',
    })
    expect(computeProgress(p).label).toBe('In treatment')
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
