import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// No backend here: every request answers "nothing" except the analyze call, set per test.
const { post, analyze } = vi.hoisted(() => {
  const analyze = vi.fn()
  const post = vi.fn(async (url: string) => url.endsWith('/analyze') ? analyze(url) : { data: null })
  return { post, analyze }
})
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

function openSessionsTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['patient', 'pt1'], { id: 'pt1', name: 'Sam Rivera', closed_at: null })
  qc.setQueryData(['parents', 'pt1'], [])
  qc.setQueryData(['recordings', 'pt1'], [])
  qc.setQueryData(['session-notes', 'pt1'], [note('n1', 'Approved note.'), note('n2', 'Draft note.', true)])
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/patients/pt1?tab=sessions']}>
        <Routes><Route path="/patients/:patientId" element={<PatientPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => { post.mockClear(); analyze.mockReset() })

// Peter, 2026-10-21: "Analyze session with AI" works on an approved note, sits where the clinician
// can see which note it applies to, says "Analyzing…" while it runs and gives a plain error if it
// fails. It replaced a disabled "Coming soon" placeholder.
describe('Analyze session with AI', () => {
  it('is on approved notes only, and the placeholder is gone', async () => {
    openSessionsTab()
    await screen.findByText('Approved note.')
    expect(screen.getAllByRole('button', { name: 'Analyze session with AI' })).toHaveLength(1)
    expect(screen.queryByText(/Coming soon/)).toBeNull()
  })

  it('analyzes that note and says so while it runs', async () => {
    let finish: (v: unknown) => void = () => {}
    analyze.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    openSessionsTab()
    fireEvent.click(await screen.findByRole('button', { name: 'Analyze session with AI' }))

    expect(analyze).toHaveBeenCalledWith('/notes/n1/analyze')
    expect(await screen.findByRole('button', { name: 'Analyzing…' })).toBeTruthy()

    finish({ data: {
      situations: [], parental_responses: [], safety_behaviors: [], treatment_targets: [],
      safety_section_label: 'Safety & avoidance behaviors',
      session_additions: [{ session_note_id: 'n1', session_date: '2026-10-15', analyzed_at: '2026-10-21T12:00:00Z',
        situations: [], parental_responses: [], safety_behaviors: [], comments: [], notes: [] }],
    } })
    expect(await screen.findByText(/Added to the Case Summary/)).toBeTruthy()
  })

  it('shows a plain error when it fails', async () => {
    analyze.mockRejectedValue({ response: { data: { detail: 'The AI could not analyze this session. Please try again.' } } })
    openSessionsTab()
    fireEvent.click(await screen.findByRole('button', { name: 'Analyze session with AI' }))
    expect((await screen.findByRole('alert')).textContent).toBe('The AI could not analyze this session. Please try again.')
  })
})
