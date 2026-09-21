import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const api = vi.hoisted(() => ({ updateAccommodation: vi.fn(), createAccommodation: vi.fn() }))
vi.mock('../../api/accommodations', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/accommodations')>()),
  updateAccommodation: api.updateAccommodation,
  createAccommodation: api.createAccommodation,
}))

import ParentPlanPanel from './ParentPlanPanel'

const acc = (id: string, name: string, status: string, lo: number | null) => ({
  id, name, status, treatment_plan_id: 'plan1', trigger_situation_id: 's1',
  parent_user_id: null, description: null, distress_min: lo, distress_max: lo, display_order: 0,
  accommodator: 'parent', created_at: '2026-09-01T00:00:00Z',
})

function open() {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['accommodations', 'plan1'], [
    acc('a1', 'Lies down with them at bedtime', 'started', 7),
    acc('a2', "Answers for them at the doctor's", 'stopped', 3),
    acc('a3', 'Texts them every hour at a sleepover', 'not_started', null),
  ])
  qc.setQueryData(['insights', 'pt1', 'accommodation'], [
    { id: 'i1', kind: 'accommodation', name: 'Leaves the hall light on', evidence_count: 0, sources: ['parent'], added: false, named_by_parent: true, situation_id: 's1' },
  ])
  // The situation name avoids the words the row matcher looks for, so it isn't counted as a row.
  render(
    <QueryClientProvider client={qc}>
      <ParentPlanPanel planId="plan1" patientId="pt1" triggers={[{ id: 's1', name: 'School mornings' }]} />
    </QueryClientProvider>,
  )
}

const rowNames = () => screen.getAllByText(/bedtime|doctor's|sleepover/).map(el => el.textContent)

beforeEach(() => {
  api.updateAccommodation.mockReset().mockResolvedValue({})
  api.createAccommodation.mockReset().mockResolvedValue({})
})

describe('the parent plan', () => {
  it('shows the plan easiest first, with nothing to add until Build plan', () => {
    open()
    expect(rowNames()).toEqual(["Answers for them at the doctor's", 'Lies down with them at bedtime', 'Texts them every hour at a sleepover'])
    expect(screen.getByText('Working on it')).toBeInTheDocument()
    expect(screen.getByText('School mornings')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('e.g. lies down with them at bedtime')).not.toBeInTheDocument()
    expect(screen.queryByText('From monitoring — tap to add')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ask the parent' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Remove/ })).not.toBeInTheDocument()
  })

  it('Plan it sets where the parent is with it, Working on it included', async () => {
    open()
    fireEvent.click(screen.getAllByRole('button', { name: 'Plan it' })[2])
    const group = screen.getByRole('radiogroup', { name: 'Where the parent is with “Texts them every hour at a sleepover”' })
    fireEvent.click(within(group).getByLabelText(/Working on it/))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.updateAccommodation).toHaveBeenCalledWith('plan1', 'a3', { status: 'started' }))
  })

  it('Build plan opens the editor: inline add, suggestions, child ratings — no conversation', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: '▸ Build plan' }))
    // The old "ask the parent" conversation is gone.
    expect(screen.queryByRole('button', { name: 'Ask the parent' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Child ratings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove “Lies down with them at bedtime”' })).toBeInTheDocument()
    // Suggestions (per situation) and the inline add show without a further click.
    expect(screen.getByText('From monitoring — tap to add')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Leaves the hall light on/ })).toHaveTextContent('from the parent’s app')
    expect(screen.getByPlaceholderText('e.g. lies down with them at bedtime')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save plan →' }))
    expect(screen.getByRole('button', { name: '▸ Build plan' })).toBeInTheDocument()
  })

  it('adds an accommodation under its situation with a required 1–10 difficulty', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: '▸ Build plan' }))
    fireEvent.change(screen.getByPlaceholderText('e.g. lies down with them at bedtime'),
      { target: { value: 'Stays in the room until asleep' } })
    // Difficulty is required — Add stays disabled until a 1–10 is entered.
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('1–10'), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(api.createAccommodation).toHaveBeenCalledWith('plan1', {
      name: 'Stays in the room until asleep', trigger_situation_id: 's1', distress_min: 6, distress_max: 6,
    }))
  })

  it('while building, the Fear Level can be changed in the score box', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: '▸ Build plan' }))
    // a1 (bedtime) starts at 7; typing a new value saves it as a single-value range.
    fireEvent.change(screen.getByDisplayValue('7'), { target: { value: '5' } })
    await waitFor(() => expect(api.updateAccommodation).toHaveBeenCalledWith('plan1', 'a1', { distress_min: 5, distress_max: 5 }))
  })
})
