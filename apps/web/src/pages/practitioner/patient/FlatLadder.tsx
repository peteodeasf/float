/**
 * The ladder, flat — every rung on the plan in one list, easiest first.
 *
 * A rung is a sentence and a score; the situation is a quiet label you can change, not a folder
 * you open first. See docs/plans/flat-ladder-grouped-situations.md.
 *
 * Moved out of PatientPage.tsx unchanged.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

import {
  getPlanRungs, createPlanRung, updatePlanRung, deletePlanRung,
  setLadderActive, setRecommendedRung, planExperimentForBehavior,
  type AvoidanceBehavior,
  type TriggerSituation,
} from '../../../api/treatment'
import { BEHAVIOR_TYPE_SCENARIO, clampDt, clampDtInput, getNextSchoolDayISO } from './shared'

// Every rung on the plan in one list, easiest first. A rung is a sentence and a score; the
// situation is a quiet label you can change, not a folder you open first. See
// docs/plans/flat-ladder-grouped-situations.md.
export function FlatLadder({
  planId,
  patientId,
  triggers,
  ladderActive,
  recommendedRungId,
  onStartConversation,
}: {
  planId: string
  patientId: string
  triggers: TriggerSituation[]
  ladderActive: boolean
  recommendedRungId: string | null
  /** Opens the setup and edit conversation. It hangs off this view rather than sitting beside it. */
  onStartConversation?: () => void
}) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [dt, setDt] = useState('')
  const [groupId, setGroupId] = useState<string>('')

  const { data: rungs, isLoading } = useQuery({
    queryKey: ['plan-rungs', planId],
    queryFn: () => getPlanRungs(planId),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['plan-rungs', planId] })
    qc.invalidateQueries({ queryKey: ['behaviors'] })
  }
  const addMut = useMutation({
    mutationFn: () => createPlanRung(planId, {
      name: name.trim(),
      behavior_type: BEHAVIOR_TYPE_SCENARIO,
      distress_thermometer_when_refraining: clampDt(dt),
      trigger_situation_id: groupId || null,
    }),
    onSuccess: () => { invalidate(); setName(''); setDt(''); setShowAdd(false) },
  })
  const refreshPlan = () => {
    qc.invalidateQueries({ queryKey: ['plan', patientId] })
    qc.invalidateQueries({ queryKey: ['patient', patientId] })
  }
  const activeMut = useMutation({
    mutationFn: (on: boolean) => setLadderActive(patientId, planId, on),
    onSuccess: refreshPlan,
  })
  const recommendMut = useMutation({
    mutationFn: (rungId: string | null) => setRecommendedRung(patientId, planId, rungId),
    onSuccess: refreshPlan,
  })

  // Easiest first. Unscored rungs sit at the end — they are not a zero, they are unanswered.
  const ordered = [...(rungs ?? [])].sort((a, b) => {
    const x = a.distress_thermometer_when_refraining
    const y = b.distress_thermometer_when_refraining
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    return Number(x) - Number(y)
  })

  return (
    <div style={{ padding: '16px 20px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Ladder</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Everything, easiest first</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* One switch for the whole ladder. Peter, 2026-09-01: "the clinician can still
              activate or deactivate a ladder, but it's all or nothing." */}
          <button
            onClick={() => activeMut.mutate(!ladderActive)}
            // Only turning it ON needs rungs. An empty ladder that is already on still has to be
            // switchable off, or a clinician who clears it is stuck.
            disabled={activeMut.isPending || (!ladderActive && ordered.length === 0)}
            title={!ladderActive && ordered.length === 0 ? 'Add a rung first' : undefined}
            className="cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              fontSize: '12px', fontWeight: 700, borderRadius: '999px', padding: '5px 12px',
              color: ladderActive ? '#fff' : '#64748b',
              background: ladderActive ? 'var(--float-primary)' : '#fff',
              border: `1px solid ${ladderActive ? 'var(--float-primary)' : '#cbd5e1'}`,
            }}
          >
            {ladderActive ? 'On for the child' : 'Off for the child'}
          </button>
          {!showAdd && (
            <button onClick={() => setShowAdd(true)} className="cursor-pointer"
              style={{ fontSize: '12px', fontWeight: 700, color: 'var(--float-primary)', background: '#fff', border: '1px solid var(--float-primary)', borderRadius: '999px', padding: '5px 12px' }}>+ Add rung</button>
          )}
          {/* The conversation is how a ladder gets built with the child. It hangs off this view. */}
          {onStartConversation && (
            <button onClick={onStartConversation} className="cursor-pointer"
              style={{ fontSize: '12px', fontWeight: 700, color: '#fff', background: 'var(--float-primary)', border: '1px solid var(--float-primary)', borderRadius: '999px', padding: '5px 12px' }}>
              ▸ Build it with them
            </button>
          )}
        </div>
      </div>

      {isLoading && <p style={{ fontSize: '12.5px', color: '#94a3b8' }}>Loading…</p>}

      <div style={{ position: 'relative', paddingLeft: '22px' }}>
        {ordered.length > 0 && (
          <div style={{ position: 'absolute', left: '6px', top: '12px', bottom: '12px', width: '3px', borderRadius: '2px', background: 'linear-gradient(#4bb98a, #f2a33f 55%, #ef6b53)' }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {ordered.map(r => (
            <LadderRow
              key={r.id}
              planId={planId}
              rung={r}
              triggers={triggers}
              isRecommended={recommendedRungId === r.id}
              onRecommend={() => recommendMut.mutate(recommendedRungId === r.id ? null : r.id)}
            />
          ))}
          {!isLoading && ordered.length === 0 && (
            <div style={{ fontSize: '12.5px', color: '#94a3b8', padding: '8px 2px' }}>
              Nothing on the ladder yet — {onStartConversation ? 'build it with them, or add a rung yourself.' : 'use “+ Add rung”.'}
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', marginTop: '12px' }}>
          <input value={name} onChange={e => setName(e.target.value)} autoFocus
            placeholder="e.g. three of Diane’s posts when I’m home by myself"
            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded"
            style={{ marginBottom: '8px' }}
            onKeyDown={e => e.key === 'Enter' && name.trim() && addMut.mutate()} />
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={{ fontSize: '11px', color: '#475569', display: 'block', marginBottom: '4px' }}>How hard (1-10)</label>
              <input value={dt} onChange={e => setDt(clampDtInput(e.target.value))} type="number" min="1" max="10"
                className="text-sm border border-slate-200 rounded" style={{ width: '80px', padding: '6px 8px', textAlign: 'center' }} />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: '#475569', display: 'block', marginBottom: '4px' }}>Situation (optional)</label>
              <select value={groupId} onChange={e => setGroupId(e.target.value)}
                className="text-sm border border-slate-200 rounded" style={{ padding: '6px 8px', minWidth: '180px', cursor: 'pointer' }}>
                <option value="">Ungrouped — decide later</option>
                {triggers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <button onClick={() => addMut.mutate()} disabled={!name.trim() || addMut.isPending}
              className="bg-teal-600 text-white rounded text-xs font-medium disabled:opacity-40 border-none cursor-pointer" style={{ padding: '7px 14px' }}>Add</button>
            <button onClick={() => setShowAdd(false)} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * One rung on the ladder, editable in place.
 *
 * This is the only ladder now (Peter, 2026-09-01): the conversation is a setup flow that hangs off
 * it rather than a second view of the same thing, so everything you could do on the conversation's
 * own review ladder has to be doable here — including agreeing an exposure with the child in front
 * of you.
 */
function LadderRow({
  planId,
  rung,
  triggers,
  isRecommended,
  onRecommend,
}: {
  planId: string
  rung: AvoidanceBehavior
  triggers: TriggerSituation[]
  isRecommended: boolean
  onRecommend: () => void
}) {
  const qc = useQueryClient()
  const [editingName, setEditingName] = useState(false)
  const [draft, setDraft] = useState(rung.name)
  const [planning, setPlanning] = useState(false)
  const [planDate, setPlanDate] = useState(getNextSchoolDayISO())
  const [planned, setPlanned] = useState(false)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['plan-rungs', planId] })
    qc.invalidateQueries({ queryKey: ['behaviors'] })
  }
  const saveMut = useMutation({
    mutationFn: (data: Parameters<typeof updatePlanRung>[2]) => updatePlanRung(planId, rung.id, data),
    onSuccess: () => { invalidate(); setEditingName(false) },
  })
  const delMut = useMutation({
    mutationFn: () => deletePlanRung(planId, rung.id),
    onSuccess: invalidate,
  })
  // The clinician sets which rung and which day; the child answers their own questions at home.
  const planMut = useMutation({
    mutationFn: () => planExperimentForBehavior(rung.id, {
      confidence_level: 'medium',
      plan_description: rung.name,
      scheduled_date: new Date(planDate + 'T12:00:00').toISOString(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['experiments'] })
      setPlanning(false)
      setPlanned(true)
    },
  })

  const sit = triggers.find(t => t.id === rung.trigger_situation_id)?.name ?? null

  const rename = () => {
    const name = draft.trim()
    if (!name || name === rung.name) { setEditingName(false); setDraft(rung.name); return }
    saveMut.mutate({ name })
  }

  if (planning) {
    return (
      <div style={{ background: '#fff', border: '1px solid var(--float-primary)', borderRadius: '10px', padding: '12px 13px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>When will they do &ldquo;{rung.name}&rdquo;?</div>
        <p style={{ fontSize: '11.5px', color: '#64748b', margin: '4px 0 10px' }}>
          They fill in what they think will happen when they open their app.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <input type="date" value={planDate} onChange={e => setPlanDate(e.target.value)}
            className="text-sm border border-slate-200 rounded" style={{ padding: '5px 8px' }} />
          <button onClick={() => planMut.mutate()} disabled={planMut.isPending}
            className="bg-teal-600 text-white rounded text-xs font-medium border-none cursor-pointer disabled:opacity-50"
            style={{ padding: '6px 12px' }}>{planMut.isPending ? 'Saving…' : 'Agree it'}</button>
          <button onClick={() => setPlanning(false)} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="group" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 13px' }}>
      {editingName ? (
        <input
          value={draft}
          autoFocus
          onChange={e => setDraft(e.target.value)}
          onBlur={rename}
          onKeyDown={e => {
            if (e.key === 'Enter') rename()
            if (e.key === 'Escape') { setDraft(rung.name); setEditingName(false) }
          }}
          className="text-sm border border-slate-200 rounded"
          style={{ flex: 1, minWidth: 0, padding: '4px 6px', fontWeight: 600 }}
        />
      ) : (
        <button
          onClick={() => { setDraft(rung.name); setEditingName(true) }}
          title="Change the wording"
          className="text-sm text-slate-700 truncate bg-transparent border-none"
          style={{ flex: 1, minWidth: 0, fontWeight: 600, textAlign: 'left', padding: 0, cursor: 'text' }}
        >
          {rung.name}
        </button>
      )}

      {planned ? (
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#3f8a78', flexShrink: 0 }}>Planned</span>
      ) : (
        <button onClick={() => setPlanning(true)} title="Agree an exposure on this one"
          className="opacity-0 group-hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer"
          style={{ fontSize: '11px', fontWeight: 700, color: '#3f8a78', flexShrink: 0, whiteSpace: 'nowrap' }}>
          Plan it
        </button>
      )}

      {/* Which one to do next. Advice the child sees — they can still pick any of them. */}
      <button
        onClick={onRecommend}
        title={isRecommended ? 'Stop suggesting this one' : 'Suggest this one next'}
        className="cursor-pointer"
        style={{
          fontSize: '11px', fontWeight: 700, borderRadius: '999px', padding: '3px 9px',
          flexShrink: 0, whiteSpace: 'nowrap',
          color: isRecommended ? '#0d3d3a' : '#94a3b8',
          background: isRecommended ? '#eafaf6' : '#fff',
          border: `1px solid ${isRecommended ? 'var(--float-primary)' : '#e2e8f0'}`,
        }}
      >
        {isRecommended ? 'Next' : 'Set next'}
      </button>

      {/* The grouping — changeable in place, and blank is allowed. */}
      <select
        value={rung.trigger_situation_id ?? ''}
        onChange={e => saveMut.mutate({ trigger_situation_id: e.target.value || null })}
        title="Which situation this belongs to"
        style={{ fontSize: '11px', fontWeight: 600, border: '1px solid #e4efeb', borderRadius: '6px', padding: '3px 6px', color: sit ? '#3f8a78' : '#c0ccca', background: '#f8fbfa', cursor: 'pointer', maxWidth: '190px' }}>
        <option value="">Ungrouped</option>
        {triggers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>

      <input
        type="number" min="1" max="10"
        value={rung.distress_thermometer_when_refraining ?? ''}
        onChange={e => { const v = clampDt(e.target.value); if (v) saveMut.mutate({ distress_thermometer_when_refraining: v }) }}
        title="How hard, 1–10"
        className="text-sm border border-slate-200 rounded"
        style={{ width: '52px', padding: '4px 6px', textAlign: 'center', flexShrink: 0 }} />

      <button onClick={() => delMut.mutate()} title="Remove rung"
        className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer"
        style={{ fontSize: '14px', padding: '0 2px', flexShrink: 0 }}>×</button>
    </div>
  )
}
