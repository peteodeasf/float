import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

// No child can be signed in here, so their identity is stubbed, the list is seeded, and the saves
// are recorded rather than sent.
vi.mock('../../context/TeenAuthContext', () => ({ useTeenAuth: () => ({ patientId: 'p1' }) }))
const api = vi.hoisted(() => ({ rateAccommodation: vi.fn() }))
vi.mock('../../api/teenAccommodations', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/teenAccommodations')>()),
  rateAccommodation: api.rateAccommodation,
}))

import TeenRateAccommodationsPage from './TeenRateAccommodationsPage'

const item = (id: string, name: string, rated = false) => ({
  id, name, situation_name: 'Bedtime', rated, rating_min: rated ? 3 : null, rating_max: rated ? 3 : null,
})

function open(items = [item('a1', 'Lies down with you until you fall asleep'), item('a2', 'Answers for you at the doctor’s'), item('a3', 'Already done', true)]) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['teen-to-rate', 'p1'], items)
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><TeenRateAccommodationsPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}

const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }))

// A block body on purpose: a function returned from beforeEach is run again after the test as a
// clean-up, and returning the mock ran the failing save once more.
beforeEach(() => {
  api.rateAccommodation.mockReset().mockResolvedValue({})
})

describe('the child rates what their parent does', () => {
  it('goes through the ones not yet rated, one at a time', async () => {
    open()
    expect(screen.getByRole('heading', { name: 'Your parent sometimes helps when you feel anxious' })).toBeInTheDocument()
    click('Start')

    expect(screen.getByText('“Lies down with you until you fall asleep”')).toBeInTheDocument()
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    click('Fear Level 4')
    click('Fear Level 7')
    click('Next')

    expect(await screen.findByText('“Answers for you at the doctor’s”')).toBeInTheDocument()
    expect(api.rateAccommodation).toHaveBeenCalledWith('a1', 4, 7)
    click('Not sure')

    expect(await screen.findByRole('heading', { name: 'Thank you' })).toBeInTheDocument()
    expect(api.rateAccommodation).toHaveBeenCalledTimes(1)
  })

  it('with nothing sent, says so', () => {
    open([])
    expect(screen.getByRole('heading', { name: 'Nothing to rate right now' })).toBeInTheDocument()
  })

  it('says so when a save fails, and stays on the question', async () => {
    api.rateAccommodation.mockImplementation(async () => { throw new Error('500') })
    open()
    click('Start')
    await screen.findByText('“Lies down with you until you fall asleep”')
    click('Fear Level 5')
    click('Next')
    expect(await screen.findByRole('alert')).toHaveTextContent("That didn't save.")
    expect(screen.getByText('“Lies down with you until you fall asleep”')).toBeInTheDocument()
  })
})
