import { useMemo, useState, type CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { getPatients, PHASES, type Patient, type Phase } from '../../api/patients'
import PractitionerNav from '../../components/ui/PractitionerNav'

// Relative "last activity" label
export function relativeActivityLabel(iso: string | null | undefined): string {
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

// Where the patient is up to. The server works this out — see backend/app/services/patient_phase.py
// — so every screen agrees and the column cannot freeze the way the old step counter did. That one
// was four conditions chained with `and`, one of them could never become true, and every patient
// sat at "Setup · Step 3 of 4" while nothing complained.
export function phaseLabel(p: Patient): string {
  return p.phase_label ?? 'New'
}

/**
 * Which patients the list shows.
 *
 * "all" means every patient EXCEPT closed ones. Closed is reachable only by choosing it, because a
 * clinician with years of finished cases does not want them in the way — but hiding them with no
 * way back would lose them, so the filter has its own entry.
 */
export function filterByPhase(patients: Patient[], filter: Phase | 'all'): Patient[] {
  if (filter === 'all') return patients.filter(p => p.phase !== 'closed')
  return patients.filter(p => p.phase === filter)
}

/** Muted for finished cases, ordinary for everyone else. */
export function phaseStyle(p: Patient): CSSProperties {
  return p.phase === 'closed'
    ? { color: 'var(--float-text-hint)', fontStyle: 'italic' }
    : { color: 'var(--float-text)' }
}

// Reasons the patient needs attention (empty array = no badge)
export function needsAttentionReasons(p: Patient): string[] {
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

export function PatientRow({ patient, onClick }: { patient: Patient; onClick: () => void }) {
  const reasons = needsAttentionReasons(patient)
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
      <td className="px-6 py-4 text-xs" style={phaseStyle(patient)}>
        {phaseLabel(patient)}
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

  // Closed cases are hidden until asked for. A clinician with two years of finished patients does
  // not want them in the way — Peter, 2026-08-31.
  const [phaseFilter, setPhaseFilter] = useState<Phase | 'all'>('all')

  const { data: patients, isLoading, error } = useQuery({
    queryKey: ['patients'],
    queryFn: getPatients,
  })

  const shown = useMemo(() => filterByPhase(patients ?? [], phaseFilter), [patients, phaseFilter])
  const closedCount = (patients ?? []).filter(p => p.phase === 'closed').length

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
                {shown.length} patient{shown.length !== 1 ? 's' : ''}
              </span>
              {phaseFilter === 'all' && closedCount > 0 && (
                <span className="ml-2 text-xs" style={{ color: 'var(--float-text-hint)' }}>
                  {closedCount} closed, hidden
                </span>
              )}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm ml-auto mr-3">
            <span style={{ color: 'var(--float-text-hint)' }}>Phase</span>
            <select
              value={phaseFilter}
              onChange={e => setPhaseFilter(e.target.value as Phase | 'all')}
              aria-label="Filter by phase"
              className="px-3 py-2 text-sm cursor-pointer"
              style={{
                borderRadius: 'var(--float-radius-sm)',
                border: '1px solid var(--float-border)',
                background: '#fff',
                color: 'var(--float-text)',
              }}
            >
              <option value="all">All open</option>
              {PHASES.map(p => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </label>
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
                    Phase
                  </th>
                  <th className="px-6 py-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--float-text-hint)' }}>
                    Last activity
                  </th>
                  <th className="px-6 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((patient) => (
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
