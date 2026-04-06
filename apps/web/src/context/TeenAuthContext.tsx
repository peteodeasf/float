import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { apiClient } from '../api/client'

interface TeenAuthContextType {
  isAuthenticated: boolean
  patientId: string | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const TeenAuthContext = createContext<TeenAuthContextType | null>(null)

export function TeenAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [patientId, setPatientId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('teen_access_token')
    const pid = localStorage.getItem('teen_patient_id')
    if (token && pid) {
      setIsAuthenticated(true)
      setPatientId(pid)
    }
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    const response = await apiClient.post('/auth/login', { email, password })
    const { access_token } = response.data
    localStorage.setItem('teen_access_token', access_token)

    // Get patient profile to extract patient ID
    const profileResponse = await apiClient.get('/auth/me', {
      headers: { Authorization: `Bearer ${access_token}` }
    })
    const pid = profileResponse.data.patient_id
    localStorage.setItem('teen_patient_id', pid)

    // Set token for subsequent requests
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${access_token}`
    setIsAuthenticated(true)
    setPatientId(pid)
  }

  const logout = () => {
    localStorage.removeItem('teen_access_token')
    localStorage.removeItem('teen_patient_id')
    delete apiClient.defaults.headers.common['Authorization']
    setIsAuthenticated(false)
    setPatientId(null)
  }

  return (
    <TeenAuthContext.Provider value={{ isAuthenticated, patientId, login, logout, isLoading }}>
      {children}
    </TeenAuthContext.Provider>
  )
}

export function useTeenAuth() {
  const context = useContext(TeenAuthContext)
  if (!context) throw new Error('useTeenAuth must be used within TeenAuthProvider')
  return context
}
