import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const api = vi.hoisted(() => ({ updateAccommodation: vi.fn() }))
vi.mock('../../api/accommodations', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/accommodations')>()),
  updateAccommodation: api.updateAccommodation,
}))

import ParentPlanPanel from './ParentPlanPanel'

const acc = (id: string, name: string, status: string, lo: number | null) => ({
  id, name, status, treatment_plan_id: 'plan1', trigger_situation_id: null,
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
  render(
    <QueryClientProvider client={qc}>
      <ParentPlanPanel planId="plan1" patientId="pt1" triggers={[]} />
    </QueryClientProvider>,
  )
}

const rowNames = () => screen.getAllByText(/bedtime|doctor's|sleepover/).map(el => el.textContent)

beforeEach(() => {
  api.updateAccommodation.mockReset().mockResolvedValue({})
})

describe('the parent plan', () => {
  it('shows the plan easiest first, with nothing to add or sort until Build plan', () => {
    open()
    expect(rowNames()).toEqual(["Answers for them at the doctor's", 'Lies down with them at bedtime', 'Texts them every hour at a sleepover'])
    expect(screen.getByText('Working on it')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add accommodation/ })).not.toBeInTheDocument()
    expect(screen.queryByText('Suggestions from monitoring')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Sort by Fear Level/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /child's app/ })).not.toBeInTheDocument()
    expect(screen.queryByText("The parent's experiments")).not.toBeInTheDocument()
    expect(screen.queryByText('Weekly check-ins')).not.toBeInTheDocument()
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

  it('Build plan opens the editor: add, suggestions from monitoring, the child ratings and the parent questions', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: '▸ Build plan' }))
    expect(screen.getByRole('button', { name: 'Ask the parent' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Child ratings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove “Lies down with them at bedtime”' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Add accommodation/ }))
    expect(screen.getByText('Suggestions from monitoring')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Leaves the hall light on/ })).toHaveTextContent('from the parent’s app')

    fireEvent.click(screen.getByRole('button', { name: 'Save plan →' }))
    expect(screen.getByRole('button', { name: '▸ Build plan' })).toBeInTheDocument()
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
