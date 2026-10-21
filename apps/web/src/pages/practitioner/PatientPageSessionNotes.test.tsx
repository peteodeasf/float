import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// No backend here: every request answers "nothing", and the page's data is seeded below.
vi.mock('../../api/client', async importOriginal => {
  const real = await importOriginal<typeof import('../../api/client')>()
  const empty = vi.fn(async () => ({ data: null }))
  return { ...real, apiClient: { get: empty, post: empty, put: empty, patch: empty, delete: empty } }
})

// The nav needs a signed-in clinician; it is not what this test is about.
vi.mock('../../components/ui/PractitionerNav', () => ({ default: () => null }))

import PatientPage from './PatientPage'

const NOTE_TEXT = 'What was covered\nChecked in about the week.\n\nTo follow up\nTry the cafeteria again.'

function openSessionsTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['patient', 'pt1'], { id: 'pt1', name: 'Sam Rivera', closed_at: null })
  qc.setQueryData(['parents', 'pt1'], [])
  qc.setQueryData(['recordings', 'pt1'], [])
  qc.setQueryData(['session-notes', 'pt1'], [{
    id: 'n1', patient_id: 'pt1', organization_id: 'o1', practitioner_id: 'pr1', session_type: null,
    participants: ['patient'], tags: ['Weekly'], session_date: '2026-10-21', content: NOTE_TEXT,
    created_at: '2026-10-21T00:00:00Z', updated_at: '2026-10-21T00:00:00Z',
  }])
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/patients/pt1?tab=sessions']}>
        <Routes><Route path="/patients/:patientId" element={<PatientPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// The note body keeps its line breaks only when the note is open.
const noteIsOpen = (body: HTMLElement) => body.style.whiteSpace === 'pre-wrap'

describe('Session note chips', () => {
  // Peter, issue #59: clicking the name or tag chip on a note ("Ginger", "Weekly") opened and
  // closed the note. They are labels, so a click on one must leave the note as it is.
  it.each(['Sam', 'Weekly'])('clicking the %s chip does not open the note', async chip => {
    openSessionsTab()
    const body = await screen.findByText((_, el) => el?.tagName === 'P' && el.textContent === NOTE_TEXT)
    expect(noteIsOpen(body)).toBe(false)
    const chips = Array.from(screen.getByTestId('note-chips').children) as HTMLElement[]
    fireEvent.click(chips.find(c => c.textContent?.endsWith(chip))!)
    expect(noteIsOpen(body)).toBe(false)
  })

  // The rest of the card still opens the note, so the fix above did not just switch opening off.
  it('clicking the note text still opens it', async () => {
    openSessionsTab()
    const body = await screen.findByText((_, el) => el?.tagName === 'P' && el.textContent === NOTE_TEXT)
    fireEvent.click(body)
    expect(noteIsOpen(body)).toBe(true)
  })
})
