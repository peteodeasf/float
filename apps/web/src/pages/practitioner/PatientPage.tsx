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
import {
  getSessionNotes,
  createSessionNote,
  updateSessionNote,
  deleteSessionNote,
  SessionNote,
} from '../../api/session_notes'
import {
  getActionPlans,
  createActionPlan,
  updateActionPlan,
  publishActionPlan,
  deleteActionPlan,
  ActionPlan,
} from '../../api/action_plans'
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
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [editingNote, setEditingNote] = useState<SessionNote | null>(null)
  const [noteType, setNoteType] = useState('weekly_session')
  const [noteDate, setNoteDate] = useState(new Date().toISOString().split('T')[0])
  const [noteContent, setNoteContent] = useState('')
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)

  // Action plan state
  const [showPlanEditor, setShowPlanEditor] = useState(false)
  const [editingPlan, setEditingPlan] = useState<ActionPlan | null>(null)
  const [planDate, setPlanDate] = useState(new Date().toISOString().split('T')[0])
  const [planNickname, setPlanNickname] = useState('')
  const [planExposures, setPlanExposures] = useState<string[]>([])
  const [planBehaviors, setPlanBehaviors] = useState<string[]>([])
  const [planParentInstructions, setPlanParentInstructions] = useState<string[]>([])
  const [planCopingTools, setPlanCopingTools] = useState<string[]>([])
  const [planCognitiveStrategies, setPlanCognitiveStrategies] = useState<string[]>([])
  const [planNotes, setPlanNotes] = useState('')
  const [planNextAppt, setPlanNextAppt] = useState('')
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null)
  const [newItemInputs, setNewItemInputs] = useState<Record<string, string>>({})

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

  // const isPreTreatment = !plan || plan.status === 'setup'

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

  const { data: sessionNotes } = useQuery({
    queryKey: ['session-notes', patientId],
    queryFn: () => getSessionNotes(patientId!),
    enabled: !!patientId
  })

  const createNoteMutation = useMutation({
    mutationFn: () => createSessionNote(patientId!, {
      session_type: noteType,
      session_date: noteDate,
      content: noteContent
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-notes', patientId] })
      resetNoteForm()
    }
  })

  const updateNoteMutation = useMutation({
    mutationFn: () => updateSessionNote(editingNote!.id, {
      session_type: noteType,
      session_date: noteDate,
      content: noteContent
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-notes', patientId] })
      resetNoteForm()
    }
  })

  const deleteNoteMutation = useMutation({
    mutationFn: (noteId: string) => deleteSessionNote(noteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['session-notes', patientId] })
    }
  })

  const resetNoteForm = () => {
    setShowNoteForm(false)
    setEditingNote(null)
    setNoteType('weekly_session')
    setNoteDate(new Date().toISOString().split('T')[0])
    setNoteContent('')
  }

  const startEditNote = (note: SessionNote) => {
    setEditingNote(note)
    setNoteType(note.session_type)
    setNoteDate(note.session_date)
    setNoteContent(note.content)
    setShowNoteForm(true)
  }

  const handleSaveNote = () => {
    if (editingNote) {
      updateNoteMutation.mutate()
    } else {
      createNoteMutation.mutate()
    }
  }

  const sessionTypeLabels: Record<string, string> = {
    consultation_1: 'Consultation 1',
    consultation_2: 'Consultation 2',
    consultation_3: 'Consultation 3',
    weekly_session: 'Weekly session',
    other: 'Other'
  }

  const sessionTypeBadgeColors: Record<string, string> = {
    consultation_1: 'bg-purple-100 text-purple-700',
    consultation_2: 'bg-purple-100 text-purple-700',
    consultation_3: 'bg-purple-100 text-purple-700',
    weekly_session: 'bg-blue-100 text-blue-700',
    other: 'bg-slate-100 text-slate-600'
  }

  // Action plans
  const { data: actionPlans } = useQuery({
    queryKey: ['action-plans', patientId],
    queryFn: () => getActionPlans(patientId!),
    enabled: !!patientId
  })

  const createPlanActionMutation = useMutation({
    mutationFn: () => createActionPlan(patientId!, {
      session_date: planDate,
      nickname: planNickname || undefined,
      exposures: planExposures,
      behaviors_to_resist: planBehaviors,
      parent_instructions: planParentInstructions,
      coping_tools: planCopingTools,
      cognitive_strategies: planCognitiveStrategies,
      additional_notes: planNotes || undefined,
      next_appointment: planNextAppt || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-plans', patientId] })
      resetPlanEditor()
    }
  })

  const updatePlanActionMutation = useMutation({
    mutationFn: () => updateActionPlan(editingPlan!.id, {
      session_date: planDate,
      nickname: planNickname || undefined,
      exposures: planExposures,
      behaviors_to_resist: planBehaviors,
      parent_instructions: planParentInstructions,
      coping_tools: planCopingTools,
      cognitive_strategies: planCognitiveStrategies,
      additional_notes: planNotes || undefined,
      next_appointment: planNextAppt || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-plans', patientId] })
      resetPlanEditor()
    }
  })

  const publishPlanMutation = useMutation({
    mutationFn: (planId: string) => publishActionPlan(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-plans', patientId] })
    }
  })

  const deletePlanMutation = useMutation({
    mutationFn: (planId: string) => deleteActionPlan(planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-plans', patientId] })
    }
  })

  const resetPlanEditor = () => {
    setShowPlanEditor(false)
    setEditingPlan(null)
    setPlanDate(new Date().toISOString().split('T')[0])
    setPlanNickname('')
    setPlanExposures([])
    setPlanBehaviors([])
    setPlanParentInstructions([])
    setPlanCopingTools([])
    setPlanCognitiveStrategies([])
    setPlanNotes('')
    setPlanNextAppt('')
    setNewItemInputs({})
  }

  const startEditPlan = (ap: ActionPlan) => {
    setEditingPlan(ap)
    setPlanDate(ap.session_date)
    setPlanNickname(ap.nickname || '')
    setPlanExposures([...ap.exposures])
    setPlanBehaviors([...ap.behaviors_to_resist])
    setPlanParentInstructions([...ap.parent_instructions])
    setPlanCopingTools([...ap.coping_tools])
    setPlanCognitiveStrategies([...ap.cognitive_strategies])
    setPlanNotes(ap.additional_notes || '')
    setPlanNextAppt(ap.next_appointment || '')
    setShowPlanEditor(true)
    setNewItemInputs({})
  }

  const handleSavePlan = () => {
    if (editingPlan) {
      updatePlanActionMutation.mutate()
    } else {
      createPlanActionMutation.mutate()
    }
  }

  const handlePublishPlan = () => {
    if (editingPlan) {
      // Save then publish
      updatePlanActionMutation.mutate(undefined, {
        onSuccess: () => {
          publishPlanMutation.mutate(editingPlan.id)
          resetPlanEditor()
        }
      })
    }
  }

  const addItemToList = (
    key: string,
    list: string[],
    setList: (v: string[]) => void
  ) => {
    const val = (newItemInputs[key] || '').trim()
    if (val) {
      setList([...list, val])
      setNewItemInputs(prev => ({ ...prev, [key]: '' }))
    }
  }

  const removeItemFromList = (
    list: string[],
    setList: (v: string[]) => void,
    index: number
  ) => {
    setList(list.filter((_, i) => i !== index))
  }

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
        {/* Session notes */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">
              Session notes
            </h2>
            {!showNoteForm && (
              <button
                onClick={() => { resetNoteForm(); setShowNoteForm(true) }}
                className="text-xs text-blue-600 font-medium hover:underline"
              >
                + Add note
              </button>
            )}
          </div>

          {showNoteForm && (
            <div className="bg-slate-50 rounded-lg p-4 space-y-3 mb-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Session type
                  </label>
                  <select
                    value={noteType}
                    onChange={e => setNoteType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="consultation_1">Consultation 1</option>
                    <option value="consultation_2">Consultation 2</option>
                    <option value="consultation_3">Consultation 3</option>
                    <option value="weekly_session">Weekly session</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={noteDate}
                    onChange={e => setNoteDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Notes
                </label>
                <textarea
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  rows={5}
                  placeholder="Session notes..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveNote}
                  disabled={!noteContent.trim() || createNoteMutation.isPending || updateNoteMutation.isPending}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {(createNoteMutation.isPending || updateNoteMutation.isPending)
                    ? 'Saving...'
                    : editingNote ? 'Update note' : 'Save note'}
                </button>
                <button
                  onClick={resetNoteForm}
                  className="px-3 py-2 text-sm text-slate-400 hover:text-slate-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {sessionNotes && sessionNotes.length > 0 ? (
            <div className="space-y-2">
              {sessionNotes.map(note => (
                <div key={note.id} className="py-3 px-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sessionTypeBadgeColors[note.session_type] ?? 'bg-slate-100 text-slate-600'}`}>
                        {sessionTypeLabels[note.session_type] ?? note.session_type}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(note.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEditNote(note)}
                        className="text-xs text-blue-600 font-medium hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => { if (confirm('Delete this note?')) deleteNoteMutation.mutate(note.id) }}
                        className="text-xs text-red-500 font-medium hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <p
                    className="text-sm text-slate-700 whitespace-pre-wrap cursor-pointer"
                    onClick={() => setExpandedNoteId(expandedNoteId === note.id ? null : note.id)}
                  >
                    {expandedNoteId === note.id
                      ? note.content
                      : note.content.length > 100
                        ? note.content.slice(0, 100) + '...'
                        : note.content}
                  </p>
                  {note.content.length > 100 && expandedNoteId !== note.id && (
                    <button
                      onClick={() => setExpandedNoteId(note.id)}
                      className="text-xs text-blue-600 mt-1 hover:underline"
                    >
                      Show more
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            !showNoteForm && (
              <p className="text-sm text-slate-400">No session notes yet</p>
            )
          )}
        </div>

        {/* Action plans */}
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-800">
              Action plans
            </h2>
            {!showPlanEditor && (
              <button
                onClick={() => { resetPlanEditor(); setShowPlanEditor(true) }}
                className="text-xs text-blue-600 font-medium hover:underline"
              >
                + New action plan
              </button>
            )}
          </div>

          {showPlanEditor && (
            <div className="bg-slate-50 rounded-lg p-4 space-y-4 mb-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Session date</label>
                  <input
                    type="date"
                    value={planDate}
                    onChange={e => setPlanDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Anxiety nickname</label>
                  <input
                    type="text"
                    value={planNickname}
                    onChange={e => setPlanNickname(e.target.value)}
                    placeholder="e.g. Obi, Worry Bug"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Bullet-point list sections */}
              {([
                { key: 'exposures', label: 'Exposures', list: planExposures, setList: setPlanExposures },
                { key: 'behaviors', label: 'Behaviors to resist', list: planBehaviors, setList: setPlanBehaviors },
                { key: 'parentInstructions', label: 'Parent instructions', list: planParentInstructions, setList: setPlanParentInstructions },
                { key: 'copingTools', label: 'Coping tools', list: planCopingTools, setList: setPlanCopingTools },
                { key: 'cognitiveStrategies', label: 'Cognitive strategies', list: planCognitiveStrategies, setList: setPlanCognitiveStrategies },
              ] as const).map(section => (
                <div key={section.key}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{section.label}</label>
                  {section.list.length > 0 && (
                    <ul className="space-y-1 mb-2">
                      {section.list.map((item, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm text-slate-700">
                          <span className="text-slate-300">•</span>
                          <span className="flex-1">{item}</span>
                          <button
                            onClick={() => removeItemFromList(section.list, section.setList, i)}
                            className="text-xs text-red-400 hover:text-red-600"
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newItemInputs[section.key] || ''}
                      onChange={e => setNewItemInputs(prev => ({ ...prev, [section.key]: e.target.value }))}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addItemToList(section.key, section.list, section.setList) } }}
                      placeholder={`Add ${section.label.toLowerCase()}...`}
                      className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      onClick={() => addItemToList(section.key, section.list, section.setList)}
                      className="text-xs text-blue-600 font-medium px-2 hover:underline"
                    >
                      + Add
                    </button>
                  </div>
                </div>
              ))}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Additional notes</label>
                <textarea
                  value={planNotes}
                  onChange={e => setPlanNotes(e.target.value)}
                  rows={3}
                  placeholder="Any additional notes..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Next appointment</label>
                <input
                  type="text"
                  value={planNextAppt}
                  onChange={e => setPlanNextAppt(e.target.value)}
                  placeholder="e.g. Tuesday 3pm"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleSavePlan}
                  disabled={createPlanActionMutation.isPending || updatePlanActionMutation.isPending}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {(createPlanActionMutation.isPending || updatePlanActionMutation.isPending)
                    ? 'Saving...'
                    : editingPlan ? 'Update draft' : 'Save draft'}
                </button>
                {editingPlan && !editingPlan.visible_to_patient && (
                  <button
                    onClick={handlePublishPlan}
                    disabled={publishPlanMutation.isPending}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
                  >
                    {publishPlanMutation.isPending ? 'Publishing...' : 'Publish to patient'}
                  </button>
                )}
                <button
                  onClick={resetPlanEditor}
                  className="px-3 py-2 text-sm text-slate-400 hover:text-slate-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {actionPlans && actionPlans.length > 0 ? (
            <div className="space-y-2">
              {actionPlans.map(ap => (
                <div key={ap.id} className="py-3 px-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700">
                        Session #{ap.session_number}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        ap.visible_to_patient ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {ap.visible_to_patient ? 'Published' : 'Draft'}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(ap.session_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                      {ap.nickname && (
                        <span className="text-xs text-slate-400 italic">({ap.nickname})</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {!ap.visible_to_patient && (
                        <>
                          <button
                            onClick={() => startEditPlan(ap)}
                            className="text-xs text-blue-600 font-medium hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => publishPlanMutation.mutate(ap.id)}
                            className="text-xs text-green-600 font-medium hover:underline"
                          >
                            Publish
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => { if (confirm('Delete this action plan?')) deletePlanMutation.mutate(ap.id) }}
                        className="text-xs text-red-500 font-medium hover:underline"
                      >
                        Delete
                      </button>
                      <button
                        onClick={() => setExpandedPlanId(expandedPlanId === ap.id ? null : ap.id)}
                        className="text-xs text-blue-600 font-medium hover:underline"
                      >
                        {expandedPlanId === ap.id ? 'Collapse' : 'View'}
                      </button>
                    </div>
                  </div>

                  {expandedPlanId === ap.id && (
                    <div className="mt-3 space-y-3 text-sm">
                      {ap.exposures.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Exposures</p>
                          <ul className="space-y-0.5">{ap.exposures.map((e, i) => <li key={i} className="text-slate-700 flex gap-2"><span className="text-slate-300">•</span>{e}</li>)}</ul>
                        </div>
                      )}
                      {ap.behaviors_to_resist.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Behaviors to resist</p>
                          <ul className="space-y-0.5">{ap.behaviors_to_resist.map((b, i) => <li key={i} className="text-slate-700 flex gap-2"><span className="text-slate-300">•</span>{b}</li>)}</ul>
                        </div>
                      )}
                      {ap.parent_instructions.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Parent instructions</p>
                          <ul className="space-y-0.5">{ap.parent_instructions.map((p, i) => <li key={i} className="text-slate-700 flex gap-2"><span className="text-slate-300">•</span>{p}</li>)}</ul>
                        </div>
                      )}
                      {ap.coping_tools.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Coping tools</p>
                          <ul className="space-y-0.5">{ap.coping_tools.map((c, i) => <li key={i} className="text-slate-700 flex gap-2"><span className="text-slate-300">•</span>{c}</li>)}</ul>
                        </div>
                      )}
                      {ap.cognitive_strategies.length > 0 && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Cognitive strategies</p>
                          <ul className="space-y-0.5">{ap.cognitive_strategies.map((s, i) => <li key={i} className="text-slate-700 flex gap-2"><span className="text-slate-300">•</span>{s}</li>)}</ul>
                        </div>
                      )}
                      {ap.additional_notes && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Additional notes</p>
                          <p className="text-slate-700 whitespace-pre-wrap">{ap.additional_notes}</p>
                        </div>
                      )}
                      {ap.next_appointment && (
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase tracking-wider mb-1">Next appointment</p>
                          <p className="text-slate-700">{ap.next_appointment}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            !showPlanEditor && (
              <p className="text-sm text-slate-400">No action plans yet</p>
            )
          )}
        </div>

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
