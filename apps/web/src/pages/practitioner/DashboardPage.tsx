import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getPatients, Patient } from '../../api/patients'
import FloatLogo from '../../components/ui/FloatLogo'

function PatientRow({ patient, onClick }: { patient: Patient; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors group"
    >
      <td className="px-6 py-4">
        <p className="font-medium" style={{ color: 'var(--float-text)' }}>{patient.name}</p>
        <p className="text-sm" style={{ color: 'var(--float-text-hint)' }}>{patient.email}</p>
      </td>
      <td className="px-6 py-4 text-sm" style={{ color: 'var(--float-text-secondary)' }}>
        {new Date(patient.created_at).toLocaleDateString()}
      </td>
      <td className="px-6 py-4 text-right">
        <span className="text-slate-300 group-hover:text-teal-500 transition-colors text-sm">
          &rarr;
        </span>
      </td>
    </tr>
  )
}

export default function DashboardPage() {
  const { logout } = useAuth()
  const navigate = useNavigate()

  const { data: patients, isLoading, error } = useQuery({
    queryKey: ['patients'],
    queryFn: getPatients,
  })

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--float-bg)' }}>
      <nav
        className="bg-white px-8 flex items-center justify-between"
        style={{ height: '56px', borderBottom: '1px solid var(--float-border)' }}
      >
        <FloatLogo size="md" />
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/education')}
            className="flex items-center gap-1.5 text-sm transition-colors cursor-pointer bg-transparent border-none"
            style={{ color: 'var(--float-text-secondary)' }}
            onMouseOver={(e) => { e.currentTarget.style.color = 'var(--float-primary)' }}
            onMouseOut={(e) => { e.currentTarget.style.color = 'var(--float-text-secondary)' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
            Education
          </button>
          <button
            onClick={handleLogout}
            className="text-sm transition-colors cursor-pointer bg-transparent border-none"
            style={{ color: 'var(--float-text-secondary)' }}
            onMouseOver={(e) => { e.currentTarget.style.color = 'var(--float-primary)' }}
            onMouseOut={(e) => { e.currentTarget.style.color = 'var(--float-text-secondary)' }}
          >
            Sign out
          </button>
        </div>
      </nav>

      <main className="px-8 py-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl" style={{ fontWeight: 600, color: 'var(--float-text)' }}>
              My patients
            </h2>
            <p className="text-sm mt-0.5">
              <span
                className="inline-block px-2 py-0.5 rounded-full text-xs font-medium"
                style={{ background: 'var(--float-primary-light)', color: 'var(--float-primary-text)' }}
              >
                {patients?.length ?? 0} patient{patients?.length !== 1 ? 's' : ''}
              </span>
            </p>
          </div>
          <button
            onClick={() => navigate('/patients/new')}
            className="text-white px-4 py-2 text-sm font-medium transition-colors cursor-pointer"
            style={{
              background: 'var(--float-primary)',
              borderRadius: 'var(--float-radius-sm)',
              border: 'none',
            }}
            onMouseOver={(e) => { e.currentTarget.style.background = 'var(--float-primary-dark)' }}
            onMouseOut={(e) => { e.currentTarget.style.background = 'var(--float-primary)' }}
          >
            Add patient
          </button>
        </div>

        <div
          className="bg-white overflow-hidden"
          style={{
            borderRadius: 'var(--float-radius)',
            border: '1px solid var(--float-border)',
            boxShadow: 'var(--float-shadow)',
          }}
        >
          {isLoading && (
            <div className="px-6 py-12 text-center" style={{ color: 'var(--float-text-hint)' }}>
              Loading patients...
            </div>
          )}

          {error && (
            <div className="px-6 py-12 text-center" style={{ color: 'var(--float-danger)' }}>
              Failed to load patients
            </div>
          )}

          {patients && patients.length === 0 && (
            <div className="px-6 py-16 text-center">
              <p className="text-lg font-medium mb-1" style={{ color: 'var(--float-text-secondary)' }}>
                No patients yet
              </p>
              <p className="text-sm mb-5" style={{ color: 'var(--float-text-hint)' }}>
                Add your first patient to get started
              </p>
              <button
                onClick={() => navigate('/patients/new')}
                className="text-white px-5 py-2.5 text-sm font-medium transition-colors cursor-pointer"
                style={{
                  background: 'var(--float-primary)',
                  borderRadius: 'var(--float-radius-sm)',
                  border: 'none',
                }}
                onMouseOver={(e) => { e.currentTarget.style.background = 'var(--float-primary-dark)' }}
                onMouseOut={(e) => { e.currentTarget.style.background = 'var(--float-primary)' }}
              >
                Add patient
              </button>
            </div>
          )}

          {patients && patients.length > 0 && (
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--float-text-hint)' }}>
                    Patient
                  </th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--float-text-hint)' }}>
                    Added
                  </th>
                  <th className="px-6 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => (
                  <PatientRow
                    key={patient.id}
                    patient={patient}
                    onClick={() => navigate(`/patients/${patient.id}`)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  )
}
