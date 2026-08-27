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
  type TriggerSituation,
} from '../../../api/treatment'
import { BEHAVIOR_TYPE_SCENARIO, clampDt, clampDtInput } from './shared'

// Every rung on the plan in one list, easiest first. A rung is a sentence and a score; the
// situation is a quiet label you can change, not a folder you open first. See
// docs/plans/flat-ladder-grouped-situations.md.
export function FlatLadder({ planId, triggers }: { planId: string; triggers: TriggerSituation[] }) {
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
  const regroupMut = useMutation({
    mutationFn: (v: { id: string; situationId: string | null }) =>
      updatePlanRung(planId, v.id, { trigger_situation_id: v.situationId }),
    onSuccess: invalidate,
  })
  const scoreMut = useMutation({
    mutationFn: (v: { id: string; dt: number }) =>
      updatePlanRung(planId, v.id, { distress_thermometer_when_refraining: v.dt }),
    onSuccess: invalidate,
  })
  const delMut = useMutation({
    mutationFn: (id: string) => deletePlanRung(planId, id),
    onSuccess: invalidate,
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
  const situationName = (id: string | null) =>
    triggers.find(t => t.id === id)?.name ?? null

  return (
    <div style={{ padding: '16px 20px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px', marginBottom: '12px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Ladder</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Everything, easiest first</div>
        </div>
        {!showAdd && (
          <button onClick={() => setShowAdd(true)} className="cursor-pointer"
            style={{ fontSize: '12px', fontWeight: 700, color: 'var(--float-primary)', background: '#fff', border: '1px solid var(--float-primary)', borderRadius: '999px', padding: '5px 12px', flexShrink: 0 }}>+ Add rung</button>
        )}
      </div>

      {isLoading && <p style={{ fontSize: '12.5px', color: '#94a3b8' }}>Loading…</p>}

      <div style={{ position: 'relative', paddingLeft: '22px' }}>
        {ordered.length > 0 && (
          <div style={{ position: 'absolute', left: '6px', top: '12px', bottom: '12px', width: '3px', borderRadius: '2px', background: 'linear-gradient(#4bb98a, #f2a33f 55%, #ef6b53)' }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {ordered.map(r => {
            const sit = situationName(r.trigger_situation_id)
            return (
              <div key={r.id} className="group" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 13px' }}>
                <span className="text-sm text-slate-700 truncate" style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{r.name}</span>

                {/* The grouping — changeable in place, and blank is allowed. */}
                <select
                  value={r.trigger_situation_id ?? ''}
                  onChange={e => regroupMut.mutate({ id: r.id, situationId: e.target.value || null })}
                  title="Which situation this belongs to"
                  style={{ fontSize: '11px', fontWeight: 600, border: '1px solid #e4efeb', borderRadius: '6px', padding: '3px 6px', color: sit ? '#3f8a78' : '#c0ccca', background: '#f8fbfa', cursor: 'pointer', maxWidth: '190px' }}>
                  <option value="">Ungrouped</option>
                  {triggers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>

                <input
                  type="number" min="1" max="10"
                  value={r.distress_thermometer_when_refraining ?? ''}
                  onChange={e => { const v = clampDt(e.target.value); if (v) scoreMut.mutate({ id: r.id, dt: v }) }}
                  title="How hard, 1–10"
                  className="text-sm border border-slate-200 rounded"
                  style={{ width: '52px', padding: '4px 6px', textAlign: 'center', flexShrink: 0 }} />

                <button onClick={() => delMut.mutate(r.id)} title="Remove rung"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer"
                  style={{ fontSize: '14px', padding: '0 2px', flexShrink: 0 }}>×</button>
              </div>
            )
          })}
          {!isLoading && ordered.length === 0 && (
            <div style={{ fontSize: '12.5px', color: '#94a3b8', padding: '8px 2px' }}>Nothing on the ladder yet — use “+ Add rung”.</div>
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
