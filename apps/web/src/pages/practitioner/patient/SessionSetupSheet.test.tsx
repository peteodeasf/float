import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const onRecommend = vi.fn()
  render(
    <QueryClientProvider client={qc}>
      <SessionSetupSheet rung={RUNG} situationName="Eye contact in the hall" isRecommended={false}
        onRecommend={onRecommend} onClose={onClose} onSaved={onSaved} {...props} />
    </QueryClientProvider>,
  )
  return { onClose, onSaved, onRecommend }
}

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }))
const save = () => screen.getByRole('button', { name: 'Save' })

beforeEach(() => {
  api.setUpInSession.mockReset().mockResolvedValue({ id: 'e1' })
})

describe("the clinician's Set it up", () => {
  it('asks the same questions as the child app, on one sheet', () => {
    open()
    for (const q of ['What are you afraid will happen?', 'How strongly do you believe that will happen?',
      'Expected Fear Level?', 'When will you do it?', 'How ready do you feel?']) {
      expect(screen.getByText(q)).toBeInTheDocument()
    }
  })

  it("starts from the arrow's fear and the step's own Fear Level, with the day left for home", () => {
    open()
    expect(screen.getByLabelText('What are you afraid will happen?')).toHaveValue(FEAR)
    expect(screen.getByRole('button', { name: 'Fear Level 6' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'They pick the day at home' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('saves with no day, so the child picks it at home', async () => {
    const { onSaved } = open()
    expect(save()).toBeDisabled()
    click('Kind of')
    click(save().textContent!)

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    expect(api.setUpInSession).toHaveBeenCalledWith('r3', {
      prediction: FEAR, bip_before: 50, distress_thermometer_expected: 6, confidence_level: 'medium',
    })
  })

  it('a day picked now needs a time of day too, and is sent with it', async () => {
    const { onSaved } = open()
    click('Ready')
    click('Pick a day now')
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '2026-09-14' } })
    expect(save()).toBeDisabled()
    click('Evening')
    click('Save')

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled())
    const sent = api.setUpInSession.mock.calls[0][1]
    expect(sent.scheduled_time_bucket).toBe('evening')
    expect(new Date(sent.scheduled_date).getHours()).toBe(19)
    expect(sent.confidence_level).toBe('high')
  })

  it('ticking "Tell them to do this one next" moves the badge here', async () => {
    const { onRecommend } = open()
    fireEvent.click(screen.getByLabelText('Tell them to do this one next'))
    click('Not really')
    click('Save')
    await vi.waitFor(() => expect(onRecommend).toHaveBeenCalledTimes(1))
  })

  it('says so when the save fails, and stays open', async () => {
    api.setUpInSession.mockRejectedValue(new Error('500'))
    const { onSaved, onClose } = open()
    click('Kind of')
    click('Save')
    expect(await screen.findByRole('alert')).toHaveTextContent("That didn't save.")
    expect(onSaved).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })
})
