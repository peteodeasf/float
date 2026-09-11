import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

// No parent can be signed in here, so their identity is stubbed, every query is seeded, and the
// save is recorded rather than sent.
vi.mock('../../context/ParentAuthContext', () => ({ useParentAuth: () => ({ logout: vi.fn() }) }))
const api = vi.hoisted(() => ({ saveCheckin: vi.fn() }))
vi.mock('../../api/parent', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/parent')>()),
  saveCheckin: api.saveCheckin,
}))

import ParentHomePage from './ParentHomePage'
import { weekStartOf } from '../../lib/checkin'

const FOCUS = {
  id: 'a1', name: 'Lies down with them at bedtime', description: null, trigger_situation_id: null,
  distress_min: 6, distress_max: 6, display_order: 0, is_weekly_focus: true,
}

function open(checkins: unknown[] = [], experiments: unknown[] = [], accommodations: unknown[] = [FOCUS]) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['parent-me'], { patient_name: 'Sam Child' })
  qc.setQueryData(['parent-upcoming'], [])
  qc.setQueryData(['parent-progress'], { shared: false })
  qc.setQueryData(['parent-accommodations'], accommodations)
  qc.setQueryData(['parent-checkins'], checkins)
  qc.setQueryData(['parent-experiments'], experiments)
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><ParentHomePage /></MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  api.saveCheckin.mockReset().mockResolvedValue({})
})

describe("the parent's weekly check-in", () => {
  it('asks once a week, with three answers of equal weight, and no per-moment buttons', () => {
    open()
    expect(screen.getByText('This week, did you hold the line?')).toBeInTheDocument()
    for (const label of ['Every time', 'Mostly', 'I gave in']) {
      expect(screen.getByRole('button', { name: label })).toHaveClass('teen-btn--outline')
    }
    expect(screen.queryByRole('button', { name: 'I held the line' })).not.toBeInTheDocument()
    expect(screen.queryByText('Did it just come up?')).not.toBeInTheDocument()
  })

  it("saves the answer for this week's Monday", async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Mostly' }))
    // The save runs after the click returns, so wait for it.
    await waitFor(() => expect(api.saveCheckin).toHaveBeenCalledWith({
      accommodation_id: 'a1', answer: 'mostly', week_start: weekStartOf(new Date()),
    }))
  })

  it("shows this week's answer, and it can be changed", () => {
    open([{ id: 'k1', accommodation_id: 'a1', accommodation_name: FOCUS.name,
            week_start: weekStartOf(new Date()), answer: 'mostly', updated_at: null }])
    expect(screen.getByText(/You mostly held the line this week/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByRole('button', { name: 'Mostly' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('asks about each focus, on its own card, when there is more than one', async () => {
    const OTHER = { ...FOCUS, id: 'a2', name: "Answers for them at the doctor's", display_order: 1 }
    open([{ id: 'k1', accommodation_id: 'a1', accommodation_name: FOCUS.name,
            week_start: weekStartOf(new Date()), answer: 'mostly', updated_at: null }], [], [FOCUS, OTHER])
    expect(screen.getByRole('heading', { name: FOCUS.name })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: OTHER.name })).toBeInTheDocument()
    // The first is answered this week; the second still asks.
    expect(screen.getByText(/You mostly held the line this week/)).toBeInTheDocument()
    expect(screen.getAllByText('This week, did you hold the line?')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Every time' }))
    await waitFor(() => expect(api.saveCheckin).toHaveBeenCalledWith({
      accommodation_id: 'a2', answer: 'every_time', week_start: weekStartOf(new Date()),
    }))
  })

  it("shows the child's own rating when the clinician has chosen to", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
    qc.setQueryData(['parent-me'], { patient_name: 'Sam Child' })
    qc.setQueryData(['parent-upcoming'], [])
    qc.setQueryData(['parent-progress'], { shared: false })
    qc.setQueryData(['parent-accommodations'], [{ ...FOCUS, child_rating_min: 5, child_rating_max: 9 }])
    qc.setQueryData(['parent-checkins'], [])
    qc.setQueryData(['parent-experiments'], [])
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter><ParentHomePage /></MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByText('Sam said stopping would be a 5–9.')).toBeInTheDocument()
  })

  it("last week's answer does not count as this week's", () => {
    const lastWeek = new Date()
    lastWeek.setDate(lastWeek.getDate() - 7)
    open([{ id: 'k0', accommodation_id: 'a1', accommodation_name: FOCUS.name,
            week_start: weekStartOf(lastWeek), answer: 'every_time', updated_at: null }])
    expect(screen.getByText('This week, did you hold the line?')).toBeInTheDocument()
  })

  it('lists the experiments coming up, with a way to say how each went', () => {
    open([], [{ id: 'x1', accommodation_id: 'a1', accommodation_name: 'Lies down with them at bedtime', status: 'planned',
      set_up_in_session: false, scheduled_date: new Date().toISOString(), scheduled_time_bucket: 'evening', instead: null,
      prediction: 'She will cry', belief_before: 80, expected_fear: 8, readiness: null, did_it: null, what_happened: null,
      actual_fear: null, prediction_happened: null, belief_after: null, what_learned: null, too_hard_reason: null,
      recorded_at: null, created_at: null }])
    expect(screen.getByText('Your experiments')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'How did it go?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Plan an experiment' })).toBeInTheDocument()
  })
})
