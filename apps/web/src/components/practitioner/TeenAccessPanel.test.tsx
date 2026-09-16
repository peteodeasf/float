import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const api = vi.hoisted(() => ({ listParents: vi.fn(), inviteParent: vi.fn(), removeParent: vi.fn(), setChildConnectConsent: vi.fn() }))
vi.mock('../../api/patients', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/patients')>()), ...api,
}))

import TeenAccessPanel from './TeenAccessPanel'

const PARENTS = [
  { parent_user_id: 'u1', email: 'mum@example.com', invited_at: '2026-09-01T10:00:00Z', has_signed_in: true, reminder_emails_off: false },
  { parent_user_id: 'u2', email: 'dad@example.com', invited_at: '2026-09-02T10:00:00Z', has_signed_in: false, reminder_emails_off: true },
]

function open() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <TeenAccessPanel patientId="pt1" focus="parent" teenEmail={null} teenInvitedAt={null} consentAt={null}
        fallbackEmail={null} onViewMessages={() => {}} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  api.listParents.mockReset().mockResolvedValue(PARENTS)
  api.inviteParent.mockReset().mockResolvedValue({ success: true, email: 'new@example.com', already_a_parent: false })
  api.removeParent.mockReset().mockResolvedValue(undefined)
  api.setChildConnectConsent.mockReset().mockResolvedValue({})
  vi.stubGlobal('confirm', () => true)
})

describe('a child with two parents', () => {
  it('lists both, and says who has signed in', async () => {
    open()
    expect(await screen.findByText('mum@example.com')).toBeInTheDocument()
    expect(screen.getByText('dad@example.com')).toBeInTheDocument()
    expect(screen.getByText('Has signed in')).toBeInTheDocument()
    expect(screen.getByText(/Has not signed in yet · reminder emails off/)).toBeInTheDocument()
  })

  it('removes one after confirming', async () => {
    open()
    await screen.findByText('dad@example.com')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1])
    await waitFor(() => expect(api.removeParent).toHaveBeenCalledWith('pt1', 'u2'))
  })

  it('says so when the email is already a parent, instead of sending anything', async () => {
    api.inviteParent.mockResolvedValue({ success: false, email: 'mum@example.com', already_a_parent: true })
    open()
    await screen.findByText('mum@example.com')
    fireEvent.change(screen.getByPlaceholderText('parent@example.com'), { target: { value: 'mum@example.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Invite parent' }))
    expect(await screen.findByText(/is already a parent of this child/)).toBeInTheDocument()
  })
})

describe('recording consent', () => {
  it('records consent when the clinician presses the button', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <TeenAccessPanel patientId="p1" focus="teen" teenEmail={null} teenInvitedAt={null}
          consentAt={null} fallbackEmail="teen@example.com" onViewMessages={() => {}} onClose={() => {}} />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByText('Record consent (obtained offline)'))
    await waitFor(() => expect(api.setChildConnectConsent).toHaveBeenCalledWith('p1', true))
  })

  it('says so when the consent does not save', async () => {
    api.setChildConnectConsent.mockRejectedValueOnce(new Error('500'))
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <TeenAccessPanel patientId="p1" focus="teen" teenEmail={null} teenInvitedAt={null}
          consentAt={null} fallbackEmail="teen@example.com" onViewMessages={() => {}} onClose={() => {}} />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByText('Record consent (obtained offline)'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn.t save/i)
  })
})
