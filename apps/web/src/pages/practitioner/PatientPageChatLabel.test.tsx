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

function openChat() {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['patient', 'pt1'], { id: 'pt1', name: 'Sam Rivera', closed_at: null })
  qc.setQueryData(['plan', 'pt1'], { id: 'plan1', patient_id: 'pt1', status: 'setup', nickname: null })
  qc.setQueryData(['parents', 'pt1'], [{ parent_user_id: 'par1', email: 'mom@example.com' }])
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/patients/pt1?tab=chat']}>
        <Routes><Route path="/patients/:patientId" element={<PatientPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// Peter, issue #79: the teen's chat header said "TEEN ONLY". Only the teen is in that chat, so
// the clinician already knows who it is with. The parent label stays: with two parents, it says
// the other parent does not see the thread.
describe('Chat header label', () => {
  it('has no "Teen only" label on the teen thread', async () => {
    openChat()
    await screen.findAllByText('Sam Rivera')
    expect(screen.queryByText(/teen only/i)).toBeNull()
  })

  it('keeps the "This parent only" label on a parent thread', async () => {
    openChat()
    fireEvent.click(await screen.findByRole('button', { name: /mom@example\.com/ }))
    expect(await screen.findByText('THIS PARENT ONLY')).toBeTruthy()
  })
})
