import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { parentApiClient } from '../api/client'

interface ParentAuthContextType {
  isAuthenticated: boolean
  patientId: string | null
  mustChangePassword: boolean
  login: (email: string, password: string) => Promise<{ mustChangePassword: boolean }>
  setMustChangePassword: (value: boolean) => void
  logout: () => void
  isLoading: boolean
}

const ParentAuthContext = createContext<ParentAuthContextType | null>(null)

export function ParentAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  // MVP: single child. `patientId` is the parent's linked child.
  const [patientId, setPatientId] = useState<string | null>(null)
  const [mustChangePassword, setMustChangePasswordState] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('parent_access_token')
    const pid = localStorage.getItem('parent_patient_id')
    const mcp = localStorage.getItem('parent_must_change_password') === 'true'
    if (token && pid) {
      parentApiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`
      setIsAuthenticated(true)
      setPatientId(pid)
      setMustChangePasswordState(mcp)
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    const response = await parentApiClient.post('/auth/login', { email, password })
    const { access_token } = response.data
    localStorage.setItem('parent_access_token', access_token)

    const profileResponse = await parentApiClient.get('/auth/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    const pid = profileResponse.data.patient_id
    const mcp = !!profileResponse.data.must_change_password
    localStorage.setItem('parent_patient_id', pid ?? '')
    localStorage.setItem('parent_must_change_password', mcp ? 'true' : 'false')

    parentApiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
    setIsAuthenticated(true)
    setPatientId(pid ?? null)
    setMustChangePasswordState(mcp)
    return { mustChangePassword: mcp }
  }

  const setMustChangePassword = (value: boolean) => {
    localStorage.setItem('parent_must_change_password', value ? 'true' : 'false')
    setMustChangePasswordState(value)
  }

  const logout = () => {
    localStorage.removeItem('parent_access_token')
    localStorage.removeItem('parent_patient_id')
    localStorage.removeItem('parent_must_change_password')
    delete parentApiClient.defaults.headers.common['Authorization']
    setIsAuthenticated(false)
    setPatientId(null)
    setMustChangePasswordState(false)
  }

  return (
    <ParentAuthContext.Provider
      value={{ isAuthenticated, patientId, mustChangePassword, login, setMustChangePassword, logout, isLoading }}
    >
      {children}
    </ParentAuthContext.Provider>
  )
}

export function useParentAuth() {
  const context = useContext(ParentAuthContext)
  if (!context) throw new Error('useParentAuth must be used within ParentAuthProvider')
  return context
}
