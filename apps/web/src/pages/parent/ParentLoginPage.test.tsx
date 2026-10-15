import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

// No real sign-in can happen here, so the parent's login call is recorded rather than sent.
const auth = vi.hoisted(() => ({ login: vi.fn() }))
vi.mock('../../context/ParentAuthContext', () => ({ useParentAuth: () => ({ login: auth.login }) }))

import ParentLoginPage from './ParentLoginPage'

function open() {
  render(
    <MemoryRouter initialEntries={['/parent/login']}>
      <Routes>
        <Route path="/parent/login" element={<ParentLoginPage />} />
        <Route path="/parent/home" element={<p>home screen</p>} />
        <Route path="/parent/set-password" element={<p>set password screen</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

function signIn(password = 'secret') {
  fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'parent@example.com' } })
  fireEvent.change(screen.getByPlaceholderText('••••••••'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
}

beforeEach(() => {
  auth.login.mockReset()
})

describe('the parent sign-in screen', () => {
  // The layout fix moved the button and error message into a new wrapper. This checks that
  // signing in still does exactly what it did before.
  it('signs in and goes to the parent home', async () => {
    auth.login.mockResolvedValue({ mustChangePassword: false })
    open()
    signIn()
    await waitFor(() => expect(screen.getByText('home screen')).toBeInTheDocument())
    expect(auth.login).toHaveBeenCalledWith('parent@example.com', 'secret')
  })

  // Same reason: a first-time parent must still be sent to choose a password.
  it('sends a parent who must change their password to set it', async () => {
    auth.login.mockResolvedValue({ mustChangePassword: true })
    open()
    signIn()
    await waitFor(() => expect(screen.getByText('set password screen')).toBeInTheDocument())
  })

  // The screen layout rules pin the main button to the bottom, with spare space above it. The
  // "wrong password" message belongs with the button, so it must sit in the same pinned group
  // rather than up among the fields.
  it('pins the Sign in button and its error message to the bottom', async () => {
    auth.login.mockRejectedValue(new Error('401'))
    open()
    signIn('wrong')
    const error = await screen.findByText('Invalid email or password')
    const group = screen.getByRole('button', { name: 'Sign in' }).parentElement!
    expect(group.style.marginTop).toBe('auto')
    expect(group).toContainElement(error)
  })

  // The old screen centred the whole card, which split the spare space above and below it.
  // The layout rules forbid centring the group.
  it('does not centre the sign-in card vertically', () => {
    open()
    const page = screen.getByText('Parent sign in').closest('.min-h-screen')!
    expect(page.className).not.toContain('justify-center')
  })
})
