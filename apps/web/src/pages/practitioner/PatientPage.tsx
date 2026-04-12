import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPatient, getPreSessionBrief } from '../../api/patients'
import {
  getTreatmentPlan, getTriggers, createTreatmentPlan, createTrigger,
  updatePlanStatus, getBehaviors, getLadder, getLadderFlags,
  reviewLadder, createBehavior, createRung, updateTrigger, deleteTrigger,
  type TriggerSituation, type AvoidanceBehavior, type Ladder, type LadderFlag
} from '../../api/treatment'
import { getMonitoringForm, sendMonitoringForm } from '../../api/monitoring'
import { getSessionNotes, createSessionNote, updateSessionNote, deleteSessionNote, type SessionNote } from '../../api/session_notes'
import { getActionPlans, createActionPlan, updateActionPlan, publishActionPlan, deleteActionPlan, type ActionPlan } from '../../api/action_plans'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import InlineForm from '../../components/ui/InlineForm'
import MessagesPanel from '../../components/ui/MessagesPanel'
import DownwardArrowPanel from '../../components/ui/DownwardArrowPanel'
import PractitionerNav from '../../components/ui/PractitionerNav'

const ACTION_PLAN_TEMPLATE = `<h2>Exposures</h2><ul><li></li></ul><h2>Behaviors to resist</h2><ul><li></li></ul><h2>Parent instructions</h2><ul><li></li></ul><h2>Coping tools</h2><ul><li></li></ul><h2>Notes</h2><p></p>`

function DTBadge({ value, size = 'sm' }: { value: number | null | undefined; size?: 'sm' | 'md' }) {
  if (value == null) return null
  const v = Number(value)
  const color = v >= 7 ? 'bg-red-100 text-red-700' : v >= 4 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
  const sz = size === 'md' ? 'text-sm px-2.5 py-1' : 'text-xs px-2 py-0.5'
  return <span className={`rounded-full font-bold ${color} ${sz}`}>DT {v}</span>
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    not_started: 'bg-slate-100 text-slate-500',
    active: 'bg-teal-100 text-teal-700',
    complete: 'bg-green-100 text-green-700',
  }
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[status] || 'bg-slate-100 text-slate-500'}`}>{status.replace('_', ' ')}</span>
}

function TrendPill({ label, trend }: { label: string; trend: string }) {
  const display = trend === 'insufficient data' ? 'Not enough data yet' : trend
  const colors: Record<string, string> = {
    improving: 'bg-green-100 text-green-700', stable: 'bg-slate-100 text-slate-600',
    worsening: 'bg-red-100 text-red-700', 'Not enough data yet': 'bg-slate-50 text-slate-400',
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[display] || 'bg-slate-50 text-slate-400'}`}>{display}</span>
    </div>
  )
}

// ── Situation Detail Panel ──
function SituationPanel({ trigger, planId, patientId }: {
  trigger: TriggerSituation; planId: string; patientId: string
}) {
  const qc = useQueryClient()
  const [showAddBehavior, setShowAddBehavior] = useState(false)
  const [behaviorName, setBehaviorName] = useState('')
  const [behaviorType, setBehaviorType] = useState('avoidance')
  const [behaviorDT, setBehaviorDT] = useState('')
  const [showAddRung, setShowAddRung] = useState(false)
  const [rungBehaviorId, setRungBehaviorId] = useState('')
  const [rungDT, setRungDT] = useState('')
  const [expandedArrowRung, setExpandedArrowRung] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameVal, setNameVal] = useState(trigger.name)

  useEffect(() => { setNameVal(trigger.name); setEditingName(false); setExpandedArrowRung(null) }, [trigger.id])

  const { data: behaviors } = useQuery({
    queryKey: ['behaviors', trigger.id],
    queryFn: () => getBehaviors(trigger.id),
  })

  const { data: ladder } = useQuery({
    queryKey: ['ladder', trigger.id],
    queryFn: () => getLadder(trigger.id),
  })

  const { data: flags } = useQuery({
    queryKey: ['ladder-flags', ladder?.id],
    queryFn: () => getLadderFlags(ladder!.id),
    enabled: !!ladder?.id
  })

  const openFlags = flags?.filter(f => f.status === 'open') ?? []

  const toggleActive = useMutation({
    mutationFn: () => updateTrigger(planId, trigger.id, { is_active: !trigger.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['triggers'] })
  })

  const renameMutation = useMutation({
    mutationFn: () => updateTrigger(planId, trigger.id, { name: nameVal }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['triggers'] }); setEditingName(false) }
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteTrigger(planId, trigger.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['triggers'] })
  })

  const addBehaviorMut = useMutation({
    mutationFn: () => createBehavior(trigger.id, {
      name: behaviorName, behavior_type: behaviorType,
      distress_thermometer_when_refraining: behaviorDT ? Number(behaviorDT) : undefined
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] }); setBehaviorName(''); setBehaviorDT(''); setShowAddBehavior(false) }
  })

  const addRungMut = useMutation({
    mutationFn: () => createRung(ladder!.id, {
      avoidance_behavior_id: rungBehaviorId || undefined,
      distress_thermometer_rating: rungDT ? Number(rungDT) : undefined,
      rung_order: (ladder?.rungs?.length ?? 0)
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ladder', trigger.id] }); setRungBehaviorId(''); setRungDT(''); setShowAddRung(false) }
  })

  const reviewMut = useMutation({
    mutationFn: () => reviewLadder(ladder!.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ladder-flags', ladder?.id] })
  })

  const sortedRungs = ladder?.rungs ? [...ladder.rungs].sort((a, b) => a.rung_order - b.rung_order) : []

  return (
    <div className="h-full overflow-y-auto">
      {/* Situation header */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-start justify-between mb-2">
          {editingName ? (
            <div className="flex items-center gap-2 flex-1">
              <input value={nameVal} onChange={e => setNameVal(e.target.value)}
                className="text-lg font-semibold text-slate-800 border-b-2 border-teal-400 outline-none bg-transparent flex-1"
                onKeyDown={e => e.key === 'Enter' && renameMutation.mutate()} autoFocus />
              <button onClick={() => renameMutation.mutate()} className="text-xs text-teal-600 font-medium">Save</button>
              <button onClick={() => { setEditingName(false); setNameVal(trigger.name) }} className="text-xs text-slate-400">Cancel</button>
            </div>
          ) : (
            <h2 className="text-lg font-semibold text-slate-800 cursor-pointer hover:text-teal-700 transition-colors"
              onClick={() => setEditingName(true)} title="Click to edit">
              {trigger.name}
            </h2>
          )}
          <DTBadge value={trigger.distress_thermometer_rating} size="md" />
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => toggleActive.mutate()}
            className="flex items-center gap-1.5 text-xs font-medium bg-transparent border-none cursor-pointer"
            style={{ color: trigger.is_active ? 'var(--float-primary)' : '#94a3b8' }}>
            <span style={{ fontSize: '8px' }}>{trigger.is_active ? '●' : '○'}</span>
            {trigger.is_active ? 'Active' : 'Not active'}
          </button>
          <button onClick={() => { if (confirm(`Delete "${trigger.name}"?`)) deleteMutation.mutate() }}
            className="text-xs text-red-400 hover:text-red-600 bg-transparent border-none cursor-pointer">Delete</button>
        </div>
      </div>

      {/* Behaviors */}
      <div className="px-5 py-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Avoidance &amp; safety behaviors</h3>
          {!showAddBehavior && (
            <button onClick={() => setShowAddBehavior(true)} className="text-xs text-teal-600 font-medium hover:underline bg-transparent border-none cursor-pointer">+ Add behavior</button>
          )}
        </div>
        {showAddBehavior && (
          <div className="bg-slate-50 rounded-lg p-3 mb-3 space-y-2">
            <input value={behaviorName} onChange={e => setBehaviorName(e.target.value)} placeholder="Behavior name"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg" />
            <div className="flex gap-2">
              <select value={behaviorType} onChange={e => setBehaviorType(e.target.value)}
                className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white">
                <option value="avoidance">Avoidance</option>
                <option value="safety">Safety</option>
                <option value="ritual">Ritual</option>
              </select>
              <input value={behaviorDT} onChange={e => setBehaviorDT(e.target.value)} placeholder="DT 0-10" type="number" min="0" max="10"
                className="w-20 px-3 py-2 text-sm border border-slate-200 rounded-lg" />
              <button onClick={() => addBehaviorMut.mutate()} disabled={!behaviorName.trim()}
                className="bg-teal-600 text-white px-3 py-2 rounded-lg text-xs font-medium disabled:opacity-40">Add</button>
              <button onClick={() => setShowAddBehavior(false)} className="text-xs text-slate-400">Cancel</button>
            </div>
          </div>
        )}
        {behaviors && behaviors.length > 0 ? (
          <div className="space-y-1.5">
            {behaviors.map(b => (
              <div key={b.id} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg text-sm">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${b.behavior_type === 'safety' ? 'bg-amber-50 text-amber-600' : b.behavior_type === 'ritual' ? 'bg-purple-50 text-purple-600' : 'bg-slate-100 text-slate-500'}`}>
                    {b.behavior_type}
                  </span>
                  <span className="text-slate-700">{b.name}</span>
                </div>
                <DTBadge value={b.distress_thermometer_when_refraining} />
              </div>
            ))}
          </div>
        ) : !showAddBehavior && (
          <p className="text-sm text-slate-400">No behaviors yet &middot; <button onClick={() => setShowAddBehavior(true)} className="text-teal-600 hover:underline bg-transparent border-none cursor-pointer text-sm font-medium">+ Add behavior</button></p>
        )}
      </div>

      {/* Exposure Ladder */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wider">Exposure ladder</h3>
            {openFlags.length > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">{openFlags.length} flag{openFlags.length > 1 ? 's' : ''}</span>
            )}
          </div>
          {ladder && (
            <button onClick={() => reviewMut.mutate()} disabled={reviewMut.isPending}
              className="text-xs text-teal-600 font-medium hover:underline bg-transparent border-none cursor-pointer disabled:opacity-50">
              {reviewMut.isPending ? 'Reviewing...' : 'Run AI review'}
            </button>
          )}
        </div>

        {/* Flags */}
        {openFlags.length > 0 && (
          <div className="space-y-2 mb-4">
            {openFlags.map(f => (
              <div key={f.id} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                <p className="text-xs font-medium text-amber-700">{f.flag_type.replace(/_/g, ' ')}</p>
                {f.description && <p className="text-xs text-amber-600 mt-0.5">{f.description}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Rungs — bottom (lowest DT) to top */}
        {sortedRungs.length > 0 ? (
          <div className="space-y-2">
            {[...sortedRungs].reverse().map((rung, i) => {
              const behavior = behaviors?.find(b => b.id === rung.avoidance_behavior_id)
              const isExpanded = expandedArrowRung === rung.id
              return (
                <div key={rung.id}>
                  <div className={`flex items-center gap-3 py-2.5 px-3 rounded-lg transition-colors ${rung.status === 'complete' ? 'bg-green-50' : rung.status === 'active' ? 'bg-teal-50' : 'bg-slate-50'}`}>
                    <span className="text-xs font-bold text-slate-400 w-5 text-center">{sortedRungs.length - i}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-700 truncate">{behavior?.name || `Step ${rung.rung_order + 1}`}</p>
                    </div>
                    <DTBadge value={rung.distress_thermometer_rating} />
                    <StatusBadge status={rung.status} />
                    <button
                      onClick={() => setExpandedArrowRung(isExpanded ? null : rung.id)}
                      className={`text-xs px-1.5 py-0.5 rounded font-medium border cursor-pointer ${isExpanded ? 'bg-teal-100 text-teal-700 border-teal-200' : 'bg-white text-slate-400 border-slate-200 hover:border-teal-300 hover:text-teal-600'}`}
                      title="Downward Arrow"
                    >DA</button>
                  </div>
                  {isExpanded && (
                    <div className="ml-8 mt-2 mb-2">
                      <DownwardArrowPanel rungId={rung.id} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-400 mb-3">No rungs yet — add behaviors then create rungs from them.</p>
        )}

        {/* Add rung */}
        {ladder && (
          <div className="mt-3">
            {!showAddRung ? (
              <button onClick={() => setShowAddRung(true)} className="text-xs text-teal-600 font-medium hover:underline bg-transparent border-none cursor-pointer">+ Add rung</button>
            ) : (
              <div className="flex gap-2 items-end bg-slate-50 p-3 rounded-lg">
                <div className="flex-1">
                  <label className="block text-xs text-slate-500 mb-1">Behavior</label>
                  <select value={rungBehaviorId} onChange={e => setRungBehaviorId(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded bg-white">
                    <option value="">None</option>
                    {behaviors?.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="w-20">
                  <label className="block text-xs text-slate-500 mb-1">DT</label>
                  <input value={rungDT} onChange={e => setRungDT(e.target.value)} type="number" min="0" max="10"
                    className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" />
                </div>
                <button onClick={() => addRungMut.mutate()} className="bg-teal-600 text-white px-3 py-1.5 rounded text-xs font-medium">Add</button>
                <button onClick={() => setShowAddRung(false)} className="text-xs text-slate-400">Cancel</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Collapsible Section ──
function CollapsibleSection({ title, count, isOpen, onToggle, children }: {
  title: string; count?: number; isOpen: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <button onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3 bg-transparent border-none cursor-pointer text-left">
        <div className="flex items-center gap-2">
          <h3 className="text-[15px] font-medium text-slate-700">{title}</h3>
          {count != null && count > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{count}</span>
          )}
        </div>
        <span className="text-slate-400 text-xs">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && <div className="px-5 pb-4 border-t border-slate-100 pt-3">{children}</div>}
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
  const [openSection, setOpenSection] = useState<string | null>(null)
  const [briefExpanded, setBriefExpanded] = useState(() => {
    if (!patientId) return true
    return localStorage.getItem(`brief_expanded_${patientId}`) !== 'false'
  })

  // Session notes state
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

  // Monitoring form state
  const [showSendForm, setShowSendForm] = useState(false)
  const [parentEmail, setParentEmail] = useState('')
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [copied, setCopied] = useState(false)

  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: 'Start writing your action plan...' })],
    content: '',
    editorProps: { attributes: { class: 'prose prose-sm max-w-none focus:outline-none min-h-[300px] px-4 py-3' } },
  })

  // Queries
  const { data: patient } = useQuery({ queryKey: ['patient', patientId], queryFn: () => getPatient(patientId!), enabled: !!patientId })
  const { data: brief } = useQuery({ queryKey: ['brief', patientId], queryFn: () => getPreSessionBrief(patientId!), enabled: !!patientId })
  const { data: plan } = useQuery({ queryKey: ['plan', patientId], queryFn: () => getTreatmentPlan(patientId!), enabled: !!patientId })
  const { data: triggers } = useQuery({ queryKey: ['triggers', plan?.id], queryFn: () => getTriggers(plan!.id), enabled: !!plan?.id })
  const { data: monitoringForm } = useQuery({ queryKey: ['monitoring-form', patientId], queryFn: () => getMonitoringForm(patientId!), enabled: !!patientId })
  const { data: sessionNotes } = useQuery({ queryKey: ['session-notes', patientId], queryFn: () => getSessionNotes(patientId!), enabled: !!patientId })
  const { data: actionPlans } = useQuery({ queryKey: ['action-plans', patientId], queryFn: () => getActionPlans(patientId!), enabled: !!patientId })

  // Select first trigger by default
  useEffect(() => {
    if (triggers?.length && !selectedTriggerId) setSelectedTriggerId(triggers[0].id)
  }, [triggers])

  const selectedTrigger = triggers?.find(t => t.id === selectedTriggerId)

  // Activity summary
  const activitySummary = (() => {
    if (monitoringForm?.status === 'in_progress') return `Monitoring form in progress \u00B7 ${monitoringForm.entries_count ?? 0} entries`
    if (monitoringForm?.status === 'submitted') return `Monitoring form submitted \u00B7 ${monitoringForm.entries_count ?? 0} entries`
    if (!monitoringForm && !plan) return 'No monitoring form sent yet'
    if (plan?.status === 'active' && brief?.experiments_since_last_session) return `${brief.experiments_since_last_session} experiment${brief.experiments_since_last_session === 1 ? '' : 's'} completed`
    if (plan?.status === 'active') return 'Treatment plan active \u00B7 No exposures yet'
    if (plan?.status === 'setup') return `Treatment plan in setup \u00B7 ${triggers?.length ?? 0} trigger situation${(triggers?.length ?? 0) === 1 ? '' : 's'}`
    return 'New patient'
  })()

  // Brief collapsed summary
  const briefSummary = brief
    ? [
        brief.open_flag_count > 0 ? `${brief.open_flag_count} open flag${brief.open_flag_count > 1 ? 's' : ''}` : null,
        `BIP ${brief.bip_trend === 'insufficient data' ? 'no data' : brief.bip_trend}`,
        brief.last_experiment_date ? `Last experiment ${new Date(brief.last_experiment_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'No experiments',
      ].filter(Boolean).join(' \u00B7 ')
    : null

  // Mutations
  const createPlanMut = useMutation({
    mutationFn: () => createTreatmentPlan(patientId!, { clinical_track: 'exposure', parent_visibility_level: 'summary' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plan', patientId] })
  })
  const activatePlanMut = useMutation({
    mutationFn: () => updatePlanStatus(patientId!, plan!.id, 'active'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plan', patientId] })
  })
  const addTriggerMut = useMutation({
    mutationFn: () => createTrigger(plan!.id, { name: newTriggerName, distress_thermometer_rating: newTriggerDT ? Number(newTriggerDT) : undefined }),
    onSuccess: (t) => {
      queryClient.invalidateQueries({ queryKey: ['triggers', plan?.id] })
      setNewTriggerName(''); setNewTriggerDT(''); setShowTriggerAdd(false)
      setSelectedTriggerId(t.id)
    }
  })

  // Session notes
  const resetNoteForm = () => { setShowNoteForm(false); setEditingNote(null); setNoteType('weekly_session'); setNoteDate(new Date().toISOString().split('T')[0]); setNoteContent('') }
  const createNoteMut = useMutation({
    mutationFn: () => createSessionNote(patientId!, { session_type: noteType, session_date: noteDate, content: noteContent }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['session-notes', patientId] }); resetNoteForm() }
  })
  const updateNoteMut = useMutation({
    mutationFn: () => updateSessionNote(editingNote!.id, { session_type: noteType, session_date: noteDate, content: noteContent }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['session-notes', patientId] }); resetNoteForm() }
  })
  const deleteNoteMut = useMutation({
    mutationFn: (id: string) => deleteSessionNote(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session-notes', patientId] })
  })

  // Action plans
  const getEditorContent = useCallback(() => editor?.getHTML() || '', [editor])
  const resetPlanEditor = useCallback(() => {
    if (autoSaveTimerRef.current) { clearInterval(autoSaveTimerRef.current); autoSaveTimerRef.current = null }
    setShowPlanEditor(false); setEditingPlan(null); setPlanDate(new Date().toISOString().split('T')[0]); setPlanNickname(''); setPlanNextAppt(''); editor?.commands.setContent('')
  }, [editor])
  const createPlanActionMut = useMutation({
    mutationFn: () => createActionPlan(patientId!, { session_date: planDate, nickname: planNickname || undefined, content: getEditorContent(), next_appointment: planNextAppt || undefined }),
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ['action-plans', patientId] }); setEditingPlan(data) }
  })
  const updatePlanActionMut = useMutation({
    mutationFn: () => updateActionPlan(editingPlan!.id, { session_date: planDate, nickname: planNickname || undefined, content: getEditorContent(), next_appointment: planNextAppt || undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['action-plans', patientId] })
  })
  const publishPlanMut = useMutation({
    mutationFn: (id: string) => publishActionPlan(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['action-plans', patientId] })
  })
  const deletePlanMut = useMutation({
    mutationFn: (id: string) => deleteActionPlan(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['action-plans', patientId] })
  })

  useEffect(() => {
    if (showPlanEditor && editingPlan && editor) {
      autoSaveTimerRef.current = setInterval(() => updatePlanActionMut.mutate(), 30000)
      return () => { if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current) }
    }
  }, [showPlanEditor, editingPlan, editor])

  // Monitoring
  const sendFormMut = useMutation({
    mutationFn: (p: { parent_email?: string; parent_name?: string; parent_phone?: string }) => sendMonitoringForm(patientId!, p),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['monitoring-form', patientId] })
      if (data.full_link) { navigator.clipboard.writeText(data.full_link); setCopied(true); setTimeout(() => setCopied(false), 2000) }
      setShowSendForm(false); setParentEmail(''); setParentName(''); setParentPhone('')
    }
  })

  const handleBriefToggle = () => {
    const next = !briefExpanded
    setBriefExpanded(next)
    localStorage.setItem(`brief_expanded_${patientId}`, String(next))
  }

  const canActivate = plan?.status === 'setup' && triggers && triggers.length > 0

  const sessionTypeLabels: Record<string, string> = { consultation_1: 'Consultation 1', consultation_2: 'Consultation 2', consultation_3: 'Consultation 3', weekly_session: 'Weekly session', other: 'Other' }
  const sessionTypeBadgeColors: Record<string, string> = { consultation_1: 'bg-purple-100 text-purple-700', consultation_2: 'bg-purple-100 text-purple-700', consultation_3: 'bg-purple-100 text-purple-700', weekly_session: 'bg-teal-100 text-teal-700', other: 'bg-slate-100 text-slate-600' }

  return (
    <div className="min-h-screen bg-slate-50">
      <PractitionerNav activePage="patients" subHeader={{
        backTo: '/dashboard', backLabel: 'Back to patients',
        title: patient?.name ?? 'Loading...', subtitle: activitySummary,
        rightAction: <button onClick={() => navigate(`/patients/${patientId}/progress`)} className="text-xs font-medium bg-transparent border-none cursor-pointer" style={{ color: 'var(--float-primary)' }}>View progress &rarr;</button>
      }} />

      {/* Phone */}
      {patient?.phone_number && (
        <div className="px-8 pt-2"><p className="text-xs" style={{ color: 'var(--float-text-hint)' }}>{patient.phone_number}</p></div>
      )}

      <main className="px-8 py-4 max-w-[1400px] mx-auto space-y-4">
        {/* Zone 2 — Pre-session brief (collapsible) */}
        {brief && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <button onClick={handleBriefToggle} className="w-full flex items-center justify-between px-5 py-3 bg-transparent border-none cursor-pointer text-left">
              <div className="flex items-center gap-2">
                <h2 className="text-[15px] font-semibold text-slate-800">Pre-session brief</h2>
                {!briefExpanded && briefSummary && <span className="text-xs text-slate-400">{briefSummary}</span>}
              </div>
              <span className="text-slate-400 text-xs">{briefExpanded ? '▲' : '▼'}</span>
            </button>
            {briefExpanded && (
              <div className="px-5 pb-4 border-t border-slate-100 pt-3">
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Experiments</p>
                    <p className="text-xl font-semibold text-slate-800">{brief.experiments_since_last_session}</p>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Open flags</p>
                    <p className="text-xl font-semibold" style={brief.open_flag_count > 0 ? { color: 'var(--float-primary)' } : undefined}>
                      {brief.open_flag_count > 0 && <span className="text-sm mr-1">⚠</span>}{brief.open_flag_count}
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 mb-4"><TrendPill label="BIP" trend={brief.bip_trend} /><TrendPill label="Distress" trend={brief.distress_thermometer_trend} /></div>
                <div className="rounded-lg px-4 py-3 mb-3" style={{ borderLeft: '4px solid var(--float-primary)', background: '#f0fdfa' }}>
                  <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--float-primary)' }}>Recommended focus</p>
                  <p className="text-base font-medium" style={{ color: '#134e4a' }}>{brief.recommended_focus}</p>
                </div>
                {brief.recent_learnings.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Recent learnings</p>
                    <ul className="space-y-1">{brief.recent_learnings.map((l: string, i: number) => <li key={i} className="text-sm text-slate-600 flex gap-2"><span className="text-slate-300">—</span><span>{l}</span></li>)}</ul>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Zone 3 — Clinical workspace */}
        {plan ? (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            {/* Plan header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-800">Treatment plan</h2>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">{plan.clinical_track}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${plan.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{plan.status}</span>
              </div>
              {canActivate && (
                <button onClick={() => activatePlanMut.mutate()} disabled={activatePlanMut.isPending}
                  className="text-xs px-3 py-1 bg-teal-600 text-white rounded-full hover:bg-teal-700 disabled:opacity-50 border-none cursor-pointer">
                  {activatePlanMut.isPending ? 'Activating...' : 'Activate plan'}
                </button>
              )}
            </div>

            {/* Two-panel layout */}
            <div className="flex min-h-[500px]" style={{ maxHeight: 'calc(100vh - 280px)' }}>
              {/* Left panel — situations */}
              <div className="w-[280px] border-r border-slate-100 flex flex-col flex-shrink-0 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Situations</span>
                  {!showTriggerAdd && (
                    <button onClick={() => setShowTriggerAdd(true)} className="text-xs text-teal-600 font-medium hover:underline bg-transparent border-none cursor-pointer">+ Add</button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto">
                  {triggers?.map(t => {
                    const isSelected = t.id === selectedTriggerId
                    return (
                      <button key={t.id} onClick={() => setSelectedTriggerId(t.id)}
                        className="w-full text-left px-4 py-3 border-none cursor-pointer transition-colors flex items-center gap-2"
                        style={{
                          background: isSelected ? '#f0fdfa' : 'transparent',
                          borderLeft: isSelected ? '3px solid var(--float-primary)' : '3px solid transparent',
                        }}>
                        <span style={{ fontSize: '6px', color: t.is_active ? 'var(--float-primary)' : '#cbd5e1' }}>●</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{t.name}</p>
                        </div>
                        <DTBadge value={t.distress_thermometer_rating} />
                      </button>
                    )
                  })}
                  {/* Inline add */}
                  {showTriggerAdd && (
                    <div className="px-3 py-2 border-t border-slate-50">
                      <input value={newTriggerName} onChange={e => setNewTriggerName(e.target.value)} placeholder="Situation name"
                        className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded mb-1.5" autoFocus
                        onKeyDown={e => e.key === 'Enter' && newTriggerName.trim() && addTriggerMut.mutate()} />
                      <div className="flex gap-1.5">
                        <input value={newTriggerDT} onChange={e => setNewTriggerDT(e.target.value)} placeholder="DT" type="number" min="0" max="10"
                          className="w-14 px-2 py-1.5 text-sm border border-slate-200 rounded" />
                        <button onClick={() => addTriggerMut.mutate()} disabled={!newTriggerName.trim()}
                          className="bg-teal-600 text-white px-2.5 py-1.5 rounded text-xs font-medium disabled:opacity-40 border-none cursor-pointer">Add</button>
                        <button onClick={() => { setShowTriggerAdd(false); setNewTriggerName(''); setNewTriggerDT('') }}
                          className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                      </div>
                    </div>
                  )}
                  {(!triggers || triggers.length === 0) && !showTriggerAdd && (
                    <div className="px-4 py-8 text-center">
                      <p className="text-sm text-slate-400 mb-2">No situations yet</p>
                      <button onClick={() => setShowTriggerAdd(true)} className="text-xs text-teal-600 font-medium bg-transparent border-none cursor-pointer">+ Add first situation</button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right panel — detail */}
              <div className="flex-1 overflow-hidden">
                {selectedTrigger ? (
                  <SituationPanel trigger={selectedTrigger} planId={plan.id} patientId={patientId!} />
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-slate-400">
                    Select a situation to view its ladder
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <p className="text-slate-500 mb-1">No treatment plan yet</p>
            <p className="text-sm text-slate-400 mb-4">Create one to start configuring trigger situations and exposure ladders</p>
            <button onClick={() => createPlanMut.mutate()} disabled={createPlanMut.isPending}
              className="text-white px-5 py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 border-none cursor-pointer"
              style={{ background: 'var(--float-primary)' }}>
              {createPlanMut.isPending ? 'Creating...' : 'Create treatment plan'}
            </button>
          </div>
        )}

        {/* Zone 4 — Secondary sections */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Session notes */}
          <CollapsibleSection title="Session notes" count={sessionNotes?.length} isOpen={openSection === 'notes'} onToggle={() => setOpenSection(openSection === 'notes' ? null : 'notes')}>
            {showNoteForm ? (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <select value={noteType} onChange={e => setNoteType(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-200 rounded bg-white">
                    {Object.entries(sessionTypeLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <input type="date" value={noteDate} onChange={e => setNoteDate(e.target.value)} className="px-2 py-1.5 text-sm border border-slate-200 rounded" />
                </div>
                <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} rows={4} placeholder="Session notes..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg resize-y" />
                <div className="flex gap-2">
                  <button onClick={() => editingNote ? updateNoteMut.mutate() : createNoteMut.mutate()} disabled={!noteContent.trim()}
                    className="bg-teal-600 text-white px-3 py-1.5 rounded text-xs font-medium disabled:opacity-40 border-none cursor-pointer">
                    {editingNote ? 'Update' : 'Save'}
                  </button>
                  <button onClick={resetNoteForm} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                </div>
              </div>
            ) : sessionNotes && sessionNotes.length > 0 ? (
              <div className="space-y-2">
                <button onClick={() => { resetNoteForm(); setShowNoteForm(true) }} className="text-xs text-teal-600 font-medium hover:underline bg-transparent border-none cursor-pointer mb-2">+ Add note</button>
                {sessionNotes.map(n => (
                  <div key={n.id} className="py-2 px-3 bg-slate-50 rounded-lg text-sm">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${sessionTypeBadgeColors[n.session_type] || 'bg-slate-100 text-slate-600'}`}>{sessionTypeLabels[n.session_type] || n.session_type}</span>
                        <span className="text-xs text-slate-400">{new Date(n.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>
                      <div className="flex gap-1.5">
                        <button onClick={() => { setEditingNote(n); setNoteType(n.session_type); setNoteDate(n.session_date); setNoteContent(n.content); setShowNoteForm(true) }} className="text-xs text-teal-600 bg-transparent border-none cursor-pointer">Edit</button>
                        <button onClick={() => { if (confirm('Delete?')) deleteNoteMut.mutate(n.id) }} className="text-xs text-red-400 bg-transparent border-none cursor-pointer">Del</button>
                      </div>
                    </div>
                    <p className="text-slate-700 whitespace-pre-wrap cursor-pointer" onClick={() => setExpandedNoteId(expandedNoteId === n.id ? null : n.id)}>
                      {expandedNoteId === n.id ? n.content : n.content.length > 80 ? n.content.slice(0, 80) + '...' : n.content}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No notes yet &middot; <button onClick={() => { resetNoteForm(); setShowNoteForm(true) }} className="text-teal-600 hover:underline bg-transparent border-none cursor-pointer text-sm font-medium">+ Add note</button></p>
            )}
          </CollapsibleSection>

          {/* Action plans */}
          <CollapsibleSection title="Action plans" count={actionPlans?.length} isOpen={openSection === 'plans'} onToggle={() => setOpenSection(openSection === 'plans' ? null : 'plans')}>
            {actionPlans && actionPlans.length > 0 ? (
              <div className="space-y-2">
                {actionPlans.map(ap => (
                  <div key={ap.id} className="py-2 px-3 bg-slate-50 rounded-lg text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">#{ap.session_number}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ap.visible_to_patient ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{ap.visible_to_patient ? 'Published' : 'Draft'}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400">No plans yet &middot; <button onClick={() => { resetPlanEditor(); editor?.commands.setContent(ACTION_PLAN_TEMPLATE); setShowPlanEditor(true); setOpenSection('plans') }} className="text-teal-600 hover:underline bg-transparent border-none cursor-pointer text-sm font-medium">+ New plan</button></p>
            )}
          </CollapsibleSection>

          {/* Messages */}
          <CollapsibleSection title="Messages" count={0} isOpen={openSection === 'messages'} onToggle={() => setOpenSection(openSection === 'messages' ? null : 'messages')}>
            {patient && <MessagesPanel patientId={patientId!} patientUserId={patient.user_id} />}
          </CollapsibleSection>

          {/* Monitoring */}
          <CollapsibleSection title="Monitoring" count={monitoringForm?.entries_count} isOpen={openSection === 'monitoring'} onToggle={() => setOpenSection(openSection === 'monitoring' ? null : 'monitoring')}>
            {monitoringForm ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${monitoringForm.status === 'submitted' ? 'bg-green-100 text-green-700' : 'bg-teal-100 text-teal-700'}`}>{monitoringForm.status === 'in_progress' ? 'in progress' : monitoringForm.status}</span>
                  <span className="text-xs text-slate-400">{monitoringForm.entries_count ?? 0} entries</span>
                </div>
                {(monitoringForm.entries_count ?? 0) > 0 && (
                  <button onClick={() => navigate(`/patients/${patientId}/monitoring-report`)} className="text-xs text-teal-600 font-medium hover:underline bg-transparent border-none cursor-pointer">View report</button>
                )}
              </div>
            ) : (
              <div>
                <p className="text-sm text-slate-400 mb-2">Send a monitoring form to the parent</p>
                <button onClick={() => { setShowSendForm(true); if (patient?.phone_number) setParentPhone(patient.phone_number) }}
                  className="bg-teal-600 text-white px-3 py-1.5 rounded text-xs font-medium border-none cursor-pointer">Send form</button>
                {showSendForm && (
                  <div className="mt-2 space-y-2">
                    <input value={parentEmail} onChange={e => setParentEmail(e.target.value)} placeholder="Parent email" className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" />
                    <input value={parentPhone} onChange={e => setParentPhone(e.target.value)} placeholder="Parent phone" className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" />
                    <div className="flex gap-1.5">
                      <button onClick={() => sendFormMut.mutate({ parent_email: parentEmail || undefined, parent_phone: parentPhone || undefined, parent_name: parentName || undefined })}
                        className="bg-teal-600 text-white px-2.5 py-1.5 rounded text-xs font-medium border-none cursor-pointer">Send</button>
                      <button onClick={() => sendFormMut.mutate({})} className="text-xs text-slate-500 border border-slate-200 px-2.5 py-1.5 rounded cursor-pointer bg-white">Copy link</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CollapsibleSection>
        </div>
      </main>
    </div>
  )
}
