// Sally's co-design list, rendered with both groups.
//
// High school and college are separate sessions with separate people, and they need different
// columns: a college student has no parent and no permission status. These check that each group
// is shown under its own label, with only its own columns.

import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import CodesignSection, { type CodesignSignups } from './CodesignSection'

const list: CodesignSignups = {
  sessions: [{
    id: 'hs1', week: 1, label: 'Tuesday, November 10 at 12pm Eastern', seats: 6, taken: 1,
    signups: [{
      id: 'teen1', teen_first_name: 'Maya', teen_last_name: 'Rivera', teen_age: 15,
      teen_email: 'maya@example.com', parent_name: 'Ana Rivera', parent_email: 'ana@example.com',
      permission: 'waiting', permission_given_at: null, permission_given_by: null,
      form_submitted_at: null, recording_allowed: false, parent_relationship: null,
      parent_session_phone: null, parent_phone: null, parent_contact_email: null,
      hold_ends_at: '2026-11-05T17:00:00Z',
    }],
  }],
  college_sessions: [
    {
      id: 'c1', week: 1, label: 'Tuesday, November 10 at 12pm Eastern', seats: 6, taken: 1,
      signups: [{
        id: 'stu1', first_name: 'Jordan', last_name: 'Kim', age: 19, email: 'jordan@example.com',
        confirmed_at: '2026-11-03T15:00:00Z', recording_agreed: true,
      }],
    },
    { id: 'c2', week: 1, label: 'Wednesday, November 11 at 12pm Eastern', seats: 6, taken: 0, signups: [] },
  ],
}

async function shown() {
  render(<CodesignSection load={() => Promise.resolve(list)} />)
  return {
    highSchool: await screen.findByTestId('codesign-high-school'),
    college: await screen.findByTestId('codesign-college'),
  }
}

describe('CodesignSection', () => {
  it('shows each group under its own label, with its own people', async () => {
    const { highSchool, college } = await shown()
    expect(within(highSchool).getByText(/High school, ages 13 to 17/)).toBeInTheDocument()
    expect(within(college).getByText(/College, ages 18 to 20/)).toBeInTheDocument()
    expect(within(highSchool).getByText('Maya Rivera')).toBeInTheDocument()
    expect(within(highSchool).queryByText(/Jordan/)).not.toBeInTheDocument()
    expect(within(college).getByText('Jordan Kim')).toBeInTheDocument()
    expect(within(college).queryByText(/Maya/)).not.toBeInTheDocument()
  })

  it('shows college rows with student, age, email, date, confirmed and recording, and no parent', async () => {
    const { college } = await shown()
    const headers = within(college).getAllByRole('columnheader').map(h => h.textContent)
    expect(headers).toEqual(['Student', 'Age', 'Email', 'Confirmed', 'Recording agreed'])
    const row = within(college).getByText('Jordan Kim').closest('tr')!
    expect(within(row).getByText('19')).toBeInTheDocument()
    expect(within(row).getByText('jordan@example.com')).toBeInTheDocument()
    expect(within(row).getByText('Yes')).toBeInTheDocument()
    // The date is the heading above the table, with the seats.
    expect(within(college).getByText(/Tuesday, November 10 at 12pm Eastern/)).toBeInTheDocument()
    expect(within(college).getByText('No one yet.')).toBeInTheDocument()
    expect(within(college).queryByText(/Parent/)).not.toBeInTheDocument()
    expect(within(college).queryByText(/Waiting|permission/i)).not.toBeInTheDocument()
  })

  it('keeps the high school columns as they were', async () => {
    const { highSchool } = await shown()
    const headers = within(highSchool).getAllByRole('columnheader').map(h => h.textContent)
    expect(headers).toEqual(['Teen', 'Parent', 'Number during session', 'Status', 'Recording'])
    expect(within(highSchool).getByText(/Waiting · seats held until/)).toBeInTheDocument()
  })
})
