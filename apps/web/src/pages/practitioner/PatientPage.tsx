  import { useState, useEffect, useCallback, useRef } from 'react'
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
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import InlineForm from '../../components/ui/InlineForm'
import MessagesPanel from '../../components/ui/MessagesPanel'
import PractitionerNav from '../../components/ui/PractitionerNav'

const ACTION_PLAN_TEMPLATE = `<h2>Exposures</h2><ul><li></li></ul><h2>Behaviors to resist</h2><ul><li></li></ul><h2>Parent instructions</h2><ul><li></li></ul><h2>Coping tools</h2><ul><li></li></ul><h2>Notes</h2><p></p>`

function TrendPill({ label, trend }: { label: string; trend: string }) {
  const displayTrend = trend === 'insufficient data' ? 'Not enough data yet' : trend
  const colors: Record<string, string> = {
    improving: 'bg-green-100 text-green-700',
    stable: 'bg-slate-100 text-slate-600',
    worsening: 'bg-red-100 text-red-700',
    'insufficient data': 'bg-slate-50 text-slate-400',
    'Not enough data yet': 'bg-slate-50 text-slate-400',
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[displayTrend] ?? colors['insufficient data']}`}>
        {displayTrend}
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
  const [planNextAppt, setPlanNextAppt] = useState('')
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing your action plan...' }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none min-h-[300px] px-4 py-3',
      },
    },
  })

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
    weekly_session: 'bg-teal-100 text-teal-700',
    other: 'bg-slate-100 text-slate-600'
  }

  // Action plans
  const { data: actionPlans } = useQuery({
    queryKey: ['action-plans', patientId],
    queryFn: () => getActionPlans(patientId!),
    enabled: !!patientId
  })

  const getEditorContent = useCallback(() => editor?.getHTML() || '', [editor])

  const createPlanActionMutation = useMutation({
    mutationFn: () => createActionPlan(patientId!, {
      session_date: planDate,
      nickname: planNickname || undefined,
      content: getEditorContent(),
      next_appointment: planNextAppt || undefined,
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['action-plans', patientId] })
      // Switch to editing mode so auto-save works on the created plan
      setEditingPlan(data)
    }
  })

  const updatePlanActionMutation = useMutation({
    mutationFn: (opts: { planId?: string } | void) => updateActionPlan((opts as { planId?: string })?.planId || editingPlan!.id, {
      session_date: planDate,
      nickname: planNickname || undefined,
      content: getEditorContent(),
      next_appointment: planNextAppt || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['action-plans', patientId] })
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

  const resetPlanEditor = useCallback(() => {
    if (autoSaveTimerRef.current) {
      clearInterval(autoSaveTimerRef.current)
      autoSaveTimerRef.current = null
    }
    setShowPlanEditor(false)
    setEditingPlan(null)
    setPlanDate(new Date().toISOString().split('T')[0])
    setPlanNickname('')
    setPlanNextAppt('')
    editor?.commands.setContent('')
  }, [editor])

  const startEditPlan = useCallback((ap: ActionPlan) => {
    setEditingPlan(ap)
    setPlanDate(ap.session_date)
    setPlanNickname(ap.nickname || '')
    setPlanNextAppt(ap.next_appointment || '')
    editor?.commands.setContent(ap.content || '')
    setShowPlanEditor(true)
  }, [editor])

  const openNewPlan = useCallback(() => {
    resetPlanEditor()
    editor?.commands.setContent(ACTION_PLAN_TEMPLATE)
    setShowPlanEditor(true)
  }, [editor, resetPlanEditor])

  const handleSavePlan = () => {
    if (editingPlan) {
      updatePlanActionMutation.mutate()
    } else {
      createPlanActionMutation.mutate()
    }
  }

  const handlePublishPlan = () => {
    if (editingPlan) {
      updatePlanActionMutation.mutate(undefined, {
        onSuccess: () => {
          publishPlanMutation.mutate(editingPlan.id)
          resetPlanEditor()
        }
      })
    }
  }

  // Auto-save every 30 seconds while editor is open with an existing plan
  useEffect(() => {
    if (showPlanEditor && editingPlan && editor) {
      autoSaveTimerRef.current = setInterval(() => {
        updatePlanActionMutation.mutate()
      }, 30000)
      return () => {
        if (autoSaveTimerRef.current) {
          clearInterval(autoSaveTimerRef.current)
          autoSaveTimerRef.current = null
        }
      }
    }
  }, [showPlanEditor, editingPlan, editor]) // eslint-disable-line react-hooks/exhaustive-deps

  // Smart activity summary
  const activitySummary = (() => {
    if (monitoringForm?.status === 'in_progress') {
      const n = monitoringForm.entries_count ?? 0
      return `Monitoring form in progress \u00B7 ${n} ${n === 1 ? 'entry' : 'entries'}`
    }
    if (monitoringForm?.status === 'submitted') {
      const n = monitoringForm.entries_count ?? 0
      return `Monitoring form submitted \u00B7 ${n} ${n === 1 ? 'entry' : 'entries'}`
    }
    if (!monitoringForm && !plan) return 'No monitoring form sent yet'
    if (plan?.status === 'active' && brief && brief.experiments_since_last_session > 0) {
      return `${brief.experiments_since_last_session} exposure${brief.experiments_since_last_session === 1 ? '' : 's'} completed`
    }
    if (plan?.status === 'active') return 'Treatment plan active \u00B7 No exposures yet'
    if (plan?.status === 'setup') {
      const n = triggers?.length ?? 0
      return `Treatment plan in setup \u00B7 ${n} trigger situation${n === 1 ? '' : 's'}`
    }
    return 'New patient'
  })()

  const canActivate = plan?.status === 'setup' &&
    triggers && triggers.length > 0

  return (
    <div className="min-h-screen bg-slate-50">
      <PractitionerNav
        activePage="patients"
        subHeader={{
          backTo: '/dashboard',
          backLabel: 'Back to patients',
          title: patient?.name ?? 'Loading...',
          subtitle: activitySummary,
          rightAction: (
            <button
              onClick={() => navigate(`/patients/${patientId}/progress`)}
              className="text-xs font-medium bg-transparent border-none cursor-pointer"
              style={{ color: 'var(--float-primary)' }}
            >
              View progress &rarr;
            </button>
          )
        }}
      />

      <main className="px-8 py-8 max-w-5xl mx-auto space-y-6">

        {/* Monitoring form */}

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="text-[15px] font-medium text-slate-700 mb-3">
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
                    className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors"
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
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      {parentEmail && (
                        <button
                          onClick={handleSendWithEmail}
                          disabled={sendFormMutation.isPending}
                          className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
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
                            : 'bg-teal-600 text-white hover:bg-teal-700'
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
                        ? 'bg-teal-100 text-teal-700'
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
                    className="text-xs text-teal-600 font-medium hover:underline"
                  >
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                </div>

                {/* Entries list (expandable) */}
                {(monitoringForm.entries_count ?? 0) > 0 && (
                  <div>
                    <button
                      onClick={() => setShowEntries(!showEntries)}
                      className="text-sm text-teal-600 font-medium hover:underline"
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
                        ? 'bg-teal-600 text-white hover:bg-teal-700'
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
                <p className={`text-2xl font-semibold ${brief.open_flag_count > 0 ? '' : 'text-slate-800'}`}
                   style={brief.open_flag_count > 0 ? { color: 'var(--float-primary)' } : undefined}>
                  {brief.open_flag_count > 0 && <span className="text-sm mr-1">&#9888;</span>}
                  {brief.open_flag_count}
                </p>
              </div>
            </div>
            <div className="flex gap-6 mb-5">
              <TrendPill label="BIP" trend={brief.bip_trend} />
              <TrendPill label="Distress" trend={brief.distress_thermometer_trend} />
            </div>
            <div className="border-t border-slate-100 pt-4 mb-4">
              <div className="rounded-lg px-4 py-3" style={{ borderLeft: '4px solid var(--float-primary)', background: '#f0fdfa' }}>
                <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--float-primary)' }}>
                  Recommended focus
                </p>
                <p className="text-base font-medium" style={{ color: '#134e4a' }}>
                  {brief.recommended_focus}
                </p>
              </div>
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

        {/* Education link — show for early-stage patients */}
        {(!brief || brief.experiments_since_last_session === 0) && (
          <button
            onClick={() => navigate('/education')}
            className="w-full text-left text-sm py-3 px-4 rounded-lg transition-colors cursor-pointer bg-transparent"
            style={{ color: 'var(--float-text-hint)', border: '1px dashed var(--float-border)' }}
          >
            New to this approach? Review the clinician education &rarr;
          </button>
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
                    className="text-xs px-3 py-1 bg-teal-600 text-white rounded-full hover:bg-teal-700 transition-colors disabled:opacity-50"
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
                    className="text-xs text-teal-600 font-medium hover:underline"
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
            <p className="text-slate-500 mb-1">No treatment plan yet</p>
            <p className="text-sm text-slate-400 mb-4">Create one to start configuring trigger situations and exposure ladders</p>
            <button
              onClick={() => createPlanMutation.mutate()}
              disabled={createPlanMutation.isPending}
              className="text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 border-none cursor-pointer"
              style={{ background: 'var(--float-primary)' }}
            >
              {createPlanMutation.isPending ? 'Creating...' : 'Create treatment plan'}
            </button>
          </div>
        )}
        {/* Session notes */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-medium text-slate-700">
              Session notes
            </h2>
            {!showNoteForm && (
              <button
                onClick={() => { resetNoteForm(); setShowNoteForm(true) }}
                className="text-xs text-teal-600 font-medium hover:underline"
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
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
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
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
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
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 resize-y"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleSaveNote}
                  disabled={!noteContent.trim() || createNoteMutation.isPending || updateNoteMutation.isPending}
                  className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
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
                        className="text-xs text-teal-600 font-medium hover:underline"
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
                      className="text-xs text-teal-600 mt-1 hover:underline"
                    >
                      Show more
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            !showNoteForm && (
              <p className="text-sm text-slate-400">
                No notes yet &middot;{' '}
                <button onClick={() => { resetNoteForm(); setShowNoteForm(true) }} className="text-teal-600 hover:underline bg-transparent border-none cursor-pointer text-sm font-medium">
                  + Add note
                </button>
              </p>
            )
          )}
        </div>

        {/* Action plans */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-medium text-slate-700">
              Action plans
            </h2>
            {!showPlanEditor && (
              <button
                onClick={openNewPlan}
                className="text-xs text-teal-600 font-medium hover:underline"
              >
                + New action plan
              </button>
            )}
          </div>

          {showPlanEditor && (
            <div className="mb-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Session date</label>
                  <input
                    type="date"
                    value={planDate}
                    onChange={e => setPlanDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Anxiety nickname</label>
                  <input
                    type="text"
                    value={planNickname}
                    onChange={e => setPlanNickname(e.target.value)}
                    placeholder="e.g. Obi, Worry Bug"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Next appointment</label>
                  <input
                    type="text"
                    value={planNextAppt}
                    onChange={e => setPlanNextAppt(e.target.value)}
                    placeholder="e.g. Tuesday 3pm"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Tiptap toolbar */}
              {editor && (
                <div className="flex items-center gap-1 border border-slate-200 rounded-t-lg bg-slate-50 px-2 py-1.5">
                  <button
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    className={`px-2 py-1 text-xs font-bold rounded transition-colors ${editor.isActive('bold') ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
                  >
                    B
                  </button>
                  <button
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    className={`px-2 py-1 text-xs italic rounded transition-colors ${editor.isActive('italic') ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
                  >
                    I
                  </button>
                  <span className="w-px h-4 bg-slate-200 mx-1" />
                  <button
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    className={`px-2 py-1 text-xs rounded transition-colors ${editor.isActive('bulletList') ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
                  >
                    List
                  </button>
                  <button
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    className={`px-2 py-1 text-xs font-semibold rounded transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:bg-slate-100'}`}
                  >
                    H2
                  </button>
                </div>
              )}

              {/* Tiptap editor */}
              <div className="border border-t-0 border-slate-200 rounded-b-lg bg-white [&_.tiptap_h2]:text-base [&_.tiptap_h2]:font-semibold [&_.tiptap_h2]:text-slate-800 [&_.tiptap_h2]:mt-4 [&_.tiptap_h2]:mb-1 [&_.tiptap_ul]:list-disc [&_.tiptap_ul]:pl-5 [&_.tiptap_ul]:mb-2 [&_.tiptap_li]:text-sm [&_.tiptap_li]:text-slate-700 [&_.tiptap_p]:text-sm [&_.tiptap_p]:text-slate-700 [&_.tiptap_p.is-editor-empty:first-child::before]:text-slate-300 [&_.tiptap_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.tiptap_p.is-editor-empty:first-child::before]:float-left [&_.tiptap_p.is-editor-empty:first-child::before]:h-0 [&_.tiptap_p.is-editor-empty:first-child::before]:pointer-events-none">
                <EditorContent editor={editor} />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSavePlan}
                  disabled={createPlanActionMutation.isPending || updatePlanActionMutation.isPending}
                  className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
                >
                  {(createPlanActionMutation.isPending || updatePlanActionMutation.isPending)
                    ? 'Saving...'
                    : editingPlan ? 'Save draft' : 'Save draft'}
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
                {editingPlan && (
                  <span className="text-xs text-slate-300 ml-auto">Auto-saves every 30s</span>
                )}
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
                            className="text-xs text-teal-600 font-medium hover:underline"
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
                        className="text-xs text-teal-600 font-medium hover:underline"
                      >
                        {expandedPlanId === ap.id ? 'Collapse' : 'View'}
                      </button>
                    </div>
                  </div>

                  {expandedPlanId === ap.id && (
                    <div className="mt-3 prose prose-sm max-w-none [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-800 [&_h2]:mt-3 [&_h2]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_li]:text-slate-700 [&_p]:text-slate-700">
                      {ap.content ? (
                        <div dangerouslySetInnerHTML={{ __html: ap.content }} />
                      ) : (
                        <p className="text-slate-400 italic">No content</p>
                      )}
                      {ap.next_appointment && (
                        <div className="mt-3 pt-3 border-t border-slate-200">
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
              <p className="text-sm text-slate-400">
                No action plans yet &middot;{' '}
                <button onClick={openNewPlan} className="text-teal-600 hover:underline bg-transparent border-none cursor-pointer text-sm font-medium">
                  + New plan
                </button>
              </p>
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
