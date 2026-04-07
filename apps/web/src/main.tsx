import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import { TeenAuthProvider } from './context/TeenAuthContext'
import ProtectedRoute from './components/ui/ProtectedRoute'
import LoginPage from './pages/auth/LoginPage'
import DashboardPage from './pages/practitioner/DashboardPage'
import PatientPage from './pages/practitioner/PatientPage'
import LadderPage from './pages/practitioner/LadderPage'
import NewPatientPage from './pages/practitioner/NewPatientPage'
import ProgressPage from './pages/practitioner/ProgressPage'
import TeenLoginPage from './pages/teen/TeenLoginPage'
import TeenHomePage from './pages/teen/TeenHomePage'
import TeenExperimentPage from './pages/teen/TeenExperimentPage'
import MonitorLandingPage from './pages/monitor/MonitorLandingPage'
import './index.css'

const queryClient = new QueryClient()

function TeenProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('teen_access_token')
  if (!token) return <Navigate to="/teen/login" replace />
  return <>{children}</>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TeenAuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Practitioner routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/dashboard" element={
                <ProtectedRoute><DashboardPage /></ProtectedRoute>
              } />
              <Route path="/patients/new" element={
                <ProtectedRoute><NewPatientPage /></ProtectedRoute>
              } />
              <Route path="/patients/:patientId" element={
                <ProtectedRoute><PatientPage /></ProtectedRoute>
              } />
              <Route path="/patients/:patientId/triggers/:triggerId/ladder" element={
                <ProtectedRoute><LadderPage /></ProtectedRoute>
              } />
              <Route path="/patients/:patientId/progress" element={
                <ProtectedRoute><ProgressPage /></ProtectedRoute>
              } />

              {/* Teen routes */}
              <Route path="/teen/login" element={<TeenLoginPage />} />
              <Route path="/teen/home" element={
                <TeenProtectedRoute><TeenHomePage /></TeenProtectedRoute>
              } />
              <Route path="/teen/experiment/:rungId" element={
                <TeenProtectedRoute><TeenExperimentPage /></TeenProtectedRoute>
              } />

              {/* Public monitoring form */}
              <Route path="/monitor/:token" element={<MonitorLandingPage />} />

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
        </TeenAuthProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
)
