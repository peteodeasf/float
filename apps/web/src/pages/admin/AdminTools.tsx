import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApiClient } from '../../context/AdminAuthContext'
import { Button, Badge } from '../../components/ui/primitives'

/**
 * The tools list on the admin Content page. Clinicians pick tools for an action plan from this list
 * only; they cannot type their own. A tool is a technique with a description, or something to learn
 * or watch, such as "The worry hill". docs/plans/action-plans-build.md
 */

interface AdminTool {
  id: string
  name: string
  description: string | null
  link: string | null
  display_order: number
  is_active: boolean
}
type Draft = Omit<AdminTool, 'id'>
const empty: Draft = { name: '', description: '', link: '', display_order: 0, is_active: true }

const card: React.CSSProperties = { background: 'var(--float-surface)', borderRadius: 'var(--float-radius-lg)', boxShadow: 'var(--float-shadow-sm)', padding: '24px', marginBottom: '24px' }
const input: React.CSSProperties = { padding: '8px 10px', fontSize: '13px', border: '1px solid var(--float-border-strong)', borderRadius: 'var(--float-radius-control)', color: 'var(--float-text-strong)', background: 'var(--float-surface)', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }
const row: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 0', borderTop: '1px solid var(--float-border)' }
const hint: React.CSSProperties = { fontSize: '12px', color: 'var(--float-text-hint)' }

const errorText = (e: unknown) =>
  (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Something went wrong. Try again.'

export default function AdminTools() {
  const qc = useQueryClient()
  const { data: tools = [] } = useQuery<AdminTool[]>({
    queryKey: ['admin-tools'],
    queryFn: async () => (await adminApiClient.get('/admin/tools')).data,
  })
  const load = () => qc.invalidateQueries({ queryKey: ['admin-tools'] })
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [draft, setDraft] = useState<Draft>(empty)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setError(null)
    try {
      if (editing === 'new') await adminApiClient.post('/admin/tools', draft)
      else await adminApiClient.put(`/admin/tools/${editing}`, draft)
      setEditing(null)
      await load()
    } catch (e) {
      setError(errorText(e))
    }
  }
  const remove = async (t: AdminTool) => {
    if (!confirm(`Delete "${t.name}"? Action plans that used it keep the line, without the tool's details.`)) return
    await adminApiClient.delete(`/admin/tools/${t.id}`)
    await load()
  }

  const form = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '12px 0', borderTop: '1px solid var(--float-border)' }}>
      <input aria-label="Name" placeholder="Name, e.g. The worry hill" style={input} value={draft.name}
        onChange={e => setDraft({ ...draft, name: e.target.value })} />
      <textarea aria-label="Description" placeholder="What it is, in a sentence or two" rows={3} style={input}
        value={draft.description ?? ''} onChange={e => setDraft({ ...draft, description: e.target.value })} />
      <input aria-label="Link" placeholder="Link to watch or read (optional)" style={input} value={draft.link ?? ''}
        onChange={e => setDraft({ ...draft, link: e.target.value })} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label style={{ fontSize: 13 }}>Order <input type="number" style={{ ...input, width: 70 }} value={draft.display_order}
          onChange={e => setDraft({ ...draft, display_order: Number(e.target.value) })} /></label>
        <label style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={draft.is_active} onChange={e => setDraft({ ...draft, is_active: e.target.checked })} />
          Clinicians can pick it
        </label>
      </div>
      {error && <p role="alert" style={{ fontSize: 13, color: 'var(--float-danger)', margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button kind="primary" size="sm" onClick={save} disabled={!draft.name.trim()}>Save</Button>
        <Button size="sm" onClick={() => setEditing(null)}>Cancel</Button>
      </div>
    </div>
  )

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--float-text-strong)' }}>Tools</h2>
        {editing === null && (
          <Button size="sm" style={{ marginLeft: 'auto' }}
            onClick={() => { setDraft({ ...empty, display_order: tools.length + 1 }); setError(null); setEditing('new') }}>
            Add a tool
          </Button>
        )}
      </div>
      <p style={{ ...hint, margin: '4px 0 12px' }}>Clinicians pick from this list when they add a tool to an action plan.</p>
      {editing === 'new' && form}
      {tools.length === 0 && editing !== 'new' && <p style={hint}>No tools yet.</p>}
      {tools.map(t => editing === t.id ? <div key={t.id}>{form}</div> : (
        <div key={t.id} style={row}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--float-text-strong)' }}>
              {t.name} {!t.is_active && <Badge>Hidden</Badge>}
            </div>
            {t.description && <div style={{ fontSize: 13, color: 'var(--float-text-secondary)', marginTop: 2 }}>{t.description}</div>}
            {t.link && <a href={t.link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12.5 }}>{t.link}</a>}
          </div>
          <Button size="sm" onClick={() => {
            setDraft({ name: t.name, description: t.description ?? '', link: t.link ?? '', display_order: t.display_order, is_active: t.is_active })
            setError(null); setEditing(t.id)
          }}>Edit</Button>
          <Button size="sm" kind="danger" onClick={() => remove(t)}>Delete</Button>
        </div>
      ))}
    </section>
  )
}
