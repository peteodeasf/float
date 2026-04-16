import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTeenAuth } from '../../context/TeenAuthContext'
import { teenApiClient } from '../../api/client'
import FloatLogo from '../../components/ui/FloatLogo'

export default function TeenLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [view, setView] = useState<'login' | 'forgot'>('login')
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)
  const { login } = useTeenAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      const { mustChangePassword } = await login(email, password)
      if (mustChangePassword) {
        navigate('/teen/set-password')
      } else {
        navigate('/teen/home')
      }
    } catch {
      setError('Invalid email or password')
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setForgotLoading(true)
    try {
      await teenApiClient.post('/auth/forgot-password', { email: forgotEmail })
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

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: 'var(--float-primary-light)' }}
    >
      <div
        className="w-full"
        style={{
          maxWidth: '400px',
          background: 'var(--float-surface)',
          borderRadius: 'var(--float-radius-lg)',
          padding: '44px 32px',
          boxShadow: 'var(--float-shadow-md)',
        }}
      >
        <div className="flex flex-col items-center" style={{ marginBottom: '32px' }}>
          <FloatLogo size="lg" />
          <p
            className="text-sm"
            style={{ color: 'var(--float-text-hint)', marginTop: '12px' }}
          >
            Your anxiety toolkit
          </p>
        </div>

        {view === 'login' ? (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--float-text-secondary)' }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                className="w-full px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                style={{
                  color: 'var(--float-text)',
                  border: '1px solid var(--float-border)',
                  borderRadius: 'var(--float-radius-sm)',
                  '--tw-ring-color': 'var(--float-primary)',
                } as React.CSSProperties}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--float-text-secondary)' }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                style={{
                  color: 'var(--float-text)',
                  border: '1px solid var(--float-border)',
                  borderRadius: 'var(--float-radius-sm)',
                  '--tw-ring-color': 'var(--float-primary)',
                } as React.CSSProperties}
                placeholder="••••••••"
              />
              <div style={{ textAlign: 'right', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={() => setView('forgot')}
                  style={{
                    fontSize: '12px',
                    color: '#94a3b8',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  Forgot password?
                </button>
              </div>
            </div>

            {error && (
              <p className="text-sm text-center" style={{ color: 'var(--float-danger)' }}>{error}</p>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 text-sm font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer"
              style={{
                background: 'var(--float-primary)',
                borderRadius: 'var(--float-radius-sm)',
                border: 'none',
              }}
              onMouseOver={(e) => { if (!isLoading) e.currentTarget.style.background = 'var(--float-primary-dark)' }}
              onMouseOut={(e) => { e.currentTarget.style.background = 'var(--float-primary)' }}
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>
        ) : (
          <div>
            <p style={{ fontSize: '17px', fontWeight: 600, color: 'var(--float-text)', margin: '0 0 8px' }}>
              Reset your password
            </p>
            <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', margin: '0 0 20px', lineHeight: '1.5' }}>
              Enter your email and we'll send you a reset link.
            </p>

            {forgotSent ? (
              <>
                <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', lineHeight: '1.5', margin: '0 0 20px' }}>
                  If that email is registered, you'll receive a reset link shortly. Check your inbox.
                </p>
                <button
                  type="button"
                  onClick={backToSignIn}
                  style={{
                    fontSize: '13px',
                    color: 'var(--float-primary)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  &larr; Back
                </button>
              </>
            ) : (
              <form onSubmit={handleForgotSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label
                    className="block text-sm font-medium mb-1.5"
                    style={{ color: 'var(--float-text-secondary)' }}
                  >
                    Email
                  </label>
                  <input
                    type="email"
                    value={forgotEmail}
                    onChange={(e) => setForgotEmail(e.target.value)}
                    className="w-full px-3.5 py-3 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                    style={{
                      color: 'var(--float-text)',
                      border: '1px solid var(--float-border)',
                      borderRadius: 'var(--float-radius-sm)',
                      '--tw-ring-color': 'var(--float-primary)',
                    } as React.CSSProperties}
                    placeholder="you@example.com"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="w-full py-3 text-sm font-semibold text-white transition-colors disabled:opacity-50 cursor-pointer"
                  style={{
                    background: 'var(--float-primary)',
                    borderRadius: 'var(--float-radius-sm)',
                    border: 'none',
                  }}
                >
                  {forgotLoading ? 'Sending...' : 'Send reset link'}
                </button>

                <button
                  type="button"
                  onClick={backToSignIn}
                  style={{
                    fontSize: '13px',
                    color: 'var(--float-primary)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: 0,
                    alignSelf: 'flex-start',
                  }}
                >
                  &larr; Back
                </button>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
