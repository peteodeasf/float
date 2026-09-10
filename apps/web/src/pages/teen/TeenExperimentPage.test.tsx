import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// No child can be signed in here, so the child's identity is stubbed, every query is seeded, and
// the saves are recorded rather than sent.
vi.mock('../../context/TeenAuthContext', () => ({
  useTeenAuth: () => ({ patientId: 'p1', logout: vi.fn() }),
}))
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('../../api/client', () => ({ teenApiClient: api }))

import TeenExperimentPage from './TeenExperimentPage'

const FEAR = "He'll think I'm weird and look away"
const STEP = {
  id: 'r3', name: 'Make eye contact with John', dt: 6, ladder_active: true,
  situation: { name: 'Eye contact in the hall', feared_outcome: FEAR },
}

function open(path: string, pending: unknown[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['teen-behavior', 'r3'], STEP)
  qc.setQueryData(['teen-pending', 'experiment-page'], pending)
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/teen/experiment/:behaviorId" element={<TeenExperimentPage />} />
          <Route path="/teen/home" element={<div>home</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const heading = (name: string) => screen.getByRole('heading', { name })
const putBody = () => api.put.mock.calls[0][1]

beforeEach(() => {
  api.get.mockReset().mockResolvedValue({ data: [] })
  api.put.mockReset().mockResolvedValue({ data: {} })
  api.post.mockReset().mockImplementation(async (url: string) =>
    url.endsWith('/experiments') ? { data: { id: 'new1' } } : { data: {} })
})

describe("the child's setup, one question per screen", () => {
  it('walks the five questions and locks it in', async () => {
    open('/teen/experiment/r3')

    expect(heading('What are you afraid will happen?')).toBeInTheDocument()
    expect(screen.getByText('1 of 5')).toBeInTheDocument()
    click(new RegExp(FEAR))
    click("That's it")

    expect(heading('How strongly do you believe that will happen?')).toBeInTheDocument()
    click('Next')
    expect(heading('Expected Fear Level?')).toBeInTheDocument()
    click('Next')

    expect(heading('When will you do it?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    click(/^Today/)
    click('Morning')
    click('Next')

    expect(heading('How ready do you feel?')).toBeInTheDocument()
    click('Kind of')
    click('Lock it in')

    expect(await screen.findByText("It's on your ladder")).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/patient/behaviors/r3/experiments', expect.anything())
    expect(api.put).toHaveBeenCalledWith('/patient/experiments/new1/before', expect.objectContaining({
      prediction: FEAR, bip_before: 50, distress_thermometer_expected: 6,
      confidence_level: 'medium', scheduled_time_bucket: 'morning',
    }))
    expect(api.post).toHaveBeenCalledWith('/patient/experiments/new1/commit')
  })

  it('with no fear from the arrow, the child says it in their own words', () => {
    const qcStep = { ...STEP, situation: { name: 'Eye contact in the hall', feared_outcome: null } }
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
    qc.setQueryData(['teen-behavior', 'r3'], qcStep)
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/teen/experiment/r3']}>
          <Routes><Route path="/teen/experiment/:behaviorId" element={<TeenExperimentPage />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByRole('button', { name: "That's it" })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Say it your own way'), { target: { value: 'Everyone will stare' } })
    expect(screen.getByRole('button', { name: "That's it" })).toBeEnabled()
  })

  it('finishes one set up in session by asking only when', async () => {
    open('/teen/experiment/r3?experiment=e1', [{
      id: 'e1', status: 'planned', scheduled_date: null, scheduled_time_bucket: null,
      prediction: FEAR, bip_before: 70, distress_thermometer_expected: 6, confidence_level: 'medium',
    }])

    expect(heading('You and your clinician set this up')).toBeInTheDocument()
    expect(screen.getByText('One thing left.')).toBeInTheDocument()
    expect(screen.getByText('70%')).toBeInTheDocument()
    expect(screen.getByText('Not picked yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Change' })).toHaveLength(4)

    click('Pick when')
    click(/^Today/)
    click('Evening')
    click('Lock it in')

    expect(await screen.findByText("It's on your ladder")).toBeInTheDocument()
    // The clinician's row is finished, not a second one made.
    expect(api.post).not.toHaveBeenCalledWith('/patient/behaviors/r3/experiments', expect.anything())
    expect(api.put).toHaveBeenCalledWith('/patient/experiments/e1/before', expect.objectContaining({
      prediction: FEAR, bip_before: 70, scheduled_time_bucket: 'evening',
    }))
    expect(putBody().scheduled_date).toEqual(expect.any(String))
    expect(api.post).toHaveBeenCalledWith('/patient/experiments/e1/commit')
  })

  it('finishes an older plan that only had a day, keeping the day', async () => {
    const day = new Date()
    day.setDate(day.getDate() + 1)
    day.setHours(12, 0, 0, 0)
    open('/teen/experiment/r3?experiment=e2', [{
      id: 'e2', status: 'planned', scheduled_date: day.toISOString(), scheduled_time_bucket: null,
      prediction: null, bip_before: null, distress_thermometer_expected: null, confidence_level: 'medium',
    }])

    // Nothing was answered in session, so there is no summary to show.
    expect(screen.queryByText('You and your clinician set this up')).not.toBeInTheDocument()
    expect(heading('What are you afraid will happen?')).toBeInTheDocument()

    click("That's it")
    click('Next')
    click('Next')
    expect(heading('When will you do it?')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Today/ })).not.toBeInTheDocument()
    click('Afternoon')
    click('Next')
    click('Ready')
    click('Lock it in')

    await screen.findByText("It's on your ladder")
    const at2pm = new Date(day)
    at2pm.setHours(14, 0, 0, 0)
    expect(putBody()).toEqual(expect.objectContaining({
      scheduled_date: at2pm.toISOString(), confidence_level: 'high', prediction: FEAR,
    }))
  })

  it('says so when the save fails, and stays on the question', async () => {
    api.put.mockRejectedValue(new Error('500'))
    open('/teen/experiment/r3?experiment=e1', [{
      id: 'e1', status: 'planned', scheduled_date: null, scheduled_time_bucket: null,
      prediction: FEAR, bip_before: 70, distress_thermometer_expected: 6, confidence_level: 'medium',
    }])
    click('Pick when')
    click(/^Today/)
    click('Evening')
    click('Lock it in')

    expect(await screen.findByRole('alert')).toHaveTextContent("That didn't save.")
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lock it in' })).toBeEnabled())
  })
})
