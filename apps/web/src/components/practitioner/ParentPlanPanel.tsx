import { btn } from '../../components/ui/buttons'
import { useMemo, useState } from 'react'
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
import { getPatientInsights, addInsightToPlan, removeInsight, type PatientInsight } from '../../api/treatment'
import { Chrome } from '../../pages/practitioner/sessionKit'
import ChildRatingSheet from './ChildRatingSheet'

type TriggerLite = { id: string; name: string }

/** Where the parent has got to with each one. Peter, 2026-09-13: "Working on it" is what the weekly
 *  focus was: the parent's home card and weekly check-in follow it. More than one can be.
 *  docs/plans/parent-accommodations-like-the-ladder.md */
const STATES: { key: AccommodationState; label: string; hint: string; color: string; bg: string }[] = [
  { key: 'not_started', label: 'Not started', hint: 'Not being worked on yet.', color: 'var(--float-text-secondary)', bg: 'var(--float-surface-sunken)' },
  { key: 'started', label: 'Working on it', hint: 'On the parent’s home screen, with a weekly check-in.', color: 'var(--float-warning)', bg: 'var(--float-warning-bg)' },
  { key: 'stopped', label: 'Stopped', hint: 'The parent doesn’t do this any more.', color: 'var(--float-success)', bg: 'var(--float-success-bg)' },
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
 * The parent's accommodation plan, on the Plan tab. Built to work like the child's exposure ladder
 * (Peter, 2026-09-20): the situations (shared with the ladder) each with their accommodations under
 * them, added inline. The old "ask the parent" conversation stepper is gone.
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
  const ordered = useMemo(() => [...accommodations].sort(byFearLevel), [accommodations])
  const invalidate = () => qc.invalidateQueries({ queryKey: key })

  // Accommodations mined from monitoring, offered under their own situation.
  const { data: allSuggestions = [] } = useQuery({
    queryKey: ['insights', patientId, 'accommodation'],
    queryFn: () => getPatientInsights(patientId, 'accommodation'),
    enabled: !!patientId,
  })

  const [editing, setEditing] = useState(false)
  const [fullScreen, setFullScreen] = useState(false)
  const [ratingWithChild, setRatingWithChild] = useState(false)

  const save = (id: string, data: Parameters<typeof updateAccommodation>[2]) =>
    updateAccommodation(planId, id, data).then(invalidate)
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAccommodation(planId, id),
    // Deleting the row a suggestion made puts the suggestion back, so both lists are read again.
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ['insights'] }) },
  })

  const finish = () => { setEditing(false); setFullScreen(false) }

  // One section per situation (situations are shared with the ladder). In view mode only situations
  // that have accommodations show; in the editor every situation shows so you can add under each.
  // Anything whose situation is missing goes in "Other" so nothing is lost.
  const known = useMemo(() => new Set(triggers.map(t => t.id)), [triggers])
  // The monitoring suggestions that belong to a situation (null = its situation isn't on the plan).
  const suggFor = (sid: string | null) =>
    sid == null
      ? allSuggestions.filter(s => !s.situation_id || !known.has(s.situation_id))
      : allSuggestions.filter(s => s.situation_id === sid)
  const sections = useMemo(() => {
    const groups: { id: string | null; name: string; items: Accommodation[] }[] =
      triggers.map(t => ({ id: t.id, name: t.name, items: ordered.filter(a => a.trigger_situation_id === t.id) }))
    const orphanItems = ordered.filter(a => !a.trigger_situation_id || !known.has(a.trigger_situation_id))
    const orphanSugg = allSuggestions.filter(s => !s.situation_id || !known.has(s.situation_id))
    if (orphanItems.length || orphanSugg.length) groups.push({ id: null, name: 'Other', items: orphanItems })
    return groups
  }, [ordered, triggers, known, allSuggestions])
  const visibleSections = editing ? sections : sections.filter(s => s.items.length > 0)

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
  const sectionHeader: React.CSSProperties = {
    fontSize: '12.5px', fontWeight: 800, letterSpacing: '0.03em', color: 'var(--float-primary-dark)',
  }

  const body = isLoading ? (
    <p style={{ fontSize: '13px', color: 'var(--float-text-hint)' }}>Loading…</p>
  ) : triggers.length === 0 ? (
    <div style={{ fontSize: '13px', color: 'var(--float-text-hint)', padding: '6px 0', lineHeight: 1.5 }}>
      No situations yet. Add situations on the exposure ladder first — they appear here automatically.
    </div>
  ) : visibleSections.length === 0 ? (
    <div style={{ fontSize: '13px', color: 'var(--float-text-hint)', padding: '6px 0' }}>
      Nothing on the plan yet — use “Build plan”.
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {visibleSections.map(sec => (
        <div key={sec.id ?? 'other'}>
          <div style={sectionHeader}>{sec.name}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' }}>
            {sec.items.map(a => (
              <AccommodationRow
                key={a.id}
                accommodation={a}
                editing={editing}
                onSave={data => save(a.id, data)}
                onDelete={() => deleteMut.mutate(a.id)}
              />
            ))}
            {sec.items.length === 0 && (
              <p style={{ fontSize: '12.5px', color: 'var(--float-text-hint)', margin: '2px 0 0' }}>No accommodations here yet.</p>
            )}
          </div>
          {editing && (
            <>
              {sec.id && <AddAccommodationInline planId={planId} situationId={sec.id} onAdded={invalidate} />}
              <SituationSuggestions patientId={patientId} items={suggFor(sec.id)} onAdded={invalidate} />
            </>
          )}
        </div>
      ))}
    </div>
  )

  const editor = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      {accommodations.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setRatingWithChild(true)} style={quietBtn}
            title="The child says how hard it would be if the parent stopped each one">
            Child ratings
          </button>
        </div>
      )}
      {body}
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
            {editing ? 'Building the plan — accommodations under each situation' : 'What the parent does in each situation, easiest to stop first'}
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
        {editing ? editor : body}
      </div>
    </div>
  )
}

/** Add one accommodation under a situation. A required 1–10 difficulty, like a ladder rung's Fear
 *  Level. Stored as distress_min == distress_max. */
function AddAccommodationInline({ planId, situationId, onAdded }: {
  planId: string
  situationId: string
  onAdded: () => void
}) {
  const [name, setName] = useState('')
  const [level, setLevel] = useState('')
  const valid = name.trim() !== '' && /^([1-9]|10)$/.test(level.trim())

  const createMut = useMutation({
    mutationFn: () => {
      const v = Number(level)
      return createAccommodation(planId, { name: name.trim(), trigger_situation_id: situationId, distress_min: v, distress_max: v })
    },
    onSuccess: () => { setName(''); setLevel(''); onAdded() },
  })

  const inputStyle: React.CSSProperties = {
    padding: '8px 10px', fontSize: '13px', color: 'var(--float-text)',
    border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-sm)', boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '10px' }}>
      <input value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && valid) createMut.mutate() }}
        placeholder="Add an accommodation the parent does here…"
        style={{ ...inputStyle, flex: '1 1 260px' }} />
      <input type="number" min={1} max={10} value={level} onChange={e => setLevel(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && valid) createMut.mutate() }}
        title="How hard it would be for the child if the parent stopped, 1–10"
        placeholder="1–10" style={{ ...inputStyle, flex: 'none', width: '72px' }} />
      <button onClick={() => createMut.mutate()} disabled={!valid || createMut.isPending}
        style={{ flex: 'none', fontSize: '13px', fontWeight: 600, color: '#fff', background: 'var(--float-primary)', border: 'none', borderRadius: 'var(--float-radius-sm)', padding: '9px 16px', cursor: 'pointer', opacity: !valid || createMut.isPending ? 0.5 : 1 }}>
        {createMut.isPending ? 'Adding…' : 'Add'}
      </button>
    </div>
  )
}

/** The monitoring suggestions for one situation, offered to add to the plan. Tapping one promotes
 *  it; × takes it off the list. */
function SituationSuggestions({ patientId, items, onAdded }: {
  patientId: string
  items: PatientInsight[]
  onAdded: () => void
}) {
  const qc = useQueryClient()
  const insightsKey = ['insights', patientId, 'accommodation']
  const takeMut = useMutation({
    mutationFn: (insightId: string) => addInsightToPlan(patientId, insightId),
    onSuccess: () => { onAdded(); qc.invalidateQueries({ queryKey: insightsKey }) },
  })
  const dropMut = useMutation({
    mutationFn: (insightId: string) => removeInsight(patientId, insightId),
    onSuccess: () => qc.invalidateQueries({ queryKey: insightsKey }),
  })

  if (items.length === 0) return null

  return (
    <div style={{ marginTop: '10px' }}>
      <div style={{ fontSize: '11.5px', fontWeight: 700, color: '#4d8478', marginBottom: '6px' }}>
        From monitoring — tap to add
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
        {items.map(item => {
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
                  {parentThinks ? ` · parent thinks ${parentThinks}` : ''}
                </span>
              </button>
              <button onClick={() => dropMut.mutate(item.id)} disabled={dropMut.isPending} title="Not relevant — take it off the list"
                style={{ fontSize: '14px', color: '#c3d0cd', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 12px 0 4px' }}>&times;</button>
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** One accommodation. On the plan: what it is, where the parent is with it, and Plan it. While
 *  building: its Fear Level can be changed and it can be removed. */
function AccommodationRow({ accommodation: a, editing, onSave, onDelete }: {
  accommodation: Accommodation
  editing: boolean
  onSave: (data: { distress_min?: number | null; distress_max?: number | null; status?: AccommodationState }) => Promise<unknown>
  onDelete: () => void
}) {
  const [planning, setPlanning] = useState(false)
  const [picked, setPicked] = useState<AccommodationState>(a.status)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [editingScore, setEditingScore] = useState(false)
  const [scoreDraft, setScoreDraft] = useState('')

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
        {(parentThinks || a.child_rated_at) && (
          <div style={{ fontSize: '11px', color: 'var(--float-text-hint)' }}>
            {parentThinks && `Parent thinks ${parentThinks}`}
            {a.child_rated_at && (
              <span style={{ color: '#3f8a78', fontWeight: 600 }}>{parentThinks ? ' · ' : ''}rated by the child</span>
            )}
          </div>
        )}
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
      {/* Planning the parent's focus happens after the plan is built — not while editing it. */}
      {!editing && (
        <button onClick={() => { setPicked(a.status); setPlanning(true) }} title="Where the parent is with stopping this"
          style={{ ...btn('secondary', 'sm'), flex: 'none' }}>
          Plan it
        </button>
      )}
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
