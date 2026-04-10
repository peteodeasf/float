import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import PractitionerNav from '../../components/ui/PractitionerNav'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import DownwardArrowPanel from '../../components/ui/DownwardArrowPanel'
import {
  getTriggers,
  getLadder,
  getLadderFlags,
  reviewLadder,
  getBehaviors,
  createBehavior,
  createRung,
  getTreatmentPlan
} from '../../api/treatment'

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

  const [showBehaviorForm, setShowBehaviorForm] = useState(false)
  const [showRungForm, setShowRungForm] = useState(false)
  const [behaviorName, setBehaviorName] = useState('')
  const [behaviorType, setBehaviorType] = useState('avoidance')
  const [behaviorDT, setBehaviorDT] = useState('')
  const [selectedBehaviorId, setSelectedBehaviorId] = useState('')
  const [rungDT, setRungDT] = useState('')

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

  const { data: behaviors } = useQuery({
    queryKey: ['behaviors', triggerId],
    queryFn: () => getBehaviors(triggerId!),
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

  const createBehaviorMutation = useMutation({
    mutationFn: () => createBehavior(triggerId!, {
      name: behaviorName,
      behavior_type: behaviorType,
      distress_thermometer_when_refraining: behaviorDT ? parseFloat(behaviorDT) : undefined
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['behaviors', triggerId] })
      setBehaviorName('')
      setBehaviorDT('')
      setShowBehaviorForm(false)
    }
  })

  const createRungMutation = useMutation({
    mutationFn: () => createRung(ladder!.id, {
      avoidance_behavior_id: selectedBehaviorId || undefined,
      distress_thermometer_rating: rungDT ? parseFloat(rungDT) : undefined,
      rung_order: ladder?.rungs.length ?? 0
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ladder', triggerId] })
      setSelectedBehaviorId('')
      setRungDT('')
      setShowRungForm(false)
    }
  })

  const openFlags = flags?.filter(f => f.status === 'open') ?? []

  return (
    <div className="min-h-screen bg-slate-50">
      <PractitionerNav
        activePage="patients"
        subHeader={{
          backTo: `/patients/${patientId}`,
          backLabel: 'Back to patient',
          title: 'Exposure Ladder',
          subtitle: trigger?.name,
        }}
      />

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

        {/* Avoidance behaviors */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">
              Avoidance & safety behaviors
            </h2>
            {!showBehaviorForm && (
              <button
                onClick={() => setShowBehaviorForm(true)}
                className="text-xs text-teal-600 font-medium hover:underline"
              >
                + Add behavior
              </button>
            )}
          </div>

          {showBehaviorForm && (
            <div className="mb-4 bg-slate-50 rounded-lg p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Behavior name
                </label>
                <input
                  type="text"
                  value={behaviorName}
                  onChange={e => setBehaviorName(e.target.value)}
                  placeholder="e.g. Sit alone at end of table"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Type
                </label>
                <select
                  value={behaviorType}
                  onChange={e => setBehaviorType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="avoidance">Avoidance</option>
                  <option value="safety">Safety</option>
                  <option value="ritual">Ritual (OCD)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  DT when refraining (0–10)
                  <span className="text-slate-400 ml-1">(optional)</span>
                </label>
                <input
                  type="number"
                  value={behaviorDT}
                  onChange={e => setBehaviorDT(e.target.value)}
                  min={0} max={10} step={0.5}
                  placeholder="6"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowBehaviorForm(false)}
                  className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createBehaviorMutation.mutate()}
                  disabled={!behaviorName || createBehaviorMutation.isPending}
                  className="px-4 py-1.5 bg-teal-600 text-white text-sm rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50"
                >
                  {createBehaviorMutation.isPending ? 'Adding...' : 'Add behavior'}
                </button>
              </div>
            </div>
          )}

          {behaviors && behaviors.length > 0 ? (
            <div className="space-y-2">
              {behaviors.map(behavior => (
                <div key={behavior.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{behavior.name}</p>
                    <p className="text-xs text-slate-400">{behavior.behavior_type}</p>
                  </div>
                  <DTBadge value={behavior.distress_thermometer_when_refraining} />
                </div>
              ))}
            </div>
          ) : (
            !showBehaviorForm && (
              <p className="text-sm text-slate-400">No behaviors added yet</p>
            )
          )}
        </div>

        {/* Ladder rungs */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">Rungs</h2>
              <p className="text-sm text-slate-400 mt-0.5">Ordered lowest to highest distress</p>
            </div>
            <div className="flex gap-2">
              {!showRungForm && (
                <button
                  onClick={() => setShowRungForm(true)}
                  className="text-xs text-teal-600 font-medium hover:underline"
                >
                  + Add rung
                </button>
              )}
              <button
                onClick={() => reviewMutation.mutate()}
                disabled={reviewMutation.isPending || !ladder}
                className="text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg hover:bg-slate-200 disabled:opacity-50"
              >
                {reviewMutation.isPending ? 'Reviewing...' : 'Run review'}
              </button>
            </div>
          </div>

          {showRungForm && (
            <div className="mb-4 bg-slate-50 rounded-lg p-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Link to behavior
                  <span className="text-slate-400 ml-1">(optional)</span>
                </label>
                <select
                  value={selectedBehaviorId}
                  onChange={e => setSelectedBehaviorId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">— Select a behavior —</option>
                  {behaviors?.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Distress thermometer (0–10)
                  <span className="text-slate-400 ml-1">(optional)</span>
                </label>
                <input
                  type="number"
                  value={rungDT}
                  onChange={e => setRungDT(e.target.value)}
                  min={0} max={10} step={0.5}
                  placeholder="4"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowRungForm(false)}
                  className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createRungMutation.mutate()}
                  disabled={createRungMutation.isPending}
                  className="px-4 py-1.5 bg-teal-600 text-white text-sm rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50"
                >
                  {createRungMutation.isPending ? 'Adding...' : 'Add rung'}
                </button>
              </div>
            </div>
          )}

          {isLoading && <p className="text-slate-400 text-sm">Loading ladder...</p>}

          {ladder && ladder.rungs.length === 0 && !showRungForm && (
            <p className="text-slate-400 text-sm">No rungs yet — add behaviors first, then build the ladder</p>
          )}

          {ladder && ladder.rungs.length > 0 && (
            <div className="space-y-2">
              {[...ladder.rungs]
                .sort((a, b) => a.rung_order - b.rung_order)
                .map((rung, index) => {
                  const linkedBehavior = behaviors?.find(b => b.id === rung.avoidance_behavior_id)
                  return (
  <div key={rung.id} className="py-3 px-4 bg-slate-50 rounded-lg">
    <div className="flex items-center gap-4">
      <span className="text-xs font-medium text-slate-400 w-5">{index + 1}</span>
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-700">
          {linkedBehavior?.name ?? 'Unnamed rung'}
        </p>
        {linkedBehavior && (
          <p className="text-xs text-slate-400">{linkedBehavior.behavior_type}</p>
        )}
      </div>
      <DTBadge value={rung.distress_thermometer_rating} />
      <span className={`text-xs px-2 py-0.5 rounded-full ${
        rung.status === 'complete' ? 'bg-green-100 text-green-700' :
        rung.status === 'active' ? 'bg-teal-100 text-teal-700' :
        'bg-slate-100 text-slate-500'
      }`}>
        {rung.status}
      </span>
    </div>
    <DownwardArrowPanel rungId={rung.id} patientId={patientId!} />
  </div>
)
                })}
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

        {/* Status */}
        {ladder && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
            <span className="text-sm text-slate-500">Ladder status</span>
            <span className={`text-sm font-medium px-3 py-1 rounded-full ${
              ladder.review_status === 'clean' ? 'bg-green-100 text-green-700' :
              ladder.review_status === 'needs_attention' ? 'bg-amber-100 text-amber-700' :
              'bg-slate-100 text-slate-500'
            }`}>
              {ladder.review_status ?? 'pending review'}
            </span>
          </div>
        )}

      </main>
    </div>
  )
}
