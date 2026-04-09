import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTeenAuth } from '../../context/TeenAuthContext'

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
      style={{ background: 'var(--float-blue-50)' }}
    >
      <div
        className="w-full max-w-sm"
        style={{
          background: '#fff',
          borderRadius: '20px',
          padding: '40px 28px',
          boxShadow: 'var(--float-shadow-md)',
        }}
      >
        <div className="flex flex-col items-center mb-8">
          <div
            className="flex items-center justify-center mb-4"
            style={{
              width: '56px',
              height: '56px',
              background: 'var(--float-blue-100)',
              borderRadius: '16px',
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 40 40"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 22c3-4 6-7 10-7s6 6 10 6 6-6 10-6c2 0 3.5 1 5 2.5"
                stroke="var(--float-blue-600, #2563eb)"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d="M4 30c3-4 6-7 10-7s6 6 10 6 6-6 10-6c2 0 3.5 1 5 2.5"
                stroke="var(--float-blue-600, #2563eb)"
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
                opacity="0.4"
              />
            </svg>
          </div>
          <h1
            className="text-2xl font-semibold"
            style={{ color: 'var(--float-grey-800)' }}
          >
            Float
          </h1>
          <p
            className="text-sm mt-1"
            style={{ color: 'var(--float-grey-400)' }}
          >
            Your anxiety toolkit
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3.5 py-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{ color: 'var(--float-grey-800)' }}
              placeholder="you@example.com"
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
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-3.5 py-3 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              style={{ color: 'var(--float-grey-800)' }}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-500 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
          >
            {isLoading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
