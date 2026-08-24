/**
 * Process checklist, per organization — Float-team managed.
 *
 * Owner call (2026-08-24): platform admin can do everything; organizations cannot edit their own
 * list. So this lives on the admin page behind an organization picker rather than anywhere a
 * clinician can reach.
 *
 * The `key` of an item is its identity: per-patient completion is stored as a `key -> bool` map
 * (`consultation_checklists.checked_items`). The API refuses to change a key for that reason, and
 * deleting an item leaves any tick already recorded against it orphaned but harmless.
 */
import { useEffect, useState } from 'react'
import { adminApiClient } from '../../context/AdminAuthContext'

type Item = {
  id: string
  key: string
  text: string
  display_order: number
  is_active: boolean
}
type Org = { id: string; name: string }

const card: React.CSSProperties = {
  background: 'var(--float-surface)', border: '1px solid #e2e8f0', borderRadius: '12px',
  padding: '24px', marginBottom: '24px',
}
const input: React.CSSProperties = {
  border: '1px solid #cbd5e1', borderRadius: '8px', padding: '8px 10px', fontSize: '13px',
  fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
}
const ghostBtn: React.CSSProperties = {
  background: 'transparent', border: '1px solid #e2e8f0', borderRadius: '6px',
  padding: '3px 8px', fontSize: '11px', color: '#64748b', cursor: 'pointer',
}
const primaryBtn: React.CSSProperties = {
  background: 'var(--float-primary)', color: '#fff', border: 'none', borderRadius: '8px',
  padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
}

export default function ChecklistAdmin() {
  const [orgs, setOrgs] = useState<Org[]>([])
  const [orgId, setOrgId] = useState<string>('')
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [newText, setNewText] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    adminApiClient.get('/admin/organizations')
      .then(r => {
        setOrgs(r.data)
        if (r.data.length > 0) setOrgId(r.data[0].id)
      })
      .catch(() => setErr('Could not load organizations.'))
  }, [])

  const load = async (id: string) => {
    if (!id) return
    setLoading(true); setErr(null)
    try {
      const r = await adminApiClient.get(`/admin/organizations/${id}/checklist-items`)
      setItems(r.data)
    } catch { setErr('Could not load the checklist.') }
    finally { setLoading(false) }
  }

  useEffect(() => { void load(orgId) }, [orgId])

  const guard = async (fn: () => Promise<unknown>) => {
    setErr(null)
    try { await fn(); await load(orgId) } catch { setErr('That did not save. Try again.') }
  }

  const add = () => {
    const text = newText.trim()
    if (!text) return
    void guard(async () => {
      await adminApiClient.post(`/admin/organizations/${orgId}/checklist-items`, { text })
      setNewText('')
    })
  }

  const saveEdit = (item: Item) => {
    const text = editText.trim()
    if (!text) return
    void guard(async () => {
      await adminApiClient.put(`/admin/checklist-items/${item.id}`, { text })
      setEditingId(null)
    })
  }

  const move = (index: number, delta: number) => {
    const next = [...items]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    setItems(next)   // optimistic: reordering should feel instant
    void guard(() => adminApiClient.put(
      `/admin/organizations/${orgId}/checklist-items/reorder`,
      { ordered_ids: next.map(i => i.id) },
    ))
  }

  const remove = (item: Item) => {
    if (!confirm(`Delete “${item.text}”?\n\nAny tick already recorded against it stays in the patient record but stops being shown.`)) return
    void guard(() => adminApiClient.delete(`/admin/checklist-items/${item.id}`))
  }

  return (
    <section style={card}>
      <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 4px', color: '#0f172a' }}>Process checklist</h2>
      <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px' }}>
        The checklist clinicians see under <strong>Process</strong>, configured per organization.
        Float team only — organizations cannot edit their own.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <select value={orgId} onChange={e => setOrgId(e.target.value)}
          style={{ ...input, width: 'auto', minWidth: '220px', cursor: 'pointer' }}>
          {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
        <span style={{ fontSize: '12px', color: '#94a3b8' }}>{items.length} item{items.length === 1 ? '' : 's'}</span>
      </div>

      {err && (
        <p style={{ fontSize: '12.5px', color: '#b91c1c', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '8px 11px' }}>{err}</p>
      )}

      {loading ? <p style={{ color: '#94a3b8', fontSize: '13px' }}>Loading…</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
          {items.map((item, i) => (
            <div key={item.id}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', opacity: item.is_active ? 1 : 0.5 }}>
              <span style={{ fontSize: '11px', color: '#cbd5e1', width: '20px', flexShrink: 0 }}>{i + 1}</span>
              {editingId === item.id ? (
                <>
                  <input style={{ ...input, flex: 1 }} value={editText} autoFocus
                    onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(item); if (e.key === 'Escape') setEditingId(null) }} />
                  <button style={ghostBtn} onClick={() => saveEdit(item)}>Save</button>
                  <button style={ghostBtn} onClick={() => setEditingId(null)}>Cancel</button>
                </>
              ) : (
                <>
                  <span style={{ fontSize: '13px', color: '#334155', flex: 1, minWidth: 0 }}>{item.text}</span>
                  <span style={{ fontSize: '10.5px', color: '#cbd5e1', flexShrink: 0 }}>{item.key}</span>
                  <button style={ghostBtn} onClick={() => move(i, -1)} disabled={i === 0} title="Move up">↑</button>
                  <button style={ghostBtn} onClick={() => move(i, 1)} disabled={i === items.length - 1} title="Move down">↓</button>
                  <button style={ghostBtn} onClick={() => { setEditingId(item.id); setEditText(item.text) }}>Edit</button>
                  <button style={ghostBtn}
                    onClick={() => void guard(() => adminApiClient.put(`/admin/checklist-items/${item.id}`, { is_active: !item.is_active }))}>
                    {item.is_active ? 'Hide' : 'Show'}
                  </button>
                  <button style={{ ...ghostBtn, color: '#b91c1c', borderColor: '#fecaca' }} onClick={() => remove(item)}>Delete</button>
                </>
              )}
            </div>
          ))}
          {items.length === 0 && <p style={{ fontSize: '13px', color: '#94a3b8' }}>No items yet.</p>}
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input style={{ ...input, flex: 1 }} value={newText} onChange={e => setNewText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()} placeholder="Add a checklist item…" />
        <button style={primaryBtn} onClick={add} disabled={!newText.trim()}>Add</button>
      </div>
    </section>
  )
}
