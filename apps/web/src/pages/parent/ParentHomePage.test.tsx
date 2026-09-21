import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

// No parent can be signed in here, so their identity is stubbed, every query is seeded, and the
// note save is recorded rather than sent.
vi.mock('../../context/ParentAuthContext', () => ({ useParentAuth: () => ({ logout: vi.fn() }) }))
const api = vi.hoisted(() => ({ createAccommodationNote: vi.fn() }))
vi.mock('../../api/parent', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/parent')>()),
  createAccommodationNote: api.createAccommodationNote,
}))

import ParentHomePage from './ParentHomePage'

const EXPOSURE = {
  id: 'e1', situation_id: 's1', situation_name: 'Attending social events with peers',
  behavior_name: 'Stand at the edge of a group of peers', scheduled_date: '2026-09-25T15:00:00Z',
  scheduled_time_bucket: 'afternoon', status: 'committed',
}
const ACCS = [
  { id: 'a1', name: "I tell him he doesn't have to go", trigger_situation_id: 's1', fear_min: 6, fear_max: 8, status: 'started', display_order: 0 },
  { id: 'a2', name: 'I stay right next to him', trigger_situation_id: 's1', fear_min: 4, fear_max: 6, status: 'not_started', display_order: 1 },
  { id: 'a3', name: 'Something in another situation', trigger_situation_id: 's2', fear_min: 3, fear_max: 3, status: 'not_started', display_order: 0 },
]

function open({ shared = true, exposures = [EXPOSURE], accommodations = ACCS }: {
  shared?: boolean; exposures?: unknown[]; accommodations?: unknown[]
} = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['parent-me'], { patient_name: 'Leo Bennett' })
  qc.setQueryData(['parent-upcoming'], exposures)
  qc.setQueryData(['parent-progress'], { shared })
  qc.setQueryData(['parent-accommodations'], accommodations)
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><ParentHomePage /></MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  api.createAccommodationNote.mockReset().mockResolvedValue({})
})

describe('the parent home, reoriented around the child', () => {
  it("shows the child's exposure with its situation's accommodations, hardest first", () => {
    open()
    expect(screen.getByText('Stand at the edge of a group of peers')).toBeInTheDocument()
    expect(screen.getByText('Your accommodation behaviors')).toBeInTheDocument()
    // Both accommodations for s1 show; the one from s2 does not.
    expect(screen.getByText("I tell him he doesn't have to go")).toBeInTheDocument()
    expect(screen.getByText('I stay right next to him')).toBeInTheDocument()
    expect(screen.queryByText('Something in another situation')).not.toBeInTheDocument()
    // Ranked by fear range, highest first: the 6–8 one comes before the 4–6 one.
    const harder = screen.getByText("I tell him he doesn't have to go")
    const easier = screen.getByText('I stay right next to him')
    expect(harder.compareDocumentPosition(easier) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // The fear-range chips show.
    expect(screen.getByText('6–8')).toBeInTheDocument()
    expect(screen.getByText('4–6')).toBeInTheDocument()
  })

  it('has no weekly check-in and no experiments on Home', () => {
    open()
    expect(screen.queryByText('This week, did you hold the line?')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Plan an experiment' })).not.toBeInTheDocument()
  })

  it('"How did it go?" opens a note and saves it for that accommodation', async () => {
    open()
    fireEvent.click(screen.getAllByRole('button', { name: /How did it go/ })[0])
    fireEvent.change(screen.getByPlaceholderText('How did it go this time?'), { target: { value: 'Held the line, he was upset but went.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.createAccommodationNote).toHaveBeenCalledWith('a1', 'Held the line, he was upset but went.'))
  })

  it("tells the parent when the clinician hasn't shared the plan", () => {
    open({ shared: false })
    expect(screen.getByText(/hasn't shared Leo's plan/)).toBeInTheDocument()
    expect(screen.queryByText('Your accommodation behaviors')).not.toBeInTheDocument()
  })
})
