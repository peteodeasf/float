import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth } from '../../context/AdminAuthContext'
import FloatLogo from '../../components/ui/FloatLogo'
import { Button } from '../../components/ui/primitives'

export default function AdminLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAdminAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await login(email, password)
      navigate('/admin/dashboard')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : ''
      if (message.startsWith('Access denied')) {
        setError('Access denied. Admin credentials required.')
      } else {
        setError('Invalid credentials or insufficient permissions.')
      }
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
          <span
            style={{
              marginTop: '12px',
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--float-text-hint)',
              background: 'var(--float-surface-sunken)',
              padding: '4px 10px',
              borderRadius: 'var(--float-radius-pill)',
            }}
          >
            Admin
          </span>
        </div>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
        >
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
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
              style={{
                color: 'var(--float-text)',
                border: '1px solid var(--float-border)',
                borderRadius: 'var(--float-radius-control)',
                '--tw-ring-color': 'var(--float-primary)',
              } as React.CSSProperties}
              placeholder="you@example.com"
              required
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
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
              style={{
                color: 'var(--float-text)',
                border: '1px solid var(--float-border)',
                borderRadius: 'var(--float-radius-control)',
                '--tw-ring-color': 'var(--float-primary)',
              } as React.CSSProperties}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-center" style={{ color: 'var(--float-danger)' }}>
              {error}
            </p>
          )}

          <Button
            type="submit"
            kind="primary"
            disabled={isLoading}
            className="w-full"
            style={{ width: '100%' }}
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  )
}
