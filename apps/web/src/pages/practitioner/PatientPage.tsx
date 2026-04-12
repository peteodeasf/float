import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPatient, getMessages, sendMessage } from '../../api/patients'
import {
  getTreatmentPlan, getTriggers, createTreatmentPlan, createTrigger,
  updatePlanStatus, getBehaviors, createBehavior, updateTrigger, deleteTrigger,
  type TriggerSituation, type AvoidanceBehavior
} from '../../api/treatment'
import { getMonitoringForm, sendMonitoringForm } from '../../api/monitoring'
import { getSessionNotes, createSessionNote, updateSessionNote, deleteSessionNote, type SessionNote } from '../../api/session_notes'
import { getActionPlans, createActionPlan, updateActionPlan, publishActionPlan, deleteActionPlan, type ActionPlan } from '../../api/action_plans'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import PractitionerNav from '../../components/ui/PractitionerNav'

const ACTION_PLAN_TEMPLATE = `<h2>Exposures</h2><ul><li></li></ul><h2>Behaviors to resist</h2><ul><li></li></ul><h2>Parent instructions</h2><ul><li></li></ul><h2>Coping tools</h2><ul><li></li></ul><h2>Notes</h2><p></p>`

function DTBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return null
  const v = Number(value)
  const color = v >= 7 ? 'bg-red-100 text-red-700' : v >= 4 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
  return <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${color}`}>{v}</span>
}

// ── Behavior Panel (right side of treatment plan) ──
function BehaviorPanel({ trigger, planId, patientId }: {
  trigger: TriggerSituation; planId: string; patientId: string
}) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('avoidance')
  const [dt, setDt] = useState('')

  const { data: behaviors } = useQuery({
    queryKey: ['behaviors', trigger.id],
    queryFn: () => getBehaviors(trigger.id),
  })

  const addMut = useMutation({
    mutationFn: () => createBehavior(trigger.id, { name, behavior_type: type, distress_thermometer_when_refraining: dt ? Number(dt) : undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] }); setName(''); setDt(''); setShowAdd(false) }
  })

  const toggleActive = useMutation({
    mutationFn: () => updateTrigger(planId, trigger.id, { is_active: !trigger.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['triggers'] })
  })

  return (
    <div className="p-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{trigger.name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <DTBadge value={trigger.distress_thermometer_rating} />
            <button onClick={() => toggleActive.mutate()} className="text-xs bg-transparent border-none cursor-pointer"
              style={{ color: trigger.is_active ? 'var(--float-primary)' : '#94a3b8' }}>
              <span style={{ fontSize: '7px' }}>{trigger.is_active ? '●' : '○'}</span> {trigger.is_active ? 'Active' : 'Inactive'}
            </button>
          </div>
        </div>
      </div>

      {/* Behaviors */}
      <div className="space-y-1.5 mb-3">
        {behaviors?.map(b => (
          <div key={b.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className={`text-[10px] px-1 py-0.5 rounded font-bold uppercase ${b.behavior_type === 'safety' ? 'bg-amber-50 text-amber-600' : b.behavior_type === 'ritual' ? 'bg-purple-50 text-purple-600' : 'bg-slate-100 text-slate-500'}`}>
                {b.behavior_type.slice(0, 3)}
              </span>
              <span className="text-sm text-slate-700 truncate">{b.name}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <DTBadge value={b.distress_thermometer_when_refraining} />
              <button onClick={() => navigate(`/patients/${patientId}/triggers/${trigger.id}/ladder`)}
                className="text-[10px] text-teal-600 font-medium hover:underline bg-transparent border-none cursor-pointer whitespace-nowrap">
                Ladder &rarr;
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add behavior inline */}
      {showAdd ? (
        <div className="bg-slate-50 rounded-lg p-2.5 space-y-1.5">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Behavior name"
            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" autoFocus
            onKeyDown={e => e.key === 'Enter' && name.trim() && addMut.mutate()} />
          <div className="flex gap-1.5">
            <select value={type} onChange={e => setType(e.target.value)} className="px-2 py-1 text-xs border border-slate-200 rounded bg-white">
              <option value="avoidance">Avoidance</option><option value="safety">Safety</option><option value="ritual">Ritual</option>
            </select>
            <input value={dt} onChange={e => setDt(e.target.value)} placeholder="DT" type="number" min="0" max="10" className="w-12 px-1.5 py-1 text-xs border border-slate-200 rounded" />
            <button onClick={() => addMut.mutate()} disabled={!name.trim()} className="bg-teal-600 text-white px-2 py-1 rounded text-xs font-medium disabled:opacity-40 border-none cursor-pointer">Add</button>
            <button onClick={() => setShowAdd(false)} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">X</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="text-xs text-teal-600 font-medium hover:underline bg-transparent border-none cursor-pointer">+ Add behavior</button>
      )}
    </div>
  )
}

// ── Main Page ──
export default function PatientPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedTriggerId, setSelectedTriggerId] = useState<string | null>(null)
  const [showTriggerAdd, setShowTriggerAdd] = useState(false)
  const [newTriggerName, setNewTriggerName] = useState('')
  const [newTriggerDT, setNewTriggerDT] = useState('')
  const [showSendForm, setShowSendForm] = useState(false)
  const [parentEmail, setParentEmail] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [copied, setCopied] = useState(false)
  const [msgContent, setMsgContent] = useState('')
  const [showMsgForm, setShowMsgForm] = useState(false)

  // Session notes
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [editingNote, setEditingNote] = useState<SessionNote | null>(null)
  const [noteType, setNoteType] = useState('weekly_session')
  const [noteDate, setNoteDate] = useState(new Date().toISOString().split('T')[0])
  const [noteContent, setNoteContent] = useState('')
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)

  // Action plans
  const [showPlanEditor, setShowPlanEditor] = useState(false)
  const [editingPlan, setEditingPlan] = useState<ActionPlan | null>(null)
  const [planDate, setPlanDate] = useState(new Date().toISOString().split('T')[0])
  const [planNickname, setPlanNickname] = useState('')
  const [planNextAppt, setPlanNextAppt] = useState('')
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: 'Start writing...' })],
    content: '',
    editorProps: { attributes: { class: 'prose prose-sm max-w-none focus:outline-none min-h-[180px] px-3 py-2' } },
  })

  // Queries
  const { data: patient } = useQuery({ queryKey: ['patient', patientId], queryFn: () => getPatient(patientId!), enabled: !!patientId })
  const { data: plan } = useQuery({ queryKey: ['plan', patientId], queryFn: () => getTreatmentPlan(patientId!), enabled: !!patientId })
  const { data: triggers } = useQuery({ queryKey: ['triggers', plan?.id], queryFn: () => getTriggers(plan!.id), enabled: !!plan?.id })
  const { data: monitoringForm } = useQuery({ queryKey: ['monitoring-form', patientId], queryFn: () => getMonitoringForm(patientId!), enabled: !!patientId })
  const { data: sessionNotes } = useQuery({ queryKey: ['session-notes', patientId], queryFn: () => getSessionNotes(patientId!), enabled: !!patientId })
  const { data: actionPlans } = useQuery({ queryKey: ['action-plans', patientId], queryFn: () => getActionPlans(patientId!), enabled: !!patientId })
  const { data: messages } = useQuery({ queryKey: ['messages', patientId], queryFn: () => getMessages(patientId!), enabled: !!patientId })

  useEffect(() => { if (triggers?.length && !selectedTriggerId) setSelectedTriggerId(triggers[0].id) }, [triggers])
  const selectedTrigger = triggers?.find(t => t.id === selectedTriggerId)

  const activitySummary = (() => {
    if (monitoringForm?.status === 'in_progress') return `Monitoring in progress`
    if (monitoringForm?.status === 'submitted') return `Monitoring submitted`
    if (plan?.status === 'active') return 'Active treatment'
    if (plan?.status === 'setup') return `Setup \u00B7 ${triggers?.length ?? 0} situation${(triggers?.length ?? 0) === 1 ? '' : 's'}`
    return 'New patient'
  })()

  // Mutations
  const createPlanMut = useMutation({ mutationFn: () => createTreatmentPlan(patientId!, { clinical_track: 'exposure', parent_visibility_level: 'summary' }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plan', patientId] }) })
  const activatePlanMut = useMutation({ mutationFn: () => updatePlanStatus(patientId!, plan!.id, 'active'), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plan', patientId] }) })
  const addTriggerMut = useMutation({
    mutationFn: () => createTrigger(plan!.id, { name: newTriggerName, distress_thermometer_rating: newTriggerDT ? Number(newTriggerDT) : undefined }),
    onSuccess: (t) => { queryClient.invalidateQueries({ queryKey: ['triggers', plan?.id] }); setNewTriggerName(''); setNewTriggerDT(''); setShowTriggerAdd(false); setSelectedTriggerId(t.id) }
  })
  const sendFormMut = useMutation({
    mutationFn: (p: any) => sendMonitoringForm(patientId!, p),
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ['monitoring-form', patientId] }); if (data.full_link) { navigator.clipboard.writeText(data.full_link); setCopied(true); setTimeout(() => setCopied(false), 1500) }; setShowSendForm(false) }
  })
  const sendMsgMut = useMutation({
    mutationFn: () => sendMessage(patientId!, patient!.user_id, msgContent, 'general'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['messages', patientId] }); setMsgContent(''); setShowMsgForm(false) }
  })

  // Session notes
  const resetNoteForm = () => { setShowNoteForm(false); setEditingNote(null); setNoteType('weekly_session'); setNoteDate(new Date().toISOString().split('T')[0]); setNoteContent('') }
  const createNoteMut = useMutation({ mutationFn: () => createSessionNote(patientId!, { session_type: noteType, session_date: noteDate, content: noteContent }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['session-notes', patientId] }); resetNoteForm() } })
  const updateNoteMut = useMutation({ mutationFn: () => updateSessionNote(editingNote!.id, { session_type: noteType, session_date: noteDate, content: noteContent }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['session-notes', patientId] }); resetNoteForm() } })
  const deleteNoteMut = useMutation({ mutationFn: (id: string) => deleteSessionNote(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session-notes', patientId] }) })

  // Action plans
  const getEditorContent = useCallback(() => editor?.getHTML() || '', [editor])
  const resetPlanEditor = useCallback(() => { if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current); setShowPlanEditor(false); setEditingPlan(null); editor?.commands.setContent('') }, [editor])
  const createPlanActionMut = useMutation({ mutationFn: () => createActionPlan(patientId!, { session_date: planDate, nickname: planNickname || undefined, content: getEditorContent(), next_appointment: planNextAppt || undefined }), onSuccess: (d) => { queryClient.invalidateQueries({ queryKey: ['action-plans', patientId] }); setEditingPlan(d) } })
  const updatePlanActionMut = useMutation({ mutationFn: () => updateActionPlan(editingPlan!.id, { session_date: planDate, nickname: planNickname || undefined, content: getEditorContent(), next_appointment: planNextAppt || undefined }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['action-plans', patientId] }) })
  const publishPlanMut = useMutation({ mutationFn: (id: string) => publishActionPlan(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['action-plans', patientId] }) })
  const deletePlanMut = useMutation({ mutationFn: (id: string) => deleteActionPlan(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['action-plans', patientId] }) })

  useEffect(() => {
    if (showPlanEditor && editingPlan && editor) {
      autoSaveTimerRef.current = setInterval(() => updatePlanActionMut.mutate(), 30000)
      return () => { if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current) }
    }
  }, [showPlanEditor, editingPlan, editor])

  const canActivate = plan?.status === 'setup' && triggers && triggers.length > 0
  const lastMsg = messages?.[0]
  const sessionTypeLabels: Record<string, string> = { consultation_1: 'Consult 1', consultation_2: 'Consult 2', consultation_3: 'Consult 3', weekly_session: 'Session', other: 'Other' }
  const badgeColors: Record<string, string> = { consultation_1: 'bg-purple-100 text-purple-700', consultation_2: 'bg-purple-100 text-purple-700', consultation_3: 'bg-purple-100 text-purple-700', weekly_session: 'bg-teal-100 text-teal-700', other: 'bg-slate-100 text-slate-600' }

  const cardStyle = { background: '#fff', borderRadius: '10px', border: '1px solid var(--float-border)', padding: '20px', width: '100%', boxSizing: 'border-box' as const }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--float-bg)' }}>
      <PractitionerNav activePage="patients" subHeader={{
        backTo: '/dashboard', backLabel: 'Back to patients',
        title: patient?.name ?? 'Loading...', subtitle: activitySummary,
        rightAction: <button onClick={() => navigate(`/patients/${patientId}/progress`)} className="text-xs font-medium bg-transparent border-none cursor-pointer" style={{ color: 'var(--float-primary)' }}>View progress &rarr;</button>
      }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', padding: '24px', alignItems: 'start' }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Monitoring card */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Monitoring</span>
                {monitoringForm ? (
                  <>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${monitoringForm.status === 'submitted' ? 'bg-green-100 text-green-700' : 'bg-teal-100 text-teal-700'}`}>{monitoringForm.status === 'in_progress' ? 'in progress' : monitoringForm.status}</span>
                    <span className="text-xs text-slate-400">{monitoringForm.entries_count ?? 0} entries</span>
                  </>
                ) : <span className="text-xs text-slate-400">Not sent</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {monitoringForm && (monitoringForm.entries_count ?? 0) > 0 && <button onClick={() => navigate(`/patients/${patientId}/monitoring-report`)} className="text-xs text-teal-600 font-medium bg-transparent border-none cursor-pointer">Report</button>}
                {!monitoringForm && <button onClick={() => setShowSendForm(!showSendForm)} className="text-xs text-teal-600 font-medium bg-transparent border-none cursor-pointer">Send form</button>}
                {monitoringForm && <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/monitor/${monitoringForm.access_token}`); setCopied(true); setTimeout(() => setCopied(false), 1500) }} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">{copied ? 'Copied!' : 'Copy link'}</button>}
              </div>
            </div>
            {showSendForm && !monitoringForm && (
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <input value={parentEmail} onChange={e => setParentEmail(e.target.value)} placeholder="Parent email" className="text-xs border border-slate-200 rounded" style={{ flex: 1, padding: '6px 8px' }} />
                <input value={parentPhone} onChange={e => setParentPhone(e.target.value)} placeholder="Phone" className="text-xs border border-slate-200 rounded" style={{ width: '110px', padding: '6px 8px' }} />
                <button onClick={() => sendFormMut.mutate({ parent_email: parentEmail || undefined, parent_phone: parentPhone || undefined })} className="bg-teal-600 text-white rounded text-xs font-medium border-none cursor-pointer" style={{ padding: '6px 12px' }}>Send</button>
              </div>
            )}
          </div>

          {/* Treatment plan card */}
          {plan ? (
            <div style={{ ...cardStyle, padding: '0', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--float-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="text-sm font-semibold text-slate-700">Treatment plan</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${plan.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{plan.status}</span>
                </div>
                {canActivate && <button onClick={() => activatePlanMut.mutate()} disabled={activatePlanMut.isPending} className="text-xs px-2.5 py-1 bg-teal-600 text-white rounded-full disabled:opacity-50 border-none cursor-pointer">{activatePlanMut.isPending ? '...' : 'Activate'}</button>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', borderTop: '0', minHeight: '280px' }}>
                {/* Situations list */}
                <div style={{ borderRight: '1px solid var(--float-border)', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid #f1f5f9' }}>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Situations</span>
                    {!showTriggerAdd && <button onClick={() => setShowTriggerAdd(true)} className="text-[10px] text-teal-600 font-bold bg-transparent border-none cursor-pointer">+</button>}
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {triggers?.map(t => (
                      <button key={t.id} onClick={() => setSelectedTriggerId(t.id)}
                        style={{ width: '100%', textAlign: 'left', padding: '10px 12px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', background: t.id === selectedTriggerId ? '#f0fdfa' : 'transparent', borderLeft: t.id === selectedTriggerId ? '2px solid var(--float-primary)' : '2px solid transparent' }}>
                        <span style={{ fontSize: '5px', color: t.is_active ? 'var(--float-primary)' : '#cbd5e1' }}>●</span>
                        <span className="text-xs text-slate-700" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                        <DTBadge value={t.distress_thermometer_rating} />
                      </button>
                    ))}
                    {showTriggerAdd && (
                      <div style={{ padding: '8px', borderTop: '1px solid #f1f5f9' }}>
                        <input value={newTriggerName} onChange={e => setNewTriggerName(e.target.value)} placeholder="Situation name" className="text-xs border border-slate-200 rounded" style={{ width: '100%', padding: '4px 6px', marginBottom: '4px', boxSizing: 'border-box' }} autoFocus onKeyDown={e => e.key === 'Enter' && newTriggerName.trim() && addTriggerMut.mutate()} />
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <input value={newTriggerDT} onChange={e => setNewTriggerDT(e.target.value)} placeholder="DT" type="number" min="0" max="10" className="text-xs border border-slate-200 rounded" style={{ width: '36px', padding: '4px' }} />
                          <button onClick={() => addTriggerMut.mutate()} disabled={!newTriggerName.trim()} className="bg-teal-600 text-white rounded text-[10px] font-medium disabled:opacity-40 border-none cursor-pointer" style={{ padding: '4px 8px' }}>Add</button>
                          <button onClick={() => { setShowTriggerAdd(false); setNewTriggerName(''); setNewTriggerDT('') }} className="text-[10px] text-slate-400 bg-transparent border-none cursor-pointer">X</button>
                        </div>
                      </div>
                    )}
                    {(!triggers || triggers.length === 0) && !showTriggerAdd && (
                      <div style={{ padding: '24px 12px', textAlign: 'center' }}><button onClick={() => setShowTriggerAdd(true)} className="text-xs text-teal-600 font-medium bg-transparent border-none cursor-pointer">+ Add situation</button></div>
                    )}
                  </div>
                </div>
                {/* Behaviors */}
                <div style={{ overflow: 'hidden' }}>
                  {selectedTrigger ? <BehaviorPanel trigger={selectedTrigger} planId={plan.id} patientId={patientId!} /> : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '13px', color: '#94a3b8' }}>Select a situation</div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div style={{ ...cardStyle, textAlign: 'center' }}>
              <p className="text-sm text-slate-500" style={{ marginBottom: '4px' }}>No treatment plan yet</p>
              <p className="text-xs text-slate-400" style={{ marginBottom: '12px' }}>Create one to start configuring trigger situations</p>
              <button onClick={() => createPlanMut.mutate()} disabled={createPlanMut.isPending} className="text-white text-sm font-medium disabled:opacity-50 border-none cursor-pointer" style={{ background: 'var(--float-primary)', padding: '8px 16px', borderRadius: '8px' }}>{createPlanMut.isPending ? 'Creating...' : 'Create treatment plan'}</button>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Messages card */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Messages</span>
              <button onClick={() => setShowMsgForm(!showMsgForm)} className="text-xs text-teal-600 font-medium bg-transparent border-none cursor-pointer">+ New</button>
            </div>
            {showMsgForm && (
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input value={msgContent} onChange={e => setMsgContent(e.target.value)} placeholder="Message..." className="text-xs border border-slate-200 rounded" style={{ flex: 1, padding: '6px 8px' }} onKeyDown={e => e.key === 'Enter' && msgContent.trim() && sendMsgMut.mutate()} />
                <button onClick={() => sendMsgMut.mutate()} disabled={!msgContent.trim()} className="bg-teal-600 text-white rounded text-xs font-medium border-none cursor-pointer disabled:opacity-40" style={{ padding: '6px 12px' }}>Send</button>
              </div>
            )}
            {lastMsg ? (
              <p className="text-xs text-slate-600" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...(lastMsg.message_type === 'too_hard' ? { borderLeft: '2px solid #f59e0b', paddingLeft: '6px' } : {}) }}>{lastMsg.content.length > 100 ? lastMsg.content.slice(0, 100) + '...' : lastMsg.content}</p>
            ) : !showMsgForm && <p className="text-xs text-slate-400">No messages yet</p>}
          </div>

          {/* Session notes card */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="text-sm font-semibold text-slate-700">Session notes</span>
                {sessionNotes && sessionNotes.length > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{sessionNotes.length}</span>}
              </div>
              {!showNoteForm && <button onClick={() => { resetNoteForm(); setShowNoteForm(true) }} className="text-xs text-teal-600 font-medium bg-transparent border-none cursor-pointer">+ Add note</button>}
            </div>
            {showNoteForm && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select value={noteType} onChange={e => setNoteType(e.target.value)} className="text-xs border border-slate-200 rounded bg-white" style={{ padding: '4px 8px' }}>
                    {Object.entries(sessionTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input type="date" value={noteDate} onChange={e => setNoteDate(e.target.value)} className="text-xs border border-slate-200 rounded" style={{ padding: '4px 8px' }} />
                </div>
                <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} rows={4} placeholder="Session notes..." className="text-xs border border-slate-200 rounded" style={{ width: '100%', padding: '8px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => editingNote ? updateNoteMut.mutate() : createNoteMut.mutate()} disabled={!noteContent.trim()} className="bg-teal-600 text-white rounded text-xs font-medium disabled:opacity-40 border-none cursor-pointer" style={{ padding: '6px 12px' }}>{editingNote ? 'Update' : 'Save'}</button>
                  <button onClick={resetNoteForm} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                </div>
              </div>
            )}
            {sessionNotes && sessionNotes.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {sessionNotes.map(n => (
                  <div key={n.id} style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: '6px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span className={`px-1 py-0.5 rounded font-medium ${badgeColors[n.session_type] || 'bg-slate-100 text-slate-600'}`}>{sessionTypeLabels[n.session_type] || n.session_type}</span>
                        <span className="text-slate-400">{new Date(n.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <button onClick={() => { setEditingNote(n); setNoteType(n.session_type); setNoteDate(n.session_date); setNoteContent(n.content); setShowNoteForm(true) }} className="text-teal-600 bg-transparent border-none cursor-pointer" style={{ fontSize: '11px' }}>Edit</button>
                        <button onClick={() => { if (confirm('Delete?')) deleteNoteMut.mutate(n.id) }} className="text-red-400 bg-transparent border-none cursor-pointer" style={{ fontSize: '11px' }}>Del</button>
                      </div>
                    </div>
                    <p className="text-slate-600" style={{ whiteSpace: 'pre-wrap', cursor: 'pointer', margin: 0 }} onClick={() => setExpandedNoteId(expandedNoteId === n.id ? null : n.id)}>
                      {expandedNoteId === n.id ? n.content : n.content.length > 100 ? n.content.slice(0, 100) + '...' : n.content}
                    </p>
                  </div>
                ))}
              </div>
            ) : !showNoteForm && <p className="text-xs text-slate-400" style={{ margin: 0 }}>No notes yet</p>}
          </div>

          {/* Action plans card */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="text-sm font-semibold text-slate-700">Action plans</span>
                {actionPlans && actionPlans.length > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{actionPlans.length}</span>}
              </div>
              {!showPlanEditor && <button onClick={() => { resetPlanEditor(); editor?.commands.setContent(ACTION_PLAN_TEMPLATE); setShowPlanEditor(true) }} className="text-xs text-teal-600 font-medium bg-transparent border-none cursor-pointer">+ New plan</button>}
            </div>
            {showPlanEditor && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input type="date" value={planDate} onChange={e => setPlanDate(e.target.value)} className="text-xs border border-slate-200 rounded" style={{ padding: '4px 8px' }} />
                  <input value={planNickname} onChange={e => setPlanNickname(e.target.value)} placeholder="Nickname" className="text-xs border border-slate-200 rounded" style={{ flex: 1, padding: '4px 8px' }} />
                </div>
                <div style={{ border: '1px solid var(--float-border)', borderRadius: '6px', overflow: 'hidden' }}>
                  <EditorContent editor={editor} />
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => editingPlan ? updatePlanActionMut.mutate() : createPlanActionMut.mutate()} className="bg-teal-600 text-white rounded text-xs font-medium border-none cursor-pointer" style={{ padding: '6px 12px' }}>Save draft</button>
                  {editingPlan && !editingPlan.visible_to_patient && <button onClick={() => { updatePlanActionMut.mutate(undefined, { onSuccess: () => { publishPlanMut.mutate(editingPlan.id); resetPlanEditor() } }) }} className="bg-green-600 text-white rounded text-xs font-medium border-none cursor-pointer" style={{ padding: '6px 12px' }}>Publish</button>}
                  <button onClick={resetPlanEditor} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                </div>
              </div>
            )}
            {actionPlans && actionPlans.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {actionPlans.map(ap => (
                  <div key={ap.id} style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span className="font-medium text-slate-700">#{ap.session_number}</span>
                      <span className="text-slate-400">{new Date(ap.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span className={`px-1 py-0.5 rounded font-medium ${ap.visible_to_patient ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{ap.visible_to_patient ? 'Published' : 'Draft'}</span>
                      {!ap.visible_to_patient && <button onClick={() => { setEditingPlan(ap); setPlanDate(ap.session_date); setPlanNickname(ap.nickname || ''); editor?.commands.setContent(ap.content || ''); setShowPlanEditor(true) }} className="text-teal-600 bg-transparent border-none cursor-pointer" style={{ fontSize: '11px' }}>Edit</button>}
                      <button onClick={() => { if (confirm('Delete?')) deletePlanMut.mutate(ap.id) }} className="text-red-400 bg-transparent border-none cursor-pointer" style={{ fontSize: '11px' }}>Del</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : !showPlanEditor && <p className="text-xs text-slate-400" style={{ margin: 0 }}>No plans yet</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
