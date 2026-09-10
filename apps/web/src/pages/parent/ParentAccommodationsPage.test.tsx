import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

// No parent can be signed in here, so every query is seeded and the saves are recorded.
const api = vi.hoisted(() => ({ answerSuggestion: vi.fn(), nameAccommodation: vi.fn() }))
vi.mock('../../api/parent', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/parent')>()),
  answerSuggestion: api.answerSuggestion,
  nameAccommodation: api.nameAccommodation,
}))

import ParentAccommodationsPage from './ParentAccommodationsPage'

const LOGGED = { id: 'i1', name: 'Lies down with them until asleep', from_record: true, still_does: null, estimate_min: null, estimate_max: null }

function open(situations = [
  { id: 't1', name: 'Bedtime', items: [LOGGED] },
  { id: 't2', name: 'Sleepovers', items: [] },
]) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['parent-conversation'], { child_name: 'Sam', situations })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><ParentAccommodationsPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const heading = (name: string | RegExp) => screen.findByRole('heading', { name })

beforeEach(() => {
  api.answerSuggestion.mockReset().mockImplementation(async (id: string, data: object) => ({ ...LOGGED, id, ...data }))
  api.nameAccommodation.mockReset().mockImplementation(async (d: { name: string }) => ({
    id: 'new1', name: d.name, from_record: false, still_does: true, estimate_min: null, estimate_max: null }))
})

describe("the parent goes through what they do", () => {
  it('asks about what they wrote, their estimate, and anything else, one screen at a time', async () => {
    open()
    expect(await heading('When Sam is anxious, what do you do?')).toBeInTheDocument()
    click('Start')

    expect(await heading('You wrote this down before:')).toBeInTheDocument()
    expect(screen.getByText('“Lies down with them until asleep”')).toBeInTheDocument()
    expect(screen.getByText('Situation 1 of 2')).toBeInTheDocument()
    click('Yes, I still do')

    expect(await heading('If you stopped, how hard would it be for Sam?')).toBeInTheDocument()
    expect(api.answerSuggestion).toHaveBeenCalledWith('i1', { still_does: true })
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    click('Fear Level 5')
    click('Fear Level 9')
    expect(screen.getByText('5–9')).toBeInTheDocument()
    click('Next')

    expect(await heading('Anything else you do when this comes up?')).toBeInTheDocument()
    expect(api.answerSuggestion).toHaveBeenCalledWith('i1', { estimate_min: 5, estimate_max: 9 })
    fireEvent.change(screen.getByLabelText('What you do'), { target: { value: 'Leaves the hall light on' } })
    click('Add it')

    expect(await heading('If you stopped, how hard would it be for Sam?')).toBeInTheDocument()
    expect(api.nameAccommodation).toHaveBeenCalledWith({ trigger_situation_id: 't1', name: 'Leaves the hall light on' })
    click('Not sure')

    expect(await heading('Anything else you do when this comes up?')).toBeInTheDocument()
    expect(screen.getByText('Leaves the hall light on')).toBeInTheDocument()
    click('Next situation')

    expect(await heading('What do you do when this comes up?')).toBeInTheDocument()
    expect(screen.getByText('Situation 2 of 2')).toBeInTheDocument()
    click("That's everything")

    expect(await heading('Thank you')).toBeInTheDocument()
  })

  it('one they no longer do gets no estimate', async () => {
    open()
    click('Start')
    await heading('You wrote this down before:')
    click('Not any more')

    // Straight on to "anything else?" for the same situation, with no estimate asked.
    expect(await heading('Anything else you do when this comes up?')).toBeInTheDocument()
    expect(api.answerSuggestion).toHaveBeenCalledWith('i1', { still_does: false })
    expect(screen.queryByRole('heading', { name: /how hard would it be/ })).not.toBeInTheDocument()
  })

  it('says so when a save fails, and stays on the question', async () => {
    api.answerSuggestion.mockRejectedValue(new Error('500'))
    open()
    click('Start')
    await heading('You wrote this down before:')
    click('Not any more')

    expect(await screen.findByRole('alert')).toHaveTextContent("That didn't save.")
    expect(screen.getByRole('heading', { name: 'You wrote this down before:' })).toBeInTheDocument()
  })

  it('with no situations yet, there is nothing to go through', async () => {
    open([])
    expect(await heading('Nothing to go through yet')).toBeInTheDocument()
  })
})
