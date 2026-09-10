import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

// apiClient carries the saved session; plain axios is what checks a brand-new token.
const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }))
const plain = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../api/client', () => ({ apiClient: api }))
vi.mock('axios', () => ({ default: plain }))

import { AuthProvider, useAuth, NotAClinicianError } from './AuthContext'

let auth: ReturnType<typeof useAuth>
function Probe() {
  auth = useAuth()
  return <div>{auth.isLoading ? 'loading' : auth.isAuthenticated ? 'in' : 'out'}</div>
}
const mount = () => render(<AuthProvider><Probe /></AuthProvider>)

/** /auth/me answers for whichever token is on the request. */
const accounts: Record<string, { is_practitioner: boolean }> = {
  'kid-token': { is_practitioner: false },
  'parent-token': { is_practitioner: false },
  'dr-token': { is_practitioner: true },
}
const meFor = (token: string) => ({ data: accounts[token] })

beforeEach(() => {
  localStorage.clear()
  api.get.mockReset().mockImplementation(async () => meFor(localStorage.getItem('access_token')!))
  plain.get.mockReset().mockImplementation(async (_url: string, cfg: { headers: { Authorization: string } }) =>
    meFor(cfg.headers.Authorization.replace('Bearer ', '')))
  api.post.mockReset()
})
const signInReturns = (token: string) => api.post.mockResolvedValue({ data: { access_token: token, refresh_token: 'r' } })

describe('the clinician app lets in clinicians only', () => {
  it("refuses a child's account and stores nothing", async () => {
    signInReturns('kid-token')
    mount()
    await screen.findByText('out')

    await expect(act(() => auth.login('kid@example.com', 'pw'))).rejects.toBeInstanceOf(NotAClinicianError)
    expect(localStorage.getItem('access_token')).toBeNull()
    expect(screen.getByText('out')).toBeInTheDocument()
  })

  it("checks the new account, not a clinician's session still saved on this browser", async () => {
    localStorage.setItem('access_token', 'dr-token')
    signInReturns('kid-token')
    mount()
    await screen.findByText('in')

    await expect(act(() => auth.login('kid@example.com', 'pw'))).rejects.toBeInstanceOf(NotAClinicianError)
    expect(localStorage.getItem('access_token')).toBe('dr-token')
  })

  it('lets a clinician in', async () => {
    signInReturns('dr-token')
    mount()
    await screen.findByText('out')

    await act(() => auth.login('dr@example.com', 'pw'))
    expect(localStorage.getItem('access_token')).toBe('dr-token')
    expect(screen.getByText('in')).toBeInTheDocument()
  })

  it("signs out a saved session that is a parent's", async () => {
    localStorage.setItem('access_token', 'parent-token')
    mount()

    await screen.findByText('out')
    expect(localStorage.getItem('access_token')).toBeNull()
  })

  it("keeps a saved clinician's session", async () => {
    localStorage.setItem('access_token', 'dr-token')
    mount()
    await waitFor(() => expect(screen.getByText('in')).toBeInTheDocument())
  })
})
