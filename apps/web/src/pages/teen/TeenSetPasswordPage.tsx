import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { teenApiClient } from '../../api/client'
import { useTeenAuth } from '../../context/TeenAuthContext'
import FloatLogo from '../../components/ui/FloatLogo'

export default function TeenSetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { setMustChangePassword } = useTeenAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match')
      return
    }
    setIsLoading(true)
    try {
      await teenApiClient.put('/auth/set-password', { password })
      setMustChangePassword(false)
      navigate('/teen/home')
    } catch {
      setError('Could not set password. Please try again.')
    } finally {
      setIsLoading(false)
    }
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
        <div className="flex flex-col items-center" style={{ marginBottom: '24px' }}>
          <FloatLogo size="lg" />
        </div>

        <h1 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--float-text)', margin: '0 0 8px', textAlign: 'center' }}>
          Welcome to Float.
        </h1>
        <p style={{ fontSize: '14px', color: 'var(--float-text-hint)', margin: '0 0 24px', textAlign: 'center' }}>
          Set your password to get started.
        </p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--float-text-secondary)' }}>
              New password
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
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--float-text-secondary)' }}>
              Confirm password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
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
          >
            {isLoading ? 'Saving...' : 'Set password'}
          </button>
        </form>
      </div>
    </div>
  )
}
