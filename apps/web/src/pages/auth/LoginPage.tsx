import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import FloatLogo from '../../components/ui/FloatLogo'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const { login } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch {
      setError('Invalid email or password')
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
          <p
            className="text-sm"
            style={{ color: 'var(--float-text-hint)', marginTop: '16px' }}
          >
            Supporting anxious children and their families
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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
                borderRadius: 'var(--float-radius-sm)',
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
            disabled={isLoading}
            className="w-full py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50 cursor-pointer"
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
