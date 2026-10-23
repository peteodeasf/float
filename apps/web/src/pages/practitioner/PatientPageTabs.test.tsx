import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

function openPlan() {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['patient', 'pt1'], { id: 'pt1', name: 'Sam Rivera', closed_at: null })
  qc.setQueryData(['plan', 'pt1'], { id: 'plan1', patient_id: 'pt1', status: 'setup', nickname: null })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/patients/pt1?tab=plan']}>
        <Routes><Route path="/patients/:patientId" element={<PatientPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Peter, issue #78: the selected tab was hard to pick out, and the Plan tab's Ladder /
// Accommodations row looked exactly like the main tabs above it. These keep the two levels apart
// and the selected tab marked by more than bold text.
describe('Patient page tabs', () => {
  it('marks the selected main tab with a tint, not only bold text', async () => {
    openPlan()
    const plan = await screen.findByRole('button', { name: 'Plan' })
    expect(plan.getAttribute('aria-current')).toBe('page')
    expect(plan.style.background).toContain('--float-primary-mid')
    const sessions = screen.getByRole('button', { name: 'Sessions' })
    expect(sessions.getAttribute('aria-current')).toBeNull()
    // Left to the stylesheet, so its hover rule can apply.
    expect(sessions.style.background).toBe('')
  })

  it('draws the Plan sub-tabs differently from the main tabs', async () => {
    openPlan()
    const plan = await screen.findByRole('button', { name: 'Plan' })
    const ladder = screen.getByRole('button', { name: 'Ladder' })
    // A main tab is underlined; a sub-tab is a rounded chip with no underline.
    expect(plan.style.borderBottom).toContain('3px')
    expect(ladder.style.borderBottom).not.toContain('3px')
    expect(ladder.style.borderRadius).toContain('--float-radius-pill')
  })
})
