import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getTriggers, getLadder, getLadderFlags, reviewLadder } from '../../api/treatment'
import { getTreatmentPlan } from '../../api/treatment'

function DTBadge({ value }: { value: number | null }) {
  if (!value) return <span className="text-slate-300 text-sm">—</span>
  const color =
    value <= 3 ? 'bg-green-100 text-green-700' :
    value <= 6 ? 'bg-amber-100 text-amber-700' :
    'bg-red-100 text-red-700'
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${color}`}>
      DT {value}
    </span>
  )
}

export default function LadderPage() {
  const { patientId, triggerId } = useParams<{ patientId: string; triggerId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

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

  const trigger = triggers?.find(t => t.id === triggerId)

  const { data: ladder, isLoading } = useQuery({
    queryKey: ['ladder', triggerId],
    queryFn: () => getLadder(triggerId!),
    enabled: !!triggerId
  })

  const { data: flags } = useQuery({
    queryKey: ['flags', ladder?.id],
    queryFn: () => getLadderFlags(ladder!.id),
    enabled: !!ladder?.id
  })

  const reviewMutation = useMutation({
    mutationFn: () => reviewLadder(ladder!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['flags', ladder?.id] })
      queryClient.invalidateQueries({ queryKey: ['ladder', triggerId] })
      queryClient.invalidateQueries({ queryKey: ['brief', patientId] })
    }
  })

  const openFlags = flags?.filter(f => f.status === 'open') ?? []

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white border-b border-slate-200 px-8 py-4 flex items-center gap-4">
        <button
          onClick={() => navigate(`/patients/${patientId}`)}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          ← Back
        </button>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">
            Exposure Ladder
          </h1>
          {trigger && (
            <p className="text-sm text-slate-400">{trigger.name}</p>
          )}
        </div>
      </nav>

      <main className="px-8 py-8 max-w-3xl mx-auto space-y-6">

        {/* Flags */}
        {openFlags.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-amber-800 mb-3">
              {openFlags.length} flag{openFlags.length !== 1 ? 's' : ''} need attention
            </h3>
            <div className="space-y-3">
              {openFlags.map((flag) => (
                <div key={flag.id} className="flex gap-3">
                  <span className="text-amber-400 mt-0.5 shrink-0">⚠</span>
                  <p className="text-sm text-amber-900">{flag.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ladder */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Rungs</h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Ordered from lowest to highest distress
              </p>
            </div>
            <button
              onClick={() => reviewMutation.mutate()}
              disabled={reviewMutation.isPending || !ladder}
              className="text-sm bg-slate-100 text-slate-700 px-4 py-2 rounded-lg hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              {reviewMutation.isPending ? 'Reviewing...' : 'Run review'}
            </button>
          </div>

          {isLoading && (
            <p className="text-slate-400 text-sm">Loading ladder...</p>
          )}

          {ladder && ladder.rungs.length === 0 && (
            <p className="text-slate-400 text-sm">No rungs yet</p>
          )}

          {ladder && ladder.rungs.length > 0 && (
            <div className="space-y-2">
              {[...ladder.rungs]
                .sort((a, b) => a.rung_order - b.rung_order)
                .map((rung, index) => (
                  <div
                    key={rung.id}
                    className="flex items-center gap-4 py-3 px-4 bg-slate-50 rounded-lg"
                  >
                    <span className="text-xs font-medium text-slate-400 w-6">
                      {index + 1}
                    </span>
                    <div className="flex-1">
                      <p className="text-sm text-slate-500">
                        Rung {index + 1}
                      </p>
                    </div>
                    <DTBadge value={rung.distress_thermometer_rating} />
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      rung.status === 'complete'
                        ? 'bg-green-100 text-green-700'
                        : rung.status === 'active'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {rung.status}
                    </span>
                  </div>
                ))}
            </div>
          )}

          {reviewMutation.isSuccess && (
            <div className="mt-4 p-3 bg-green-50 rounded-lg">
              <p className="text-sm text-green-700">
                Review complete — {reviewMutation.data.flag_count} flag(s) found
              </p>
            </div>
          )}
        </div>

        {/* Ladder status */}
        {ladder && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
            <span className="text-sm text-slate-500">Ladder status</span>
            <span className={`text-sm font-medium px-3 py-1 rounded-full ${
              ladder.review_status === 'clean'
                ? 'bg-green-100 text-green-700'
                : ladder.review_status === 'needs_attention'
                ? 'bg-amber-100 text-amber-700'
                : 'bg-slate-100 text-slate-500'
            }`}>
              {ladder.review_status ?? 'pending review'}
            </span>
          </div>
        )}

      </main>
    </div>
  )
}
