import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiClient } from '../../api/client'
import FloatLogo from '../../components/ui/FloatLogo'

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setIsLoading(true)
    try {
      const res = await apiClient.post('/auth/reset-password', { token, password })
      if (res.data?.success) {
        setSuccess(true)
      } else {
        setError('This reset link is invalid or has expired. Request a new one.')
      }
    } catch {
      setError('This reset link is invalid or has expired. Request a new one.')
    } finally {
      setIsLoading(false)
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

        {success ? (
          <div>
            <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--float-text)', margin: '0 0 12px' }}>
              Password updated
            </p>
            <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', margin: '0 0 20px', lineHeight: '1.5' }}>
              You can now sign in with your new password.
            </p>
            <Link
              to="/login"
              style={{
                fontSize: '14px',
                fontWeight: 500,
                color: 'var(--float-primary)',
                textDecoration: 'none',
              }}
            >
              Sign in &rarr;
            </Link>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '16px', fontWeight: 600, color: 'var(--float-text)', margin: '0 0 20px' }}>
              Set a new password
            </p>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: 'var(--float-text-secondary)' }}
                >
                  New password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{
                    color: 'var(--float-text)',
                    border: '1px solid var(--float-border)',
                    borderRadius: 'var(--float-radius-sm)',
                    '--tw-ring-color': 'var(--float-primary)',
                  } as React.CSSProperties}
                  placeholder="••••••••"
                  required
                />
              </div>

              <div>
                <label
                  className="block text-sm font-medium mb-1.5"
                  style={{ color: 'var(--float-text-secondary)' }}
                >
                  Confirm password
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                  style={{
                    color: 'var(--float-text)',
                    border: '1px solid var(--float-border)',
                    borderRadius: 'var(--float-radius-sm)',
                    '--tw-ring-color': 'var(--float-primary)',
                  } as React.CSSProperties}
                  placeholder="••••••••"
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-center" style={{ color: 'var(--float-danger)' }}>{error}</p>
              )}

              <button
                type="submit"
                disabled={isLoading || !token}
                className="w-full py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 cursor-pointer"
                style={{
                  background: 'var(--float-primary)',
                  borderRadius: 'var(--float-radius-sm)',
                  border: 'none',
                }}
              >
                {isLoading ? 'Updating...' : 'Set new password'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
