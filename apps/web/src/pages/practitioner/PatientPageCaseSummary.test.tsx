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

function openTab(tab: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['patient', 'pt1'], { id: 'pt1', name: 'Sam Rivera', closed_at: null })
  qc.setQueryData(['plan', 'pt1'], { id: 'plan1', patient_id: 'pt1', status: 'setup', nickname: null })
  // The Chat tab lists each parent's thread; the empty mock above would answer null, not a list.
  qc.setQueryData(['parents', 'pt1'], [])
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/patients/pt1?tab=${tab}`]}>
        <Routes><Route path="/patients/:patientId" element={<PatientPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Peter, issue #54: the Case Summary was in two places, under Monitoring and under Plan. It is one
// tab now, beside Monitoring, Sessions, Plan, Progress and Chat. These keep a second copy from
// coming back.
describe('Case Summary', () => {
  it('opens as its own tab', async () => {
    openTab('summary')
    expect(await screen.findByRole('heading', { name: 'Case Summary' })).toBeTruthy()
  })

  it.each(['monitoring', 'sessions', 'plan', 'progress', 'chat'])(
    'has one tab button and no second copy on the %s tab',
    async tab => {
      openTab(tab)
      await screen.findAllByText('Sam Rivera')
      expect(screen.getAllByRole('button', { name: 'Case Summary' })).toHaveLength(1)
      expect(screen.queryByRole('heading', { name: 'Case Summary' })).toBeNull()
    },
  )
})
