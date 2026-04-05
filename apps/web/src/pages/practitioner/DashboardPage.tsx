import { useAuth } from '../../context/AuthContext'
import { useNavigate } from 'react-router-dom'

export default function DashboardPage() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Float</h1>
        <button
          onClick={handleLogout}
          className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          Sign out
        </button>
      </nav>
      <main className="px-8 py-8">
        <h2 className="text-2xl font-semibold text-slate-800 mb-2">Dashboard</h2>
        <p className="text-slate-500">Your caseload will appear here.</p>
      </main>
    </div>
  )
}
