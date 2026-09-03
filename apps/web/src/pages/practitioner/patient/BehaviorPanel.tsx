/**
 * The exposure ladder for one situation — the Plan tab's right-hand pane.
 *
 * Shows the situation's rungs, its tags, its feared outcome, and the plan-an-experiment flow.
 * Moved out of PatientPage.tsx unchanged.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import {
  getBehaviors, createBehavior, updateBehavior, deleteBehavior,
  getLadder, getLadderFlags, reviewLadder, updateTrigger,
  getActiveTags, getSituationTags, setSituationTags,
  searchBehaviorLibrary, getSituationDownwardArrow,
  type AvoidanceBehavior, type TriggerSituation,
} from '../../../api/treatment'
import { getPatientExperiments, planExperimentForBehavior } from '../../../api/treatment'
import {
  BEHAVIOR_TYPE_SCENARIO, SUB_BEHAVIOR_ADD_ENABLED, clampDt, clampDtInput, DTBadge,
  getNextSchoolDayISO, CONFIDENCE_OPTIONS,
} from './shared'

// ── Behavior Panel (right side of treatment plan) ──
export function BehaviorPanel({ trigger, planId, patientId, planStatus }: {
  trigger: TriggerSituation; planId: string; patientId: string; planStatus: string
}) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('avoidance')
  const [dt, setDt] = useState('')
  const [behaviorLibraryId, setBehaviorLibraryId] = useState<string | null>(null)
  const [showBehSuggest, setShowBehSuggest] = useState(false)
  // Sub-behaviors (#7): a smaller, lower-scored step under a parent behavior.
  const [subParentId, setSubParentId] = useState<string | null>(null)
  const [subName, setSubName] = useState('')
  const [subDt, setSubDt] = useState('')
  const [reviewMsg, setReviewMsg] = useState<string | null>(null)
  const [editingBehaviorId, setEditingBehaviorId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState('avoidance')
  const [editDT, setEditDT] = useState('')
  const [deletingBehaviorId, setDeletingBehaviorId] = useState<string | null>(null)
  const [delError, setDelError] = useState<string | null>(null)

  // Experiment planning
  const [planningBehaviorId, setPlanningBehaviorId] = useState<string | null>(null)
  const [expConfidence, setExpConfidence] = useState<string>('high')
  const [expPlan, setExpPlan] = useState('')
  const [expDate, setExpDate] = useState(getNextSchoolDayISO())
  const [expWarning, setExpWarning] = useState(false)
  const [expSavedFor, setExpSavedFor] = useState<{ behaviorId: string; date: string } | null>(null)
  // Which rung the single top-of-ladder "Plan an experiment" control targets.
  const [selectedRungId, setSelectedRungId] = useState<string | null>(null)

  const planActive = planStatus === 'active'

  const { data: behaviors } = useQuery({
    queryKey: ['behaviors', trigger.id],
    queryFn: () => getBehaviors(trigger.id),
  })

  const { data: patientExps } = useQuery({
    queryKey: ['experiments', patientId],
    queryFn: () => getPatientExperiments(patientId),
    enabled: !!patientId,
  })

  const planExpMut = useMutation({
    mutationFn: (vars: { behaviorId: string; force: boolean }) =>
      planExperimentForBehavior(vars.behaviorId, {
        confidence_level: expConfidence,
        plan_description: expPlan.trim(),
        scheduled_date: expDate ? new Date(expDate + 'T12:00:00').toISOString() : undefined,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['experiments', patientId] })
      setExpSavedFor({ behaviorId: vars.behaviorId, date: expDate })
      setPlanningBehaviorId(null)
      setExpPlan('')
      setExpConfidence('high')
      setExpDate(getNextSchoolDayISO())
      setExpWarning(false)
      setTimeout(() => setExpSavedFor(null), 4000)
    },
  })

  const startPlanning = (b: AvoidanceBehavior) => {
    setPlanningBehaviorId(b.id)
    setExpPlan('')
    setExpConfidence('high')
    setExpDate(getNextSchoolDayISO())
    setExpWarning(false)
  }

  const handleSaveExperiment = (behaviorId: string) => {
    if (!expPlan.trim()) return
    if ((expConfidence === 'low' || expConfidence === 'medium') && !expWarning) {
      setExpWarning(true)
      return
    }
    planExpMut.mutate({ behaviorId, force: expWarning })
  }

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

  // Content tags: which JIT tips are relevant to this situation.
  const { data: allTags } = useQuery({ queryKey: ['content-tags'], queryFn: getActiveTags })
  // The feared outcome the downward arrow landed on for this situation. Same query key the arrow
  // mode uses, so finishing a chain there refreshes it here.
  const { data: situationArrow } = useQuery({
    queryKey: ['situation-da', trigger.id],
    queryFn: () => getSituationDownwardArrow(trigger.id),
  })
  const { data: situationTagIds } = useQuery({
    queryKey: ['situation-tags', trigger.id],
    queryFn: () => getSituationTags(trigger.id),
  })
  const setTagsMut = useMutation({
    mutationFn: (ids: string[]) => setSituationTags(trigger.id, ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['situation-tags', trigger.id] }),
  })
  const toggleSituationTag = (tagId: string) => {
    const current = situationTagIds ?? []
    const next = current.includes(tagId)
      ? current.filter(x => x !== tagId)
      : [...current, tagId]
    setTagsMut.mutate(next)
  }

  // Behavior library suggestions (select-from-list; typing a new name still creates one)
  const { data: behSuggestions } = useQuery({
    queryKey: ['behavior-library', name.trim()],
    queryFn: () => searchBehaviorLibrary(name.trim()),
    enabled: showAdd && showBehSuggest && name.trim().length >= 2,
  })

  const addMut = useMutation({
    // Avoidance is defined by the situation it avoids, so the name is optional —
    // default it to "Avoids {situation}" when left blank.
    mutationFn: () => createBehavior(trigger.id, { name: name.trim() || `Avoids ${trigger.name}`, behavior_type: type, distress_thermometer_when_refraining: clampDt(dt), behavior_library_id: behaviorLibraryId ?? undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] }); setName(''); setDt(''); setBehaviorLibraryId(null); setShowBehSuggest(false); setShowAdd(false) }
  })

  const resetSub = () => { setSubParentId(null); setSubName(''); setSubDt('') }
  const subMut = useMutation({
    mutationFn: (parent: AvoidanceBehavior) => createBehavior(trigger.id, {
      name: subName.trim(),
      behavior_type: parent.behavior_type,
      distress_thermometer_when_refraining: clampDt(subDt),
      parent_behavior_id: parent.id,
      behavior_library_id: undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] }); resetSub() },
  })

  const editMut = useMutation({
    mutationFn: () => updateBehavior(trigger.id, editingBehaviorId!, { name: editName, behavior_type: editType, distress_thermometer_when_refraining: clampDt(editDT) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] }); setEditingBehaviorId(null) }
  })

  const delMut = useMutation({
    mutationFn: (id: string) => deleteBehavior(trigger.id, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] }); setDeletingBehaviorId(null); setDelError(null) },
    onError: () => setDelError('Could not delete that behavior. Try again.')
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

  // A situation can't be activated until it has at least one behavior — the
  // teen ladder has nothing to show for an empty situation.
  const hasBehaviors = (behaviors?.length ?? 0) > 0
  const canToggleActive = trigger.is_active || hasBehaviors

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

  // Ladder derivations: which rungs have an experiment (scheduled vs any), and the
  // default rung for the top "Plan an experiment" control (lowest rung without one).
  const topRungs = sortedBehaviors.filter(b => !b.parent_behavior_id)
  const scheduledByBehavior = new Map<string, { date: string | null }>()
  const behaviorsWithAnyExp = new Set<string>()
  ;(patientExps ?? []).forEach(e => {
    if (!e.avoidance_behavior_id) return
    behaviorsWithAnyExp.add(e.avoidance_behavior_id)
    if (e.status !== 'completed' && !scheduledByBehavior.has(e.avoidance_behavior_id)) {
      scheduledByBehavior.set(e.avoidance_behavior_id, { date: e.scheduled_date })
    }
  })
  const defaultRungId = (topRungs.find(b => !behaviorsWithAnyExp.has(b.id)) ?? topRungs[0])?.id ?? null
  const effectiveRungId = (selectedRungId && topRungs.some(b => b.id === selectedRungId)) ? selectedRungId : defaultRungId
  const planningBehavior = sortedBehaviors.find(b => b.id === planningBehaviorId) ?? null
  const fmtDate = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

  return (
    <div className="p-4 h-full overflow-y-auto">
      {/* Section label above the situation it belongs to. Everything ABOUT the situation —
          score, active state, tags — sits on the situation's own row, so the eye picks up the
          whole context in one line instead of three stacked blocks. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Exposure ladder</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>What to face, and what to resist</div>
        </div>
        {behaviors && behaviors.length > 0 && ladder && (
          <button onClick={() => reviewMut.mutate()} disabled={reviewMut.isPending}
            className="text-[11px] font-medium bg-transparent border-none cursor-pointer disabled:opacity-50"
            style={{ color: '#64748b', flexShrink: 0 }}>
            {reviewMut.isPending ? 'Reviewing...' : 'Run AI review'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap', margin: '10px 0 12px' }}>
        <h3 className="text-sm font-semibold text-slate-800" style={{ margin: 0 }}>{trigger.name}</h3>
        <DTBadge value={trigger.distress_thermometer_rating} max={trigger.distress_thermometer_max} />
        <button
          onClick={() => toggleActive.mutate()}
          disabled={toggleActive.isPending || !canToggleActive}
          title={!canToggleActive ? 'Add at least one behavior before activating this situation' : undefined}
          style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '4px 12px',
            borderRadius: '999px',
            border: trigger.is_active ? '1px solid var(--float-primary)' : '1px solid #cbd5e1',
            background: trigger.is_active ? 'var(--float-primary)' : '#fff',
            color: trigger.is_active ? '#fff' : '#64748b',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            cursor: canToggleActive ? 'pointer' : 'not-allowed',
            opacity: canToggleActive ? 1 : 0.5,
          }}
        >
          <span style={{ fontSize: '8px' }}>{trigger.is_active ? '\u25cf' : '\u25cb'}</span>
          {trigger.is_active ? 'Active' : 'Not active'}
        </button>

        {/* Tags — targets the JIT tips the teen sees on this situation's exposures. No heading:
            on the situation's own row they read as properties of it. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginLeft: 'auto' }}>
          {(allTags ?? []).map(tag => {
            const on = (situationTagIds ?? []).includes(tag.id)
            return (
              <button
                key={tag.id}
                onClick={() => toggleSituationTag(tag.id)}
                disabled={setTagsMut.isPending}
                title="Tag — targets the tips the teen sees on this situation"
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '4px 11px',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  border: `1px solid ${on ? 'var(--float-primary)' : '#cbd5e1'}`,
                  background: on ? 'var(--float-primary)' : '#fff',
                  color: on ? '#fff' : '#64748b',
                }}
              >
                {tag.label}
              </button>
            )
          })}
        </div>
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

      {/* Exposure ladder — the hero: a grouped, tinted object with rungs on a color-graded rail.
          The plan-an-experiment control lives in the footer below, so the ladder reads as the focus
          and its actions are taken from it. This same block is what the child sees, on its own. */}
      <div style={{ background: '#f7faf9', border: '1px solid #e6eeec', borderRadius: '14px', padding: '14px 14px 12px', marginBottom: '12px' }}>
        <div style={{ position: 'relative', paddingLeft: '30px' }}>
        {topRungs.length > 0 && (
          <div style={{ position: 'absolute', left: '10px', top: '12px', bottom: '12px', width: '2px', background: 'linear-gradient(#4bb98a, #f2a33f 55%, #ef6b53)' }} />
        )}
        {topRungs.map((b, i) => (
          <div key={b.id} style={{ position: 'relative', marginBottom: '5px' }}>
            {editingBehaviorId === b.id ? (
              /* Edit mode */
              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 12px' }}>
                <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" style={{ marginBottom: '8px' }}
                  onKeyDown={e => e.key === 'Enter' && editName.trim() && editMut.mutate()} />
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Type</div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {['avoidance', 'safety', 'ritual'].map(opt => (
                      <button key={opt} onClick={() => setEditType(opt)} type="button"
                        style={{ fontSize: '11px', fontWeight: 600, padding: '5px 10px', borderRadius: '999px', cursor: 'pointer',
                          background: editType === opt ? 'var(--float-primary)' : '#fff',
                          color: editType === opt ? '#fff' : '#475569',
                          border: editType === opt ? '1px solid var(--float-primary)' : '1px solid #cbd5e1',
                          textTransform: 'capitalize' }}>{opt}</button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <label style={{ fontSize: '11px', color: '#475569', display: 'block', marginBottom: '4px' }}>Fear level when refraining (1-10)</label>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <button type="button" onClick={() => setEditDT(String(Math.max(1, (Number(editDT) || 1) - 1)))} style={{ width: '28px', height: '32px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#475569' }}>&minus;</button>
                    <input value={editDT} onChange={e => setEditDT(clampDtInput(e.target.value))} type="number" min="1" max="10" className="text-sm border border-slate-200 rounded" style={{ width: '80px', padding: '6px 8px', textAlign: 'center', height: '32px', boxSizing: 'border-box' }} />
                    <button type="button" onClick={() => setEditDT(String(Math.min(10, (Number(editDT) || 0) + 1)))} style={{ width: '28px', height: '32px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#475569' }}>+</button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button onClick={() => editMut.mutate()} disabled={!editName.trim() || editMut.isPending} className="bg-teal-600 text-white rounded text-[11px] font-medium disabled:opacity-40 border-none cursor-pointer" style={{ padding: '6px 12px' }}>Save</button>
                  <button onClick={() => setEditingBehaviorId(null)} className="text-[11px] text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                </div>
              </div>
            ) : deletingBehaviorId === b.id ? (
              /* Delete confirmation */
              <div style={{ background: '#fef2f2', borderRadius: '8px', padding: '8px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: '#991b1b' }}>Delete this behavior{sortedBehaviors.some(c => c.parent_behavior_id === b.id) ? ' and its smaller steps' : ''}?</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => delMut.mutate(b.id)} disabled={delMut.isPending} className="text-[11px] text-red-600 font-medium bg-transparent border-none cursor-pointer disabled:opacity-50">{delMut.isPending ? 'Deleting…' : 'Yes, delete'}</button>
                    <button onClick={() => { setDeletingBehaviorId(null); setDelError(null) }} className="text-[11px] text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                  </div>
                </div>
                {delError && <p style={{ fontSize: '11px', color: '#b91c1c', margin: '6px 0 0' }}>{delError}</p>}
              </div>
            ) : (
              <>
                {/* Rung node */}
                <div style={{ position: 'absolute', left: '-30px', top: '12px', width: '22px', height: '22px', borderRadius: '50%', background: planningBehaviorId === b.id ? '#135450' : '#fff', border: `2px solid ${planningBehaviorId === b.id ? '#135450' : '#cbd5e1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, color: planningBehaviorId === b.id ? '#fff' : '#64748b', zIndex: 2 }}>{i + 1}</div>
                {/* Rung card */}
                <div className="group" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '11px 14px' }}>
                  <span className={`text-[10px] px-1 py-0.5 rounded font-bold uppercase ${b.behavior_type === BEHAVIOR_TYPE_SCENARIO ? 'bg-teal-50 text-teal-700' : b.behavior_type === 'safety' ? 'bg-amber-50 text-amber-600' : b.behavior_type === 'ritual' ? 'bg-purple-50 text-purple-600' : 'bg-slate-100 text-slate-500'}`} style={{ flexShrink: 0 }}>
                    {b.behavior_type === BEHAVIOR_TYPE_SCENARIO ? 'SIT' : (b.behavior_type ?? '').slice(0, 3).toUpperCase()}
                  </span>
                  <span className="text-sm text-slate-700 truncate" style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{b.name}</span>
                  {scheduledByBehavior.has(b.id) && (
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#3f8a78', background: '#eafaf4', border: '1px solid #cdeee2', padding: '3px 8px', borderRadius: '6px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {scheduledByBehavior.get(b.id)?.date ? `Scheduled ${fmtDate(scheduledByBehavior.get(b.id)!.date)}` : 'Planned'}
                    </span>
                  )}
                  <div style={{ width: '38px', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                    <DTBadge value={b.distress_thermometer_when_refraining} />
                  </div>
                  <div style={{ width: '126px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '11px', flexShrink: 0 }}>
                    <button onClick={() => startEdit(b)} className="text-[12px] text-slate-400 hover:text-teal-600 bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">Edit</button>
                    <button onClick={() => setDeletingBehaviorId(b.id)} className="text-[12px] text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">Del</button>
                  </div>
                </div>

                {/* Sub-steps — same rail + same columns, only a smaller node + lighter card mark them children */}
                {sortedBehaviors.filter(c => c.parent_behavior_id === b.id).map(c => (
                  <div key={c.id} style={{ position: 'relative', marginTop: '5px' }}>
                    <div style={{ position: 'absolute', left: '-25px', top: '13px', width: '12px', height: '12px', borderRadius: '50%', background: '#fff', border: '2px solid #cbd5e1', zIndex: 2 }} />
                    <div className="group" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc', border: '1px dashed #d5dee2', borderRadius: '10px', padding: '9px 14px' }}>
                      <span style={{ color: '#94a3b8', fontSize: '13px', flexShrink: 0 }}>&#8627;</span>
                      <span className="truncate" style={{ flex: 1, minWidth: 0, fontSize: '13.5px', color: '#64748b', fontWeight: 500 }}>{c.name}</span>
                      <div style={{ width: '38px', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                        <DTBadge value={c.distress_thermometer_when_refraining} />
                      </div>
                      <div style={{ width: '92px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '11px', flexShrink: 0 }}>
                        <button onClick={() => { if (confirm('Delete this step?')) delMut.mutate(c.id) }} className="text-[12px] text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">Del</button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Sub-step add form — unreachable while SUB_BEHAVIOR_ADD_ENABLED is false. */}
                {SUB_BEHAVIOR_ADD_ENABLED && subParentId === b.id && (
                  <div style={{ position: 'relative', marginTop: '5px' }}>
                    <div style={{ position: 'absolute', left: '-25px', top: '15px', width: '12px', height: '12px', borderRadius: '50%', background: '#fff', border: '2px solid #cbd5e1', zIndex: 2 }} />
                    <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '10px 12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Smaller step under &ldquo;{b.name}&rdquo;</div>
                      <input value={subName} onChange={e => setSubName(e.target.value)} placeholder="More specific, easier version" className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" style={{ marginBottom: '8px' }} autoFocus
                        onKeyDown={e => e.key === 'Enter' && subName.trim() && subMut.mutate(b)} />
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '11px', color: '#475569', display: 'block', marginBottom: '4px' }}>Fear level (lower than {b.distress_thermometer_when_refraining != null ? Number(b.distress_thermometer_when_refraining) : '—'})</label>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <button type="button" onClick={() => setSubDt(String(Math.max(1, (Number(subDt) || 1) - 1)))} style={{ width: '28px', height: '32px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#475569' }}>&minus;</button>
                          <input value={subDt} onChange={e => setSubDt(clampDtInput(e.target.value))} type="number" min="1" max="10" className="text-sm border border-slate-200 rounded" style={{ width: '80px', padding: '6px 8px', textAlign: 'center', height: '32px', boxSizing: 'border-box' }} />
                          <button type="button" onClick={() => setSubDt(String(Math.min(10, (Number(subDt) || 0) + 1)))} style={{ width: '28px', height: '32px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#475569' }}>+</button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button onClick={() => subMut.mutate(b)} disabled={!subName.trim() || subMut.isPending} className="bg-teal-600 text-white rounded text-[11px] font-medium disabled:opacity-40 border-none cursor-pointer" style={{ padding: '6px 12px' }}>Add step</button>
                        <button onClick={resetSub} className="text-[11px] text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
          {topRungs.length === 0 && (
            <div style={{ fontSize: '12.5px', color: '#94a3b8', padding: '8px 2px' }}>Nothing on the ladder yet — use “+ Add rung” to add the first one.</div>
          )}

          {/* What every rung above is there to test. From the downward arrow; read-only here. */}
          {situationArrow?.feared_outcome && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed #dbe6e3' }}>
              <span style={{ fontSize: '10.5px', fontWeight: 700, color: '#9fb5b0', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>
                &#9825; Feared outcome
              </span>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: '#3f8a78', lineHeight: 1.4, minWidth: 0 }}>
                &ldquo;{situationArrow.feared_outcome}&rdquo;
              </span>
            </div>
          )}

          {/* Plan an experiment — the single action, taken from the ladder */}
          {planActive && topRungs.length > 0 && (
            planningBehaviorId == null ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap', marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #dbe6e3' }}>
                <button onClick={() => { const rung = topRungs.find(x => x.id === effectiveRungId); if (rung) startPlanning(rung) }}
                  disabled={!effectiveRungId} className="disabled:opacity-40"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 800, color: '#135450', background: '#fff', border: '1.5px solid #135450', borderRadius: '9px', padding: '8px 13px', cursor: 'pointer' }}>&#9656; Plan an experiment</button>
                {expSavedFor && (
                  <span style={{ fontSize: '12px', color: '#16a34a', marginLeft: 'auto' }}>&#10003; Experiment planned for {fmtDate(expSavedFor.date + 'T00:00:00')}</span>
                )}
              </div>
            ) : planningBehavior && (
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #dbe6e3' }}>
                <div style={{ background: '#fff', borderRadius: '10px', padding: '12px', border: '1px solid #dbe6e3' }}>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: '#475569', margin: '0 0 9px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    Plan experiment for
                    <select value={planningBehaviorId ?? ''} onChange={e => { setSelectedRungId(e.target.value); const rung = topRungs.find(x => x.id === e.target.value); if (rung) startPlanning(rung) }}
                      style={{ fontSize: '12.5px', fontWeight: 700, color: '#0d3d3a', border: '1px solid #bfe9dc', background: '#fff', borderRadius: '7px', padding: '4px 6px', maxWidth: '230px', cursor: 'pointer' }}>
                      {topRungs.map(b => (
                        <option key={b.id} value={b.id}>{b.name}{b.distress_thermometer_when_refraining != null ? ` · ${Number(b.distress_thermometer_when_refraining)}` : ''}</option>
                      ))}
                    </select>
                  </p>
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Confidence level (ask the child):</div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {CONFIDENCE_OPTIONS.map(opt => (
                        <button key={opt.key} type="button" onClick={() => { setExpConfidence(opt.key); setExpWarning(false) }}
                          style={{ fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: '999px', cursor: 'pointer',
                            background: expConfidence === opt.key ? 'var(--float-primary)' : '#fff',
                            color: expConfidence === opt.key ? '#fff' : '#475569',
                            border: expConfidence === opt.key ? '1px solid var(--float-primary)' : '1px solid #cbd5e1',
                            display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span>{opt.emoji}</span>{opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Specific plan:</div>
                    <textarea value={expPlan} onChange={e => setExpPlan(e.target.value)} rows={2}
                      placeholder="e.g. Sit at the cafeteria table without headphones on Tuesday at lunch"
                      className="text-sm border border-slate-200 rounded"
                      style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Scheduled date:</div>
                    <input type="date" value={expDate} onChange={e => setExpDate(e.target.value)} className="text-sm border border-slate-200 rounded" style={{ padding: '6px 8px' }} />
                  </div>
                  {expWarning && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '10px 12px', marginBottom: '10px' }}>
                      <p style={{ fontSize: '12px', color: '#78350f', margin: '0 0 8px', lineHeight: '1.4' }}>
                        &#9888; Confidence is {expConfidence === 'low' ? 'Low' : 'Medium'} &mdash; consider simplifying this experiment before the teen attempts it.
                      </p>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => planExpMut.mutate({ behaviorId: planningBehavior.id, force: true })} disabled={planExpMut.isPending}
                          className="text-[11px] font-medium border-none cursor-pointer disabled:opacity-50"
                          style={{ background: '#d97706', color: '#fff', padding: '5px 10px', borderRadius: '6px' }}>Save anyway</button>
                        <button onClick={() => { setPlanningBehaviorId(null); setExpWarning(false) }}
                          className="text-[11px] bg-white cursor-pointer" style={{ border: '1px solid #fde68a', color: '#78350f', padding: '5px 10px', borderRadius: '6px' }}>Cancel</button>
                      </div>
                    </div>
                  )}
                  {!expWarning && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => handleSaveExperiment(planningBehavior.id)} disabled={!expPlan.trim() || planExpMut.isPending}
                        className="bg-teal-600 text-white rounded text-xs font-medium disabled:opacity-40 border-none cursor-pointer" style={{ padding: '6px 12px' }}>
                        {planExpMut.isPending ? 'Saving...' : 'Save experiment plan'}</button>
                      <button onClick={() => setPlanningBehaviorId(null)} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* Below the list it adds to, not up in the section header. */}
      {!showAdd && (
        <button onClick={() => setShowAdd(true)} className="cursor-pointer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700, color: 'var(--float-primary)', background: '#fff', border: '1px solid var(--float-primary)', borderRadius: '999px', padding: '5px 12px', marginBottom: '12px' }}>+ Add rung</button>
      )}

      {/* Add behavior inline */}
      {showAdd && (
        <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 12px' }}>
          <div style={{ position: 'relative', marginBottom: type === 'avoidance' ? '4px' : '8px' }}>
            <input value={name} onChange={e => { setName(e.target.value); setBehaviorLibraryId(null); setShowBehSuggest(true) }}
              placeholder={
                type === BEHAVIOR_TYPE_SCENARIO ? 'e.g. three of Diane’s posts when I’m home by myself'
                : type === 'avoidance' ? `Optional — type to search, or leave blank for “Avoids ${trigger.name}”`
                : 'Behavior name — type to search or add new'
              }
              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" autoFocus
              onKeyDown={e => e.key === 'Enter' && (name.trim() || type === 'avoidance') && addMut.mutate()} />
            {showBehSuggest && (behSuggestions?.length ?? 0) > 0 && (
              <div style={{ position: 'absolute', top: '34px', left: 0, right: 0, zIndex: 30, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 6px 16px rgba(0,0,0,0.12)', maxHeight: '160px', overflowY: 'auto' }}>
                {behSuggestions!.map(s => (
                  <button key={s.id} type="button" onClick={() => { setName(s.name); if (s.behavior_type) setType(s.behavior_type); setBehaviorLibraryId(s.id); setShowBehSuggest(false) }}
                    className="cursor-pointer" style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid #f1f5f9', padding: '7px 10px', fontSize: '13px', color: '#334155' }}>
                    {s.name}{s.behavior_type ? <span style={{ color: '#94a3b8', fontSize: '11px' }}> · {s.behavior_type}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
          {type === 'avoidance' && (
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 8px' }}>Leave blank to name it “Avoids {trigger.name}”.</p>
          )}
          {type === BEHAVIOR_TYPE_SCENARIO && (
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 8px' }}>
              A narrower version of “{trigger.name}” — vary who’s there, how much, how long. Its rating can be
              higher or lower than the situation’s.
            </p>
          )}
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Type</div>
            <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
              {[
                { key: BEHAVIOR_TYPE_SCENARIO, label: 'A version of this situation' },
                { key: 'avoidance', label: 'Avoidance' },
                { key: 'safety', label: 'Safety' },
                { key: 'ritual', label: 'Ritual' },
              ].map(opt => (
                <button key={opt.key} onClick={() => setType(opt.key)} type="button"
                  style={{
                    fontSize: '11px', fontWeight: 600, padding: '5px 10px', borderRadius: '999px', cursor: 'pointer',
                    background: type === opt.key ? 'var(--float-primary)' : '#fff',
                    color: type === opt.key ? '#fff' : '#475569',
                    border: type === opt.key ? '1px solid var(--float-primary)' : '1px solid #cbd5e1',
                  }}>{opt.label}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ fontSize: '11px', color: '#475569', display: 'block', marginBottom: '4px' }}>
              {type === BEHAVIOR_TYPE_SCENARIO ? 'How hard is this version? (1-10)' : 'Fear level when refraining (1-10)'}
            </label>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <button type="button" onClick={() => setDt(String(Math.max(1, (Number(dt) || 1) - 1)))} style={{ width: '28px', height: '32px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#475569' }}>−</button>
              <input value={dt} onChange={e => setDt(clampDtInput(e.target.value))} type="number" min="1" max="10" className="text-sm border border-slate-200 rounded" style={{ width: '80px', padding: '6px 8px', textAlign: 'center', height: '32px', boxSizing: 'border-box' }} />
              <button type="button" onClick={() => setDt(String(Math.min(10, (Number(dt) || 0) + 1)))} style={{ width: '28px', height: '32px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#475569' }}>+</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button onClick={() => addMut.mutate()} disabled={!name.trim() && type !== 'avoidance'} className="bg-teal-600 text-white rounded text-xs font-medium disabled:opacity-40 border-none cursor-pointer" style={{ padding: '6px 12px' }}>Add</button>
            <button onClick={() => setShowAdd(false)} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
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
