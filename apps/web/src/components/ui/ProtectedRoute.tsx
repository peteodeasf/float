import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

/**
 * Which part of the app a screen belongs to.
 *   clinician — patients, education, settings: clinicians who have finished setup.
 *   practice  — the practice screens: office managers, and clinicians who are practice admins
 *               (the server decides who is an admin).
 *   setup     — the setup screens: anyone signed in who has not finished setup.
 * docs/plans/clinician-practice-onboarding.md
 */
type Area = 'clinician' | 'practice' | 'setup'

export default function ProtectedRoute({ children, area = 'clinician' }: { children: React.ReactNode; area?: Area }) {
  const { isAuthenticated, isLoading, setupComplete, isPracticeManager } = useAuth()

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
  if (area === 'setup') {
    if (setupComplete) return <Navigate to={isPracticeManager ? '/practice' : '/dashboard'} replace />
  } else if (!setupComplete) {
    return <Navigate to="/setup/steps" replace />
  } else if (area === 'clinician' && isPracticeManager) {
    return <Navigate to="/practice" replace />
  }

  // One wrapper around every clinician screen, so the app's text boxes can be styled in one place
  // (styles/tokens.css, .float-app input) rather than on each of the 71 of them. The child's and
  // parent's apps are not inside it and keep their own look.
  return <div className="float-app">{children}</div>
}
