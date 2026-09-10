import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const api = vi.hoisted(() => ({
  getConversationInSession: vi.fn(), answerInSession: vi.fn(), nameInSession: vi.fn(),
}))
vi.mock('../../api/treatment', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/treatment')>()),
  ...api,
}))

import ParentConversationSheet from './ParentConversationSheet'

const CONVERSATION = {
  child_name: 'Sam',
  situations: [
    { id: 't1', name: 'Bedtime', items: [
      { id: 'i1', name: 'Lies down with them until asleep', from_record: true, still_does: null, estimate_min: null, estimate_max: null },
    ] },
    { id: 't2', name: 'Sleepovers', items: [] },
  ],
}

function open() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={qc}>
      <ParentConversationSheet patientId="pt1" onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose }
}

beforeEach(() => {
  api.getConversationInSession.mockReset().mockResolvedValue(CONVERSATION)
  api.answerInSession.mockReset().mockResolvedValue({})
  api.nameInSession.mockReset().mockResolvedValue({})
})

describe('going through it with the parent in session', () => {
  it('asks the same questions, one situation at a time, and saves each answer', async () => {
    const { onClose } = open()
    expect(await screen.findByText('When Sam is anxious about “Bedtime”, what do you do?')).toBeInTheDocument()
    expect(screen.getByText('Situation 1 of 2')).toBeInTheDocument()

    const logged = screen.getByRole('group', { name: 'Lies down with them until asleep' })
    fireEvent.click(within(logged).getByRole('button', { name: 'Yes' }))
    await waitFor(() => expect(api.answerInSession).toHaveBeenCalledWith('pt1', 'i1', { still_does: true }))

    fireEvent.click(within(logged).getByRole('button', { name: 'Fear Level 6' }))
    await waitFor(() => expect(api.answerInSession).toHaveBeenCalledWith('pt1', 'i1', { estimate_min: 6, estimate_max: 6 }))

    fireEvent.change(screen.getByLabelText('Something else they do'), { target: { value: 'Sits outside the door' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(api.nameInSession).toHaveBeenCalledWith('pt1', { trigger_situation_id: 't1', name: 'Sits outside the door' }))

    fireEvent.click(screen.getByRole('button', { name: 'Next situation' }))
    expect(screen.getByText('When Sam is anxious about “Sleepovers”, what do you do?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('with no situations on the ladder, says so', async () => {
    api.getConversationInSession.mockResolvedValue({ child_name: 'Sam', situations: [] })
    open()
    expect(await screen.findByText('No situations on the ladder yet')).toBeInTheDocument()
  })
})
