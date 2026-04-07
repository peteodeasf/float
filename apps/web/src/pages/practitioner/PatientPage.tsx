  import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPatient, getPreSessionBrief } from '../../api/patients'
import {
  getTreatmentPlan,
  getTriggers,
  createTreatmentPlan,
  createTrigger,
  updatePlanStatus
} from '../../api/treatment'
import {
  getMonitoringForm,
  sendMonitoringForm,
} from '../../api/monitoring'
import InlineForm from '../../components/ui/InlineForm'
import MessagesPanel from '../../components/ui/MessagesPanel'

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
  const queryClient = useQueryClient()
  const [showTriggerForm, setShowTriggerForm] = useState(false)
  const [showEntries, setShowEntries] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showSendForm, setShowSendForm] = useState(false)
  const [parentEmail, setParentEmail] = useState('')
  const [parentName, setParentName] = useState('')
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null)

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

  const { data: monitoringForm } = useQuery({
    queryKey: ['monitoring-form', patientId],
    queryFn: () => getMonitoringForm(patientId!),
    enabled: !!patientId
  })

  const sendFormMutation = useMutation({
    mutationFn: (params: { parent_email?: string; parent_name?: string } = {}) =>
      sendMonitoringForm(patientId!, params),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['monitoring-form', patientId] })
      // Always copy link
      if (data.full_link) {
        navigator.clipboard.writeText(data.full_link)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
      if (data.email_sent && parentEmail) {
        setEmailSentTo(parentEmail)
      }
      setShowSendForm(false)
      setParentEmail('')
      setParentName('')
    }
  })

  const handleCopyLink = () => {
    if (monitoringForm?.access_token) {
      const url = `${window.location.origin}/monitor/${monitoringForm.access_token}`
      navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleSendWithEmail = () => {
    sendFormMutation.mutate({
      parent_email: parentEmail || undefined,
      parent_name: parentName || undefined
    })
  }

  const handleSendLinkOnly = () => {
    sendFormMutation.mutate({})
  }

  const daysSinceSent = monitoringForm?.sent_at
    ? Math.floor((Date.now() - new Date(monitoringForm.sent_at).getTime()) / (1000 * 60 * 60 * 24))
    : null

  const isPreTreatment = !plan || plan.status === 'setup'

  const createPlanMutation = useMutation({
    mutationFn: () => createTreatmentPlan(patientId!, {
      clinical_track: 'exposure',
      parent_visibility_level: 'summary'
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', patientId] })
    }
  })

  const createTriggerMutation = useMutation({
    mutationFn: (data: Record<string, any>) => createTrigger(plan!.id, {
      name: data.name,
      description: data.description,
      distress_thermometer_rating: data.distress_thermometer_rating
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['triggers', plan?.id] })
      setShowTriggerForm(false)
    }
  })

  const activatePlanMutation = useMutation({
    mutationFn: () => updatePlanStatus(patientId!, plan!.id, 'active'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', patientId] })
    }
  })

  const canActivate = plan?.status === 'setup' &&
    triggers && triggers.length > 0

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
      <nav className="bg-white border-b border-slate-200 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard')}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            ← Back
          </button>
          <h1 className="text-xl font-semibold text-slate-800">
            {patient?.name ?? 'Loading...'}
          </h1>
        </div>
        <button
          onClick={() => navigate(`/patients/${patientId}/progress`)}
          className="text-sm text-blue-600 font-medium hover:underline"
        >
          View progress →
        </button>
      </nav>

      <main className="px-8 py-8 max-w-5xl mx-auto space-y-6">

        {/* Monitoring form */}
        {isPreTreatment && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              Parent monitoring form
            </h2>

            {!monitoringForm ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">
                  Send a monitoring form to the parent. They'll observe their child's anxiety for about a week before your first appointment.
                </p>

                {emailSentTo && (
                  <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                    <span>&#10003;</span> Email sent to {emailSentTo}
                  </div>
                )}

                {!showSendForm ? (
                  <button
                    onClick={() => setShowSendForm(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                  >
                    Send monitoring form
                  </button>
                ) : (
                  <div className="space-y-3 bg-slate-50 rounded-lg p-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Parent email (optional)
                      </label>
                      <input
                        type="email"
                        value={parentEmail}
                        onChange={e => setParentEmail(e.target.value)}
                        placeholder="parent@email.com"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Parent name (optional)
                      </label>
                      <input
                        type="text"
                        value={parentName}
                        onChange={e => setParentName(e.target.value)}
                        placeholder="e.g. Sarah"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      {parentEmail && (
                        <button
                          onClick={handleSendWithEmail}
                          disabled={sendFormMutation.isPending}
                          className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {sendFormMutation.isPending ? 'Sending...' : 'Send email + copy link'}
                        </button>
                      )}
                      <button
                        onClick={handleSendLinkOnly}
                        disabled={sendFormMutation.isPending}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                          parentEmail
                            ? 'border border-slate-200 text-slate-600 hover:bg-slate-100'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {sendFormMutation.isPending ? 'Creating...' : 'Just copy link'}
                      </button>
                      <button
                        onClick={() => setShowSendForm(false)}
                        className="px-3 py-2 text-sm text-slate-400 hover:text-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                {/* Status row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      monitoringForm.status === 'submitted'
                        ? 'bg-green-100 text-green-700'
                        : monitoringForm.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {monitoringForm.status === 'in_progress' ? 'in progress' : monitoringForm.status}
                    </span>
                    {monitoringForm.entries_count != null && (
                      <span className="text-sm text-slate-500">
                        {monitoringForm.entries_count} {monitoringForm.entries_count === 1 ? 'entry' : 'entries'}
                      </span>
                    )}
                    {daysSinceSent != null && (
                      <span className="text-sm text-slate-400">
                        {daysSinceSent === 0 ? 'Sent today' : `Sent ${daysSinceSent}d ago`}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handleCopyLink}
                    className="text-xs text-blue-600 font-medium hover:underline"
                  >
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                </div>

                {/* Entries list (expandable) */}
                {(monitoringForm.entries_count ?? 0) > 0 && (
                  <div>
                    <button
                      onClick={() => setShowEntries(!showEntries)}
                      className="text-sm text-blue-600 font-medium hover:underline"
                    >
                      {showEntries ? 'Hide entries' : 'View entries'}
                    </button>
                    {showEntries && monitoringForm.entries && (
                      <div className="mt-3 space-y-2">
                        {monitoringForm.entries.map((entry) => (
                          <div
                            key={entry.id}
                            className="py-3 px-4 bg-slate-50 rounded-lg"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-medium text-slate-400">
                                {new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                              </span>
                              {entry.fear_thermometer != null && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  entry.fear_thermometer >= 7 ? 'bg-red-100 text-red-700' :
                                  entry.fear_thermometer >= 4 ? 'bg-amber-100 text-amber-700' :
                                  'bg-green-100 text-green-700'
                                }`}>
                                  FT {entry.fear_thermometer}
                                </span>
                              )}
                            </div>
                            {entry.situation && (
                              <p className="text-sm text-slate-700">{entry.situation}</p>
                            )}
                            {entry.child_behavior_observed && (
                              <p className="text-xs text-slate-500 mt-1">
                                <span className="font-medium">Observed:</span> {entry.child_behavior_observed}
                              </p>
                            )}
                            {entry.parent_response && (
                              <p className="text-xs text-slate-500 mt-1">
                                <span className="font-medium">Response:</span> {entry.parent_response}
                              </p>
                            )}
                            {entry.is_draft && (
                              <span className="text-xs text-slate-400 italic">Draft</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Report button */}
                {(monitoringForm.entries_count ?? 0) > 0 && (
                  <button
                    onClick={() => navigate(`/patients/${patientId}/monitoring-report`)}
                    className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                      (monitoringForm.entries_count ?? 0) >= 5
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    View pre-consultation report
                  </button>
                )}
              </div>
            )}
          </div>
        )}

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
        {plan ? (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">
                Treatment plan
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-1 bg-slate-100 text-slate-600 rounded-full">
                  {plan.clinical_track}
                </span>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  plan.status === 'active'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-600'
                }`}>
                  {plan.status}
                </span>
                {canActivate && (
                  <button
                    onClick={() => activatePlanMutation.mutate()}
                    disabled={activatePlanMutation.isPending}
                    className="text-xs px-3 py-1 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {activatePlanMutation.isPending ? 'Activating...' : 'Activate plan'}
                  </button>
                )}
              </div>
            </div>

            {/* Trigger situations */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Trigger situations
                </p>
                {!showTriggerForm && (
                  <button
                    onClick={() => setShowTriggerForm(true)}
                    className="text-xs text-blue-600 font-medium hover:underline"
                  >
                    + Add trigger
                  </button>
                )}
              </div>

              {showTriggerForm && (
                <div className="mb-3">
                  <InlineForm
                    fields={[
                      {
                        key: 'name',
                        label: 'Situation name',
                        type: 'text',
                        placeholder: 'e.g. Eating in the cafeteria',
                        required: true
                      },
                      {
                        key: 'description',
                        label: 'Description',
                        type: 'text',
                        placeholder: 'Brief description'
                      },
                      {
                        key: 'distress_thermometer_rating',
                        label: 'Distress thermometer (0–10)',
                        type: 'number',
                        placeholder: '7'
                      }
                    ]}
                    onSubmit={(data) => createTriggerMutation.mutate(data)}
                    onCancel={() => setShowTriggerForm(false)}
                    submitLabel="Add trigger"
                    isLoading={createTriggerMutation.isPending}
                  />
                </div>
              )}

              {triggers && triggers.length > 0 ? (
                <div className="space-y-2">
                  {triggers.map((trigger) => (
                    <div
                      key={trigger.id}
                      onClick={() => navigate(`/patients/${patientId}/triggers/${trigger.id}/ladder`)}
                      className="flex items-center justify-between py-3 px-4 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          {trigger.name}
                        </p>
                        {trigger.description && (
                          <p className="text-xs text-slate-400 mt-0.5">
                            {trigger.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        {trigger.distress_thermometer_rating && (
                          <span className="text-sm font-medium text-slate-500">
                            DT {trigger.distress_thermometer_rating}
                          </span>
                        )}
                        <span className="text-slate-300 text-sm">→</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                !showTriggerForm && (
                  <p className="text-sm text-slate-400">
                    No trigger situations yet — add one to get started
                  </p>
                )
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
            <p className="text-slate-400 mb-3">No treatment plan yet</p>
            <button
              onClick={() => createPlanMutation.mutate()}
              disabled={createPlanMutation.isPending}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {createPlanMutation.isPending ? 'Creating...' : 'Create treatment plan'}
            </button>
          </div>
        )}
        {patient && (
         <MessagesPanel
           patientId={patientId!}
           patientUserId={patient.user_id}
         />
       )}
       
      </main>
    </div>
  )
}
