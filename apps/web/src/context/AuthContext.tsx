import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import axios from 'axios'
import { apiClient } from '../api/client'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

interface AuthContextType {
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

/** The account signed in, but it is a child's or a parent's, not a clinician's. */
export class NotAClinicianError extends Error {}

// Peter, 2026-09-10: a child's login got into the clinician app. The clinician routes on the server
// already refused it, but the app itself let anyone in. This asks the server whether the account is
// a clinician's — the same test those routes use — before anything is stored.

/** The account a brand-new token belongs to. Plain axios, not apiClient: apiClient puts whatever
 *  token is already saved on every request, so a clinician still signed in on this browser would
 *  have been the account checked, and a child's login let through. */
async function tokenIsClinician(token: string): Promise<boolean> {
  const me = await axios.get(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
  return !!me.data?.is_practitioner
}

/** The account of the session already saved here. apiClient renews it if it has expired. */
async function savedSessionIsClinician(): Promise<boolean> {
  const me = await apiClient.get('/auth/me')
  return !!me.data?.is_practitioner
}

function clearTokens() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!localStorage.getItem('access_token')) {
      setIsLoading(false)
      return
    }
    // A child's or parent's account that signed in here before this check existed still has its
    // token saved, so an existing session is checked too.
    savedSessionIsClinician()
      .then(ok => {
        if (ok) setIsAuthenticated(true)
        else clearTokens()
      })
      // Offline or the server is down: keep the session. The server still refuses a non-clinician
      // on every clinician route, and a rejected token signs out on its own (api/session.ts).
      .catch(() => setIsAuthenticated(!!localStorage.getItem('access_token')))
      .finally(() => setIsLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const response = await apiClient.post('/auth/login', { email, password })
    const { access_token, refresh_token } = response.data
    if (!(await tokenIsClinician(access_token))) throw new NotAClinicianError()
    localStorage.setItem('access_token', access_token)
    localStorage.setItem('refresh_token', refresh_token)
    setIsAuthenticated(true)
  }

  const logout = () => {
    clearTokens()
    setIsAuthenticated(false)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
