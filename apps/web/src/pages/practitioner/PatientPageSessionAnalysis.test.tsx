import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// No backend here: every request answers "nothing".
const { post } = vi.hoisted(() => ({ post: vi.fn(async () => ({ data: null })) }))
vi.mock('../../api/client', async importOriginal => {
  const real = await importOriginal<typeof import('../../api/client')>()
  const empty = vi.fn(async () => ({ data: null }))
  return { ...real, apiClient: { get: empty, post, put: empty, patch: empty, delete: empty } }
})

// The nav needs a signed-in clinician; it is not what this test is about.
vi.mock('../../components/ui/PractitionerNav', () => ({ default: () => null }))

import PatientPage from './PatientPage'

const note = (id: string, content: string, is_draft = false) => ({
  id, patient_id: 'pt1', organization_id: 'o1', practitioner_id: 'pr1', session_type: null,
  participants: ['patient'], tags: [], session_date: '2026-10-15', content, is_draft,
  created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-15T00:00:00Z',
})

function openSessionsTab(report: unknown = null, tab = 'sessions') {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['patient', 'pt1'], { id: 'pt1', name: 'Sam Rivera', closed_at: null })
  qc.setQueryData(['parents', 'pt1'], [])
  qc.setQueryData(['recordings', 'pt1'], [])
  qc.setQueryData(['session-notes', 'pt1'], [note('n1', 'Approved note.'), note('n2', 'Draft note.', true)])
  if (report) qc.setQueryData(['formulation', 'pt1'], { id: 'f1', preliminary_report: report })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/patients/pt1?tab=${tab}`]}>
        <Routes><Route path="/patients/:patientId" element={<PatientPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => { post.mockClear() })

// Changed 2026-11-18 (Peter): the case summary updates on its own when a note is saved or approved,
// so the "Analyze session with AI" button on each note is gone "for now". These replaced the
// 2026-10-21 tests of that button. docs/plans/case-summary-auto-refresh.md
describe('Session notes and the Case Summary', () => {
  it('has no analyze button on any note', async () => {
    openSessionsTab()
    await screen.findByText('Approved note.')
    expect(screen.queryByRole('button', { name: /Analyze/ })).toBeNull()
    expect(screen.queryByText(/Coming soon/)).toBeNull()
  })

  it('says when an approved note was added to the Case Summary', async () => {
    openSessionsTab({
      situations: [], parental_responses: [], safety_behaviors: [], treatment_targets: [],
      safety_section_label: 'Safety & avoidance behaviors',
      session_additions: [{ session_note_id: 'n1', session_date: '2026-10-15', analyzed_at: '2026-10-21T12:00:00Z',
        situations: [], parental_responses: [], safety_behaviors: [], comments: [], notes: [] }],
    })
    expect(await screen.findByText(/Added to the Case Summary Oct 21/)).toBeTruthy()
  })
})

describe('AI Refresh', () => {
  it('is what the Case Summary button is called', async () => {
    openSessionsTab(null, 'summary')
    expect(await screen.findByRole('button', { name: 'AI Refresh' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /analyze/i })).toBeNull()
    expect(screen.getByText(/updates automatically whenever a parent logs a new observation/)).toBeTruthy()
  })
})
