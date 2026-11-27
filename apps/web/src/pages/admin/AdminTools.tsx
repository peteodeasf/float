import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApiClient } from '../../context/AdminAuthContext'
import { Button, Badge } from '../../components/ui/primitives'
import ToolImage from '../../components/tools/ToolImage'
import { AUDIENCE_LABEL, KIND_LABEL, type ToolAudience, type ToolBlock, type ToolKind, type ToolPage } from '../../api/tools'

/**
 * Tools and strategies on the admin Content page. Each is a page: text, image and video blocks, and
 * optional examples (the mottos), each with how it's used. Every family can read a published page;
 * clinicians pick from them for action plans. docs/plans/tools-and-strategies.md
 */

interface AdminVideo { id: string; title: string }
// `key` is for React only: a new example has no id yet, and its place in the list changes.
interface ExampleDraft { id?: string; key: string; name: string; how_used: string }
let nextKey = 0
const newKey = () => `ex-${nextKey++}`
interface Draft {
  name: string; kind: ToolKind; audience: ToolAudience; summary: string
  blocks: ToolBlock[]; examples: ExampleDraft[]; display_order: number; is_published: boolean
}
const empty: Draft = { name: '', kind: 'tool', audience: 'both', summary: '', blocks: [], examples: [], display_order: 0, is_published: false }

const card: React.CSSProperties = { background: 'var(--float-surface)', borderRadius: 'var(--float-radius-lg)', boxShadow: 'var(--float-shadow-sm)', padding: '24px', marginBottom: '24px' }
const input: React.CSSProperties = { padding: '8px 10px', fontSize: '13px', border: '1px solid var(--float-border-strong)', borderRadius: 'var(--float-radius-control)', color: 'var(--float-text-strong)', background: 'var(--float-surface)', width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' }
const label: React.CSSProperties = { fontSize: '12px', fontWeight: 600, color: 'var(--float-text-secondary)', display: 'block', marginBottom: '4px' }
const hint: React.CSSProperties = { fontSize: '12px', color: 'var(--float-text-hint)' }
const blockBox: React.CSSProperties = { background: 'var(--float-surface)', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-control)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }
const blockTag: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--float-text-hint)', letterSpacing: '.04em' }
const row: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 0', borderTop: '1px solid var(--float-border)' }

const errorText = (e: unknown) =>
  (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Something went wrong. Try again.'

function Chips<T extends string>({ value, options, onChange, labels }: {
  value: T; options: T[]; onChange: (v: T) => void; labels: Record<T, string>
}) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {options.map(o => (
        <Button key={o} size="sm" kind={o === value ? 'on' : 'secondary'} aria-pressed={o === value} onClick={() => onChange(o)}>
          {labels[o].charAt(0).toUpperCase() + labels[o].slice(1)}
        </Button>
      ))}
    </div>
  )
}

export default function AdminTools() {
  const qc = useQueryClient()
  const { data: tools = [] } = useQuery<ToolPage[]>({
    queryKey: ['admin-tools'],
    queryFn: async () => (await adminApiClient.get('/admin/tools')).data,
  })
  const { data: videos = [] } = useQuery<AdminVideo[]>({
    queryKey: ['admin-videos-for-tools'],
    queryFn: async () => (await adminApiClient.get('/admin/videos')).data,
  })
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [draft, setDraft] = useState<Draft>(empty)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = (patch: Partial<Draft>) => setDraft(d => ({ ...d, ...patch }))
  const setBlock = (i: number, b: ToolBlock) => set({ blocks: draft.blocks.map((x, j) => (j === i ? b : x)) })
  const moveBlock = (i: number, by: number) => {
    const b = [...draft.blocks]
    const j = i + by
    if (j < 0 || j >= b.length) return
    ;[b[i], b[j]] = [b[j], b[i]]
    set({ blocks: b })
  }
  const setExample = (i: number, patch: Partial<ExampleDraft>) =>
    set({ examples: draft.examples.map((x, j) => (j === i ? { ...x, ...patch } : x)) })

  const open = (t: ToolPage | null) => {
    setError(null)
    if (!t) { setDraft({ ...empty, display_order: tools.length + 1 }); setEditing('new'); return }
    setDraft({
      name: t.name, kind: t.kind, audience: t.audience, summary: t.summary ?? '', blocks: t.blocks,
      examples: t.examples.map(e => ({ id: e.id, key: e.id, name: e.name, how_used: e.how_used ?? '' })),
      display_order: t.display_order ?? 0, is_published: !!t.is_published,
    })
    setEditing(t.id)
  }

  const save = async (publish: boolean) => {
    setError(null)
    const body = { ...draft, is_published: publish, examples: draft.examples.map(e => ({ id: e.id, name: e.name, how_used: e.how_used })) }
    try {
      if (editing === 'new') await adminApiClient.post('/admin/tools', body)
      else await adminApiClient.put(`/admin/tools/${editing}`, body)
      setEditing(null)
      qc.invalidateQueries({ queryKey: ['admin-tools'] })
    } catch (e) {
      setError(errorText(e))
    }
  }
  const remove = async (t: ToolPage) => {
    if (!confirm(`Delete "${t.name}"? Action plans that used it keep the line, without the page.`)) return
    try {
      await adminApiClient.delete(`/admin/tools/${t.id}`)
      qc.invalidateQueries({ queryKey: ['admin-tools'] })
    } catch (e) {
      alert(errorText(e))
    }
  }
  const upload = async (file: File) => {
    setUploading(true); setError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const { data } = await adminApiClient.post('/admin/tool-images', form)
      set({ blocks: [...draft.blocks, { type: 'image', image_id: data.id }] })
    } catch (e) {
      setError(errorText(e))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const form = (
    <div style={{ background: 'var(--float-surface-muted)', borderRadius: 'var(--float-radius-card)', padding: 18, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <input aria-label="Name" placeholder="Name, e.g. Worry Hill" style={{ ...input, fontSize: 15, fontWeight: 600 }}
          value={draft.name} onChange={e => set({ name: e.target.value })} />
        <Badge tone={draft.is_published ? 'success' : 'warning'}>{draft.is_published ? 'Published' : 'Draft'}</Badge>
      </div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div><span style={label}>Kind</span><Chips value={draft.kind} options={['tool', 'strategy']} labels={KIND_LABEL} onChange={kind => set({ kind })} /></div>
        <div><span style={label}>For</span><Chips value={draft.audience} options={['child', 'parent', 'both']} labels={AUDIENCE_LABEL} onChange={audience => set({ audience })} /></div>
      </div>
      <label style={label}>Summary
        <input style={{ ...input, marginTop: 4, fontWeight: 400 }} placeholder="One line, shown in lists"
          value={draft.summary} onChange={e => set({ summary: e.target.value })} />
      </label>

      <div>
        <span style={label}>Page</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {draft.blocks.map((b, i) => (
            <div key={i} style={blockBox}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={blockTag}>{b.type.toUpperCase()}</span>
                <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <Button size="sm" kind="quiet" aria-label="Move up" onClick={() => moveBlock(i, -1)}>↑</Button>
                  <Button size="sm" kind="quiet" aria-label="Move down" onClick={() => moveBlock(i, 1)}>↓</Button>
                  <Button size="sm" kind="quiet" aria-label="Remove" onClick={() => set({ blocks: draft.blocks.filter((_, j) => j !== i) })}>×</Button>
                </span>
              </div>
              {b.type === 'text' && (
                <textarea aria-label="Text" rows={4} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }}
                  value={b.text} onChange={e => setBlock(i, { type: 'text', text: e.target.value })} />
              )}
              {b.type === 'image' && <ToolImage id={b.image_id} client={adminApiClient} style={{ maxHeight: 180, width: 'auto' }} />}
              {b.type === 'video' && (
                <select aria-label="Video" style={input} value={b.video_id}
                  onChange={e => setBlock(i, { type: 'video', video_id: e.target.value })}>
                  {videos.map(v => <option key={v.id} value={v.id}>{v.title}</option>)}
                </select>
              )}
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8 }}>
            <Button size="sm" onClick={() => set({ blocks: [...draft.blocks, { type: 'text', text: '' }] })}>+ Text</Button>
            <Button size="sm" disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? 'Uploading…' : '+ Image'}</Button>
            <Button size="sm" disabled={videos.length === 0} title={videos.length === 0 ? 'Add a video in the Videos section first' : undefined}
              onClick={() => set({ blocks: [...draft.blocks, { type: 'video', video_id: videos[0].id }] })}>+ Video</Button>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) upload(f) }} />
          </div>
        </div>
      </div>

      <div>
        <span style={{ ...label, marginBottom: 2 }}>Examples</span>
        <span style={{ ...hint, display: 'block', marginBottom: 8 }}>Optional. A clinician can put one on an action plan, or write their own.</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {draft.examples.map((ex, i) => (
            <div key={ex.key} style={blockBox}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input aria-label="Example" placeholder="e.g. Wait and see" style={{ ...input, fontWeight: 600 }}
                  value={ex.name} onChange={e => setExample(i, { name: e.target.value })} />
                <Button size="sm" kind="quiet" aria-label="Remove example" onClick={() => set({ examples: draft.examples.filter((_, j) => j !== i) })}>×</Button>
              </div>
              <span style={blockTag}>HOW IT'S USED</span>
              <textarea aria-label="How it's used" rows={3} style={{ ...input, resize: 'vertical', lineHeight: 1.5 }}
                value={ex.how_used} onChange={e => setExample(i, { how_used: e.target.value })} />
            </div>
          ))}
          <Button size="sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ examples: [...draft.examples, { key: newKey(), name: '', how_used: '' }] })}>+ Add an example</Button>
        </div>
      </div>

      {error && <p role="alert" style={{ fontSize: 13, color: 'var(--float-danger)', margin: 0 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button kind="primary" size="sm" onClick={() => save(true)} disabled={!draft.name.trim()}>Publish</Button>
        <Button size="sm" onClick={() => save(false)} disabled={!draft.name.trim()}>{draft.is_published ? 'Save as draft' : 'Save draft'}</Button>
        <Button size="sm" kind="quiet" onClick={() => setEditing(null)}>Cancel</Button>
      </div>
    </div>
  )

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--float-text-strong)' }}>Tools and strategies</h2>
        {editing === null && <Button size="sm" style={{ marginLeft: 'auto' }} onClick={() => open(null)}>Add a page</Button>}
      </div>
      <p style={{ ...hint, margin: '4px 0 12px' }}>Every family can read these in their app. Clinicians pick from them for action plans.</p>
      {editing === 'new' && form}
      {tools.length === 0 && editing !== 'new' && <p style={hint}>No pages yet.</p>}
      {tools.map(t => editing === t.id ? <div key={t.id} style={{ padding: '12px 0', borderTop: '1px solid var(--float-border)' }}>{form}</div> : (
        <div key={t.id} style={row}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--float-text-strong)' }}>
              {t.name}{' '}
              <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--float-text-secondary)' }}>· {KIND_LABEL[t.kind]} · {AUDIENCE_LABEL[t.audience]}</span>
              {!t.is_published && <> <Badge tone="warning">Draft</Badge></>}
            </div>
            {t.summary && <div style={{ fontSize: 13, color: 'var(--float-text-secondary)', marginTop: 2 }}>{t.summary}</div>}
          </div>
          <Button size="sm" onClick={() => open(t)}>Edit</Button>
          <Button size="sm" kind="danger" onClick={() => remove(t)}>Delete</Button>
        </div>
      ))}
    </section>
  )
}
