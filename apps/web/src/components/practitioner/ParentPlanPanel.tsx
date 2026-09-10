import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listAccommodations,
  createAccommodation,
  updateAccommodation,
  deleteAccommodation,
  reorderAccommodations,
  reseedAccommodations,
  listAccommodationMoments,
  type Accommodation,
} from '../../api/accommodations'
import { getPatientInsights, addInsightToPlan, removeInsight } from '../../api/treatment'

type TriggerLite = { id: string; name: string }

const num = (v: string): number | null => {
  if (v.trim() === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** "5" when min == max, "5–9" for a range, "—" when unrated. */
function distressLabel(a: Accommodation): string {
  const { distress_min: lo, distress_max: hi } = a
  if (lo == null && hi == null) return '—'
  if (lo != null && hi != null) return lo === hi ? `${lo}` : `${lo}–${hi}`
  return `${lo ?? hi}`
}

/**
 * Therapist-facing manager for a child's parent-accommodation ladder.
 *
 * The parent ladder is per-child (one flat list per plan), so this sits
 * alongside the situations/behaviors editor rather than nesting in a situation.
 * Distinct from the child's avoidance/safety behaviors.
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

  const { data: moments = [] } = useQuery({
    queryKey: ['accommodation-moments', planId],
    queryFn: () => listAccommodationMoments(planId),
    enabled: !!planId,
  })

  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [situationId, setSituationId] = useState('')
  const [dmin, setDmin] = useState('')
  const [dmax, setDmax] = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: key })

  const createMut = useMutation({
    mutationFn: () =>
      createAccommodation(planId, {
        name: name.trim(),
        trigger_situation_id: situationId || null,
        distress_min: num(dmin),
        // A single value entered as min → store as min == max.
        distress_max: num(dmax) ?? num(dmin),
      }),
    onSuccess: () => {
      setName('')
      setSituationId('')
      setDmin('')
      setDmax('')
      invalidate()
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAccommodation(planId, id),
    // Adding is the only thing that takes a suggestion off the list, so deleting the row it
    // created is the way back. The database already does this; the list has to be re-read to
    // show it.
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ['insights'] }) },
  })

  const reorderMut = useMutation({
    mutationFn: (orderedIds: string[]) => reorderAccommodations(planId, orderedIds),
    onSuccess: invalidate,
  })

  const reseedMut = useMutation({
    mutationFn: () => reseedAccommodations(planId),
    onSuccess: invalidate,
  })

  // Drag to reorder. HTML5 drag and drop rather than a library: one list, short rows, and the
  // whole interaction is pick up, move, drop.
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const dropOn = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return }
    const ids = accommodations.map(a => a.id)
    const from = ids.indexOf(dragId)
    const to = ids.indexOf(targetId)
    if (from < 0 || to < 0) { setDragId(null); setOverId(null); return }
    ids.splice(to, 0, ids.splice(from, 1)[0])
    reorderMut.mutate(ids)
    setDragId(null)
    setOverId(null)
  }

  const move = (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= accommodations.length) return
    const ids = accommodations.map(a => a.id)
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    reorderMut.mutate(ids)
  }

  const insightsKey = ['insights', patientId, 'accommodation']
  const { data: fromMonitoring = [] } = useQuery({
    queryKey: insightsKey,
    queryFn: () => getPatientInsights(patientId, 'accommodation'),
    enabled: !!patientId,
  })
  const takeMut = useMutation({
    mutationFn: (insightId: string) => addInsightToPlan(patientId, insightId),
    onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: insightsKey }) },
  })
  const dropMut = useMutation({
    mutationFn: (insightId: string) => removeInsight(patientId, insightId),
    onSuccess: () => qc.invalidateQueries({ queryKey: insightsKey }),
  })

  // The panel is one white card, matching Treatment Plan. So the add form is a sunken block inside
  // it rather than a second white card on top of a white card.
  const panelStyle: React.CSSProperties = {
    background: '#ffffff',
    borderRadius: '12px',
    border: '1px solid #cbd5e1',
    boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
    overflow: 'hidden',
    width: '100%',
    boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    color: 'var(--float-text-secondary)',
    marginBottom: '4px',
    display: 'block',
  }
  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    fontSize: '13px',
    color: 'var(--float-text)',
    border: '1px solid var(--float-border)',
    borderRadius: 'var(--float-radius-sm)',
    boxSizing: 'border-box',
  }

  return (
    <div style={panelStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 20px', borderBottom: '1px solid var(--float-border)' }}>
        <div>
          <div className="text-sm font-semibold text-slate-700">Parent Accommodations</div>
          <p style={{ fontSize: '12px', color: 'var(--float-text-hint)', margin: '2px 0 0', lineHeight: 1.5 }}>
            Create a plan for parents to reduce accommodation behaviors
          </p>
        </div>
        {accommodations.length > 1 && (
          <button
            onClick={() => reseedMut.mutate()}
            disabled={reseedMut.isPending}
            style={{
              flex: 'none',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--float-primary)',
              background: 'var(--float-primary-light)',
              border: '1px solid var(--float-primary-mid)',
              borderRadius: 'var(--float-radius-sm)',
              padding: '7px 12px',
              cursor: 'pointer',
            }}
          >
            {reseedMut.isPending ? 'Sorting…' : 'Sort by distress'}
          </button>
        )}
      </div>

      <div style={{ padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>

      {/* What is on the ladder, first. This is the thing you came to look at. */}
      {isLoading ? (
        <p style={{ fontSize: '13px', color: 'var(--float-text-hint)' }}>Loading…</p>
      ) : accommodations.length === 0 ? null : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {accommodations.map((a, i) => (
            <AccommodationRow
              key={a.id}
              accommodation={a}
              index={i}
              total={accommodations.length}
              triggers={triggers}
              onMove={move}
              dragging={dragId === a.id}
              dropTarget={overId === a.id && dragId !== null && dragId !== a.id}
              onDragStart={() => setDragId(a.id)}
              onDragOver={() => setOverId(a.id)}
              onDragEnd={() => { setDragId(null); setOverId(null) }}
              onDrop={() => dropOn(a.id)}
              onDelete={() => deleteMut.mutate(a.id)}
              onSave={(data) => updateAccommodation(planId, a.id, data).then(invalidate)}
            />
          ))}
        </div>
      )}

      {/* Adding, the same shape as the ladder's Add situation: a button that opens one panel with
          the form and this child's own monitoring suggestions inside it. */}
      {adding ? (
        <div style={{ background: '#f8fbfa', border: '1px solid #dbe8e5', borderRadius: '11px', padding: '14px 16px' }}>
          <label style={labelStyle}>New accommodation</label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === 'Enter' && name.trim()) createMut.mutate() }}
            placeholder="e.g. Lies down with them at bedtime"
            style={{ ...inputStyle, marginBottom: '10px' }}
          />
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: '2 1 200px' }}>
              <label style={labelStyle}>Situation (optional)</label>
              <select value={situationId} onChange={e => setSituationId(e.target.value)} style={inputStyle}>
                <option value="">No situation</option>
                {triggers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: '1 1 80px' }}>
              <label style={labelStyle}>Fear Level min</label>
              <input type="number" min={0} max={10} value={dmin}
                onChange={e => setDmin(e.target.value)} placeholder="—" style={inputStyle} />
            </div>
            <div style={{ flex: '1 1 80px' }}>
              <label style={labelStyle}>Fear Level max</label>
              <input type="number" min={0} max={10} value={dmax}
                onChange={e => setDmax(e.target.value)} placeholder="—" style={inputStyle} />
            </div>
            <button
              onClick={() => createMut.mutate()}
              disabled={!name.trim() || createMut.isPending}
              style={{
                flex: 'none', fontSize: '13px', fontWeight: 600, color: '#fff',
                background: 'var(--float-primary)', border: 'none',
                borderRadius: 'var(--float-radius-sm)', padding: '9px 16px', cursor: 'pointer',
                opacity: !name.trim() || createMut.isPending ? 0.5 : 1,
              }}
            >
              {createMut.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--float-text-hint)', margin: '8px 0 0' }}>
            Leave Fear Level blank if unrated. Enter one value, or both for a range (e.g. 5–9).
          </p>

          {/* What the parent actually did, in their own words, with the dated entries behind it.
              Nothing is reworded and nothing is invented. White until added — once added it is a
              row above, and that is what the mint means. */}
          {/* Always shown, empty or not. An absent section reads as broken; "No suggestions" reads
              as an answer. */}
          <div style={{ marginTop: '16px', borderTop: '1px solid #e6efec', paddingTop: '14px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#4d8478', marginBottom: '2px' }}>
                From the monitoring log
              </div>
              {fromMonitoring.length === 0 ? (
                <div style={{ fontSize: '12.5px', color: 'var(--float-text-hint)' }}>No suggestions.</div>
              ) : (<>
              <div style={{ fontSize: '11.5px', color: 'var(--float-text-hint)', marginBottom: '8px' }}>
                Tap to add it above. Delete it there and it comes back here.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '7px' }}>
                {fromMonitoring.map(item => (
                  <span key={item.id} style={{ display: 'inline-flex', alignItems: 'center', background: '#fff', border: '1px solid #cfe0db', borderRadius: '999px', overflow: 'hidden' }}>
                    <button
                      onClick={() => takeMut.mutate(item.id)}
                      disabled={takeMut.isPending}
                      style={{ fontSize: '13px', fontWeight: 600, color: '#135450', background: 'transparent', border: 'none', padding: '8px 6px 8px 14px', cursor: 'pointer', textAlign: 'left' }}
                    >
                      + {item.name}
                      <span style={{ fontWeight: 500, color: '#9aa9a8' }}>
                        {' '}&middot; {item.evidence_count} {item.evidence_count === 1 ? 'entry' : 'entries'}
                        {item.parent_name ? ` \u00b7 ${item.parent_name}` : ''}
                      </span>
                    </button>
                    <button
                      onClick={() => dropMut.mutate(item.id)}
                      disabled={dropMut.isPending}
                      title="Not relevant — take it off the list"
                      style={{ fontSize: '14px', color: '#c3d0cd', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 12px 0 4px' }}
                    >&times;</button>
                  </span>
                ))}
              </div>
              </>)}
          </div>

          <button
            onClick={() => { setAdding(false); setName(''); setSituationId(''); setDmin(''); setDmax('') }}
            style={{ marginTop: '14px', fontSize: '13px', fontWeight: 700, color: '#135450', background: '#fff', border: '1px solid #cfe0db', borderRadius: '999px', padding: '8px 16px', cursor: 'pointer' }}
          >
            Done adding
          </button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{ alignSelf: 'flex-start', fontSize: '13px', fontWeight: 700, color: '#135450', background: '#fff', border: '1px solid #cfe0db', borderRadius: '999px', padding: '9px 16px', cursor: 'pointer' }}
        >
          + Add accommodation
          {fromMonitoring.length > 0 && (
            <span style={{ fontWeight: 500, color: '#9aa9a8' }}> · {fromMonitoring.length} from monitoring</span>
          )}
        </button>
      )}

      {moments.length > 0 && (
        <div>
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--float-text)', marginBottom: '8px' }}>
            Recent parent logs
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {moments.slice(0, 12).map(m => (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '13px',
                  background: 'var(--float-surface)',
                  border: '1px solid var(--float-border)',
                  borderRadius: 'var(--float-radius-sm)',
                  padding: '8px 12px',
                }}
              >
                <span
                  style={{
                    flex: 'none',
                    fontSize: '11px',
                    fontWeight: 700,
                    borderRadius: '999px',
                    padding: '2px 8px',
                    background: m.held ? '#eafaf6' : '#fef2f2',
                    color: m.held ? 'var(--float-primary)' : '#b91c1c',
                  }}
                >
                  {m.held ? 'Held' : 'Gave in'}
                </span>
                <span style={{ flex: 1, minWidth: 0, color: 'var(--float-text)' }}>
                  {m.accommodation_name ?? 'An accommodation'}
                  {m.note && <span style={{ color: 'var(--float-text-hint)' }}> — “{m.note}”</span>}
                </span>
                {m.created_at && (
                  <span style={{ flex: 'none', fontSize: '12px', color: 'var(--float-text-hint)' }}>
                    {new Date(m.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}

function AccommodationRow({
  accommodation: a,
  index,
  total,
  triggers,
  onMove,
  dragging,
  dropTarget,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  onDelete,
  onSave,
}: {
  accommodation: Accommodation
  index: number
  total: number
  triggers: TriggerLite[]
  /** Kept for the keyboard: dragging is a mouse gesture and cannot be the only way to reorder. */
  onMove: (index: number, dir: -1 | 1) => void
  dragging: boolean
  dropTarget: boolean
  onDragStart: () => void
  onDragOver: () => void
  onDragEnd: () => void
  onDrop: () => void
  onDelete: () => void
  onSave: (data: { name?: string; trigger_situation_id?: string | null; distress_min?: number | null; distress_max?: number | null; is_weekly_focus?: boolean }) => Promise<unknown>
}) {
  const [planning, setPlanning] = useState(false)
  const [wantFocus, setWantFocus] = useState(a.is_weekly_focus)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [editingScore, setEditingScore] = useState(false)
  const [scoreDraft, setScoreDraft] = useState('')

  const situationName = triggers.find(t => t.id === a.trigger_situation_id)?.name ?? null

  /** "6" sets a single rating; "6-8" sets a range. The same two shapes the add form describes.
   *  Anything unreadable is left alone rather than guessed at. */
  const saveScore = () => {
    setEditingScore(false)
    const raw = scoreDraft.trim()
    if (raw === '') {
      if (a.distress_min != null || a.distress_max != null) onSave({ distress_min: null, distress_max: null })
      return
    }
    const parts = raw.split(/[-–—]/).map(x => x.trim()).filter(x => x !== '')
    const nums = parts.map(Number).filter(n => Number.isFinite(n) && n >= 0 && n <= 10)
    if (nums.length === 0) return
    const lo = Math.min(...nums)
    const hi = Math.max(...nums)
    if (lo === a.distress_min && hi === a.distress_max) return
    onSave({ distress_min: lo, distress_max: hi })
  }

  if (planning) {
    return (
      <div style={{ background: 'var(--float-surface)', border: '1px solid var(--float-primary)', borderRadius: 'var(--float-radius)', padding: '14px 16px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--float-text)' }}>
          Plan &ldquo;{a.name}&rdquo;
        </div>
        <p style={{ fontSize: '11.5px', color: 'var(--float-text-hint)', margin: '4px 0 10px' }}>
          Only one accommodation is the parent&rsquo;s focus at a time. Choosing this one takes it
          off whichever has it now.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12.5px', color: 'var(--float-text-secondary)', cursor: 'pointer', marginBottom: '12px' }}>
          <input type="checkbox" checked={wantFocus} onChange={e => setWantFocus(e.target.checked)} style={{ cursor: 'pointer' }} />
          Make this the parent&rsquo;s focus this week
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={async () => {
              if (wantFocus !== a.is_weekly_focus) await onSave({ is_weekly_focus: wantFocus })
              setPlanning(false)
            }}
            style={{ fontSize: '13px', fontWeight: 600, color: '#fff', background: 'var(--float-primary)', border: 'none', borderRadius: 'var(--float-radius-sm)', padding: '7px 14px', cursor: 'pointer' }}
          >Save</button>
          <button onClick={() => { setWantFocus(a.is_weekly_focus); setPlanning(false) }}
            style={{ fontSize: '13px', color: 'var(--float-text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: '7px 8px' }}>Cancel</button>
        </div>
      </div>
    )
  }

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart() }}
      onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; onDragOver() }}
      onDragEnd={onDragEnd}
      onDrop={e => { e.preventDefault(); onDrop() }}
      style={{
        background: 'var(--float-surface)',
        border: `1px solid ${dropTarget ? 'var(--float-primary)' : a.is_weekly_focus ? 'var(--float-primary)' : 'var(--float-border)'}`,
        borderRadius: 'var(--float-radius)', padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: '12px',
        opacity: dragging ? 0.4 : 1,
      }}
    >
      {/* Drag to reorder. The arrows stay behind it for the keyboard — a mouse gesture cannot be
          the only way to change the order. */}
      <span
        title="Drag to reorder"
        style={{ flex: 'none', cursor: 'grab', color: 'var(--float-border-strong)', fontSize: '14px', lineHeight: 1, letterSpacing: '1px', userSelect: 'none' }}
      >⠿</span>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 'none' }}>
        <button onClick={() => onMove(index, -1)} disabled={index === 0} style={{ background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer', color: index === 0 ? 'var(--float-border-strong)' : 'var(--float-text-secondary)', fontSize: '9px', lineHeight: 1, padding: 0 }} aria-label="Move up">▲</button>
        <button onClick={() => onMove(index, 1)} disabled={index === total - 1} style={{ background: 'none', border: 'none', cursor: index === total - 1 ? 'default' : 'pointer', color: index === total - 1 ? 'var(--float-border-strong)' : 'var(--float-text-secondary)', fontSize: '9px', lineHeight: 1, padding: 0 }} aria-label="Move down">▼</button>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--float-text)' }}>{a.name}</div>
        {situationName && (
          <span style={{ fontSize: '11px', color: 'var(--float-text-hint)' }}>{situationName}</span>
        )}
      </div>
      {editingScore ? (
        <input
          value={scoreDraft}
          autoFocus
          onChange={e => setScoreDraft(e.target.value)}
          onBlur={saveScore}
          onKeyDown={e => {
            if (e.key === 'Enter') saveScore()
            if (e.key === 'Escape') setEditingScore(false)
          }}
          title="Type 6, or 6-8 for a range"
          style={{ flex: 'none', width: '58px', textAlign: 'center', fontSize: '13px', fontWeight: 600, padding: '3px 6px', border: '1px solid var(--float-primary)', borderRadius: '999px' }}
        />
      ) : (
        <button
          onClick={() => { setScoreDraft(distressLabel(a) === '—' ? '' : distressLabel(a)); setEditingScore(true) }}
          title="Child's Fear Level if the parent stops. Click to change."
          style={{ flex: 'none', fontSize: '13px', fontWeight: 600, color: 'var(--float-primary-text)', background: 'var(--float-primary-light)', border: 'none', borderRadius: '999px', padding: '3px 10px', cursor: 'text' }}
        >
          {distressLabel(a)}
        </button>
      )}
      {a.is_weekly_focus && (
        <span style={{ flex: 'none', fontSize: '11px', fontWeight: 800, color: '#0d3d3a', background: '#eafaf6', border: '1px solid var(--float-primary)', borderRadius: '999px', padding: '1px 8px' }}>
          ★ Focus
        </span>
      )}
      <button
        onClick={() => { setWantFocus(a.is_weekly_focus); setPlanning(true) }}
        title="Plan what the parents work on"
        style={{
          flex: 'none', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer',
          borderRadius: '999px', padding: '3px 9px', color: '#3f8a78',
          background: '#fff', border: '1px solid var(--float-border)',
        }}
      >Plan it</button>
      {/* Asks first, the same as a ladder rung. */}
      {confirmRemove ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 'none', whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: '11px', color: 'var(--float-text-hint)' }}>Remove?</span>
          <button onClick={onDelete} style={{ fontSize: '11px', fontWeight: 700, color: 'var(--float-danger)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Yes, remove</button>
          <button onClick={() => setConfirmRemove(false)} style={{ fontSize: '11px', color: 'var(--float-text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Cancel</button>
        </span>
      ) : (
        <button onClick={() => setConfirmRemove(true)} title="Remove"
          style={{ flex: 'none', fontSize: '14px', color: 'var(--float-text-hint)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}>×</button>
      )}
    </div>
  )
}
