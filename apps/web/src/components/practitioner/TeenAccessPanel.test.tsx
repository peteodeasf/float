import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('../../api/patients', () => ({
  inviteTeen: vi.fn(),
  inviteParent: vi.fn(),
  setChildConnectConsent: vi.fn().mockResolvedValue({}),
}))

import TeenAccessPanel from './TeenAccessPanel'
import { setChildConnectConsent } from '../../api/patients'

describe('TeenAccessPanel', () => {
  it('records consent when the clinician presses the button', async () => {
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <TeenAccessPanel
          patientId="p1" focus="teen" teenEmail={null} teenInvitedAt={null}
          consentAt={null} fallbackEmail="teen@example.com"
          onViewMessages={() => {}} onClose={() => {}}
        />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByText('Record consent (obtained offline)'))
    await waitFor(() => expect(setChildConnectConsent).toHaveBeenCalledWith('p1', true))
  })

  it('says so when the consent does not save', async () => {
    vi.mocked(setChildConnectConsent).mockRejectedValueOnce(new Error('500'))
    const qc = new QueryClient()
    render(
      <QueryClientProvider client={qc}>
        <TeenAccessPanel
          patientId="p1" focus="teen" teenEmail={null} teenInvitedAt={null}
          consentAt={null} fallbackEmail="teen@example.com"
          onViewMessages={() => {}} onClose={() => {}}
        />
      </QueryClientProvider>,
    )
    fireEvent.click(screen.getByText('Record consent (obtained offline)'))
    expect(await screen.findByRole('alert')).toHaveTextContent(/didn.t save/i)
  })
})
