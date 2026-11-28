import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const api = vi.hoisted(() => ({ setUpInSession: vi.fn() }))
vi.mock('../../../api/treatment', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/treatment')>()),
  setUpInSession: api.setUpInSession,
}))

import { SessionSetupSheet } from './SessionSetupSheet'

const RUNG = {
  id: 'r3', name: 'Make eye contact with John', trigger_situation_id: 't1', description: null,
  behavior_type: 'scenario', distress_thermometer_when_refraining: 6, behavior_library_id: null,
  parent_behavior_id: null, created_at: '2026-09-01T00:00:00Z',
}
const FEAR = "He'll think I'm weird and look away"

function open(props: Partial<Parameters<typeof SessionSetupSheet>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['situation-da', 't1'], { id: 'a1', arrow_steps: [], feared_outcome: FEAR })
  qc.setQueryData(['behaviors', 't1'], [
    { ...RUNG, id: 's1', name: 'Looks at the floor', behavior_type: 'safety' },
    { ...RUNG, id: 's2', name: 'Takes the long way round', behavior_type: 'avoidance' },
    RUNG,
  ])
  const onClose = vi.fn()
  const onSaved = vi.fn()
  render(
    <QueryClientProvider client={qc}>
      <SessionSetupSheet rung={RUNG} situationName="Eye contact in the hall"
        onClose={onClose} onSaved={onSaved} {...props} />
    </QueryClientProvider>,
  )
  return { onClose, onSaved }
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const save = () => screen.getByRole('button', { name: 'Save' })

beforeEach(() => {
  api.setUpInSession.mockReset().mockResolvedValue({ id: 'e1' })
})

describe("the clinician's Set it up", () => {
  it("asks Dr. Walker's worksheet questions, the same as the child app, on one sheet", () => {
    open()
    for (const q of ['What are you most worried will happen?', 'How will you know if this happens?',
      'How strongly do you believe your prediction is correct?', 'What will your Fear Level be?',
      'Which safety or avoidance behaviors or rituals might you want to do?',
      'How confident do you feel that you can do the exposure without doing them?', 'When will you do it?']) {
      expect(screen.getByText(q)).toBeInTheDocument()
    }
  })

  it("offers the situation's safety and avoidance behaviors, not its rungs, and saves the ones picked", async () => {
    const { onSaved } = open()
    expect(screen.queryByRole('button', { name: 'Make eye contact with John' })).not.toBeInTheDocument()
    click('Looks at the floor')
    fireEvent.change(screen.getByLabelText('Add another'), { target: { value: 'Keeps headphones in' } })
    click('Add')
    fireEvent.change(screen.getByLabelText('How will you know if this happens?'), { target: { value: 'He looks away' } })
    click('Medium')
    click('Save')

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    const sent = api.setUpInSession.mock.calls[0][1]
    expect(sent.how_will_i_know).toBe('He looks away')
    expect(JSON.parse(sent.tempting_behaviors)).toEqual({ safety: ['Looks at the floor', 'Keeps headphones in'] })
  })

  it("starts from the arrow's fear and the step's own Fear Level, with the day left for home", () => {
    open()
    expect(screen.getByLabelText('What are you most worried will happen?')).toHaveValue(FEAR)
    expect(screen.getByRole('button', { name: 'Fear Level 6' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'They pick the day at home' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('saves with no day, so the child picks it at home', async () => {
    const { onSaved } = open()
    expect(save()).toBeDisabled()
    click('Medium')
    click(save().textContent!)

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(api.setUpInSession).toHaveBeenCalledWith('r3', {
      prediction: FEAR, how_will_i_know: '', bip_before: 50, distress_thermometer_expected: 6,
      tempting_behaviors: JSON.stringify({ safety: [] }), confidence_level: 'medium',
    })
  })

  it('picks several days, which need a time of day too, and sends each one', async () => {
    const { onSaved } = open()
    click('High')
    click('Pick days')
    expect(save()).toBeDisabled()
    const days = within(screen.getByRole('group', { name: 'Days' })).getAllByRole('button')
    expect(days).toHaveLength(14)
    fireEvent.click(days[3])
    fireEvent.click(days[1])
    expect(save()).toBeDisabled()
    click('Evening')
    expect(screen.getByText('2 days, each in the evening. Each day is its own exposure.')).toBeInTheDocument()
    click('Save')

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    const sent = api.setUpInSession.mock.calls[0][1]
    expect(sent.scheduled_time_bucket).toBe('evening')
    expect(sent.scheduled_dates).toHaveLength(2)
    const [first, second] = sent.scheduled_dates.map((d: string) => new Date(d))
    expect(first.getHours()).toBe(19)
    expect(Math.round((second.getTime() - first.getTime()) / 86400000)).toBe(2)
    expect(sent.confidence_level).toBe('high')
  })

  it('says so when the save fails, and stays open', async () => {
    api.setUpInSession.mockRejectedValue(new Error('500'))
    const { onSaved, onClose } = open()
    click('Medium')
    click('Save')
    expect(await screen.findByRole('alert')).toHaveTextContent("That didn't save.")
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
