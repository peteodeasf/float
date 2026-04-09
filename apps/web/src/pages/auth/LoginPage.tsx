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
      style={{ background: 'var(--float-grey-50)' }}
    >
      <div
        className="w-full max-w-md"
        style={{
          background: '#fff',
          borderRadius: 'var(--float-radius)',
          boxShadow: 'var(--float-shadow-md)',
          padding: '48px 40px',
        }}
      >
        <div className="flex flex-col items-center mb-8">
          <FloatLogo size="lg" />
          <p
            className="mt-3 text-sm"
            style={{ color: 'var(--float-grey-400)' }}
          >
            Supporting anxious children and their families
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: 'var(--float-grey-600)' }}
            >
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ color: 'var(--float-grey-800)', '--tw-ring-color': '#2563eb' } as React.CSSProperties}
              placeholder="you@example.com"
              required
            />
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-1.5"
              style={{ color: 'var(--float-grey-600)' }}
            >
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:border-transparent"
              style={{ color: 'var(--float-grey-800)', '--tw-ring-color': '#2563eb' } as React.CSSProperties}
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
            style={{ background: '#2563eb' }}
            onMouseOver={(e) => { if (!isLoading) (e.currentTarget.style.background = '#1d4ed8') }}
            onMouseOut={(e) => { e.currentTarget.style.background = '#2563eb' }}
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
