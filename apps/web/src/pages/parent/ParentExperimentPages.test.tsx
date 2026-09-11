import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// No parent can be signed in here: every query is seeded and the saves are recorded, not sent.
const api = vi.hoisted(() => ({ setUpExperiment: vi.fn(), recordExperiment: vi.fn() }))
vi.mock('../../api/parentExperiments', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/parentExperiments')>()),
  setUpExperiment: api.setUpExperiment,
  recordExperiment: api.recordExperiment,
}))

import ParentExperimentSetupPage from './ParentExperimentSetupPage'
import ParentExperimentRecordPage from './ParentExperimentRecordPage'

const ACCOMMODATIONS = [
  { id: 'a2', name: "Answers for them at the doctor's", description: null, trigger_situation_id: null,
    display_order: 1, status: 'not_started', is_weekly_focus: false },
  { id: 'a1', name: 'Lies down with them until asleep', description: null, trigger_situation_id: 's1',
    display_order: 0, status: 'started', is_weekly_focus: true, parent_estimate_min: 6, parent_estimate_max: 8 },
]
const PLANNED = {
  id: 'x1', accommodation_id: 'a1', accommodation_name: 'Lies down with them until asleep', status: 'planned',
  set_up_in_session: false, scheduled_date: new Date().toISOString(), scheduled_time_bucket: 'evening',
  instead: 'Say goodnight and leave', prediction: "She'll cry for an hour", belief_before: 80, expected_fear: 8,
  readiness: 'medium', did_it: null, what_happened: null, actual_fear: null, prediction_happened: null,
  belief_after: null, what_learned: null, too_hard_reason: null, recorded_at: null, created_at: null,
}

function client() {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['parent-me'], { patient_name: 'Sam Rivera' })
  qc.setQueryData(['parent-accommodations'], ACCOMMODATIONS)
  qc.setQueryData(['parent-tips', 's1'], [{ id: 't1', title: 'Keep it short', body: 'A warm, brief goodnight.' }])
  qc.setQueryData(['parent-experiments'], [PLANNED])
  return qc
}

function openSetup() {
  render(
    <QueryClientProvider client={client()}>
      <MemoryRouter><ParentExperimentSetupPage /></MemoryRouter>
    </QueryClientProvider>,
  )
}

function openRecord(id = 'x1') {
  render(
    <QueryClientProvider client={client()}>
      <MemoryRouter initialEntries={[`/parent/experiments/${id}/after`]}>
        <Routes><Route path="/parent/experiments/:experimentId/after" element={<ParentExperimentRecordPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const heading = (name: string) => screen.getByRole('heading', { name })

beforeEach(() => {
  api.setUpExperiment.mockReset().mockImplementation(async (d: { accommodation_id: string }) => ({ ...PLANNED, accommodation_id: d.accommodation_id }))
  api.recordExperiment.mockReset().mockResolvedValue({ ...PLANNED, status: 'recorded' })
})

describe('a parent plans an experiment', () => {
  it('asks one question at a time, starting on the weekly focus, and saves it', async () => {
    openSetup()
    expect(heading('Which one will you try?')).toBeInTheDocument()
    // Any accommodation can be picked, but the focus comes first and is picked to start.
    expect(screen.getByRole('button', { name: /Lies down with them until asleep/ })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText("This week's focus")).toBeInTheDocument()
    click('Next')

    expect(heading('When will you try it?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    click(/^Today/)
    click('Evening')
    click('Next')

    expect(heading('What will you do instead?')).toBeInTheDocument()
    expect(screen.getByText('Keep it short')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("What you'll do instead"), { target: { value: 'Say goodnight and leave' } })
    click('Next')

    expect(heading('What are you afraid will happen?')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("What you're afraid will happen"), { target: { value: "She'll cry for an hour" } })
    click('Next')

    expect(heading('How strongly do you believe that will happen?')).toBeInTheDocument()
    click('Next')
    expect(heading('How upset do you expect Sam to be?')).toBeInTheDocument()
    expect(screen.getByText('7')).toBeInTheDocument() // from their 6–8 estimate
    click('Next')

    expect(heading('How ready do you feel?')).toBeInTheDocument()
    click('Kind of')
    click('Plan it')

    await waitFor(() => expect(api.setUpExperiment).toHaveBeenCalledWith(expect.objectContaining({
      accommodation_id: 'a1', scheduled_time_bucket: 'evening', instead: 'Say goodnight and leave',
      prediction: "She'll cry for an hour", belief_before: 50, expected_fear: 7, readiness: 'medium',
    })))
    expect(await screen.findByRole('heading', { name: "It's planned" })).toBeInTheDocument()
  })

  it('can be about an accommodation that is not the focus', async () => {
    openSetup()
    click(/Answers for them at the doctor's/)
    click('Next')
    click(/^Today/)
    click('Morning')
    click('Next')
    click('Next')
    fireEvent.change(screen.getByLabelText("What you're afraid will happen"), { target: { value: 'He will refuse' } })
    click('Next')
    click('Next')
    click('Next')
    click('Plan it')
    await waitFor(() => expect(api.setUpExperiment).toHaveBeenCalledWith(expect.objectContaining({ accommodation_id: 'a2', expected_fear: 5 })))
  })
})

describe('a parent says how it went', () => {
  it('asks what happened, how upset, whether it came true, belief now and what they learned', async () => {
    openRecord()
    expect(heading('Did you do it?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Not this time' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /gave in/i })).not.toBeInTheDocument()
    click('Yes')

    expect(heading('What happened?')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('What happened'), { target: { value: 'Ten minutes of crying, then sleep' } })
    click('Next')
    expect(heading('How upset was Sam, really?')).toBeInTheDocument()
    click('Next')
    expect(heading('Did what you were afraid of happen?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    click('No')
    click('Next')
    expect(heading('How strongly do you believe it now?')).toBeInTheDocument()
    click('Next')
    expect(heading('What did you learn?')).toBeInTheDocument()
    click('Save')

    await waitFor(() => expect(api.recordExperiment).toHaveBeenCalledWith('x1', {
      did_it: 'yes', what_happened: 'Ten minutes of crying, then sleep', actual_fear: 8,
      prediction_happened: 'no', belief_after: 80, what_learned: null,
    }))
    expect(await screen.findByRole('heading', { name: 'Thank you' })).toBeInTheDocument()
  })

  it('"Not this time" skips the rest', async () => {
    openRecord()
    click('Not this time')
    expect(heading('What made it too hard?')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('What made it too hard'), { target: { value: 'She was already upset' } })
    click('Save')
    await waitFor(() => expect(api.recordExperiment).toHaveBeenCalledWith('x1', {
      did_it: 'not_this_time', too_hard_reason: 'She was already upset',
    }))
  })

  it('one that is not on the plan is not found', () => {
    openRecord('nope')
    expect(heading('Not found')).toBeInTheDocument()
  })
})
