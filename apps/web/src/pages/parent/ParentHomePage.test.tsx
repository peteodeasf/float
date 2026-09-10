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

function open(checkins: unknown[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['parent-me'], { patient_name: 'Sam Child' })
  qc.setQueryData(['parent-upcoming'], [])
  qc.setQueryData(['parent-progress'], { shared: false })
  qc.setQueryData(['parent-accommodations'], [FOCUS])
  qc.setQueryData(['parent-checkins'], checkins)
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><ParentHomePage /></MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => api.saveCheckin.mockReset().mockResolvedValue({}))

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

  it("last week's answer does not count as this week's", () => {
    const lastWeek = new Date()
    lastWeek.setDate(lastWeek.getDate() - 7)
    open([{ id: 'k0', accommodation_id: 'a1', accommodation_name: FOCUS.name,
            week_start: weekStartOf(lastWeek), answer: 'every_time', updated_at: null }])
    expect(screen.getByText('This week, did you hold the line?')).toBeInTheDocument()
  })
})
