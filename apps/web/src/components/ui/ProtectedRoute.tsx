import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-400">Loading...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // One wrapper around every clinician screen, so the app's text boxes can be styled in one place
  // (styles/tokens.css, .float-app input) rather than on each of the 71 of them. The child's and
  // parent's apps are not inside it and keep their own look.
  return <div className="float-app">{children}</div>
}
