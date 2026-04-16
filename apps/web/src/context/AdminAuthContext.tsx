import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

interface AdminAuthContextType {
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const AdminAuthContext = createContext<AdminAuthContextType | null>(null)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('admin_token')
    setIsAuthenticated(!!token)
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    const loginRes = await axios.post(`${API_URL}/auth/login`, { email, password })
    const token = loginRes.data.access_token as string

    // Verify the user is an admin by checking their role via /auth/me.
    // Do NOT persist the token unless the role is "admin".
    let role: string | null = null
    try {
      const meRes = await axios.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      role = (meRes.data?.role as string) ?? null
    } catch {
      throw new Error('Access denied')
    }

    if (role !== 'admin') {
      throw new Error('Access denied. Admin credentials required.')
    }

    localStorage.setItem('admin_token', token)
    setIsAuthenticated(true)
  }

  const logout = () => {
    localStorage.removeItem('admin_token')
    setIsAuthenticated(false)
  }

  return (
    <AdminAuthContext.Provider value={{ isAuthenticated, login, logout, isLoading }}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext)
  if (!context) throw new Error('useAdminAuth must be used within AdminAuthProvider')
  return context
}

export const adminApiClient = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
})

adminApiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('admin_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

adminApiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('admin_token')
      window.location.href = '/admin/login'
    }
    return Promise.reject(error)
  }
)
