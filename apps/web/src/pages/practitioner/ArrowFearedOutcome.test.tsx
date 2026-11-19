import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ChainPhase } from './ArrowPage'

// docs/plans/arrow-feared-outcome.md. "That's the bottom" asks the AI for a feared outcome drawn
// from the whole arrow; if that fails, the child's last answer is used, as before.
const api = vi.hoisted(() => ({ draft: vi.fn(), probe: vi.fn(), update: vi.fn() }))
vi.mock('../../api/treatment', async (orig) => ({
  ...(await orig<typeof import('../../api/treatment')>()),
  draftFearedOutcome: api.draft,
  getNextProbe: api.probe,
  updateDownwardArrow: api.update,
}))

const arrow = {
  id: 'a1', trigger_situation_id: 's1', arrow_steps: [
    { question: 'Starting thought', response: 'I will forget what to say' },
    { question: 'What will happen if you forget?', response: 'everyone will laugh, obviously' },
  ],
  feared_outcome: null, feared_outcome_approved: false, bip_derived: null, facilitated_by: 'practitioner',
  created_at: '', updated_at: '',
}

function renderChain() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ChainPhase name="Ordering food" openArrow={async () => arrow} onBack={() => {}} onDone={() => {}} />
    </QueryClientProvider>,
  )
}

beforeEach(() => { api.draft.mockReset(); api.probe.mockResolvedValue('What will happen if everyone laughs?') })

describe("That's the bottom", () => {
  it('drafts the feared outcome from the whole arrow', async () => {
    api.draft.mockResolvedValue('I will forget what to say and everyone will laugh at me.')
    renderChain()
    fireEvent.click(await screen.findByRole('button', { name: /the bottom/ }))
    await waitFor(() => expect(screen.getByDisplayValue('I will forget what to say and everyone will laugh at me.')).toBeInTheDocument())
    expect(api.draft).toHaveBeenCalledWith('I will forget what to say', [arrow.arrow_steps[1]])
  })

  it("falls back to the child's last answer when the AI fails", async () => {
    api.draft.mockRejectedValue(new Error('502'))
    renderChain()
    fireEvent.click(await screen.findByRole('button', { name: /the bottom/ }))
    await waitFor(() => expect(screen.getByDisplayValue('Everyone will laugh.')).toBeInTheDocument())
  })
})
