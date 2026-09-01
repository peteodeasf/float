import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import { TeenAuthProvider } from './context/TeenAuthContext'
import { ParentAuthProvider } from './context/ParentAuthContext'
import { AdminAuthProvider } from './context/AdminAuthContext'
import ProtectedRoute from './components/ui/ProtectedRoute'
import AdminProtectedRoute from './components/auth/AdminProtectedRoute'
import AdminLoginPage from './pages/admin/AdminLoginPage'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import AdminContentPage from './pages/admin/AdminContentPage'
import LoginPage from './pages/auth/LoginPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import DashboardPage from './pages/practitioner/DashboardPage'
import PatientPage from './pages/practitioner/PatientPage'
import SessionPage from './pages/practitioner/SessionPage'
import ArrowPage from './pages/practitioner/ArrowPage'
import SessionPreview from './pages/practitioner/__SessionPreview'
import NewPatientPage from './pages/practitioner/NewPatientPage'
import ProgressPage from './pages/practitioner/ProgressPage'
import TeenLoginPage from './pages/teen/TeenLoginPage'
import TeenResetPasswordPage from './pages/teen/TeenResetPasswordPage'
import TeenSetPasswordPage from './pages/teen/TeenSetPasswordPage'
import TeenHomePage from './pages/teen/TeenHomePage'
import TeenExperimentPage from './pages/teen/TeenExperimentPage'
import TeenExposurePage from './pages/teen/TeenExposurePage'
import TeenRecordPage from './pages/teen/TeenRecordPage'
import TeenPlansPage from './pages/teen/TeenPlansPage'
import TeenProgressPage from './pages/teen/TeenProgressPage'
import ParentLoginPage from './pages/parent/ParentLoginPage'
import ParentSetPasswordPage from './pages/parent/ParentSetPasswordPage'
import ParentResetPasswordPage from './pages/parent/ParentResetPasswordPage'
import ParentHomePage from './pages/parent/ParentHomePage'
import ParentMessagesPage from './pages/parent/ParentMessagesPage'
import TeenMessagesPage from './pages/teen/TeenMessagesPage'
import MonitorLandingPage from './pages/monitor/MonitorLandingPage'
import MonitoringReportPage from './pages/practitioner/MonitoringReportPage'
import EducationIndexPage from './pages/practitioner/EducationIndexPage'
import EducationModulePage from './pages/practitioner/EducationModulePage'
import TeenClosedPage from './pages/teen/TeenClosedPage'
import ParentClosedPage from './pages/parent/ParentClosedPage'
import { getTeenMe, getParentMe } from './api/me'
import './index.css'

const queryClient = new QueryClient()

// Both wrappers ask the server whether treatment has been closed, rather than reading the copy of
// /auth/me saved at login. A clinician can close a family who is already signed in, and they should
// find out on their next page load, not their next login. If the call fails we let them through —
// the backend refuses every write on a closed patient regardless.
function TeenProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('teen_access_token')
  const { data: me, isLoading } = useQuery({
    queryKey: ['teen-me'],
    queryFn: getTeenMe,
    enabled: !!token,
    staleTime: 60_000,
  })
  if (!token) return <Navigate to="/teen/login" replace />
  if (isLoading) return null
  if (me?.treatment_closed) return <TeenClosedPage />
  return <>{children}</>
}

function ParentProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('parent_access_token')
  const { data: me, isLoading } = useQuery({
    queryKey: ['parent-me'],
    queryFn: getParentMe,
    enabled: !!token,
    staleTime: 60_000,
  })
  if (!token) return <Navigate to="/parent/login" replace />
  if (isLoading) return null
  if (me?.treatment_closed) return <ParentClosedPage />
  return <>{children}</>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TeenAuthProvider>
          <ParentAuthProvider>
          <AdminAuthProvider>
          <BrowserRouter>
            <Routes>
              {/* Practitioner routes */}
              {/* Local design preview for session mode. Dev-only: stripped from prod builds. */}
              {import.meta.env.DEV && <Route path="/__session-preview" element={<SessionPreview />} />}
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
              <Route path="/patients/:patientId/arrow" element={
                <ProtectedRoute><ArrowPage /></ProtectedRoute>
              } />
              <Route path="/patients/:patientId/session" element={
                <ProtectedRoute><SessionPage /></ProtectedRoute>
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
              <Route path="/teen/experiment/:behaviorId" element={
                <TeenProtectedRoute><TeenExperimentPage /></TeenProtectedRoute>
              } />
              <Route path="/teen/exposure/:experimentId" element={
                <TeenProtectedRoute><TeenExposurePage /></TeenProtectedRoute>
              } />
              <Route path="/teen/record/:experimentId" element={
                <TeenProtectedRoute><TeenRecordPage /></TeenProtectedRoute>
              } />
              <Route path="/teen/plans" element={
                <TeenProtectedRoute><TeenPlansPage /></TeenProtectedRoute>
              } />
              <Route path="/teen/progress" element={
                <TeenProtectedRoute><TeenProgressPage /></TeenProtectedRoute>
              } />
              <Route path="/teen/messages" element={
                <TeenProtectedRoute><TeenMessagesPage /></TeenProtectedRoute>
              } />

              {/* Parent routes */}
              <Route path="/parent/login" element={<ParentLoginPage />} />
              <Route path="/parent/reset-password" element={<ParentResetPasswordPage />} />
              <Route path="/parent/set-password" element={
                <ParentProtectedRoute><ParentSetPasswordPage /></ParentProtectedRoute>
              } />
              <Route path="/parent/home" element={
                <ParentProtectedRoute><ParentHomePage /></ParentProtectedRoute>
              } />
              <Route path="/parent/messages" element={
                <ParentProtectedRoute><ParentMessagesPage /></ParentProtectedRoute>
              } />

              {/* Public monitoring form */}
              <Route path="/monitor/:token" element={<MonitorLandingPage />} />

              {/* Admin routes */}
              <Route path="/admin/login" element={<AdminLoginPage />} />
              <Route path="/admin/dashboard" element={
                <AdminProtectedRoute><AdminDashboardPage /></AdminProtectedRoute>
              } />
              <Route path="/admin/content" element={
                <AdminProtectedRoute><AdminContentPage /></AdminProtectedRoute>
              } />
              <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </BrowserRouter>
          </AdminAuthProvider>
          </ParentAuthProvider>
        </TeenAuthProvider>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>
)
