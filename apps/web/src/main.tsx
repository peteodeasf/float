import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import { TeenAuthProvider } from './context/TeenAuthContext'
import { AdminAuthProvider } from './context/AdminAuthContext'
import ProtectedRoute from './components/ui/ProtectedRoute'
import AdminProtectedRoute from './components/auth/AdminProtectedRoute'
import AdminLoginPage from './pages/admin/AdminLoginPage'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import LoginPage from './pages/auth/LoginPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import DashboardPage from './pages/practitioner/DashboardPage'
import PatientPage from './pages/practitioner/PatientPage'
import NewPatientPage from './pages/practitioner/NewPatientPage'
import ProgressPage from './pages/practitioner/ProgressPage'
import TeenLoginPage from './pages/teen/TeenLoginPage'
import TeenResetPasswordPage from './pages/teen/TeenResetPasswordPage'
import TeenSetPasswordPage from './pages/teen/TeenSetPasswordPage'
import TeenHomePage from './pages/teen/TeenHomePage'
import TeenExperimentPage from './pages/teen/TeenExperimentPage'
import TeenRecordPage from './pages/teen/TeenRecordPage'
import TeenPlansPage from './pages/teen/TeenPlansPage'
import MonitorLandingPage from './pages/monitor/MonitorLandingPage'
import MonitoringReportPage from './pages/practitioner/MonitoringReportPage'
import EducationIndexPage from './pages/practitioner/EducationIndexPage'
import EducationModulePage from './pages/practitioner/EducationModulePage'
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
          <AdminAuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Practitioner routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/dashboard" element={
                <ProtectedRoute><DashboardPage /></ProtectedRoute>
              } />
              <Route path="/patients/new" element={
                <ProtectedRoute><NewPatientPage /></ProtectedRoute>
              } />
              <Route path="/patients/:patientId" element={
                <ProtectedRoute><PatientPage /></ProtectedRoute>
              } />
              <Route path="/patients/:patientId/progress" element={
                <ProtectedRoute><ProgressPage /></ProtectedRoute>
              } />
              <Route path="/patients/:patientId/monitoring-report" element={
                <ProtectedRoute><MonitoringReportPage /></ProtectedRoute>
              } />
              <Route path="/education" element={
                <ProtectedRoute><EducationIndexPage /></ProtectedRoute>
              } />
              <Route path="/education/:moduleId" element={
                <ProtectedRoute><EducationModulePage /></ProtectedRoute>
              } />

              {/* Teen routes */}
              <Route path="/teen/login" element={<TeenLoginPage />} />
              <Route path="/teen/reset-password" element={<TeenResetPasswordPage />} />
              <Route path="/teen/set-password" element={
                <TeenProtectedRoute><TeenSetPasswordPage /></TeenProtectedRoute>
              } />
              <Route path="/teen/home" element={
                <TeenProtectedRoute><TeenHomePage /></TeenProtectedRoute>
              } />
              <Route path="/teen/experiment/:rungId" element={
                <TeenProtectedRoute><TeenExperimentPage /></TeenProtectedRoute>
              } />
              <Route path="/teen/record/:experimentId" element={
                <TeenProtectedRoute><TeenRecordPage /></TeenProtectedRoute>
              } />
              <Route path="/teen/plans" element={
                <TeenProtectedRoute><TeenPlansPage /></TeenProtectedRoute>
              } />

              {/* Public monitoring form */}
              <Route path="/monitor/:token" element={<MonitorLandingPage />} />

              {/* Admin routes */}
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/admin/dashboard" element={
                <AdminProtectedRoute><AdminDashboardPage /></AdminProtectedRoute>
              } />
              <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
          </AdminAuthProvider>
        </TeenAuthProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
)
