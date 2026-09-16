import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiClient } from '../../api/client'
import { useAuth } from '../../context/AuthContext'
import FloatLogo from '../../components/ui/FloatLogo'

// The page a new clinician's setup link opens. The token is after the #, so it never reaches the
// web server; once read it is removed from the address bar and browser history.
// docs/plans/clinician-practice-onboarding.md
function tokenFromUrl(): string {
  return new URLSearchParams(window.location.hash.slice(1)).get('token') || ''
}

const inputStyle = {
  color: 'var(--float-text)',
  border: '1px solid var(--float-border)',
  borderRadius: 'var(--float-radius-sm)',
  '--tw-ring-color': 'var(--float-primary)',
} as React.CSSProperties

export default function SetupAccountPage() {
  const [token] = useState(tokenFromUrl)
  const [status, setStatus] = useState<'checking' | 'ready' | 'unusable'>('checking')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
    if (!token) {
      setStatus('unusable')
      return
    }
    apiClient.post('/auth/setup-link/check', { token })
      .then(res => {
        setEmail(res.data.email)
        setStatus('ready')
      })
      .catch(() => setStatus('unusable'))
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Your password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('The two passwords do not match.')
      return
    }
    setIsSaving(true)
    try {
      await apiClient.post('/auth/setup-link/complete', { token, password })
    } catch {
      setIsSaving(false)
      setStatus('unusable')
      return
    }
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch {
      // The password is saved; only the automatic sign-in failed.
      navigate('/login')
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: 'var(--float-bg)' }}
    >
      <div
        className="w-full"
        style={{
          maxWidth: '420px',
          background: 'var(--float-surface)',
          borderRadius: 'var(--float-radius-lg)',
          boxShadow: 'var(--float-shadow-md)',
          padding: '48px',
        }}
      >
        <div className="flex flex-col items-center" style={{ marginBottom: '32px' }}>
          <FloatLogo size="lg" />
        </div>

        {status === 'checking' && (
          <p style={{ fontSize: '14px', color: 'var(--float-text-hint)', textAlign: 'center' }}>
            Checking your link…
          </p>
        )}

        {status === 'unusable' && (
          <div>
            <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--float-text)', margin: '0 0 12px' }}>
              This link has expired or has already been used
            </p>
            <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', margin: '0 0 20px', lineHeight: '1.5' }}>
              Setup links work once and expire. Ask whoever invited you to send a new one. If you
              have already chosen a password, sign in.
            </p>
            <Link
              to="/login"
              style={{ fontSize: '14px', fontWeight: 500, color: 'var(--float-primary)', textDecoration: 'none' }}
            >
              Sign in &rarr;
            </Link>
          </div>
        )}

        {status === 'ready' && (
          <>
            <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--float-text)', margin: '0 0 6px' }}>
              Set up your Float account
            </p>
            <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', margin: '0 0 20px', lineHeight: '1.5' }}>
              Choose a password. You'll sign in as <strong>{email}</strong>.
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--float-text-secondary)' }}>
                  Password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                  style={inputStyle}
                  placeholder="At least 8 characters"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--float-text-secondary)' }}>
                  Confirm password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                  style={inputStyle}
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-center" style={{ color: 'var(--float-danger)' }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 cursor-pointer"
                style={{ background: 'var(--float-primary)', borderRadius: 'var(--float-radius-sm)', border: 'none' }}
              >
                {isSaving ? 'Setting up…' : 'Set password and sign in'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
