import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPatient, getPreSessionBrief } from '../../api/patients'
import { getTreatmentPlan, getTriggers, createTreatmentPlan } from '../../api/treatment'
import { useMutation, useQueryClient } from '@tanstack/react-query'

function TrendPill({ label, trend }: { label: string; trend: string }) {
  const colors: Record<string, string> = {
    improving: 'bg-green-100 text-green-700',
    stable: 'bg-slate-100 text-slate-600',
    worsening: 'bg-red-100 text-red-700',
    'insufficient data': 'bg-slate-100 text-slate-400',
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[trend] ?? colors['insufficient data']}`}>
        {trend}
      </span>
    </div>
  )
}

export default function PatientPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()

  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => getPatient(patientId!),
    enabled: !!patientId
  })

  const { data: brief } = useQuery({
    queryKey: ['brief', patientId],
    queryFn: () => getPreSessionBrief(patientId!),
    enabled: !!patientId
  })

  const { data: plan } = useQuery({
    queryKey: ['plan', patientId],
    queryFn: () => getTreatmentPlan(patientId!),
    enabled: !!patientId
  })

  const { data: triggers } = useQuery({
    queryKey: ['triggers', plan?.id],
    queryFn: () => getTriggers(plan!.id),
    enabled: !!plan?.id
  })

  const queryClient = useQueryClient()

  const createPlanMutation = useMutation({
    mutationFn: () => createTreatmentPlan(patientId!, {
      clinical_track: 'exposure',
      parent_visibility_level: 'summary'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', patientId] })
    }
  })

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-8 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate('/dashboard')}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          ← Back
        </button>
        <h1 className="text-xl font-semibold text-slate-800">
          {patient?.name ?? 'Loading...'}
        </h1>
      </nav>

      <main className="px-8 py-8 max-w-5xl mx-auto space-y-6">

        {/* Pre-session brief */}
        {brief && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              Pre-session brief
            </h2>

            <div className="grid grid-cols-2 gap-6 mb-5">
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
                  Experiments since last session
                </p>
                <p className="text-2xl font-semibold text-slate-800">
                  {brief.experiments_since_last_session}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
                  Open flags
                </p>
                <p className={`text-2xl font-semibold ${brief.open_flag_count > 0 ? 'text-amber-500' : 'text-slate-800'}`}>
                  {brief.open_flag_count}
                </p>
              </div>
            </div>

            <div className="flex gap-6 mb-5">
              <TrendPill label="BIP" trend={brief.bip_trend} />
              <TrendPill label="Distress" trend={brief.distress_thermometer_trend} />
            </div>

            <div className="bg-blue-50 rounded-lg px-4 py-3 mb-4">
              <p className="text-xs font-medium text-blue-400 uppercase tracking-wider mb-1">
                Recommended focus
              </p>
              <p className="text-sm text-blue-800 font-medium">
                {brief.recommended_focus}
              </p>
            </div>

            {brief.recent_learnings.length > 0 && (
              <div>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
                  Recent learnings
                </p>
                <ul className="space-y-1">
                  {brief.recent_learnings.map((learning, i) => (
                    <li key={i} className="text-sm text-slate-600 flex gap-2">
                      <span className="text-slate-300 mt-0.5">—</span>
                      <span>{learning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Treatment plan */}
        {plan && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">
                Treatment plan
              </h2>
              <div className="flex gap-2">
                <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">
                  {plan.clinical_track}
                </span>
                <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">
                  {plan.status}
                </span>
              </div>
            </div>

            {triggers && triggers.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-3">
                  Trigger situations
                </p>
                {triggers.map((trigger) => (
                  <div
                    key={trigger.id}
                    onClick={() => navigate(`/patients/${patientId}/triggers/${trigger.id}/ladder`)}
                    className="flex items-center justify-between py-3 px-4 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors"
                  >
                    <p className="text-sm font-medium text-slate-700">
                      {trigger.name}
                    </p>
                    {trigger.distress_thermometer_rating && (
                      <span className="text-sm font-medium text-slate-500">
                        DT {trigger.distress_thermometer_rating}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">
                No trigger situations added yet
              </p>
            )}
          </div>
        )}

        {/* No plan yet */}
        {!plan && patient && (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
            <p className="text-slate-400 mb-3">No treatment plan yet</p>
            <button
              onClick={() => createPlanMutation.mutate()}
              disabled={createPlanMutation.isPending}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50">
              {createPlanMutation.isPending ? 'Creating...' : 'Create treatment plan'}
            </button>
          </div>
        )}

      </main>
    </div>
  )
}
