import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listAccommodations,
  createAccommodation,
  updateAccommodation,
  deleteAccommodation,
  reorderAccommodations,
  reseedAccommodations,
  type Accommodation,
} from '../../api/accommodations'

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
  triggers,
}: {
  planId: string
  triggers: TriggerLite[]
}) {
  const qc = useQueryClient()
  const key = ['accommodations', planId]

  const { data: accommodations = [], isLoading } = useQuery({
    queryKey: key,
    queryFn: () => listAccommodations(planId),
    enabled: !!planId,
  })

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
    onSuccess: invalidate,
  })

  const reorderMut = useMutation({
    mutationFn: (orderedIds: string[]) => reorderAccommodations(planId, orderedIds),
    onSuccess: invalidate,
  })

  const reseedMut = useMutation({
    mutationFn: () => reseedAccommodations(planId),
    onSuccess: invalidate,
  })

  const move = (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= accommodations.length) return
    const ids = accommodations.map(a => a.id)
    ;[ids[index], ids[next]] = [ids[next], ids[index]]
    reorderMut.mutate(ids)
  }

  const cardStyle: React.CSSProperties = {
    background: 'var(--float-surface)',
    border: '1px solid var(--float-border)',
    borderRadius: 'var(--float-radius)',
    padding: '16px 18px',
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--float-text)' }}>
            Parent accommodations
          </div>
          <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', margin: '4px 0 0', lineHeight: 1.5, maxWidth: '520px' }}>
            The things a parent does to lower the child's distress. One ladder per child,
            ordered easiest-to-stop first. The rating is the child's distress if the parent stops.
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

      {/* Add form */}
      <div style={cardStyle}>
        <label style={labelStyle}>New accommodation</label>
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. Lies down with them at bedtime"
          style={{ ...inputStyle, marginBottom: '10px' }}
        />
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div style={{ flex: '2 1 200px' }}>
            <label style={labelStyle}>Situation (optional)</label>
            <select
              value={situationId}
              onChange={e => setSituationId(e.target.value)}
              style={inputStyle}
            >
              <option value="">No situation</option>
              {triggers.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: '1 1 80px' }}>
            <label style={labelStyle}>Distress min</label>
            <input
              type="number" min={0} max={10} value={dmin}
              onChange={e => setDmin(e.target.value)}
              placeholder="—" style={inputStyle}
            />
          </div>
          <div style={{ flex: '1 1 80px' }}>
            <label style={labelStyle}>Distress max</label>
            <input
              type="number" min={0} max={10} value={dmax}
              onChange={e => setDmax(e.target.value)}
              placeholder="—" style={inputStyle}
            />
          </div>
          <button
            onClick={() => createMut.mutate()}
            disabled={!name.trim() || createMut.isPending}
            style={{
              flex: 'none',
              fontSize: '13px',
              fontWeight: 600,
              color: '#fff',
              background: 'var(--float-primary)',
              border: 'none',
              borderRadius: 'var(--float-radius-sm)',
              padding: '9px 16px',
              cursor: 'pointer',
              opacity: !name.trim() || createMut.isPending ? 0.5 : 1,
            }}
          >
            {createMut.isPending ? 'Adding…' : 'Add'}
          </button>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--float-text-hint)', margin: '8px 0 0' }}>
          Leave distress blank if unrated. Enter one value for a single rating, or both for a range (e.g. 5–9).
        </p>
      </div>

      {/* Ladder */}
      {isLoading ? (
        <p style={{ fontSize: '13px', color: 'var(--float-text-hint)' }}>Loading…</p>
      ) : accommodations.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', fontStyle: 'italic' }}>
          No accommodations yet. Add the ones that surfaced in monitoring or consultation.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {accommodations.map((a, i) => (
            <AccommodationRow
              key={a.id}
              accommodation={a}
              index={i}
              total={accommodations.length}
              triggers={triggers}
              onMove={move}
              onDelete={() => deleteMut.mutate(a.id)}
              onSave={(data) => updateAccommodation(planId, a.id, data).then(invalidate)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function AccommodationRow({
  accommodation: a,
  index,
  total,
  triggers,
  onMove,
  onDelete,
  onSave,
}: {
  accommodation: Accommodation
  index: number
  total: number
  triggers: TriggerLite[]
  onMove: (index: number, dir: -1 | 1) => void
  onDelete: () => void
  onSave: (data: { name?: string; trigger_situation_id?: string | null; distress_min?: number | null; distress_max?: number | null }) => Promise<unknown>
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(a.name)
  const [situationId, setSituationId] = useState(a.trigger_situation_id ?? '')
  const [dmin, setDmin] = useState(a.distress_min?.toString() ?? '')
  const [dmax, setDmax] = useState(a.distress_max?.toString() ?? '')
  const [saving, setSaving] = useState(false)

  const situationName = triggers.find(t => t.id === a.trigger_situation_id)?.name ?? null

  const inputStyle: React.CSSProperties = {
    padding: '7px 9px', fontSize: '13px', color: 'var(--float-text)',
    border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-sm)',
    boxSizing: 'border-box',
  }

  const save = async () => {
    setSaving(true)
    try {
      await onSave({
        name: name.trim(),
        trigger_situation_id: situationId || null,
        distress_min: num(dmin),
        distress_max: num(dmax) ?? num(dmin),
      })
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div style={{ background: 'var(--float-surface)', border: '1px solid var(--float-primary-mid)', borderRadius: 'var(--float-radius)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input value={name} onChange={e => setName(e.target.value)} style={{ ...inputStyle, width: '100%' }} />
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <select value={situationId} onChange={e => setSituationId(e.target.value)} style={{ ...inputStyle, flex: '2 1 160px' }}>
            <option value="">No situation</option>
            {triggers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <input type="number" min={0} max={10} value={dmin} onChange={e => setDmin(e.target.value)} placeholder="min" style={{ ...inputStyle, flex: '1 1 70px', width: 70 }} />
          <input type="number" min={0} max={10} value={dmax} onChange={e => setDmax(e.target.value)} placeholder="max" style={{ ...inputStyle, flex: '1 1 70px', width: 70 }} />
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={save} disabled={saving || !name.trim()} style={{ fontSize: '13px', fontWeight: 600, color: '#fff', background: 'var(--float-primary)', border: 'none', borderRadius: 'var(--float-radius-sm)', padding: '7px 14px', cursor: 'pointer', opacity: saving || !name.trim() ? 0.5 : 1 }}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={() => setEditing(false)} style={{ fontSize: '13px', color: 'var(--float-text-secondary)', background: 'none', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-sm)', padding: '7px 14px', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: 'var(--float-surface)', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius)', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 'none' }}>
        <button onClick={() => onMove(index, -1)} disabled={index === 0} style={{ background: 'none', border: 'none', cursor: index === 0 ? 'default' : 'pointer', color: index === 0 ? 'var(--float-border-strong)' : 'var(--float-text-secondary)', fontSize: '11px', lineHeight: 1, padding: '1px' }} aria-label="Move up">▲</button>
        <button onClick={() => onMove(index, 1)} disabled={index === total - 1} style={{ background: 'none', border: 'none', cursor: index === total - 1 ? 'default' : 'pointer', color: index === total - 1 ? 'var(--float-border-strong)' : 'var(--float-text-secondary)', fontSize: '11px', lineHeight: 1, padding: '1px' }} aria-label="Move down">▼</button>
      </div>
      <span style={{ flex: 'none', width: 20, fontSize: '13px', fontWeight: 600, color: 'var(--float-text-hint)' }}>{index + 1}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--float-text)' }}>{a.name}</div>
        {situationName && (
          <span style={{ fontSize: '11px', color: 'var(--float-text-hint)' }}>{situationName}</span>
        )}
      </div>
      <span style={{ flex: 'none', fontSize: '13px', fontWeight: 600, color: 'var(--float-primary-text)', background: 'var(--float-primary-light)', borderRadius: '999px', padding: '2px 10px' }} title="Child's distress if stopped">
        {distressLabel(a)}
      </span>
      <button onClick={() => setEditing(true)} style={{ flex: 'none', fontSize: '12px', color: 'var(--float-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Edit</button>
      <button onClick={onDelete} style={{ flex: 'none', fontSize: '12px', color: 'var(--float-danger)', background: 'none', border: 'none', cursor: 'pointer' }}>Delete</button>
    </div>
  )
}
