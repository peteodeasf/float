import { Button } from '../../components/ui/primitives'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listAccommodations,
  createAccommodation,
  updateAccommodation,
  deleteAccommodation,
  listAccommodationNotes,
  type Accommodation,
  type AccommodationState,
} from '../../api/accommodations'
import { getPatientInsights, addInsightToPlan, removeInsight, type PatientInsight } from '../../api/treatment'
import { clampDtInput } from '../../pages/practitioner/patient/shared'
import { Chrome } from '../../pages/practitioner/sessionKit'
import ChildRatingSheet from './ChildRatingSheet'

type TriggerLite = { id: string; name: string }

/** Where the parent has got to with each one. "Working on it" is the weekly focus. */
const STATES: { key: AccommodationState; label: string; hint: string; color: string; bg: string }[] = [
  { key: 'not_started', label: 'Not started', hint: 'Not being worked on yet.', color: 'var(--float-text-secondary)', bg: 'var(--float-surface-sunken)' },
  { key: 'started', label: 'Working on it', hint: 'On the parent’s home screen, with a weekly check-in.', color: 'var(--float-warning)', bg: 'var(--float-warning-bg)' },
  { key: 'stopped', label: 'Stopped', hint: 'The parent doesn’t do this any more.', color: 'var(--float-success)', bg: 'var(--float-success-bg)' },
]

/** "5" single, "5–9" range, null when there is none. */
function rangeLabel(lo: number | null | undefined, hi: number | null | undefined): string | null {
  if (lo == null && hi == null) return null
  if (lo != null && hi != null) return lo === hi ? `${lo}` : `${lo}–${hi}`
  return `${lo ?? hi}`
}

/** A typed value as a whole 1–10 Fear Level, or null when blank/invalid. */
function toDt(raw: string): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  if (Number.isNaN(n)) return null
  return Math.min(10, Math.max(1, Math.round(n)))
}

/**
 * A Fear Level range: from–to, both 1–10. The child's distress if the parent stops can depend on
 * the context, so an accommodation carries a range, not a single number (Peter, 2026-09-21). "to"
 * is optional — leave it blank for a single value.
 */
function RangeInputs({ lo, hi, setLo, setHi, onCommit, commitOnBlur, labelFrom, labelTo }: {
  lo: string; hi: string
  setLo: (v: string) => void; setHi: (v: string) => void
  onCommit?: () => void
  /** Save on blur (editing a saved row); off for the add form, which commits on Add/Enter only. */
  commitOnBlur?: boolean
  labelFrom: string; labelTo: string
}) {
  const box: React.CSSProperties = {
    width: 42, flexShrink: 0, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--float-text)',
    padding: '5px 4px', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-control)', background: 'var(--float-surface)',
  }
  const onBlur = commitOnBlur ? onCommit : undefined
  const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') onCommit?.() }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
      <input type="number" min={1} max={10} value={lo} onChange={e => setLo(clampDtInput(e.target.value))} onBlur={onBlur} onKeyDown={onKey}
        aria-label={labelFrom} title="Fear Level from, 1–10" placeholder="–" style={box} />
      <span aria-hidden="true" style={{ color: 'var(--float-text-hint)', fontWeight: 700 }}>–</span>
      <input type="number" min={1} max={10} value={hi} onChange={e => setHi(clampDtInput(e.target.value))} onBlur={onBlur} onKeyDown={onKey}
        aria-label={labelTo} title="Fear Level to (optional), 1–10" placeholder="–" style={box} />
    </span>
  )
}

/** The from–to range for one accommodation, saved as soon as a valid "from" is entered. */
function RangeScore({ min, max, label, onSet }: {
  min: number | null; max: number | null; label: string
  onSet: (lo: number, hi: number) => void
}) {
  const [lo, setLo] = useState(min == null ? '' : String(min))
  const [hi, setHi] = useState(max == null ? '' : String(max))
  useEffect(() => { setLo(min == null ? '' : String(min)); setHi(max == null ? '' : String(max)) }, [min, max])
  const commit = () => {
    const l = toDt(lo)
    if (l == null) return
    const h = toDt(hi) ?? l
    const a = Math.min(l, h), b = Math.max(l, h)
    if (a !== min || b !== max) onSet(a, b)
  }
  return <RangeInputs lo={lo} hi={hi} setLo={setLo} setHi={setHi} onCommit={commit} commitOnBlur
    labelFrom={`Fear Level from for “${label}”`} labelTo={`Fear Level to for “${label}”`} />
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
 * The parent's accommodation plan, on the Plan tab. Built to look and work like the child's exposure
 * ladder (Peter, 2026-09-20): situation cards with a mint heading (shared with the ladder) and the
 * accommodations under each, added inline with a Fear Level. Same UI as the ladder builder.
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

  const { data: allSuggestions = [] } = useQuery({
    queryKey: ['insights', patientId, 'accommodation'],
    queryFn: () => getPatientInsights(patientId, 'accommodation'),
    enabled: !!patientId,
  })

  // The parent's "how did it go?" notes, newest first — show the latest under each accommodation.
  const { data: notes = [] } = useQuery({
    queryKey: ['accommodation-notes', planId],
    queryFn: () => listAccommodationNotes(planId),
    enabled: !!planId,
  })
  const latestNote = useMemo(() => {
    const m = new Map<string, string>()
    for (const n of notes) if (!m.has(n.accommodation_id)) m.set(n.accommodation_id, n.body)
    return m
  }, [notes])

  const [editing, setEditing] = useState(false)
  const [fullScreen, setFullScreen] = useState(false)
  const [ratingWithChild, setRatingWithChild] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const save = (id: string, data: Parameters<typeof updateAccommodation>[2]) =>
    updateAccommodation(planId, id, data).then(invalidate)
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAccommodation(planId, id),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ['insights'] }) },
  })
  const finish = () => { setEditing(false); setFullScreen(false) }

  const known = useMemo(() => new Set(triggers.map(t => t.id)), [triggers])
  // A suggestion with no plan situation (or one no longer on the plan) belongs to "Other".
  const isOrphan = (s: PatientInsight) => !s.situation_id || !known.has(s.situation_id)
  const suggFor = (sid: string | null) =>
    sid == null ? allSuggestions.filter(isOrphan) : allSuggestions.filter(s => s.situation_id === sid)
  const sections = useMemo(() => {
    const groups: { id: string | null; name: string; items: Accommodation[] }[] =
      triggers.map(t => ({ id: t.id, name: t.name, items: ordered.filter(a => a.trigger_situation_id === t.id) }))
    const orphanItems = ordered.filter(a => !a.trigger_situation_id || !known.has(a.trigger_situation_id))
    const orphanSugg = allSuggestions.filter(isOrphan)
    if (orphanItems.length || orphanSugg.length) groups.push({ id: null, name: 'Other', items: orphanItems })
    return groups
  }, [ordered, triggers, known, allSuggestions])
  const visibleSections = editing ? sections : sections.filter(s => s.items.length > 0)

  const panelStyle: React.CSSProperties = {
    background: 'var(--float-surface)', borderRadius: 'var(--float-radius-card)',
    border: '1px solid var(--float-border-strong)', boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
    overflow: 'hidden', width: '100%', boxSizing: 'border-box',
  }
  const quietBtn: React.CSSProperties = {
    fontSize: '12px', fontWeight: 600, color: 'var(--float-primary)', background: 'var(--float-surface)',
    border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-sm)', padding: '7px 12px', cursor: 'pointer',
  }
  const primary: React.CSSProperties = {
    fontSize: '12px', fontWeight: 600, color: '#fff', background: 'var(--float-primary)',
    border: '1px solid var(--float-primary)', borderRadius: 'var(--float-radius-sm)', padding: '7px 12px', cursor: 'pointer',
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {/* Names the number column, lined up over each row's score box. */}
      <div style={{ display: 'flex', gap: 10, marginBottom: -2, paddingRight: editing ? 24 : 130 }}>
        <span style={{ flex: 1 }} />
        <span style={{ width: editing ? 104 : 60, textAlign: 'center', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#4d8478', lineHeight: 1.15 }}>Fear Level</span>
      </div>
      {visibleSections.map(sec => (
        <SituationCard
          key={sec.id ?? 'other'}
          name={sec.name}
          collapsed={collapsed.has(sec.id ?? 'other')}
          onToggle={() => setCollapsed(prev => {
            const next = new Set(prev); const k = sec.id ?? 'other'
            next.has(k) ? next.delete(k) : next.add(k); return next
          })}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sec.items.map(a => (
              <AccommodationRow key={a.id} accommodation={a} editing={editing} note={latestNote.get(a.id) ?? null}
                onSave={data => save(a.id, data)} onDelete={() => deleteMut.mutate(a.id)} />
            ))}
            {sec.items.length === 0 && (
              <p style={{ fontSize: '12.5px', color: 'var(--float-text-hint)', margin: '2px 0' }}>No accommodations here yet.</p>
            )}
          </div>
          {editing && sec.id && <AddAccommodationInline planId={planId} situationId={sec.id} onAdded={invalidate} />}
          {editing && <SituationSuggestions patientId={patientId} items={suggFor(sec.id)} onAdded={invalidate} />}
        </SituationCard>
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
          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--float-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Accommodations</div>
          <p style={{ fontSize: '12px', color: 'var(--float-text-hint)', margin: '2px 0 0', lineHeight: 1.5 }}>
            {editing ? 'Building the plan — accommodations under each situation' : 'What the parent does, easiest to stop first'}
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
      {editing && fullScreen && createPortal(
        <div role="dialog" aria-modal="true" aria-label="Build the parent plan" style={{ position: 'fixed', inset: 0, zIndex: 900, overflowY: 'auto' }}>
          <Chrome onExit={() => setFullScreen(false)} exitLabel="⛶ Exit full screen">
            <div style={{ background: 'var(--float-surface)', border: '1px solid #dde8e6', borderRadius: 18, padding: '20px 22px' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--float-primary-dark)', marginBottom: 12 }}>Accommodations</div>
              {editor}
            </div>
          </Chrome>
        </div>,
        document.body,
      )}

      {/* When the full-screen editor is open it holds the live editor; don't mount a second copy
          underneath (it would keep its own input state). */}
      <div style={{ padding: '16px 20px 20px' }}>
        {fullScreen ? null : editing ? editor : body}
      </div>
    </div>
  )
}

/** A situation heading over its accommodations — the mint header + collapse of the ladder's
 *  situation card. The name is read-only here: situations are added and renamed on the ladder. */
function SituationCard({ name, collapsed, onToggle, children }: {
  name: string
  collapsed: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div style={{ background: 'var(--float-surface)', border: '1px solid #cfe0db', borderRadius: 'var(--float-radius-card)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px', background: 'var(--float-primary-light)', borderBottom: collapsed ? undefined : '1px solid #cfe0db' }}>
        <button onClick={onToggle} aria-expanded={!collapsed} title={collapsed ? 'Show its accommodations' : 'Collapse'}
          style={{ fontSize: 11, color: '#4d8478', width: 12, flexShrink: 0, background: 'none', border: 0, cursor: 'pointer', transform: collapsed ? 'none' : 'rotate(90deg)', transition: 'transform .12s' }}>▶</button>
        <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--float-primary-dark)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
      </div>
      {!collapsed && (
        <div style={{ background: 'var(--float-surface)', padding: '10px 8px 12px 24px' }}>
          <div style={{ borderLeft: '2px solid #dbeee8', paddingLeft: 14 }}>{children}</div>
        </div>
      )}
    </div>
  )
}

/** Add one accommodation under a situation: a name and a required 1–10 Fear Level. Same shape as
 *  the ladder's "Add step". Stored as distress_min == distress_max. */
function AddAccommodationInline({ planId, situationId, onAdded }: {
  planId: string
  situationId: string
  onAdded: () => void
}) {
  const [name, setName] = useState('')
  const [lo, setLo] = useState('')
  const [hi, setHi] = useState('')
  const minVal = toDt(lo)
  const valid = name.trim() !== '' && minVal != null

  const createMut = useMutation({
    mutationFn: () => {
      const l = minVal!
      const h = toDt(hi) ?? l
      return createAccommodation(planId, {
        name: name.trim(), trigger_situation_id: situationId,
        distress_min: Math.min(l, h), distress_max: Math.max(l, h),
      })
    },
    onSuccess: () => { setName(''); setLo(''); setHi(''); onAdded() },
  })

  const fieldStyle: React.CSSProperties = {
    border: '1px solid #dbe8e5', borderRadius: 'var(--float-radius-control)', padding: '8px 11px', fontSize: 13,
    background: 'var(--float-surface)', boxSizing: 'border-box',
  }

  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginTop: 10 }}>
      <input value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && valid) createMut.mutate() }}
        placeholder="e.g. lies down with them at bedtime"
        style={{ ...fieldStyle, flex: 1, minWidth: 0 }} />
      <RangeInputs lo={lo} hi={hi} setLo={setLo} setHi={setHi}
        onCommit={() => { if (valid) createMut.mutate() }}
        labelFrom="New accommodation Fear Level from" labelTo="New accommodation Fear Level to" />
      <Button kind="primary" size="sm" onClick={() => createMut.mutate()} disabled={!valid || createMut.isPending} style={{ flexShrink: 0 }}>
        Add
      </Button>
    </div>
  )
}

/** The monitoring suggestions for one situation. Tapping one promotes it; × takes it off the list. */
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
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11.5, fontWeight: 700, color: '#4d8478', marginBottom: 6 }}>From monitoring — tap to add</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {items.map(item => {
          const fromApp = !!item.named_by_parent || item.sources.includes('parent')
          const parentThinks = rangeLabel(item.parent_estimate_min, item.parent_estimate_max)
          return (
            <span key={item.id} style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--float-surface)', border: '1px solid #cfe0db', borderRadius: 'var(--float-radius-pill)', overflow: 'hidden' }}>
              <button onClick={() => takeMut.mutate(item.id)} disabled={takeMut.isPending}
                style={{ fontSize: 13, fontWeight: 600, color: 'var(--float-primary)', background: 'transparent', border: 'none', padding: '8px 6px 8px 14px', cursor: 'pointer', textAlign: 'left' }}>
                + {item.name}
                <span style={{ fontWeight: 500, color: '#9aa9a8' }}>
                  {item.evidence_count > 0 && ` · ${item.evidence_count} ${item.evidence_count === 1 ? 'entry' : 'entries'}`}
                  {fromApp && ' · from the parent’s app'}
                  {item.parent_name ? ` · ${item.parent_name}` : ''}
                  {parentThinks ? ` · parent thinks ${parentThinks}` : ''}
                </span>
              </button>
              <button onClick={() => dropMut.mutate(item.id)} disabled={dropMut.isPending} title="Not relevant — take it off the list"
                style={{ fontSize: 14, color: '#c3d0cd', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 12px 0 4px' }}>&times;</button>
            </span>
          )
        })}
      </div>
    </div>
  )
}

/** One accommodation, styled like a ladder step. Building: rename, score, remove. Saved (view):
 *  the score, where the parent is with it, and Plan it. */
function AccommodationRow({ accommodation: a, editing, note, onSave, onDelete }: {
  accommodation: Accommodation
  editing: boolean
  /** The parent's latest "how did it go?" note on this accommodation, if any. */
  note?: string | null
  onSave: (data: { name?: string; distress_min?: number | null; distress_max?: number | null; status?: AccommodationState }) => Promise<unknown>
  onDelete: () => void
}) {
  const [planning, setPlanning] = useState(false)
  const [picked, setPicked] = useState<AccommodationState>(a.status)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [draft, setDraft] = useState(a.name)

  const state = STATES.find(s => s.key === a.status) ?? STATES[0]
  const score = rangeLabel(a.distress_min, a.distress_max) ?? '–'
  const parentThinks = rangeLabel(a.parent_estimate_min, a.parent_estimate_max)

  const rename = () => {
    const next = draft.trim()
    setEditingName(false)
    if (next && next !== a.name) onSave({ name: next })
    else setDraft(a.name)
  }

  if (planning) {
    return (
      <div style={{ background: 'var(--float-surface)', border: '1px solid var(--float-primary)', borderRadius: 'var(--float-radius-card)', padding: '14px 16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--float-text)', marginBottom: '10px' }}>Plan &ldquo;{a.name}&rdquo;</div>
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
    <div style={{ background: 'var(--float-surface)', border: `1px solid ${a.status === 'started' ? 'var(--float-primary)' : '#e6efec'}`, borderRadius: 'var(--float-radius-card)', padding: '8px 6px 8px 11px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {editing && editingName ? (
        <input value={draft} autoFocus onChange={e => setDraft(e.target.value)} onBlur={rename}
          onKeyDown={e => { if (e.key === 'Enter') rename(); if (e.key === 'Escape') { setDraft(a.name); setEditingName(false) } }}
          style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--float-text)', padding: '3px 5px', border: '1px solid #cfe3de', borderRadius: 'var(--float-radius-control)' }} />
      ) : editing ? (
        <button onClick={() => { setDraft(a.name); setEditingName(true) }} title="Change the wording"
          style={{ flex: '0 1 auto', minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'text', fontSize: 13, fontWeight: 600, color: 'var(--float-text)' }}>
          {a.name}
        </button>
      ) : (
        <span style={{ flex: '0 1 auto', minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--float-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
      )}

      <span aria-hidden="true" style={{ flex: 1, minWidth: 12, alignSelf: 'flex-end', marginBottom: 5, borderBottom: '1px dotted #dde8e6' }} />

      {editing ? (
        <RangeScore min={a.distress_min ?? null} max={a.distress_max ?? null} label={a.name}
          onSet={(loN, hiN) => onSave({ distress_min: loN, distress_max: hiN })} />
      ) : (
        <span title="Child's Fear Level if the parent stops — a range, since it depends on the context"
          style={{ flexShrink: 0, minWidth: 48, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--float-primary-text)', background: 'var(--float-primary-light)', borderRadius: 'var(--float-radius-pill)', padding: '3px 12px', whiteSpace: 'nowrap' }}>
          {score}
        </span>
      )}

      {!editing && (
        <>
          <span style={{ flexShrink: 0, width: 96, textAlign: 'center', fontSize: 11, fontWeight: 700, color: state.color, background: state.bg, borderRadius: 'var(--float-radius-pill)', padding: '3px 6px' }}>{state.label}</span>
          <button onClick={() => { setPicked(a.status); setPlanning(true) }} title="Where the parent is with stopping this"
            style={{ fontSize: 11, fontWeight: 700, flexShrink: 0, whiteSpace: 'nowrap', width: 64, textAlign: 'center', borderRadius: 'var(--float-radius-pill)', padding: '3px 0', color: '#3f8a78', background: 'var(--float-surface)', border: '1px solid var(--float-border)', cursor: 'pointer' }}>
            Plan it
          </button>
        </>
      )}

      {!editing && parentThinks && (
        <span style={{ flexShrink: 0, fontSize: 10.5, color: 'var(--float-text-hint)' }} title="What the parent estimated">≈{parentThinks}</span>
      )}

      {editing && (confirmRemove ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--float-text-hint)' }}>Remove?</span>
          <button onClick={onDelete} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--float-danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Yes, remove</button>
          <button onClick={() => setConfirmRemove(false)} style={{ fontSize: '11px', color: 'var(--float-text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Cancel</button>
        </span>
      ) : (
        <button onClick={() => setConfirmRemove(true)} title="Take this out" aria-label={`Remove “${a.name}”`}
          style={{ fontSize: 14, lineHeight: 1, color: '#cbd8d6', background: 'none', border: 0, cursor: 'pointer', flexShrink: 0, width: 16, padding: 0, textAlign: 'center' }}>×</button>
      ))}
      </div>
      {!editing && note && (
        <div style={{ marginTop: 7, fontSize: 12.5, color: 'var(--float-text-secondary)', lineHeight: 1.4 }}>
          <span style={{ fontWeight: 700, color: 'var(--float-text-hint)' }}>Parent: </span>“{note}”
        </div>
      )}
    </div>
  )
}
