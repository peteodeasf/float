import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const api = vi.hoisted(() => ({ updateAccommodation: vi.fn(), askChildToRate: vi.fn() }))
vi.mock('../../api/accommodations', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/accommodations')>()),
  updateAccommodation: api.updateAccommodation,
  askChildToRate: api.askChildToRate,
}))

import ParentPlanPanel from './ParentPlanPanel'

const acc = (id: string, name: string, status: string, focus = false) => ({
  id, name, status, is_weekly_focus: focus, treatment_plan_id: 'plan1', trigger_situation_id: null,
  parent_user_id: null, description: null, distress_min: 5, distress_max: 5, display_order: 0,
  accommodator: 'parent', created_at: '2026-09-01T00:00:00Z',
})

function open() {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['accommodations', 'plan1'], [
    acc('a1', 'Lies down with them at bedtime', 'started', true),
    acc('a2', "Answers for them at the doctor's", 'stopped'),
  ])
  qc.setQueryData(['accommodation-checkins', 'plan1'], [
    { id: 'k1', accommodation_id: 'a1', accommodation_name: 'Lies down with them at bedtime', parent_email: 'p@example.com', week_start: '2026-09-07', answer: 'gave_in', updated_at: null },
  ])
  qc.setQueryData(['parent-experiments', 'plan1'], [{
    id: 'x1', accommodation_id: 'a1', accommodation_name: 'Lies down with them at bedtime', status: 'recorded',
    set_up_in_session: false, scheduled_date: '2026-09-10T23:00:00Z', scheduled_time_bucket: 'evening',
    instead: 'Say goodnight and leave', prediction: "She'll cry for an hour", belief_before: 80, expected_fear: 8,
    readiness: 'medium', did_it: 'yes', what_happened: 'Ten minutes, then asleep', actual_fear: 5,
    prediction_happened: 'no', belief_after: 30, what_learned: 'She settles faster than I think',
    too_hard_reason: null, recorded_at: '2026-09-11T08:00:00Z', created_at: '2026-09-09T12:00:00Z',
  }])
  qc.setQueryData(['insights', 'pt1', 'accommodation'], [])
  render(
    <QueryClientProvider client={qc}>
      <ParentPlanPanel planId="plan1" patientId="pt1" triggers={[]} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  api.updateAccommodation.mockReset().mockResolvedValue({})
  api.askChildToRate.mockReset().mockResolvedValue([])
})

describe('where each accommodation has got to', () => {
  it('shows each one in its state', () => {
    open()
    expect(screen.getByLabelText('Where the parent is with “Lies down with them at bedtime”')).toHaveValue('started')
    expect(screen.getByLabelText("Where the parent is with “Answers for them at the doctor's”")).toHaveValue('stopped')
  })

  it("shows the parent's weekly answers", () => {
    open()
    expect(screen.getByText('Weekly check-ins')).toBeInTheDocument()
    expect(screen.getByText('Gave in')).toBeInTheDocument()
    expect(screen.getByText('Week of Sep 7')).toBeInTheDocument()
    // One parent answering, so who answered is not shown.
    expect(screen.queryByText(/p@example.com/)).not.toBeInTheDocument()
  })

  it("sends the unrated ones to the child's app", async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: "Send 2 to the child's app" }))
    await waitFor(() => expect(api.askChildToRate).toHaveBeenCalledWith('plan1'))
  })

  it("shows the parent's experiments: what they feared against what happened", () => {
    open()
    expect(screen.getByText("The parent's experiments")).toBeInTheDocument()
    expect(screen.getByText('Did it')).toBeInTheDocument()
    expect(screen.getByText(/Upset: expected 8, was 5 · belief 80% → 30%/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Set one up with the parent' })).toBeInTheDocument()
  })

  it('the clinician changes it on the row', () => {
    open()
    fireEvent.change(screen.getByLabelText('Where the parent is with “Lies down with them at bedtime”'), {
      target: { value: 'stopped' },
    })
    expect(api.updateAccommodation).toHaveBeenCalledWith('plan1', 'a1', { status: 'stopped' })
  })
})
