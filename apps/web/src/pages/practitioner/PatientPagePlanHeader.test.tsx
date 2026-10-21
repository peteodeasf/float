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

function openPlanTab(status: 'setup' | 'active') {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['patient', 'pt1'], { id: 'pt1', name: 'Sam Rivera', closed_at: null })
  qc.setQueryData(['plan', 'pt1'], { id: 'plan1', patient_id: 'pt1', status, nickname: null })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/patients/pt1?tab=plan']}>
        <Routes><Route path="/patients/:patientId" element={<PatientPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Treatment Plan header', () => {
  // Peter, issue #48: the "setup" tag beside "Treatment Plan" made no sense to clinicians, so it
  // was removed. This keeps it from coming back, for either plan status.
  it.each(['setup', 'active'] as const)('shows no %s tag beside the title', async status => {
    openPlanTab(status)
    const title = await screen.findByText('Treatment Plan')
    const pieces = Array.from(title.parentElement!.children, el => el.textContent?.trim().toLowerCase())
    expect(pieces).not.toContain(status)
  })
})
