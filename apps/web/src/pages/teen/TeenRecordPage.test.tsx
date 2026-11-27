import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), put: vi.fn() }))
vi.mock('../../api/client', () => ({ teenApiClient: api }))

import TeenRecordPage from './TeenRecordPage'

function open() {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['teen-experiment', 'e1'], {
    id: 'e1', prediction: 'Everyone will stare', bip_before: 70, distress_thermometer_expected: 6,
  })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/teen/record/e1']}>
        <Routes>
          <Route path="/teen/record/:experimentId" element={<TeenRecordPage />} />
          <Route path="/teen/progress" element={<div>progress</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))

beforeEach(() => {
  api.put.mockReset().mockResolvedValue({ data: {} })
})

describe("the child's debrief", () => {
  it("asks Dr. Walker's worksheet questions in the child's own words, with no ready-made answers", async () => {
    open()
    expect(screen.getByRole('heading', { name: 'Did what you were most worried about happen?' })).toBeInTheDocument()
    expect(screen.getByLabelText('What did happen')).toHaveAttribute('placeholder', 'What did you do? What did other people do?')
    expect(screen.queryByRole('button', { name: 'Nobody cared' })).not.toBeInTheDocument()

    expect(screen.getByRole('button', { name: 'Next →' })).toBeDisabled()
    click("No — it didn't")
    fireEvent.change(screen.getByLabelText('What did happen'), { target: { value: 'One person said hi' } })
    click('Next →')

    expect(screen.getByRole('heading', { name: 'Were you surprised?' })).toBeInTheDocument()
    expect(screen.getByText('What was your Fear Level?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next →' })).toBeDisabled()
    click('Yes')
    click('3 out of 10')
    click('Next →')

    expect(screen.getByText('How strong is your belief now?')).toBeInTheDocument()
    expect(screen.getByLabelText('What did you learn')).toHaveAttribute('placeholder', 'How was it different to what you expected?')
    expect(screen.queryByRole('button', { name: 'My anxiety exaggerates' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('What did you learn'), { target: { value: 'Less bad than I thought' } })
    click('Submit')

    expect(await screen.findByText('progress')).toBeInTheDocument()
    expect(api.put).toHaveBeenCalledWith('/patient/experiments/e1/after', {
      feared_outcome_occurred: false,
      what_happened: 'One person said hi',
      was_surprised: true,
      distress_thermometer_actual: 3,
      bip_after: 70,
      what_learned: 'Less bad than I thought',
    })
  })

  it('leaves "were you surprised" empty when not answered', async () => {
    open()
    click('Yeah, it did')
    click('Next →')
    click('5 out of 10')
    click('Next →')
    click('Submit')
    await screen.findByText('progress')
    expect(api.put.mock.calls[0][1].was_surprised).toBeNull()
  })
})
