import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getPatients, Patient } from '../../api/patients'
import PractitionerNav from '../../components/ui/PractitionerNav'
import { SETUP_STEPS } from '../../lib/treatmentJourney'

// Relative "last activity" label
function relativeActivityLabel(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate())
  const days = Math.round((startOfDay(new Date()).getTime() - startOfDay(d).getTime()) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Two-mode journey progress: Setup (numbered, worked once) → Treatment (ongoing).
// Setup completes — and treatment begins — when the plan is built.
function computeProgress(p: Patient): { label: string } {
  const setupComplete: boolean[] = [
    p.has_monitoring_form,
    p.situation_count >= 1,
    p.has_consultation_1_note && p.has_parent_da,
    p.has_consultation_2_note && p.has_patient_da,
    p.has_active_situation_with_behaviors,
  ]
  if (setupComplete.every(Boolean)) {
    return { label: p.plan_status === 'active' ? 'In treatment' : 'In treatment · activate plan' }
  }
  const firstIncomplete = setupComplete.findIndex(c => !c)
  const idx = firstIncomplete === -1 ? SETUP_STEPS.length - 1 : firstIncomplete
  return { label: `Setup · Step ${idx + 1} of ${SETUP_STEPS.length} · ${SETUP_STEPS[idx]}` }
}

// Reasons the patient needs attention (empty array = no badge)
function needsAttentionReasons(p: Patient): string[] {
  const reasons: string[] = []
  if (p.overdue_experiment_count > 0) {
    reasons.push(`Overdue experiment${p.overdue_experiment_count > 1 ? 's' : ''} (${p.overdue_experiment_count})`)
  }
  if (p.active_plan_with_no_recent_activity) {
    reasons.push('No activity this week')
  }
  if (p.monitoring_form_sent && p.monitoring_entries_count < 3) {
    reasons.push(`Awaiting monitoring entries (${p.monitoring_entries_count}/3)`)
  }
  return reasons
}

function PatientRow({ patient, onClick }: { patient: Patient; onClick: () => void }) {
  const reasons = needsAttentionReasons(patient)
  const progress = computeProgress(patient)
  return (
    <tr
      onClick={onClick}
      className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors group"
    >
      <td className="px-6 py-4">
        <div className="flex items-center gap-2">
          <p className="font-medium" style={{ color: 'var(--float-text)' }}>{patient.name}</p>
          {reasons.length > 0 && (
            <span
              title={reasons.join('\n')}
              aria-label="Needs attention"
              style={{ color: '#f59e0b', fontSize: '10px', lineHeight: 1 }}
            >
              ●
            </span>
          )}
        </div>
        <p className="text-sm" style={{ color: 'var(--float-text-hint)' }}>{patient.email}</p>
      </td>
      <td className="px-6 py-4 text-xs" style={{ color: 'var(--float-text-hint)' }}>
        {progress.label}
      </td>
      <td className="px-6 py-4 text-sm" style={{ color: 'var(--float-text-secondary)' }}>
        {relativeActivityLabel(patient.last_activity_at)}
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
  const navigate = useNavigate()

  const { data: patients, isLoading, error } = useQuery({
    queryKey: ['patients'],
    queryFn: getPatients,
  })

  return (
    <div className="min-h-screen" style={{ background: 'var(--float-bg)' }}>
      <PractitionerNav activePage="patients" />

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
                    Progress
                  </th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--float-text-hint)' }}>
                    Last activity
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
