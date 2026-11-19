import { useCallback, useEffect, useState } from 'react'
import { adminApiClient } from '../../context/AdminAuthContext'
import { Button, Badge } from '../../components/ui/primitives'
import { AUDIENCE_LABEL, formatDuration, type VideoAudience } from '../../api/videos'

/**
 * Videos on the admin Content page. Videos are uploaded in Mux's own dashboard; here the Float
 * team adds one to Float, which makes it private on Mux, then titles it, says who it is for, and
 * publishes it to clinicians' Library. docs/plans/videos.md
 */

interface AdminVideo {
  id: string
  title: string
  description: string | null
  audience: VideoAudience
  duration_seconds: number | null
  display_order: number
  mux_asset_id: string
  is_published: boolean
}
interface MuxAsset {
  mux_asset_id: string
  status: string
  duration_seconds: number | null
  created_at: string | null
  name: string | null
  public: boolean
}

const card: React.CSSProperties = { background: 'var(--float-surface)', borderRadius: 'var(--float-radius-lg)', boxShadow: 'var(--float-shadow-sm)', padding: '24px', marginBottom: '24px' }
const input: React.CSSProperties = { padding: '8px 10px', fontSize: '13px', border: '1px solid var(--float-border-strong)', borderRadius: 'var(--float-radius-control)', color: 'var(--float-text-strong)', background: 'var(--float-surface)' }
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 0', borderTop: '1px solid var(--float-border)', flexWrap: 'wrap' }
const hint: React.CSSProperties = { fontSize: '12px', color: 'var(--float-text-hint)' }

const errorText = (e: unknown) =>
  (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ?? 'Something went wrong. Try again.'

export default function AdminVideos() {
  const [videos, setVideos] = useState<AdminVideo[]>([])
  const [fromMux, setFromMux] = useState<MuxAsset[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const [draft, setDraft] = useState<{ title: string; description: string; audience: VideoAudience }>({ title: '', description: '', audience: 'family' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try { setVideos((await adminApiClient.get('/admin/videos')).data) } catch (e) { setError(errorText(e)) }
  }, [])
  useEffect(() => { load() }, [load])

  const lookInMux = async () => {
    setError(null)
    try { setFromMux((await adminApiClient.get('/admin/videos/from-mux')).data) } catch (e) { setError(errorText(e)) }
  }

  const add = async () => {
    if (!adding || !draft.title.trim()) return
    setBusy(true); setError(null)
    try {
      await adminApiClient.post('/admin/videos', { mux_asset_id: adding, ...draft })
      setAdding(null); setDraft({ title: '', description: '', audience: 'family' })
      await Promise.all([load(), lookInMux()])
    } catch (e) { setError(errorText(e)) } finally { setBusy(false) }
  }

  const edit = async (id: string, change: Partial<AdminVideo>) => {
    setError(null)
    try { await adminApiClient.put(`/admin/videos/${id}`, change); await load() } catch (e) { setError(errorText(e)) }
  }

  const remove = async (v: AdminVideo) => {
    if (!window.confirm(`Take "${v.title}" out of Float? It stays on Mux, still private.`)) return
    try { await adminApiClient.delete(`/admin/videos/${v.id}`); await load() } catch (e) { setError(errorText(e)) }
  }

  return (
    <section style={card}>
      <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 4px', color: 'var(--float-text-strong)' }}>Videos</h2>
      <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', margin: '0 0 16px' }}>
        Upload videos in Mux's dashboard first. Adding one here makes it private, so it plays only inside Float.
        Published videos appear in every clinician's Library.
      </p>
      {error && <p role="alert" style={{ fontSize: '13px', color: 'var(--float-danger)', margin: '0 0 12px' }}>{error}</p>}

      {videos.length === 0 && <p style={hint}>No videos in Float yet.</p>}
      {videos.map(v => (
        <div key={v.id} style={row}>
          <span style={{ flex: '1 1 220px', minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--float-text-strong)' }}>{v.title}</span>
            <span style={hint}>{formatDuration(v.duration_seconds)}</span>
          </span>
          <select value={v.audience} onChange={e => edit(v.id, { audience: e.target.value as VideoAudience })} style={input} aria-label={`Who "${v.title}" is for`}>
            {(Object.keys(AUDIENCE_LABEL) as VideoAudience[]).map(a => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}
          </select>
          {v.is_published ? <Badge tone="success">Published</Badge> : <Badge tone="neutral">Not published</Badge>}
          <Button size="sm" kind="secondary" onClick={() => edit(v.id, { is_published: !v.is_published })}>
            {v.is_published ? 'Unpublish' : 'Publish'}
          </Button>
          <Button size="sm" kind="quiet" onClick={() => remove(v)}>Remove</Button>
        </div>
      ))}

      <div style={{ marginTop: '16px' }}>
        {fromMux === null ? (
          <Button size="sm" kind="secondary" onClick={lookInMux}>Add a video from Mux</Button>
        ) : (
          <>
            <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--float-text-strong)', margin: '8px 0' }}>On Mux, not in Float yet</div>
            {fromMux.length === 0 && <p style={hint}>Every video on Mux is already in Float.</p>}
            {fromMux.map(a => (
              <div key={a.mux_asset_id} style={{ ...row, alignItems: 'flex-start' }}>
                <span style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: '13px', color: 'var(--float-text-strong)' }}>{a.name || a.mux_asset_id}</span>
                  <span style={hint}>
                    {a.status === 'ready' ? formatDuration(a.duration_seconds) : 'Mux is still processing it'}
                    {a.created_at ? ` · uploaded ${new Date(Number(a.created_at) * 1000).toLocaleDateString()}` : ''}
                    {a.public ? ' · public on Mux now' : ''}
                  </span>
                </span>
                {adding === a.mux_asset_id ? (
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: '1 1 320px' }}>
                    <input style={input} placeholder="Title" value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} autoFocus />
                    <input style={input} placeholder="A short description (optional)" value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} />
                    <select style={input} value={draft.audience} onChange={e => setDraft({ ...draft, audience: e.target.value as VideoAudience })}>
                      {(Object.keys(AUDIENCE_LABEL) as VideoAudience[]).map(x => <option key={x} value={x}>{AUDIENCE_LABEL[x]}</option>)}
                    </select>
                    <span style={{ display: 'flex', gap: '8px' }}>
                      <Button size="sm" kind="primary" onClick={add} disabled={busy || !draft.title.trim()}>{busy ? 'Adding…' : 'Add and make private'}</Button>
                      <Button size="sm" kind="quiet" onClick={() => setAdding(null)}>Cancel</Button>
                    </span>
                  </span>
                ) : (
                  <Button size="sm" kind="secondary" disabled={a.status !== 'ready'} onClick={() => { setAdding(a.mux_asset_id); setDraft({ title: a.name ?? '', description: '', audience: 'family' }) }}>Add</Button>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    </section>
  )
}
