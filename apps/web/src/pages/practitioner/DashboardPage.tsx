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
        <p className="font-medium text-slate-800">{patient.name}</p>
        <p className="text-sm text-slate-400">{patient.email}</p>
      </td>
      <td className="px-6 py-4 text-sm text-slate-500">
        {new Date(patient.created_at).toLocaleDateString()}
      </td>
      <td className="px-6 py-4 text-right">
        <span className="text-slate-300 group-hover:text-slate-400 transition-colors text-sm">
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
    <div className="min-h-screen bg-slate-50">
      <nav
        className="bg-white px-8 flex items-center justify-between"
        style={{ height: '56px', borderBottom: '1px solid var(--float-grey-200)' }}
      >
        <FloatLogo size="sm" />
        <button
          onClick={handleLogout}
          className="text-sm text-slate-400 hover:text-slate-600 transition-colors cursor-pointer bg-transparent border-none"
        >
          Sign out
        </button>
      </nav>

      <main className="px-8 py-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-slate-800">My patients</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              {patients?.length ?? 0} patient{patients?.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            onClick={() => navigate('/patients/new')}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Add patient
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden" style={{ boxShadow: 'var(--float-shadow)' }}>
          {isLoading && (
            <div className="px-6 py-12 text-center text-slate-400">
              Loading patients...
            </div>
          )}

          {error && (
            <div className="px-6 py-12 text-center text-red-400">
              Failed to load patients
            </div>
          )}

          {patients && patients.length === 0 && (
            <div className="px-6 py-16 text-center">
              <p className="text-lg font-medium text-slate-600 mb-1">No patients yet</p>
              <p className="text-sm text-slate-400 mb-5">
                Add your first patient to get started
              </p>
              <button
                onClick={() => navigate('/patients/new')}
                className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Add patient
              </button>
            </div>
          )}

          {patients && patients.length > 0 && (
            <table className="w-full">
              <thead>
                <tr className="text-left">
                  <th className="px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Patient
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">
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
