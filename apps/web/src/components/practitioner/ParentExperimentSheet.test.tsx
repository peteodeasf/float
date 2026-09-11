import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const api = vi.hoisted(() => ({ setUpParentExperimentInSession: vi.fn() }))
vi.mock('../../api/parentExperiments', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/parentExperiments')>()),
  setUpParentExperimentInSession: api.setUpParentExperimentInSession,
}))

import ParentExperimentSheet from './ParentExperimentSheet'
import type { Accommodation } from '../../api/accommodations'

const acc = (id: string, name: string, over: Partial<Accommodation> = {}): Accommodation => ({
  id, name, treatment_plan_id: 'plan1', trigger_situation_id: null, parent_user_id: null, description: null,
  distress_min: null, distress_max: null, display_order: 0, status: 'not_started', is_weekly_focus: false,
  accommodator: 'parent', created_at: '2026-09-01T00:00:00Z', ...over,
})

function open() {
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ParentExperimentSheet planId="plan1" onClose={onClose} accommodations={[
        acc('a2', "Answers for them at the doctor's"),
        acc('a1', 'Lies down with them until asleep', { is_weekly_focus: true, parent_estimate_min: 6, parent_estimate_max: 8 }),
      ]} />
    </QueryClientProvider>,
  )
  return { onClose }
}

beforeEach(() => {
  api.setUpParentExperimentInSession.mockReset().mockResolvedValue({})
})

describe('setting up a parent experiment in session', () => {
  it("asks the parent app's questions on one sheet, the focus first, and saves", async () => {
    const { onClose } = open()
    expect(screen.getByLabelText('Which one will you try?')).toHaveValue('a1')
    expect(screen.getByRole('button', { name: 'Fear Level 7' })).toHaveAttribute('aria-pressed', 'true')
    const save = () => screen.getByRole('button', { name: 'Save' })
    expect(save()).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-09-15' } })
    fireEvent.click(screen.getByRole('button', { name: 'Evening' }))
    fireEvent.change(screen.getByLabelText('What will you do instead?'), { target: { value: 'Say goodnight and leave' } })
    fireEvent.change(screen.getByLabelText('What are you afraid will happen?'), { target: { value: "She'll cry for an hour" } })
    fireEvent.click(save())

    await waitFor(() => expect(api.setUpParentExperimentInSession).toHaveBeenCalledWith('plan1', expect.objectContaining({
      accommodation_id: 'a1', scheduled_time_bucket: 'evening', instead: 'Say goodnight and leave',
      prediction: "She'll cry for an hour", belief_before: 50, expected_fear: 7, readiness: null,
    })))
    const sent = api.setUpParentExperimentInSession.mock.calls[0][1]
    expect(new Date(sent.scheduled_date).getHours()).toBe(19)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('can be about an accommodation that is not the focus', async () => {
    open()
    fireEvent.change(screen.getByLabelText('Which one will you try?'), { target: { value: 'a2' } })
    expect(screen.getByRole('button', { name: 'Fear Level 5' })).toHaveAttribute('aria-pressed', 'true')
  })
})
