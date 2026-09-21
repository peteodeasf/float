import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import axios from 'axios'
import { apiClient } from '../api/client'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

interface AuthContextType {
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
  /** Finished the setup screens. Until then every screen sends them to /setup/steps. */
  setupComplete: boolean
  /** An office manager: signs in here but only uses the practice screens. */
  isPracticeManager: boolean
  /** The clinician's organization (institution) name, shown in the top bar. */
  organizationName: string | null
  /** Re-read the account after finishing setup. */
  refreshAccount: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

/** The account signed in, but it is a child's or a parent's, not a clinician's. */
export class NotAClinicianError extends Error {}

// Peter, 2026-09-10: a child's login got into the clinician app. The clinician routes on the server
// already refused it, but the app itself let anyone in. This asks the server whether the account is
// a clinician's (or an office manager's) before anything is stored.

interface Account {
  is_practitioner: boolean
  is_practice_manager?: boolean
  setup_complete?: boolean
  organization_name?: string | null
}

const belongsHere = (a: Account) => !!a.is_practitioner || !!a.is_practice_manager

/** The account a brand-new token belongs to. Plain axios, not apiClient: apiClient puts whatever
 *  token is already saved on every request, so a clinician still signed in on this browser would
 *  have been the account checked, and a child's login let through. */
async function accountForToken(token: string): Promise<Account> {
  return (await axios.get(`${API_URL}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).data
}

/** The account of the session already saved here. apiClient renews it if it has expired. */
async function savedAccount(): Promise<Account> {
  return (await apiClient.get('/auth/me')).data
}

function clearTokens() {
  localStorage.removeItem('access_token')
  localStorage.removeItem('refresh_token')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  // Assumed done until the server says otherwise, so an offline start does not strand anyone.
  const [setupComplete, setSetupComplete] = useState(true)
  const [isPracticeManager, setIsPracticeManager] = useState(false)
  const [organizationName, setOrganizationName] = useState<string | null>(null)

  const applyAccount = (a: Account) => {
    setSetupComplete(a.setup_complete !== false)
    setIsPracticeManager(!!a.is_practice_manager)
    setOrganizationName(a.organization_name ?? null)
  }

  useEffect(() => {
    if (!localStorage.getItem('access_token')) {
      setIsLoading(false)
      return
    }
    // A child's or parent's account that signed in here before this check existed still has its
    // token saved, so an existing session is checked too.
    savedAccount()
      .then(a => {
        if (belongsHere(a)) {
          applyAccount(a)
          setIsAuthenticated(true)
        } else clearTokens()
      })
      // Offline or the server is down: keep the session. The server still refuses a non-clinician
      // on every clinician route, and a rejected token signs out on its own (api/session.ts).
      .catch(() => setIsAuthenticated(!!localStorage.getItem('access_token')))
      .finally(() => setIsLoading(false))
  }, [])

  const login = async (email: string, password: string) => {
    const response = await apiClient.post('/auth/login', { email, password })
    const { access_token, refresh_token } = response.data
    const account = await accountForToken(access_token)
    if (!belongsHere(account)) throw new NotAClinicianError()
    localStorage.setItem('access_token', access_token)
    localStorage.setItem('refresh_token', refresh_token)
    applyAccount(account)
    setIsAuthenticated(true)
  }

  const logout = () => {
    clearTokens()
    setIsAuthenticated(false)
    setOrganizationName(null)
  }

  const refreshAccount = async () => applyAccount(await savedAccount())

  return (
    <AuthContext.Provider value={{
      isAuthenticated, login, logout, isLoading, setupComplete, isPracticeManager, organizationName, refreshAccount,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
