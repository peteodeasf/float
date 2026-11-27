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
  safety_behaviors: ['Looks at the floor', 'Takes the long way round'],
}
const KNOW = 'He looks away straight after'
// Set up in session after the worksheet questions arrived: everything but when.
const IN_SESSION = {
  id: 'e1', status: 'planned', scheduled_date: null, scheduled_time_bucket: null,
  prediction: FEAR, how_will_i_know: KNOW, bip_before: 70, distress_thermometer_expected: 6,
  tempting_behaviors: JSON.stringify({ safety: ['Looks at the floor'] }), confidence_level: 'medium',
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

describe("the child's setup", () => {
  it("walks Dr. Walker's worksheet questions, then when", async () => {
    open('/teen/experiment/r3')

    expect(heading('What are you most worried will happen?')).toBeInTheDocument()
    expect(heading('How will you know if this happens?')).toBeInTheDocument()
    expect(screen.getByText('1 of 5')).toBeInTheDocument()
    expect(screen.getByText(new RegExp(FEAR))).toBeInTheDocument()
    // The fear comes from the arrow, but how they will know is theirs to say.
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('How will you know if this happens?'), { target: { value: KNOW } })
    click('Next')

    expect(screen.getByText('How strongly do you believe your prediction is correct?')).toBeInTheDocument()
    expect(screen.getByText('What will your Fear Level be?')).toBeInTheDocument()
    click('Next')

    expect(heading('Which safety or avoidance behaviors or rituals might you want to do?')).toBeInTheDocument()
    click('Looks at the floor')
    fireEvent.change(screen.getByLabelText('Add your own'), { target: { value: 'Keeps headphones in' } })
    click('Add')
    expect(screen.getByRole('button', { name: 'Keeps headphones in' })).toHaveAttribute('aria-pressed', 'true')
    click('Next')

    // The behaviors just picked are shown with the confidence question, which says "them".
    expect(heading('How confident do you feel that you can do the exposure without doing them?')).toBeInTheDocument()
    expect(screen.getByText('Keeps headphones in')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    click('Medium')
    click('Next')

    expect(heading('When will you do it?')).toBeInTheDocument()
    expect(screen.getByText('5 of 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lock it in' })).toBeDisabled()
    click(/^Today/)
    click('Morning')
    click('Lock it in')

    expect(await screen.findByText("It's on your ladder")).toBeInTheDocument()
    expect(api.post).toHaveBeenCalledWith('/patient/behaviors/r3/experiments', expect.anything())
    expect(api.put).toHaveBeenCalledWith('/patient/experiments/new1/before', expect.objectContaining({
      prediction: FEAR, how_will_i_know: KNOW, bip_before: 50, distress_thermometer_expected: 6,
      confidence_level: 'medium', scheduled_time_bucket: 'morning',
    }))
    expect(JSON.parse(putBody().tempting_behaviors)).toEqual({ safety: ['Looks at the floor', 'Keeps headphones in'] })
    expect(api.post).toHaveBeenCalledWith('/patient/experiments/new1/commit')
  })

  it('a safety behavior typed but not added is still saved', async () => {
    open('/teen/experiment/r3')
    fireEvent.change(screen.getByLabelText('How will you know if this happens?'), { target: { value: KNOW } })
    click('Next')
    click('Next')
    fireEvent.change(screen.getByLabelText('Add your own'), { target: { value: 'Keeps headphones in' } })
    click('Next')
    expect(screen.getByText('Keeps headphones in')).toBeInTheDocument()
    click('Low')
    click('Next')
    click(/^Today/)
    click('Morning')
    click('Lock it in')
    await screen.findByText("It's on your ladder")
    expect(JSON.parse(putBody().tempting_behaviors)).toEqual({ safety: ['Keeps headphones in'] })
  })

  it('picking no safety behaviors is an answer', () => {
    open('/teen/experiment/r3')
    fireEvent.change(screen.getByLabelText('How will you know if this happens?'), { target: { value: KNOW } })
    click('Next')
    click('Next')
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
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
    fireEvent.change(screen.getByLabelText('How will you know if this happens?'), { target: { value: KNOW } })
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Say it your own way'), { target: { value: 'Everyone will stare' } })
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('finishes one set up in session by asking only when', async () => {
    open('/teen/experiment/r3?experiment=e1', [IN_SESSION])

    expect(heading('You and your clinician set this up')).toBeInTheDocument()
    expect(screen.getByText('One thing left.')).toBeInTheDocument()
    expect(screen.getByText('70%')).toBeInTheDocument()
    expect(screen.getByText(KNOW)).toBeInTheDocument()
    expect(screen.getByText('Looks at the floor')).toBeInTheDocument()
    expect(screen.getByText('Not picked yet')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Change' })).toHaveLength(6)

    click('Pick when')
    click(/^Today/)
    click('Evening')
    click('Lock it in')

    expect(await screen.findByText("It's on your ladder")).toBeInTheDocument()
    // The clinician's row is finished, not a second one made.
    expect(api.post).not.toHaveBeenCalledWith('/patient/behaviors/r3/experiments', expect.anything())
    expect(api.put).toHaveBeenCalledWith('/patient/experiments/e1/before', expect.objectContaining({
      prediction: FEAR, how_will_i_know: KNOW, bip_before: 70, scheduled_time_bucket: 'evening',
    }))
    expect(JSON.parse(putBody().tempting_behaviors)).toEqual({ safety: ['Looks at the floor'] })
    expect(putBody().scheduled_date).toEqual(expect.any(String))
    expect(api.post).toHaveBeenCalledWith('/patient/experiments/e1/commit')
  })

  it('one set up in session before the worksheet questions asks the new ones too', () => {
    open('/teen/experiment/r3?experiment=e1', [{ ...IN_SESSION, how_will_i_know: null, tempting_behaviors: null }])
    expect(screen.getByText('3 things left.')).toBeInTheDocument()
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
    expect(heading('What are you most worried will happen?')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('How will you know if this happens?'), { target: { value: KNOW } })
    click('Next')
    click('Next')
    click('Next')
    click('High')
    click('Next')
    expect(heading('When will you do it?')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Today/ })).not.toBeInTheDocument()
    click('Afternoon')
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
    open('/teen/experiment/r3?experiment=e1', [IN_SESSION])
    click('Pick when')
    click(/^Today/)
    click('Evening')
    click('Lock it in')

    expect(await screen.findByRole('alert')).toHaveTextContent("That didn't save.")
    await waitFor(() => expect(screen.getByRole('button', { name: 'Lock it in' })).toBeEnabled())
  })
})
