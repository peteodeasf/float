import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const api = vi.hoisted(() => ({ sendFeedback: vi.fn() }))
vi.mock('../../api/feedback', () => api)

import FeedbackLink from './FeedbackLink'

function show(path = '/patients/p1') {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}><FeedbackLink /></MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => { api.sendFeedback.mockReset().mockResolvedValue({ id: 'f1' }) })

describe('FeedbackLink', () => {
  // Why: the link is how a clinician reports a problem from any page; it must open the panel and
  // send what they wrote with the page they were on.
  it('opens the panel and sends the text with the page', async () => {
    show('/patients/p1')
    fireEvent.click(screen.getByRole('button', { name: 'Feedback' }))
    const send = screen.getByRole('button', { name: 'Send' })
    expect(send).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Your feedback'), { target: { value: '  The ladder tab is slow  ' } })
    fireEvent.click(send)

    await waitFor(() => expect(api.sendFeedback).toHaveBeenCalledWith('The ladder tab is slow', '/patients/p1'))
    expect(await screen.findByText("Thanks — we've got it.")).toBeInTheDocument()
  })

  // Why: if it does not save, the clinician must know, and keep what they typed.
  it('says so when it fails and keeps the text', async () => {
    api.sendFeedback.mockRejectedValue(new Error('500'))
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Feedback' }))
    fireEvent.change(screen.getByLabelText('Your feedback'), { target: { value: 'Broken' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))

    expect(await screen.findByText("That didn't send. Try again.")).toBeInTheDocument()
    expect(screen.getByLabelText('Your feedback')).toHaveValue('Broken')
  })

  it('closes on Escape', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Feedback' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
