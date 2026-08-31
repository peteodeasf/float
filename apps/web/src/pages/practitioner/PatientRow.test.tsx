// A row on the patient list, rendered.
//
// The tests next door check the functions that decide what a row SAYS. These check that a rendered
// row actually shows it, and that clicking one opens the patient — the two things a plain function
// test cannot tell you.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { PatientRow } from './DashboardPage'
import type { Patient } from '../../api/patients'

function patient(over: Partial<Patient> = {}): Patient {
  return {
    id: 'p1',
    name: 'Jamie Smith',
    email: 'jamie@example.com',
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

/** A row is a <tr>, so it needs a table around it or React complains and the DOM is wrong. */
function renderRow(p: Patient, onClick = () => {}) {
  return render(
    <table><tbody><PatientRow patient={p} onClick={onClick} /></tbody></table>,
  )
}

describe('a row on the patient list', () => {
  it('shows the child by name', () => {
    renderRow(patient())
    expect(screen.getByText('Jamie Smith')).toBeInTheDocument()
  })

  it('shows where they are up to', () => {
    renderRow(patient({ has_monitoring_form: true }))
    expect(screen.getByText(/Step 2/)).toBeInTheDocument()
  })

  it('marks a child who needs attention', () => {
    renderRow(patient({ overdue_experiment_count: 3 }))

    const marker = screen.getByLabelText('Needs attention')
    expect(marker).toBeInTheDocument()
    // The REASON is only in the tooltip. A clinician scanning the list sees a coloured dot and has
    // to hover to find out why — worth revisiting in the patient list work, and asserted here so a
    // change to it is deliberate rather than accidental.
    expect(marker).toHaveAttribute('title', 'Overdue experiments (3)')
  })

  it('does not mark a child who does not', () => {
    renderRow(patient())
    expect(screen.queryByLabelText('Needs attention')).not.toBeInTheDocument()
  })

  it('opens the patient when the row is clicked', async () => {
    const onClick = vi.fn()
    renderRow(patient(), onClick)

    await userEvent.click(screen.getByText('Jamie Smith'))

    expect(onClick).toHaveBeenCalledOnce()
  })
})
