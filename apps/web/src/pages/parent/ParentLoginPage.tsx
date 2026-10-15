import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useParentAuth } from '../../context/ParentAuthContext'
import { parentApiClient } from '../../api/client'
import FloatLogo from '../../components/ui/FloatLogo'

// Screen layout rules (CLAUDE.md): a little space above the card, one gap between every block,
// and the main button pinned to the bottom so any spare height collects just above it.
const column: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', gap: '80px' }
const footer: React.CSSProperties = { marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 'var(--float-space-3)' }
const backLink: React.CSSProperties = {
  fontSize: '13px', color: 'var(--float-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0,
  alignSelf: 'flex-start',
}

export default function ParentLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [view, setView] = useState<'login' | 'forgot'>('login')
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const { login } = useParentAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const { mustChangePassword } = await login(email, password)
      navigate(mustChangePassword ? '/parent/set-password' : '/parent/home')
    } catch {
      setError('Invalid email or password')
      setPassword('')
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotLoading(true)
    try {
      await parentApiClient.post('/auth/forgot-password', { email: forgotEmail })
      setForgotSent(true)
    } catch {
      setForgotSent(true)
    } finally {
      setForgotLoading(false)
    }
  }

  const backToSignIn = () => {
    setView('login')
    setForgotSent(false)
    setForgotEmail('')
  }

  const inputStyle = {
    color: 'var(--float-text)',
    border: '1px solid var(--float-border)',
    borderRadius: 'var(--float-radius-sm)',
    '--tw-ring-color': 'var(--float-primary)',
  } as React.CSSProperties

  return (
    <div
      className="min-h-screen flex flex-col items-center px-6"
      style={{ background: 'var(--float-primary-light)', paddingTop: 'var(--float-space-6)', paddingBottom: 'var(--float-space-6)' }}
    >
      <div
        className="w-full"
        style={{
          ...column,
          maxWidth: '400px',
          background: 'var(--float-surface)',
          borderRadius: 'var(--float-radius-lg)',
          padding: '44px 32px',
          boxShadow: 'var(--float-shadow-md)',
        }}
      >
        <div className="flex flex-col items-center">
          <FloatLogo size="lg" />
          <p className="text-sm" style={{ color: 'var(--float-text-hint)', marginTop: '12px' }}>
            Parent sign in
          </p>
        </div>

        {view === 'login' ? (
          <form onSubmit={handleSubmit} style={column}>
            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--float-text-secondary)' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                style={inputStyle}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--float-text-secondary)' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                style={inputStyle}
                placeholder="••••••••"
              />
              <div style={{ textAlign: 'right', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setView('forgot')}
                  style={{ fontSize: '12px', color: 'var(--float-text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Forgot password?
                </button>
              </div>
            </div>

            <div style={footer}>
              {error && <p className="text-sm text-center" style={{ color: 'var(--float-danger)' }}>{error}</p>}

              <button type="submit" disabled={isLoading} className="teen-btn teen-btn--primary">
                {isLoading ? 'Signing in...' : 'Sign in'}
              </button>
            </div>
          </form>
        ) : (
          <div style={column}>
            <div>
              <p style={{ fontSize: '17px', fontWeight: 600, color: 'var(--float-text)', margin: '0 0 8px' }}>
                Reset your password
              </p>
              <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', margin: 0, lineHeight: '1.5' }}>
                Enter your email and we'll send you a reset link.
              </p>
            </div>

            {forgotSent ? (
              <>
                <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', lineHeight: '1.5', margin: 0 }}>
                  If that email is registered, you'll receive a reset link shortly. Check your inbox.
                </p>
                <div style={footer}>
                  <button
                    type="button"
                    onClick={backToSignIn}
                    style={backLink}
                  >
                    &larr; Back
                  </button>
                </div>
              </>
            ) : (
              <form onSubmit={handleForgotSubmit} style={column}>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--float-text-secondary)' }}>
                    Email
                  </label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="w-full px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                    style={inputStyle}
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <div style={footer}>
                  <button type="submit" disabled={forgotLoading} className="teen-btn teen-btn--primary">
                    {forgotLoading ? 'Sending...' : 'Send reset link'}
                  </button>

                  <button
                    type="button"
                    onClick={backToSignIn}
                    style={backLink}
                  >
                    &larr; Back
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
