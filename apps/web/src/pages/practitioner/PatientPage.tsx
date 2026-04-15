import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPatient, getMessages, sendMessage } from '../../api/patients'
import {
  getTreatmentPlan, getTriggers, createTreatmentPlan, createTrigger,
  updatePlanStatus, updatePlanNickname, getBehaviors, getLadder, getLadderFlags, reviewLadder,
  createBehavior, updateBehavior, deleteBehavior, updateTrigger, deleteTrigger,
  getSituationDownwardArrow, createSituationDownwardArrow, updateDownwardArrow,
  type TriggerSituation, type AvoidanceBehavior, type DownwardArrow, type ArrowStep
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
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('avoidance')
  const [dt, setDt] = useState('')
  const [reviewMsg, setReviewMsg] = useState<string | null>(null)
  const [editingBehaviorId, setEditingBehaviorId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState('avoidance')
  const [editDT, setEditDT] = useState('')
  const [deletingBehaviorId, setDeletingBehaviorId] = useState<string | null>(null)

  const { data: behaviors } = useQuery({
    queryKey: ['behaviors', trigger.id],
    queryFn: () => getBehaviors(trigger.id),
  })

  const { data: ladder } = useQuery({
    queryKey: ['ladder', trigger.id],
    queryFn: () => getLadder(trigger.id),
    enabled: !!trigger.id
  })

  const { data: ladderFlags } = useQuery({
    queryKey: ['ladder-flags', ladder?.id],
    queryFn: async () => {
      if (!ladder?.id) return []
      const flags = await getLadderFlags(ladder.id)
      return flags.filter((f: any) => f.status === 'open')
    },
    enabled: !!ladder?.id
  })

  const addMut = useMutation({
    mutationFn: () => createBehavior(trigger.id, { name, behavior_type: type, distress_thermometer_when_refraining: dt ? Number(dt) : undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] }); setName(''); setDt(''); setShowAdd(false) }
  })

  const editMut = useMutation({
    mutationFn: () => updateBehavior(trigger.id, editingBehaviorId!, { name: editName, behavior_type: editType, distress_thermometer_when_refraining: editDT ? Number(editDT) : undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] }); setEditingBehaviorId(null) }
  })

  const delMut = useMutation({
    mutationFn: (id: string) => deleteBehavior(trigger.id, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] }); setDeletingBehaviorId(null) }
  })

  const startEdit = (b: AvoidanceBehavior) => {
    setEditingBehaviorId(b.id)
    setEditName(b.name)
    setEditType(b.behavior_type)
    setEditDT(b.distress_thermometer_when_refraining != null ? String(b.distress_thermometer_when_refraining) : '')
  }

  const reviewMut = useMutation({
    mutationFn: () => reviewLadder(ladder!.id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['ladder-flags', ladder?.id] })
      const flagCount = Array.isArray(data) ? data.filter((f: any) => f.status === 'open').length : 0
      setReviewMsg(`Review complete — ${flagCount} flag${flagCount === 1 ? '' : 's'} found`)
      setTimeout(() => setReviewMsg(null), 3000)
    }
  })

  const toggleActive = useMutation({
    mutationFn: () => updateTrigger(planId, trigger.id, { is_active: !trigger.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['triggers'] })
  })

  // Sort behaviors by DT ascending (lowest first), nulls at end
  const sortedBehaviors = behaviors ? [...behaviors].sort((a, b) => {
    const aDT = a.distress_thermometer_when_refraining
    const bDT = b.distress_thermometer_when_refraining
    if (aDT == null && bDT == null) return 0
    if (aDT == null) return 1
    if (bDT == null) return -1
    return Number(aDT) - Number(bDT)
  }) : []

  const openFlags = ladderFlags ?? []

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

      {/* Section header with AI review */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '10px', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avoidance &amp; safety behaviors</span>
          {!showAdd && (
            <button onClick={() => setShowAdd(true)} className="text-[10px] text-teal-600 font-medium bg-transparent border-none cursor-pointer">+ Add</button>
          )}
        </div>
        {behaviors && behaviors.length > 0 && ladder && (
          <button onClick={() => reviewMut.mutate()} disabled={reviewMut.isPending}
            className="text-[10px] font-medium bg-transparent border-none cursor-pointer disabled:opacity-50"
            style={{ color: 'var(--float-primary)' }}>
            {reviewMut.isPending ? 'Reviewing...' : 'Run AI review'}
          </button>
        )}
      </div>

      {/* Review confirmation */}
      {reviewMsg && (
        <p style={{ fontSize: '11px', color: 'var(--float-primary)', margin: '0 0 8px' }}>{reviewMsg}</p>
      )}

      {/* Flags */}
      {openFlags.length > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' }}>
          <p style={{ fontSize: '11px', fontWeight: '600', color: '#92400e', margin: '0 0 6px' }}>
            &#9888; {openFlags.length} item{openFlags.length === 1 ? '' : 's'} need{openFlags.length === 1 ? 's' : ''} attention
          </p>
          {openFlags.map((f: any) => (
            <p key={f.id} style={{ fontSize: '12px', color: '#78350f', lineHeight: '1.4', margin: '0 0 4px' }}>
              {f.description || f.flag_type.replace(/_/g, ' ')}
            </p>
          ))}
        </div>
      )}

      {/* Behaviors — sorted by DT ascending */}
      <div className="space-y-1.5 mb-3">
        {sortedBehaviors.map(b => (
          <div key={b.id}>
            {editingBehaviorId === b.id ? (
              /* Edit mode */
              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '8px 10px' }}>
                <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" style={{ marginBottom: '6px' }}
                  onKeyDown={e => e.key === 'Enter' && editName.trim() && editMut.mutate()} />
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <select value={editType} onChange={e => setEditType(e.target.value)} className="px-2 py-1 text-xs border border-slate-200 rounded bg-white">
                    <option value="avoidance">Avoidance</option><option value="safety">Safety</option><option value="ritual">Ritual</option>
                  </select>
                  <input value={editDT} onChange={e => setEditDT(e.target.value)} placeholder="DT" type="number" min="0" max="10" className="text-xs border border-slate-200 rounded" style={{ width: '44px', padding: '4px 6px' }} />
                  <button onClick={() => editMut.mutate()} disabled={!editName.trim() || editMut.isPending} className="bg-teal-600 text-white rounded text-[11px] font-medium disabled:opacity-40 border-none cursor-pointer" style={{ padding: '4px 10px' }}>Save</button>
                  <button onClick={() => setEditingBehaviorId(null)} className="text-[11px] text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                </div>
              </div>
            ) : deletingBehaviorId === b.id ? (
              /* Delete confirmation */
              <div style={{ background: '#fef2f2', borderRadius: '8px', padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: '#991b1b' }}>Delete this behavior?</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => delMut.mutate(b.id)} disabled={delMut.isPending} className="text-[11px] text-red-600 font-medium bg-transparent border-none cursor-pointer disabled:opacity-50">Yes, delete</button>
                  <button onClick={() => setDeletingBehaviorId(null)} className="text-[11px] text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                </div>
              </div>
            ) : (
              /* Normal row */
              <div className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg group">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className={`text-[10px] px-1 py-0.5 rounded font-bold uppercase ${b.behavior_type === 'safety' ? 'bg-amber-50 text-amber-600' : b.behavior_type === 'ritual' ? 'bg-purple-50 text-purple-600' : 'bg-slate-100 text-slate-500'}`}>
                    {b.behavior_type.slice(0, 3)}
                  </span>
                  <span className="text-sm text-slate-700 truncate">{b.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <DTBadge value={b.distress_thermometer_when_refraining} />
                  <button onClick={() => startEdit(b)} className="text-[10px] text-slate-400 hover:text-teal-600 bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">Edit</button>
                  <button onClick={() => setDeletingBehaviorId(b.id)} className="text-[10px] text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">Del</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Add behavior inline */}
      {showAdd && (
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
      )}

      {/* Empty state */}
      {(!behaviors || behaviors.length === 0) && !showAdd && (
        <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.4', margin: '4px 0 0' }}>
          Add avoidance and safety behaviors for this situation. Rate each with the DT for refraining.
        </p>
      )}
    </div>
  )
}

// ── DA Status Badge ──
function DABadge({ status, onClick }: { status: 'none' | 'in_progress' | 'approved'; onClick?: (e: React.MouseEvent) => void }) {
  const colors = {
    none: { bg: '#f1f5f9', text: '#94a3b8', border: '#e2e8f0' },
    in_progress: { bg: '#fffbeb', text: '#b45309', border: '#fde68a' },
    approved: { bg: '#f0fdfa', text: 'var(--float-primary)', border: '#99f6e4' }
  }
  const c = colors[status]
  return (
    <button onClick={onClick} style={{
      fontSize: '9px', fontWeight: '700', padding: '2px 5px', borderRadius: '4px',
      background: c.bg, color: c.text, border: `1px solid ${c.border}`, cursor: onClick ? 'pointer' : 'default'
    }}>DA</button>
  )
}

// ── Downward Arrow Panel ──
function DownwardArrowPanel({ trigger, onBack }: { trigger: TriggerSituation; onBack: () => void }) {
  const qc = useQueryClient()
  const [firstAnswer, setFirstAnswer] = useState('')
  const [nextAnswer, setNextAnswer] = useState('')

  const { data: arrow } = useQuery({
    queryKey: ['downward-arrow', trigger.id],
    queryFn: () => getSituationDownwardArrow(trigger.id),
    enabled: !!trigger.id
  })

  const createMut = useMutation({
    mutationFn: () => createSituationDownwardArrow(trigger.id, firstAnswer),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['downward-arrow', trigger.id] }); qc.invalidateQueries({ queryKey: ['da-statuses'] }); setFirstAnswer('') }
  })

  const addStepMut = useMutation({
    mutationFn: (newSteps: ArrowStep[]) => updateDownwardArrow(arrow!.id, { arrow_steps: newSteps }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['downward-arrow', trigger.id] }); setNextAnswer('') }
  })

  const setFearedOutcomeMut = useMutation({
    mutationFn: (fo: string) => updateDownwardArrow(arrow!.id, { feared_outcome: fo }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['downward-arrow', trigger.id] }); qc.invalidateQueries({ queryKey: ['da-statuses'] }); setNextAnswer('') }
  })

  const approveMut = useMutation({
    mutationFn: () => updateDownwardArrow(arrow!.id, { is_approved: true }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['downward-arrow', trigger.id] }); qc.invalidateQueries({ queryKey: ['da-statuses'] }) }
  })

  const steps: ArrowStep[] = arrow?.arrow_steps ?? []
  const lastAnswer = steps.length > 0 ? steps[steps.length - 1].response : ''
  const nextQuestion = lastAnswer ? `What will happen if... ${lastAnswer}?` : 'What will happen in this situation?'
  const hasFearedOutcome = !!arrow?.feared_outcome
  const isApproved = !!arrow?.feared_outcome_approved

  const handleAddStep = () => {
    if (!nextAnswer.trim()) return
    const newSteps = [...steps, { question: nextQuestion, response: nextAnswer.trim() }]
    addStepMut.mutate(newSteps)
  }

  const handleMarkFearedOutcome = () => {
    if (!nextAnswer.trim()) return
    setFearedOutcomeMut.mutate(nextAnswer.trim())
  }

  return (
    <div className="p-4 h-full overflow-y-auto">
      {/* Header */}
      <div style={{ marginBottom: '16px' }}>
        <button onClick={onBack} className="text-xs bg-transparent border-none cursor-pointer" style={{ color: 'var(--float-text-hint)', marginBottom: '8px' }}>
          &larr; Back to behaviors
        </button>
        <h3 style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', margin: '0 0 2px' }}>Downward Arrow</h3>
        <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Situation: {trigger.name}</p>
      </div>

      {/* No DA yet */}
      {!arrow && (
        <div>
          <p style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.5', marginBottom: '12px' }}>
            The Downward Arrow helps identify the child's core feared outcome for this situation.
          </p>
          <p style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', marginBottom: '6px' }}>
            Start with: "What will happen in this situation?"
          </p>
          <textarea value={firstAnswer} onChange={e => setFirstAnswer(e.target.value)} rows={2}
            placeholder="The child's answer..."
            className="text-sm border border-slate-200 rounded"
            style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginBottom: '8px' }} />
          <button onClick={() => createMut.mutate()} disabled={!firstAnswer.trim() || createMut.isPending}
            className="bg-teal-600 text-white rounded text-xs font-medium border-none cursor-pointer disabled:opacity-40"
            style={{ padding: '7px 14px' }}>
            {createMut.isPending ? 'Starting...' : 'Start \u2192'}
          </button>
        </div>
      )}

      {/* DA exists — show chain */}
      {arrow && (
        <div>
          {/* Show all existing steps */}
          {steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <span style={{ fontSize: '18px', color: 'var(--float-primary)', lineHeight: '1.2', flexShrink: 0 }}>↓</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '12px', fontWeight: '600', color: '#334155', margin: '0 0 4px' }}>{step.question}</p>
                <p style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic', margin: 0 }}>&ldquo;{step.response}&rdquo;</p>
              </div>
            </div>
          ))}

          {/* If no feared outcome yet — show next question input */}
          {!hasFearedOutcome && (
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <span style={{ fontSize: '18px', color: 'var(--float-primary)', lineHeight: '1.2', flexShrink: 0 }}>↓</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '12px', fontWeight: '600', color: '#334155', margin: '0 0 4px' }}>{nextQuestion}</p>
                <textarea value={nextAnswer} onChange={e => setNextAnswer(e.target.value)} rows={2}
                  placeholder="The child's answer..."
                  className="text-sm border border-slate-200 rounded"
                  style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginBottom: '8px' }} />
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button onClick={handleAddStep} disabled={!nextAnswer.trim() || addStepMut.isPending}
                    className="bg-teal-600 text-white rounded text-xs font-medium border-none cursor-pointer disabled:opacity-40"
                    style={{ padding: '6px 12px' }}>
                    Next ↓
                  </button>
                  <button onClick={handleMarkFearedOutcome} disabled={!nextAnswer.trim() || setFearedOutcomeMut.isPending}
                    className="text-xs font-medium border cursor-pointer disabled:opacity-40 bg-white"
                    style={{ padding: '6px 12px', borderRadius: '6px', borderColor: 'var(--float-primary)', color: 'var(--float-primary)' }}>
                    This is the feared outcome
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Feared outcome + approval */}
          {hasFearedOutcome && (
            <div style={{ marginTop: '8px', padding: '12px 14px', background: '#f0fdfa', borderLeft: '3px solid var(--float-primary)', borderRadius: '6px' }}>
              <p style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--float-primary)', margin: '0 0 6px' }}>
                Feared outcome
              </p>
              <p style={{ fontSize: '14px', fontStyle: 'italic', color: '#134e4a', margin: '0 0 10px' }}>
                &ldquo;{arrow.feared_outcome}&rdquo;
              </p>
              {isApproved ? (
                <p style={{ fontSize: '12px', color: '#16a34a', fontWeight: '600', margin: '0 0 8px' }}>
                  &#10003; Approved
                </p>
              ) : (
                <button onClick={() => approveMut.mutate()} disabled={approveMut.isPending}
                  className="bg-teal-600 text-white rounded text-xs font-medium border-none cursor-pointer disabled:opacity-40"
                  style={{ padding: '6px 12px', marginBottom: '8px' }}>
                  {approveMut.isPending ? 'Approving...' : 'Approve this feared outcome'}
                </button>
              )}
              <p style={{ fontSize: '11px', color: '#64748b', margin: 0, lineHeight: '1.4' }}>
                This feared outcome will be used as the prediction in all experiments for this situation.
              </p>
            </div>
          )}
        </div>
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
  const [rightPanelView, setRightPanelView] = useState<'behaviors' | 'da'>('behaviors')
  const [showTriggerAdd, setShowTriggerAdd] = useState(false)
  const [newTriggerName, setNewTriggerName] = useState('')
  const [newTriggerDT, setNewTriggerDT] = useState('')
  const [editingNickname, setEditingNickname] = useState(false)
  const [nicknameVal, setNicknameVal] = useState('')
  const [showSendForm, setShowSendForm] = useState(false)
  const [parentEmail, setParentEmail] = useState('')
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [copied, setCopied] = useState(false)
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null)
  const [smsSentTo, setSmsSentTo] = useState<string | null>(null)
  const [showEntries, setShowEntries] = useState(false)
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

  // Fetch DA status for every trigger situation (one query per trigger, keyed by trigger id)
  const triggerIds = (triggers ?? []).map(t => t.id)
  const { data: daStatuses } = useQuery({
    queryKey: ['da-statuses', patientId, triggerIds.join(',')],
    queryFn: async () => {
      const results = await Promise.all(triggerIds.map(async (id) => {
        const da = await getSituationDownwardArrow(id)
        return [id, da] as const
      }))
      return Object.fromEntries(results) as Record<string, DownwardArrow | null>
    },
    enabled: triggerIds.length > 0
  })

  const getDAStatus = (triggerId: string): 'none' | 'in_progress' | 'approved' => {
    const da = daStatuses?.[triggerId]
    if (!da) return 'none'
    if (da.feared_outcome_approved) return 'approved'
    return 'in_progress'
  }

  useEffect(() => { if (triggers?.length && !selectedTriggerId) setSelectedTriggerId(triggers[0].id) }, [triggers])
  useEffect(() => { setRightPanelView('behaviors') }, [selectedTriggerId])
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
  const nicknameMut = useMutation({
    mutationFn: () => updatePlanNickname(patientId!, plan!.id, nicknameVal.trim()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['plan', patientId] }); setEditingNickname(false) }
  })
  const addTriggerMut = useMutation({
    mutationFn: () => createTrigger(plan!.id, { name: newTriggerName, distress_thermometer_rating: newTriggerDT ? Number(newTriggerDT) : undefined }),
    onSuccess: (t) => { queryClient.invalidateQueries({ queryKey: ['triggers', plan?.id] }); setNewTriggerName(''); setNewTriggerDT(''); setShowTriggerAdd(false); setSelectedTriggerId(t.id) }
  })

  const sendFormMutation = useMutation({
    mutationFn: (params: { parent_email?: string; parent_name?: string; parent_phone?: string } = {}) =>
      sendMonitoringForm(patientId!, params),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['monitoring-form', patientId] })
      if (data.full_link) {
        try { navigator.clipboard.writeText(data.full_link) } catch { const el = document.createElement('textarea'); el.value = data.full_link; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el) }
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
      if (data.email_sent && parentEmail) setEmailSentTo(parentEmail)
      if (data.sms_sent && parentPhone) setSmsSentTo(parentPhone)
      setShowSendForm(false)
      setParentEmail('')
      setParentName('')
      setParentPhone('')
    }
  })

  const handleCopyLink = async () => {
    if (monitoringForm?.access_token) {
      const url = `${window.location.origin}/monitor/${monitoringForm.access_token}`
      try { await navigator.clipboard.writeText(url) } catch { const el = document.createElement('textarea'); el.value = url; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el) }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleSendAll = () => {
    sendFormMutation.mutate({
      parent_email: parentEmail || undefined,
      parent_name: parentName || undefined,
      parent_phone: parentPhone || undefined
    })
  }

  const handleSendLinkOnly = () => {
    sendFormMutation.mutate({})
  }

  const daysSinceSent = monitoringForm?.sent_at
    ? Math.floor((Date.now() - new Date(monitoringForm.sent_at).getTime()) / (1000 * 60 * 60 * 24))
    : null
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

  // Fetch behaviors for every trigger (for activation validation)
  const { data: allBehaviors } = useQuery({
    queryKey: ['all-behaviors', patientId, triggerIds.join(',')],
    queryFn: async () => {
      const results = await Promise.all(triggerIds.map(async (id) => {
        const bs = await getBehaviors(id)
        return [id, bs] as const
      }))
      return Object.fromEntries(results) as Record<string, AvoidanceBehavior[]>
    },
    enabled: triggerIds.length > 0
  })

  // Activation validation
  const triggersWithMissingDT: TriggerSituation[] = []
  const activeTriggersMissingDA: TriggerSituation[] = []
  if (triggers && allBehaviors) {
    for (const t of triggers) {
      const bs = allBehaviors[t.id] || []
      if (bs.some(b => b.distress_thermometer_when_refraining == null)) {
        triggersWithMissingDT.push(t)
      }
    }
  }
  if (triggers && daStatuses) {
    for (const t of triggers) {
      if (t.is_active && !daStatuses[t.id]?.feared_outcome_approved) {
        activeTriggersMissingDA.push(t)
      }
    }
  }
  const hasActivationBlocker = triggersWithMissingDT.length > 0
  const hasActivationWarning = activeTriggersMissingDA.length > 0
  const canActivate = plan?.status === 'setup' && triggers && triggers.length > 0 && !hasActivationBlocker
  const lastMsg = messages?.[0]
  const sessionTypeLabels: Record<string, string> = { consultation_1: 'Consult 1', consultation_2: 'Consult 2', consultation_3: 'Consult 3', weekly_session: 'Session', other: 'Other' }
  const badgeColors: Record<string, string> = { consultation_1: 'bg-purple-100 text-purple-700', consultation_2: 'bg-purple-100 text-purple-700', consultation_3: 'bg-purple-100 text-purple-700', weekly_session: 'bg-teal-100 text-teal-700', other: 'bg-slate-100 text-slate-600' }

  const cardStyle = { background: '#fff', borderRadius: '10px', border: '1px solid var(--float-border)', padding: '20px', width: '100%', boxSizing: 'border-box' as const }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--float-bg)' }}>
      <PractitionerNav activePage="patients" subHeader={{
        backTo: '/dashboard', backLabel: 'Back to patients',
        title: patient?.name ?? 'Loading...',
        subtitle: [
          patient?.age ? `Age ${patient.age}` : null,
          patient?.gender || null,
          patient?.phone_number || null,
          activitySummary
        ].filter(Boolean).join(' \u00B7 '),
        rightAction: <button onClick={() => navigate(`/patients/${patientId}/progress`)} className="text-xs font-medium bg-transparent border-none cursor-pointer" style={{ color: 'var(--float-primary)' }}>View progress &rarr;</button>
      }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: '12px', padding: '24px', alignItems: 'start' }}>

        {/* ── LEFT COLUMN ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

          {/* Monitoring card */}
          <div style={cardStyle}>
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--float-text)', margin: '0 0 12px' }}>Parent monitoring form</h2>

            {!monitoringForm ? (
              <div>
                <p style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.5', margin: '0 0 12px' }}>
                  Send a monitoring form to the parent. They'll observe their child's anxiety for about a week before your first appointment.
                </p>

                {(emailSentTo || smsSentTo) && (
                  <div style={{ marginBottom: '12px' }}>
                    {emailSentTo && (
                      <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg" style={{ marginBottom: '4px' }}>
                        <span>&#10003;</span> Email sent to {emailSentTo}
                      </div>
                    )}
                    {smsSentTo && (
                      <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                        <span>&#10003;</span> SMS sent to {smsSentTo}
                      </div>
                    )}
                  </div>
                )}

                {!showSendForm ? (
                  <button
                    onClick={() => { setShowSendForm(true); if (patient?.phone_number) setParentPhone(patient.phone_number) }}
                    className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors border-none cursor-pointer"
                  >
                    Send monitoring form
                  </button>
                ) : (
                  <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '14px' }}>
                    <div style={{ marginBottom: '10px' }}>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Parent email (optional)</label>
                      <input type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} placeholder="parent@email.com"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Parent name (optional)</label>
                      <input type="text" value={parentName} onChange={e => setParentName(e.target.value)} placeholder="e.g. Sarah"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Parent phone for SMS (optional)</label>
                      <input type="tel" value={parentPhone} onChange={e => setParentPhone(e.target.value)} placeholder="+1 (555) 123-4567"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(parentEmail || parentPhone) && (
                        <button onClick={handleSendAll} disabled={sendFormMutation.isPending}
                          className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 border-none cursor-pointer">
                          {sendFormMutation.isPending ? 'Sending...' :
                            parentEmail && parentPhone ? 'Send both + copy link' :
                            parentEmail ? 'Send email + copy link' : 'Send SMS + copy link'}
                        </button>
                      )}
                      <button onClick={handleSendLinkOnly} disabled={sendFormMutation.isPending}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer ${
                          (parentEmail || parentPhone) ? 'text-slate-600 hover:bg-slate-100 bg-white' : 'bg-teal-600 text-white hover:bg-teal-700'
                        }`} style={(parentEmail || parentPhone) ? { border: '1px solid #e2e8f0' } : { border: 'none' }}>
                        {sendFormMutation.isPending ? 'Creating...' : 'Just copy link'}
                      </button>
                      <button onClick={() => setShowSendForm(false)} className="px-3 py-2 text-sm text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer">Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div>
                {/* Status row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      monitoringForm.status === 'submitted' ? 'bg-green-100 text-green-700' :
                      monitoringForm.status === 'in_progress' ? 'bg-teal-100 text-teal-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {monitoringForm.status === 'in_progress' ? 'in progress' : monitoringForm.status}
                    </span>
                    {monitoringForm.entries_count != null && (
                      <span className="text-sm text-slate-500">{monitoringForm.entries_count} {monitoringForm.entries_count === 1 ? 'entry' : 'entries'}</span>
                    )}
                    {daysSinceSent != null && (
                      <span className="text-sm text-slate-400">{daysSinceSent === 0 ? 'Sent today' : `Sent ${daysSinceSent}d ago`}</span>
                    )}
                  </div>
                  <button onClick={handleCopyLink} className="text-xs text-teal-600 font-medium hover:underline bg-transparent border-none cursor-pointer">
                    {copied ? 'Copied!' : 'Copy link'}
                  </button>
                </div>

                {/* Entries list */}
                {(monitoringForm.entries_count ?? 0) > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <button onClick={() => setShowEntries(!showEntries)} className="text-sm text-teal-600 font-medium hover:underline bg-transparent border-none cursor-pointer">
                      {showEntries ? 'Hide entries' : 'View entries'}
                    </button>
                    {showEntries && monitoringForm.entries && (
                      <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {monitoringForm.entries.map((entry: any) => (
                          <div key={entry.id} style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                              <span className="text-xs font-medium text-slate-400">
                                {new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                              </span>
                              {entry.fear_thermometer != null && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${entry.fear_thermometer >= 7 ? 'bg-red-100 text-red-700' : entry.fear_thermometer >= 4 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                                  FT {entry.fear_thermometer}
                                </span>
                              )}
                            </div>
                            {entry.situation && <p className="text-sm text-slate-700" style={{ margin: 0 }}>{entry.situation}</p>}
                            {entry.child_behavior_observed && <p className="text-xs text-slate-500" style={{ margin: '2px 0 0' }}><span className="font-medium">Observed:</span> {entry.child_behavior_observed}</p>}
                            {entry.parent_response && <p className="text-xs text-slate-500" style={{ margin: '2px 0 0' }}><span className="font-medium">Response:</span> {entry.parent_response}</p>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Report button */}
                {(monitoringForm.entries_count ?? 0) > 0 && (
                  <div style={{ marginBottom: '12px' }}>
                    <button onClick={() => navigate(`/patients/${patientId}/monitoring-report`)}
                      className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                        (monitoringForm.entries_count ?? 0) >= 5
                          ? 'bg-teal-600 text-white hover:bg-teal-700 border-none'
                          : 'text-slate-600 hover:bg-slate-50 bg-white'
                      }`} style={(monitoringForm.entries_count ?? 0) < 5 ? { border: '1px solid #e2e8f0' } : undefined}>
                      View monitoring report
                    </button>
                  </div>
                )}

                {/* Resend form — always available */}
                <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
                  {!showSendForm ? (
                    <button onClick={() => { setShowSendForm(true); if (patient?.phone_number) setParentPhone(patient.phone_number) }}
                      className="text-xs text-teal-600 font-medium hover:underline bg-transparent border-none cursor-pointer">
                      Resend to different contact
                    </button>
                  ) : (
                    <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '14px' }}>
                      <div style={{ marginBottom: '10px' }}>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Parent email (optional)</label>
                        <input type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} placeholder="parent@email.com"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
                      </div>
                      <div style={{ marginBottom: '10px' }}>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Parent name (optional)</label>
                        <input type="text" value={parentName} onChange={e => setParentName(e.target.value)} placeholder="e.g. Sarah"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
                      </div>
                      <div style={{ marginBottom: '12px' }}>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Parent phone for SMS (optional)</label>
                        <input type="tel" value={parentPhone} onChange={e => setParentPhone(e.target.value)} placeholder="+1 (555) 123-4567"
                          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(parentEmail || parentPhone) && (
                          <button onClick={handleSendAll} disabled={sendFormMutation.isPending}
                            className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 border-none cursor-pointer">
                            {sendFormMutation.isPending ? 'Sending...' :
                              parentEmail && parentPhone ? 'Send both + copy link' :
                              parentEmail ? 'Send email + copy link' : 'Send SMS + copy link'}
                          </button>
                        )}
                        <button onClick={handleSendLinkOnly} disabled={sendFormMutation.isPending}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer ${
                            (parentEmail || parentPhone) ? 'text-slate-600 hover:bg-slate-100 bg-white' : 'bg-teal-600 text-white hover:bg-teal-700'
                          }`} style={(parentEmail || parentPhone) ? { border: '1px solid #e2e8f0' } : { border: 'none' }}>
                          {sendFormMutation.isPending ? 'Creating...' : 'Just copy link'}
                        </button>
                        <button onClick={() => setShowSendForm(false)} className="px-3 py-2 text-sm text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Treatment plan card */}
          {plan ? (
            <div style={{ ...cardStyle, padding: '0', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--float-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="text-sm font-semibold text-slate-700">Treatment plan</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${plan.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{plan.status}</span>
                  <span style={{ fontSize: '12px', color: '#cbd5e1' }}>&middot;</span>
                  {editingNickname ? (
                    <>
                      <input value={nicknameVal} onChange={e => setNicknameVal(e.target.value)} placeholder="Nickname"
                        className="text-xs border border-slate-200 rounded" autoFocus
                        style={{ padding: '3px 8px', width: '140px' }}
                        onKeyDown={e => { if (e.key === 'Enter' && nicknameVal.trim()) nicknameMut.mutate(); if (e.key === 'Escape') setEditingNickname(false) }} />
                      <button onClick={() => nicknameMut.mutate()} disabled={!nicknameVal.trim() || nicknameMut.isPending} className="text-[11px] text-teal-600 font-medium bg-transparent border-none cursor-pointer disabled:opacity-40">Save</button>
                      <button onClick={() => setEditingNickname(false)} className="text-[11px] text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                    </>
                  ) : plan.nickname ? (
                    <>
                      <span style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--float-primary)' }}>
                        &ldquo;{plan.nickname}&rdquo;
                      </span>
                      <button onClick={() => { setNicknameVal(plan.nickname || ''); setEditingNickname(true) }}
                        className="text-[11px] text-slate-400 hover:text-teal-600 bg-transparent border-none cursor-pointer">edit</button>
                    </>
                  ) : (
                    <button onClick={() => { setNicknameVal(''); setEditingNickname(true) }}
                      className="text-[11px] text-teal-600 font-medium bg-transparent border-none cursor-pointer">+ Add nickname</button>
                  )}
                </div>
                {plan.status === 'setup' && triggers && triggers.length > 0 && (
                  <button
                    onClick={() => activatePlanMut.mutate()}
                    disabled={activatePlanMut.isPending || hasActivationBlocker}
                    className="text-xs px-2.5 py-1 bg-teal-600 text-white rounded-full disabled:opacity-50 border-none cursor-pointer"
                  >
                    {activatePlanMut.isPending ? '...' : hasActivationWarning ? 'Activate anyway' : 'Activate plan'}
                  </button>
                )}
              </div>

              {/* Activation blocker — hard stop */}
              {plan.status === 'setup' && hasActivationBlocker && (
                <div style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca', padding: '12px 20px' }}>
                  <p style={{ fontSize: '12px', fontWeight: '600', color: '#991b1b', margin: '0 0 4px' }}>
                    &#9888; Cannot activate — behaviors missing distress ratings
                  </p>
                  <p style={{ fontSize: '12px', color: '#7f1d1d', margin: 0, lineHeight: '1.4' }}>
                    Every behavior needs a DT before the plan can be activated. Missing in: {triggersWithMissingDT.map(t => t.name).join(', ')}
                  </p>
                </div>
              )}

              {/* Activation warning — DA recommended */}
              {plan.status === 'setup' && !hasActivationBlocker && hasActivationWarning && (
                <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '12px 20px' }}>
                  <p style={{ fontSize: '12px', color: '#78350f', margin: 0, lineHeight: '1.4' }}>
                    &#9888; The Downward Arrow has not been completed for: {activeTriggersMissingDA.map(t => t.name).join(', ')}. This is recommended before activation.
                  </p>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '200px minmax(0,1fr)', borderTop: '1px solid var(--float-border)', marginTop: '0', minHeight: '320px' }}>
                {/* Situations list */}
                <div style={{ borderRight: '1px solid var(--float-border)', display: 'flex', flexDirection: 'column', padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Situations</span>
                    {!showTriggerAdd && <button onClick={() => setShowTriggerAdd(true)} className="text-[10px] text-teal-600 font-bold bg-transparent border-none cursor-pointer">+</button>}
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto' }}>
                    {triggers?.map(t => (
                      <div key={t.id} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', background: t.id === selectedTriggerId ? '#f0fdfa' : 'transparent', borderLeft: t.id === selectedTriggerId ? '2px solid var(--float-primary)' : '2px solid transparent', borderRadius: '6px', marginBottom: '8px' }}
                        onClick={() => setSelectedTriggerId(t.id)}>
                        <span style={{ fontSize: '5px', color: t.is_active ? 'var(--float-primary)' : '#cbd5e1' }}>●</span>
                        <span className="text-xs text-slate-700" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                        <DTBadge value={t.distress_thermometer_rating} />
                        <DABadge status={getDAStatus(t.id)} onClick={(e) => { e.stopPropagation(); setSelectedTriggerId(t.id); setRightPanelView('da') }} />
                      </div>
                    ))}
                    {showTriggerAdd && (
                      <div style={{ padding: '12px 0' }}>
                        <input value={newTriggerName} onChange={e => setNewTriggerName(e.target.value)} placeholder="Situation name" className="text-xs border border-slate-200 rounded" style={{ width: '100%', padding: '4px 6px', marginBottom: '4px', boxSizing: 'border-box' }} autoFocus onKeyDown={e => e.key === 'Enter' && newTriggerName.trim() && addTriggerMut.mutate()} />
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <input value={newTriggerDT} onChange={e => setNewTriggerDT(e.target.value)} placeholder="DT" type="number" min="0" max="10" className="text-xs border border-slate-200 rounded" style={{ width: '36px', padding: '4px' }} />
                          <button onClick={() => addTriggerMut.mutate()} disabled={!newTriggerName.trim()} className="bg-teal-600 text-white rounded text-[10px] font-medium disabled:opacity-40 border-none cursor-pointer" style={{ padding: '4px 8px' }}>Add</button>
                          <button onClick={() => { setShowTriggerAdd(false); setNewTriggerName(''); setNewTriggerDT('') }} className="text-[10px] text-slate-400 bg-transparent border-none cursor-pointer">X</button>
                        </div>
                      </div>
                    )}
                    {(!triggers || triggers.length === 0) && !showTriggerAdd && (
                      <div>
                        <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: '1.4', margin: '0 0 8px' }}>Add trigger situations identified in your sessions.</p>
                        <button onClick={() => setShowTriggerAdd(true)} className="text-xs text-teal-600 font-medium bg-transparent border-none cursor-pointer">+ Add first situation</button>
                      </div>
                    )}
                  </div>
                </div>
                {/* Right panel — behaviors or DA */}
                <div style={{ overflow: 'hidden' }}>
                  {selectedTrigger ? (
                    rightPanelView === 'da'
                      ? <DownwardArrowPanel trigger={selectedTrigger} onBack={() => setRightPanelView('behaviors')} />
                      : <BehaviorPanel trigger={selectedTrigger} planId={plan.id} patientId={patientId!} />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '13px', color: '#94a3b8', padding: '16px' }}>Select a situation</div>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

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
            ) : !showMsgForm && (
              <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5', margin: 0 }}>
                Send check-ins, encouragement, or plan adjustments to the patient between sessions.
              </p>
            )}
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
            ) : !showNoteForm && (
              <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5', margin: 0 }}>
                Capture notes from each session here — clinical observations, what was discussed, anything to reference next time. Clinician-only.
              </p>
            )}
          </div>

          {/* Action plans card */}
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="text-sm font-semibold text-slate-700">Action plans</span>
                {actionPlans && actionPlans.length > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{actionPlans.length}</span>}
              </div>
              {!showPlanEditor && <button onClick={() => { resetPlanEditor(); editor?.commands.setContent(ACTION_PLAN_TEMPLATE); setPlanNickname(plan?.nickname || ''); setShowPlanEditor(true) }} className="text-xs text-teal-600 font-medium bg-transparent border-none cursor-pointer">+ New plan</button>}
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
            ) : !showPlanEditor && (
              <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5', margin: 0 }}>
                Action plans are session summaries written directly to the patient. After each session, write what they'll work on and publish it to their app.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
