import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import ParentProgressPage from './ParentProgressPage'
import type { ChildProgress } from '../../api/parent'

// No parent can be signed in here, so every query is seeded.
function open(progress: ChildProgress) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['parent-me'], { patient_name: 'Sam Child' })
  qc.setQueryData(['parent-progress'], progress)
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><ParentProgressPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("the parent's view of the child's progress", () => {
  it('says so when the clinician has not shared it', () => {
    open({ shared: false })
    expect(screen.getByText(/hasn't shared Sam's progress with you yet/)).toBeInTheDocument()
    expect(screen.queryByText("Sam's ladder")).not.toBeInTheDocument()
  })

  it('shows the ladder, what is planned and what is done', () => {
    open({
      shared: true,
      steps: [
        { id: 's1', name: 'Look up at John', fear_level: 3, situation_name: 'Hall', status: 'mastered', times_done: 2 },
        { id: 's2', name: 'Say hi to John', fear_level: 7, situation_name: 'Hall', status: 'in_progress', times_done: 1 },
      ],
      planned: [{ id: 'p1', step_name: 'Say hi to John', scheduled_date: null, scheduled_time_bucket: null, status: 'planned' }],
      done: [{ id: 'd1', step_name: 'Look up at John', done_on: '2026-09-09T15:00:00Z', outcome: 'too_hard' }],
    })
    expect(screen.getByText("Sam's ladder")).toBeInTheDocument()
    expect(screen.getByText('✓ Done')).toBeInTheDocument()
    expect(screen.getByText(/Started · done once/)).toBeInTheDocument()
    expect(screen.getByText('Day not picked yet')).toBeInTheDocument()
    expect(screen.getByText(/Felt too hard/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Progress' })).toHaveAttribute('aria-current', 'page')
  })
})
