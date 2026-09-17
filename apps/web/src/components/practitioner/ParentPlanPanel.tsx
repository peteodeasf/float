import { btn } from '../../components/ui/buttons'
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listAccommodations,
  createAccommodation,
  updateAccommodation,
  deleteAccommodation,
  type Accommodation,
  type AccommodationState,
} from '../../api/accommodations'
import { getPatientInsights, addInsightToPlan, removeInsight } from '../../api/treatment'
import { Chrome } from '../../pages/practitioner/sessionKit'
import ParentConversationSheet from './ParentConversationSheet'
import ChildRatingSheet from './ChildRatingSheet'

type TriggerLite = { id: string; name: string }

const num = (v: string): number | null => {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Where the parent has got to with each one. Peter, 2026-09-13: "Working on it" is what the weekly
 *  focus was: the parent's home card and weekly check-in follow it. More than one can be.
 *  docs/plans/parent-accommodations-like-the-ladder.md */
const STATES: { key: AccommodationState; label: string; hint: string; color: string; bg: string }[] = [
  { key: 'not_started', label: 'Not started', hint: 'Not being worked on yet.', color: 'var(--float-text-secondary)', bg: 'var(--float-surface-sunken)' },
  { key: 'started', label: 'Working on it', hint: 'On the parent’s home screen, with a weekly check-in.', color: '#92400e', bg: '#fffbeb' },
  { key: 'stopped', label: 'Stopped', hint: 'The parent doesn’t do this any more.', color: '#166534', bg: '#f0fdf4' },
]

/** "5" for a single value, "5–9" for a range, null when there is none. */
function rangeLabel(lo: number | null | undefined, hi: number | null | undefined): string | null {
  if (lo == null && hi == null) return null
  if (lo != null && hi != null) return lo === hi ? `${lo}` : `${lo}–${hi}`
  return `${lo ?? hi}`
}

/** Easiest to stop first, like the exposure ladder. No Fear Level goes last. */
function byFearLevel(a: Accommodation, b: Accommodation): number {
  const mid = (x: Accommodation) => {
    const { distress_min: lo, distress_max: hi } = x
    if (lo == null && hi == null) return null
    return ((lo ?? hi)! + (hi ?? lo)!) / 2
  }
  const x = mid(a), y = mid(b)
  if (x == null && y == null) return a.created_at.localeCompare(b.created_at)
  if (x == null) return 1
  if (y == null) return -1
  return x - y || a.created_at.localeCompare(b.created_at)
}

/**
 * The parent's accommodation plan, on the Plan tab. Works like the exposure ladder (Peter,
 * 2026-09-13): the plan, easiest first, with Plan it on each; Build plan turns the same place into
 * the editor, where accommodations are added, rated with the child, changed and removed.
 * Tracking the parent's progress is on the Experiments tab (ParentProgressSection).
 * docs/plans/parent-accommodations-like-the-ladder.md
 */
export default function ParentPlanPanel({
  planId,
  patientId,
  triggers,
}: {
  planId: string
  patientId: string
  triggers: TriggerLite[]
}) {
  const qc = useQueryClient()
  const key = ['accommodations', planId]
  const { data: accommodations = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => listAccommodations(planId),
    enabled: !!planId,
  })
  const ordered = [...accommodations].sort(byFearLevel)
  const invalidate = () => qc.invalidateQueries({ queryKey: key })

  const [editing, setEditing] = useState(false)
  const [fullScreen, setFullScreen] = useState(false)
  const [askingParent, setAskingParent] = useState(false)
  const [ratingWithChild, setRatingWithChild] = useState(false)

  const save = (id: string, data: Parameters<typeof updateAccommodation>[2]) =>
    updateAccommodation(planId, id, data).then(invalidate)
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAccommodation(planId, id),
    // Deleting the row a suggestion made puts the suggestion back, so both lists are read again.
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ['insights'] }) },
  })

  const finish = () => { setEditing(false); setFullScreen(false) }

  const panelStyle: React.CSSProperties = {
    background: 'var(--float-surface)',
    borderRadius: 'var(--float-radius-card)',
    border: '1px solid var(--float-border-strong)',
    boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
    overflow: 'hidden',
    width: '100%',
    boxSizing: 'border-box',
  }
  const quietBtn: React.CSSProperties = {
    fontSize: '12px', fontWeight: 600, color: 'var(--float-primary)', background: 'var(--float-surface)',
    border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-sm)', padding: '7px 12px', cursor: 'pointer',
  }
  const primary: React.CSSProperties = {
    fontSize: '12px', fontWeight: 600, color: '#fff', background: 'var(--float-primary)',
    border: '1px solid var(--float-primary)', borderRadius: 'var(--float-radius-sm)', padding: '7px 12px', cursor: 'pointer',
  }

  const list = isLoading ? (
    <p style={{ fontSize: '13px', color: 'var(--float-text-hint)' }}>Loading…</p>
  ) : ordered.length === 0 ? (
    <div style={{ fontSize: '13px', color: 'var(--float-text-hint)', padding: '6px 0' }}>
      {editing ? 'Nothing on the plan yet. Add an accommodation below.' : 'Nothing on the plan yet — use “Build plan”.'}
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {ordered.map(a => (
        <AccommodationRow
          key={a.id}
          accommodation={a}
          triggers={triggers}
          editing={editing}
          onSave={data => save(a.id, data)}
          onDelete={() => deleteMut.mutate(a.id)}
        />
      ))}
    </div>
  )

  const editor = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button onClick={() => setAskingParent(true)} style={quietBtn}
          title="Ask the parent what they do, situation by situation, and type their answers">
          Ask the parent
        </button>
        {accommodations.length > 0 && (
          <button onClick={() => setRatingWithChild(true)} style={quietBtn}
            title="The child says how hard it would be if the parent stopped each one">
            Child ratings
          </button>
        )}
      </div>
      {list}
      <AddAccommodation planId={planId} patientId={patientId} triggers={triggers} onAdded={invalidate} />
      <button onClick={finish} style={{ ...primary, alignSelf: 'flex-start', fontSize: '13px', padding: '9px 16px' }}>
        Save plan →
      </button>
    </div>
  )

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 20px', borderBottom: '1px solid var(--float-border)' }}>
        <div>
          <div className="text-sm font-semibold text-slate-700">Parent Accommodations</div>
          <p style={{ fontSize: '12px', color: 'var(--float-text-hint)', margin: '2px 0 0', lineHeight: 1.5 }}>
            {editing ? 'Building the plan' : 'The plan for the parent to stop, easiest first'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flex: 'none' }}>
          {editing ? (
            <>
              <button onClick={finish} style={quietBtn}>← Back to the plan</button>
              <button onClick={() => setFullScreen(true)} style={quietBtn}>⛶ Full screen</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} style={primary}>▸ Build plan</button>
          )}
        </div>
      </div>

      {askingParent && <ParentConversationSheet patientId={patientId} onClose={() => setAskingParent(false)} />}
      {ratingWithChild && (
        <ChildRatingSheet planId={planId} accommodations={ordered}
          onClose={() => { setRatingWithChild(false); invalidate() }} />
      )}
      {/* For when the parent or child is looking at the screen. The same editor, bigger. */}
      {editing && fullScreen && createPortal(
        <div role="dialog" aria-modal="true" aria-label="Build the parent plan" style={{ position: 'fixed', inset: 0, zIndex: 900, overflowY: 'auto' }}>
          <Chrome onExit={() => setFullScreen(false)} exitLabel="⛶ Exit full screen">
            <div style={{ background: 'var(--float-surface)', border: '1px solid #dde8e6', borderRadius: 18, padding: '20px 22px' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--float-primary-dark)', marginBottom: 12 }}>Parent Accommodations</div>
              {editor}
            </div>
          </Chrome>
        </div>,
        document.body,
      )}

      <div style={{ padding: '16px 20px 20px' }}>
        {editing ? editor : list}
      </div>
    </div>
  )
}

/** + Add accommodation, and inside it the suggestions from monitoring. The same shape as the
 *  ladder's Add situation. */
function AddAccommodation({ planId, patientId, triggers, onAdded }: {
  planId: string
  patientId: string
  triggers: TriggerLite[]
  onAdded: () => void
}) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [situationId, setSituationId] = useState('')
  const [dmin, setDmin] = useState('')
  const [dmax, setDmax] = useState('')

  const insightsKey = ['insights', patientId, 'accommodation']
  const { data: suggestions = [] } = useQuery({
    queryKey: insightsKey,
    queryFn: () => getPatientInsights(patientId, 'accommodation'),
    enabled: !!patientId,
  })
  const createMut = useMutation({
    mutationFn: () => createAccommodation(planId, {
      name: name.trim(),
      trigger_situation_id: situationId || null,
      distress_min: num(dmin),
      // A single value entered as min is stored as min == max.
      distress_max: num(dmax) ?? num(dmin),
    }),
    onSuccess: () => { setName(''); setSituationId(''); setDmin(''); setDmax(''); onAdded() },
  })
  const takeMut = useMutation({
    mutationFn: (insightId: string) => addInsightToPlan(patientId, insightId),
    onSuccess: () => { onAdded(); qc.invalidateQueries({ queryKey: insightsKey }) },
  })
  const dropMut = useMutation({
    mutationFn: (insightId: string) => removeInsight(patientId, insightId),
    onSuccess: () => qc.invalidateQueries({ queryKey: insightsKey }),
  })

  const labelStyle: React.CSSProperties = { fontSize: '12px', fontWeight: 600, color: 'var(--float-text-secondary)', marginBottom: '4px', display: 'block' }
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', fontSize: '13px', color: 'var(--float-text)',
    border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-sm)', boxSizing: 'border-box',
  }

  if (!adding) {
    return (
      <button onClick={() => setAdding(true)}
        style={{ ...btn('secondary', 'md'), alignSelf: 'flex-start' }}>
        + Add accommodation
        {suggestions.length > 0 && (
          <span style={{ fontWeight: 500, color: '#9aa9a8' }}> · {suggestions.length} {suggestions.length === 1 ? 'suggestion' : 'suggestions'}</span>
        )}
      </button>
    )
  }

  return (
    <div style={{ background: '#f8fbfa', border: '1px solid #dbe8e5', borderRadius: '11px', padding: '14px 16px' }}>
      <label style={labelStyle} htmlFor="new-accommodation">New accommodation</label>
      <input id="new-accommodation" value={name} onChange={e => setName(e.target.value)} autoFocus
        onKeyDown={e => { if (e.key === 'Enter' && name.trim()) createMut.mutate() }}
        placeholder="e.g. Lies down with them at bedtime" style={{ ...inputStyle, marginBottom: '10px' }} />
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '2 1 200px' }}>
          <label style={labelStyle}>Situation (optional)</label>
          <select value={situationId} onChange={e => setSituationId(e.target.value)} style={inputStyle}>
            <option value="">No situation</option>
            {triggers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 80px' }}>
          <label style={labelStyle}>Fear Level min</label>
          <input type="number" min={0} max={10} value={dmin} onChange={e => setDmin(e.target.value)} placeholder="—" style={inputStyle} />
        </div>
        <div style={{ flex: '1 1 80px' }}>
          <label style={labelStyle}>Fear Level max</label>
          <input type="number" min={0} max={10} value={dmax} onChange={e => setDmax(e.target.value)} placeholder="—" style={inputStyle} />
        </div>
        <button onClick={() => createMut.mutate()} disabled={!name.trim() || createMut.isPending}
          style={{ flex: 'none', fontSize: '13px', fontWeight: 600, color: '#fff', background: 'var(--float-primary)', border: 'none', borderRadius: 'var(--float-radius-sm)', padding: '9px 16px', cursor: 'pointer', opacity: !name.trim() || createMut.isPending ? 0.5 : 1 }}>
          {createMut.isPending ? 'Adding…' : 'Add'}
        </button>
      </div>
      <p style={{ fontSize: '12px', color: 'var(--float-text-hint)', margin: '8px 0 0' }}>
        Leave Fear Level blank if unrated. Enter one value, or both for a range (e.g. 5–9).
      </p>

      {/* What the parent did, in their own words: from the monitoring log, and what they named in
          their app. Nothing reworded, nothing invented. Always shown, empty or not: an absent
          section reads as broken; "No suggestions" reads as an answer. */}
      <div style={{ marginTop: '16px', borderTop: '1px solid #e6efec', paddingTop: '14px' }}>
        <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#4d8478', marginBottom: '2px' }}>
          Suggestions from monitoring
        </div>
        {suggestions.length === 0 ? (
          <div style={{ fontSize: '12.5px', color: 'var(--float-text-hint)' }}>No suggestions.</div>
        ) : (<>
          <div style={{ fontSize: '11.5px', color: 'var(--float-text-hint)', marginBottom: '8px' }}>
            Tap to add it to the plan. Delete it there and it comes back here.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
            {suggestions.map(item => {
              const fromApp = !!item.named_by_parent || item.sources.includes('parent')
              const parentThinks = rangeLabel(item.parent_estimate_min, item.parent_estimate_max)
              return (
                <span key={item.id} style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--float-surface)', border: '1px solid #cfe0db', borderRadius: 'var(--float-radius-pill)', overflow: 'hidden' }}>
                  <button onClick={() => takeMut.mutate(item.id)} disabled={takeMut.isPending}
                    style={{ fontSize: '13px', fontWeight: 600, color: 'var(--float-primary)', background: 'transparent', border: 'none', padding: '8px 6px 8px 14px', cursor: 'pointer', textAlign: 'left' }}>
                    + {item.name}
                    <span style={{ fontWeight: 500, color: '#9aa9a8' }}>
                      {item.evidence_count > 0 && ` · ${item.evidence_count} ${item.evidence_count === 1 ? 'entry' : 'entries'}`}
                      {fromApp && ' · from the parent’s app'}
                      {item.parent_name ? ` · ${item.parent_name}` : ''}
                      {item.still_does === false ? ' · parent says not any more' : ''}
                      {parentThinks ? ` · parent thinks ${parentThinks}` : ''}
                    </span>
                  </button>
                  <button onClick={() => dropMut.mutate(item.id)} disabled={dropMut.isPending} title="Not relevant — take it off the list"
                    style={{ fontSize: '14px', color: '#c3d0cd', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 12px 0 4px' }}>&times;</button>
                </span>
              )
            })}
          </div>
        </>)}
      </div>

      <button onClick={() => { setAdding(false); setName(''); setSituationId(''); setDmin(''); setDmax('') }}
        style={{ ...btn('secondary', 'md'), marginTop: '14px' }}>
        Done adding
      </button>
    </div>
  )
}

/** One accommodation. On the plan: what it is, where the parent is with it, and Plan it. While
 *  building: its Fear Level can be changed and it can be removed. */
function AccommodationRow({ accommodation: a, triggers, editing, onSave, onDelete }: {
  accommodation: Accommodation
  triggers: TriggerLite[]
  editing: boolean
  onSave: (data: { distress_min?: number | null; distress_max?: number | null; status?: AccommodationState }) => Promise<unknown>
  onDelete: () => void
}) {
  const [planning, setPlanning] = useState(false)
  const [picked, setPicked] = useState<AccommodationState>(a.status)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [editingScore, setEditingScore] = useState(false)
  const [scoreDraft, setScoreDraft] = useState('')

  const situationName = triggers.find(t => t.id === a.trigger_situation_id)?.name ?? null
  const state = STATES.find(s => s.key === a.status) ?? STATES[0]
  const score = rangeLabel(a.distress_min, a.distress_max) ?? '—'
  const parentThinks = rangeLabel(a.parent_estimate_min, a.parent_estimate_max)

  /** "6" sets a single rating; "6-8" sets a range. Anything unreadable is left alone. */
  const saveScore = () => {
    setEditingScore(false)
    const raw = scoreDraft.trim()
    if (raw === '') {
      if (a.distress_min != null || a.distress_max != null) onSave({ distress_min: null, distress_max: null })
      return
    }
    const nums = raw.split(/[-–—]/).map(x => x.trim()).filter(Boolean).map(Number).filter(n => Number.isFinite(n) && n >= 0 && n <= 10)
    if (nums.length === 0) return
    const lo = Math.min(...nums), hi = Math.max(...nums)
    if (lo === a.distress_min && hi === a.distress_max) return
    onSave({ distress_min: lo, distress_max: hi })
  }

  if (planning) {
    return (
      <div style={{ background: 'var(--float-surface)', border: '1px solid var(--float-primary)', borderRadius: 'var(--float-radius)', padding: '14px 16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--float-text)', marginBottom: '10px' }}>
          Plan &ldquo;{a.name}&rdquo;
        </div>
        <div role="radiogroup" aria-label={`Where the parent is with “${a.name}”`} style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
          {STATES.map(s => (
            <label key={s.key} style={{ display: 'flex', alignItems: 'baseline', gap: '8px', fontSize: '13px', color: 'var(--float-text)', cursor: 'pointer' }}>
              <input type="radio" name={`state-${a.id}`} checked={picked === s.key} onChange={() => setPicked(s.key)} style={{ cursor: 'pointer' }} />
              <span style={{ fontWeight: 600 }}>{s.label}</span>
              <span style={{ fontSize: '12px', color: 'var(--float-text-hint)' }}>{s.hint}</span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={async () => { if (picked !== a.status) await onSave({ status: picked }); setPlanning(false) }}
            style={{ fontSize: '13px', fontWeight: 600, color: '#fff', background: 'var(--float-primary)', border: 'none', borderRadius: 'var(--float-radius-sm)', padding: '7px 14px', cursor: 'pointer' }}>Save</button>
          <button onClick={() => { setPicked(a.status); setPlanning(false) }}
            style={{ fontSize: '13px', color: 'var(--float-text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: '7px 8px' }}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--float-surface)', borderRadius: 'var(--float-radius)', padding: '12px 14px',
      border: `1px solid ${a.status === 'started' ? 'var(--float-primary)' : 'var(--float-border)'}`,
      display: 'flex', alignItems: 'center', gap: '12px',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--float-text)' }}>{a.name}</div>
        <div style={{ fontSize: '11px', color: 'var(--float-text-hint)' }}>
          {[situationName, parentThinks && `Parent thinks ${parentThinks}`].filter(Boolean).join(' · ')}
          {a.child_rated_at && (
            <span style={{ color: '#3f8a78', fontWeight: 600 }}>{situationName || parentThinks ? ' · ' : ''}rated by the child</span>
          )}
        </div>
      </div>
      {editing && editingScore ? (
        <input value={scoreDraft} autoFocus onChange={e => setScoreDraft(e.target.value)} onBlur={saveScore}
          onKeyDown={e => { if (e.key === 'Enter') saveScore(); if (e.key === 'Escape') setEditingScore(false) }}
          title="Type 6, or 6-8 for a range" aria-label={`Fear Level for “${a.name}”`}
          style={{ flex: 'none', width: '58px', textAlign: 'center', fontSize: '13px', fontWeight: 600, padding: '3px 6px', border: '1px solid var(--float-primary)', borderRadius: 'var(--float-radius-pill)' }} />
      ) : editing ? (
        <button onClick={() => { setScoreDraft(score === '—' ? '' : score); setEditingScore(true) }}
          title="Child's Fear Level if the parent stops. Click to change."
          style={{ flex: 'none', fontSize: '13px', fontWeight: 600, color: 'var(--float-primary-text)', background: 'var(--float-primary-light)', border: 'none', borderRadius: 'var(--float-radius-pill)', padding: '3px 10px', cursor: 'text' }}>
          {score}
        </button>
      ) : (
        <span title="Child's Fear Level if the parent stops"
          style={{ flex: 'none', fontSize: '13px', fontWeight: 600, color: 'var(--float-primary-text)', background: 'var(--float-primary-light)', borderRadius: 'var(--float-radius-pill)', padding: '3px 10px' }}>
          {score}
        </span>
      )}
      <span style={{ flex: 'none', width: '98px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: state.color, background: state.bg, borderRadius: 'var(--float-radius-pill)', padding: '3px 6px' }}>
        {state.label}
      </span>
      <button onClick={() => { setPicked(a.status); setPlanning(true) }} title="Where the parent is with stopping this"
        style={{ ...btn('secondary', 'sm'), flex: 'none' }}>
        Plan it
      </button>
      {editing && (confirmRemove ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 'none', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--float-text-hint)' }}>Remove?</span>
          <button onClick={onDelete} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--float-danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Yes, remove</button>
          <button onClick={() => setConfirmRemove(false)} style={{ fontSize: '11px', color: 'var(--float-text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Cancel</button>
        </span>
      ) : (
        <button onClick={() => setConfirmRemove(true)} title="Remove" aria-label={`Remove “${a.name}”`}
          style={{ flex: 'none', fontSize: '14px', color: 'var(--float-text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}>×</button>
      ))}
    </div>
  )
}
