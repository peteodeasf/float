import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTeenAuth } from '../../context/TeenAuthContext'
import FloatLogo from '../../components/ui/FloatLogo'

export default function TeenLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useTeenAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await login(email, password)
      navigate('/teen/home')
    } catch {
      setError('Invalid email or password')
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
        <div className="flex flex-col items-center" style={{ marginBottom: '32px' }}>
          <FloatLogo size="lg" />
          <p
            className="text-sm"
            style={{ color: 'var(--float-text-hint)', marginTop: '12px' }}
          >
            Your anxiety toolkit
          </p>
        </div>

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
      </div>
    </div>
  )
}
