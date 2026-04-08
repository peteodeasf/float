import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getPatients, Patient } from '../../api/patients'

// TrendBadge reserved for future use with patient trend indicators
// function TrendBadge({ trend }: { trend: string }) { ... }

function PatientRow({ patient, onClick }: { patient: Patient; onClick: () => void }) {
  return (
    <tr
      onClick={onClick}
      className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
    >
      <td className="px-6 py-4">
        <p className="font-medium text-slate-800">{patient.name}</p>
        <p className="text-sm text-slate-400">{patient.email}</p>
      </td>
      <td className="px-6 py-4 text-sm text-slate-500">
        {new Date(patient.created_at).toLocaleDateString()}
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
      <nav className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">Float</h1>
        <button
          onClick={handleLogout}
          className="text-sm text-slate-500 hover:text-slate-800 transition-colors"
        >
          Sign out
        </button>
      </nav>

      <main className="px-8 py-8 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-semibold text-slate-800">Caseload</h2>
            <p className="text-slate-500 text-sm mt-0.5">
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

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
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
            <div className="px-6 py-12 text-center">
              <p className="text-slate-400">No patients yet</p>
              <button
                onClick={() => navigate('/patients/new')}
                className="mt-3 text-blue-600 text-sm font-medium hover:underline"
              >
                Add your first patient
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
