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
    { id: 'i1', kind: 'accommodation', name: 'Leaves the hall light on', evidence_count: 0, sources: ['parent'], added: false, named_by_parent: true },
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
    expect(screen.queryByPlaceholderText('Add an accommodation the parent does here…')).not.toBeInTheDocument()
    expect(screen.queryByText('Suggestions from monitoring')).not.toBeInTheDocument()
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
    // Suggestions and the inline add show without a further click.
    expect(screen.getByText('Suggestions from monitoring')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Leaves the hall light on/ })).toHaveTextContent('from the parent’s app')
    expect(screen.getByPlaceholderText('Add an accommodation the parent does here…')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Save plan →' }))
    expect(screen.getByRole('button', { name: '▸ Build plan' })).toBeInTheDocument()
  })

  it('adds an accommodation under its situation with a required 1–10 difficulty', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: '▸ Build plan' }))
    fireEvent.change(screen.getByPlaceholderText('Add an accommodation the parent does here…'),
      { target: { value: 'Stays in the room until asleep' } })
    // Difficulty is required — Add stays disabled until a 1–10 is entered.
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled()
    fireEvent.change(screen.getByPlaceholderText('1–10'), { target: { value: '6' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(api.createAccommodation).toHaveBeenCalledWith('plan1', {
      name: 'Stays in the room until asleep', trigger_situation_id: 's1', distress_min: 6, distress_max: 6,
    }))
  })

  it('while building, the Fear Level can be changed', async () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: '▸ Build plan' }))
    fireEvent.click(screen.getByRole('button', { name: '7' }))
    const box = screen.getByLabelText('Fear Level for “Lies down with them at bedtime”')
    fireEvent.change(box, { target: { value: '6-8' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await waitFor(() => expect(api.updateAccommodation).toHaveBeenCalledWith('plan1', 'a1', { distress_min: 6, distress_max: 8 }))
  })
})
