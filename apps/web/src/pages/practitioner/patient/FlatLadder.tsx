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
  getPlanRungs, updatePlanRung, deletePlanRung,
  setLadderActive, setRecommendedRung, planExperimentForBehavior,
  type AvoidanceBehavior,
  type TriggerSituation,
} from '../../../api/treatment'
import { clampDt, clampDtInput, getNextSchoolDayISO } from './shared'

/** Whether the situation shows under each rung. A display preference, so it lives in the browser
 *  rather than on the plan — it says how this clinician likes to read the list, not anything about
 *  the patient. Reads and writes are wrapped because storage throws outright in some browsers. */
const SHOW_SITUATIONS_KEY = 'float.ladder.showSituations'

function readShowSituations(): boolean {
  try {
    return window.localStorage.getItem(SHOW_SITUATIONS_KEY) !== '0'
  } catch {
    return true
  }
}

function writeShowSituations(on: boolean) {
  try {
    window.localStorage.setItem(SHOW_SITUATIONS_KEY, on ? '1' : '0')
  } catch {
    // A browser with storage blocked still gets the toggle for this visit.
  }
}

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
  const [showSituations, setShowSituations] = useState(readShowSituations)

  const { data: rungs, isLoading } = useQuery({
    queryKey: ['plan-rungs', planId],
    queryFn: () => getPlanRungs(planId),
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
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
            Start with the easiest
            {' · '}
            <button
              onClick={() => { const next = !showSituations; setShowSituations(next); writeShowSituations(next) }}
              title={showSituations ? 'Stop showing which situation each rung belongs to' : 'Show which situation each rung belongs to'}
              className="cursor-pointer bg-transparent border-none underline"
              style={{ fontSize: '11px', color: '#94a3b8', padding: 0 }}
            >
              {showSituations ? 'Hide situations' : 'Show situations'}
            </button>
          </div>
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
            {ladderActive ? 'Patient can view' : 'Patient cannot view'}
          </button>
          {/* The conversation is how a ladder gets built with the child. It hangs off this view. */}
          {onStartConversation && (
            <button onClick={onStartConversation} className="cursor-pointer"
              style={{ fontSize: '12px', fontWeight: 700, color: '#fff', background: 'var(--float-primary)', border: '1px solid var(--float-primary)', borderRadius: '999px', padding: '5px 12px' }}>
              ▸ Build ladder
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
          {/* Names the number column. Lined up with each row's score box: the row's padding plus
              border is 14px, and the two controls after the score are fixed at 64px and 16px. */}
          {ordered.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '10px', padding: '0 14px', marginBottom: '-2px' }}>
              <span style={{ flex: 1 }} />
              <span style={{ width: '46px', flexShrink: 0, textAlign: 'center', fontSize: '9.5px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#64748b', lineHeight: 1.15 }}>Fear Level</span>
              <span style={{ width: '64px', flexShrink: 0 }} />
              <span style={{ width: '16px', flexShrink: 0 }} />
            </div>
          )}
          {ordered.map(r => (
            <LadderRow
              key={r.id}
              planId={planId}
              rung={r}
              triggers={triggers}
              isRecommended={recommendedRungId === r.id}
              showSituation={showSituations}
              onRecommend={() => recommendMut.mutate(recommendedRungId === r.id ? null : r.id)}
            />
          ))}
          {!isLoading && ordered.length === 0 && (
            <div style={{ fontSize: '12.5px', color: '#94a3b8', padding: '8px 2px' }}>
              Nothing on the ladder yet — use “Build ladder”.
            </div>
          )}
        </div>
      </div>

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
  showSituation,
  onRecommend,
}: {
  planId: string
  rung: AvoidanceBehavior
  triggers: TriggerSituation[]
  isRecommended: boolean
  /** Off hides the second line. The "Do this next" badge still shows — that is not a label, it is
   *  what the patient has been told to do. */
  showSituation: boolean
  onRecommend: () => void
}) {
  const qc = useQueryClient()
  const [editingName, setEditingName] = useState(false)
  const [draft, setDraft] = useState(rung.name)
  const [planning, setPlanning] = useState(false)
  const [planDate, setPlanDate] = useState(getNextSchoolDayISO())
  const [planned, setPlanned] = useState(false)
  // Peter, 2026-09-05: one button to plan the exposure, and telling the patient to do this one
  // next is an option inside it — not a second button competing for the same row.
  const [wantNext, setWantNext] = useState(isRecommended)
  const [confirmRemove, setConfirmRemove] = useState(false)

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
    const agree = () => {
      if (wantNext !== isRecommended) onRecommend()
      if (planned) { setPlanning(false); return }
      planMut.mutate()
    }
    return (
      <div style={{ background: '#fff', border: '1px solid var(--float-primary)', borderRadius: '10px', padding: '12px 13px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>When will they do &ldquo;{rung.name}&rdquo;?</div>
        <p style={{ fontSize: '11.5px', color: '#64748b', margin: '4px 0 10px' }}>
          They fill in what they think will happen when they open their app.
        </p>
        {planned ? (
          <p style={{ fontSize: '12px', color: '#3f8a78', margin: '0 0 10px', fontWeight: 600 }}>Already planned.</p>
        ) : (
          <input type="date" value={planDate} onChange={e => setPlanDate(e.target.value)}
            className="text-sm border border-slate-200 rounded" style={{ padding: '5px 8px', marginBottom: '10px' }} />
        )}

        {/* Advice, not a lock — the child can still pick any rung. Only one rung can carry it, so
            ticking this here takes it off whichever rung had it. */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', color: '#475569', cursor: 'pointer', marginBottom: '12px' }}>
          <input type="checkbox" checked={wantNext} onChange={e => setWantNext(e.target.checked)} style={{ cursor: 'pointer' }} />
          Tell them to do this one next
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={agree} disabled={planMut.isPending}
            className="bg-teal-600 text-white rounded text-xs font-medium border-none cursor-pointer disabled:opacity-50"
            style={{ padding: '6px 12px' }}>{planMut.isPending ? 'Saving…' : planned ? 'Save' : 'Agree it'}</button>
          <button onClick={() => { setWantNext(isRecommended); setPlanning(false) }} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div className="group" style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 13px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
          style={{ flex: '0 1 auto', minWidth: 0, fontWeight: 600, textAlign: 'left', padding: 0, cursor: 'text' }}
        >
          {rung.name}
        </button>
      )}

      {/* Carries the eye from the step to its score, so the two read as one thing however wide
          the row is — and the scores still line up in a column you can read down. */}
      <span aria-hidden="true" style={{ flex: 1, minWidth: 12, alignSelf: 'flex-end', marginBottom: 7, borderBottom: '1px dotted #dde8e6' }} />

      <input
        type="number" min="1" max="10"
        value={rung.distress_thermometer_when_refraining ?? ''}
        onChange={e => { const v = clampDt(clampDtInput(e.target.value)); if (v) saveMut.mutate({ distress_thermometer_when_refraining: v }) }}
        title="Fear Level, 1–10"
        className="text-sm border border-slate-200 rounded"
        style={{ width: '46px', padding: '4px 6px', textAlign: 'center', flexShrink: 0, fontWeight: 700 }} />

      {/* One button. Planning the exposure and telling them to do it next are the same decision,
          made in the same place — and it is always on screen. It used to appear on hover, which
          hid the main thing you come to this row to do. */}
      <button
        onClick={() => { setWantNext(isRecommended); setPlanning(true) }}
        title={planned ? 'Change the plan for this one' : 'Agree an exposure on this one'}
        className="cursor-pointer"
        style={{
          fontSize: '11px', fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap',
          // Fixed width so every row's score sits in the same column, under the Fear Level heading.
          width: '64px', textAlign: 'center',
          borderRadius: '999px', padding: '3px 0',
          color: '#3f8a78',
          background: planned ? '#eef7f4' : '#fff',
          border: `1px solid ${planned ? '#bcdfd4' : '#e2e8f0'}`,
        }}>
        {planned ? 'Planned' : 'Plan it'}
      </button>

      {/* Asks first. A rung is a sentence somebody wrote with a child in the room, and the × sat
          one stray click away from taking it. */}
      {confirmRemove ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: '11px', color: '#64748b' }}>Remove?</span>
          <button onClick={() => delMut.mutate()} disabled={delMut.isPending}
            className="bg-transparent border-none cursor-pointer disabled:opacity-50"
            style={{ fontSize: '11px', fontWeight: 700, color: '#dc2626', padding: 0 }}>Yes, remove</button>
          <button onClick={() => setConfirmRemove(false)}
            className="bg-transparent border-none cursor-pointer"
            style={{ fontSize: '11px', color: '#94a3b8', padding: 0 }}>Cancel</button>
        </span>
      ) : (
        <button onClick={() => setConfirmRemove(true)} title="Remove rung"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer"
          style={{ fontSize: '14px', padding: 0, width: '16px', textAlign: 'center', flexShrink: 0 }}>×</button>
      )}
      </div>

      {/* Underneath, not beside. On the main line the situation was the thing that got truncated,
          and it competed with the step's own wording for the width. Here it has the whole row and
          it reads as part of the step rather than another column. */}
      {((sit && showSituation) || isRecommended) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginTop: '3px' }}>
          {isRecommended && (
            <span style={{ fontSize: '10px', fontWeight: 800, color: '#0d3d3a', background: '#eafaf6', border: '1px solid var(--float-primary)', borderRadius: '999px', padding: '1px 7px', flexShrink: 0 }}>
              Do this next
            </span>
          )}
          {sit && showSituation && <span style={{ fontSize: '11px', color: '#8fa5a1', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sit}</span>}
        </div>
      )}
    </div>
  )
}
