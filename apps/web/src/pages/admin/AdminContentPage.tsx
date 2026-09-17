import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth, adminApiClient } from '../../context/AdminAuthContext'
import ChecklistAdmin from './ChecklistAdmin'
import FloatLogo from '../../components/ui/FloatLogo'
import { Button, Badge } from '../../components/ui/primitives'

type Tag = { id: string; slug: string; label: string; is_active: boolean }
type Tip = {
  id: string
  title: string
  body: string
  always_show: boolean
  display_order: number
  is_active: boolean
  audience: string
  tag_ids: string[]
}

type TipDraft = {
  title: string
  body: string
  always_show: boolean
  display_order: number
  is_active: boolean
  audience: string
  tag_ids: string[]
}

const emptyDraft: TipDraft = {
  title: '',
  body: '',
  always_show: false,
  display_order: 0,
  is_active: true,
  audience: 'teen',
  tag_ids: [],
}

const card: React.CSSProperties = {
  background: 'var(--float-surface)',
  borderRadius: 'var(--float-radius-lg)',
  boxShadow: 'var(--float-shadow-sm)',
  padding: '24px',
  marginBottom: '24px',
}
const input: React.CSSProperties = {
  padding: '8px 10px',
  fontSize: '13px',
  border: '1px solid var(--float-border-strong)',
  borderRadius: 'var(--float-radius-control)',
  color: 'var(--float-text-strong)',
  background: 'var(--float-surface)',
}
const label: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: 'var(--float-text-secondary)',
  display: 'block',
  marginBottom: '4px',
}

export default function AdminContentPage() {
  const { logout } = useAdminAuth()
  const navigate = useNavigate()

  const [tags, setTags] = useState<Tag[]>([])
  const [tips, setTips] = useState<Tip[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [newTagSlug, setNewTagSlug] = useState('')
  const [newTagLabel, setNewTagLabel] = useState('')

  // editing = tip id being edited, 'new' for the create form, or null
  const [editing, setEditing] = useState<null | 'new' | string>(null)
  const [draft, setDraft] = useState<TipDraft>(emptyDraft)

  const load = async () => {
    setLoading(true)
    const [t, p] = await Promise.all([
      adminApiClient.get('/admin/tags'),
      adminApiClient.get('/admin/jit-tips'),
    ])
    setTags(t.data)
    setTips(p.data)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const tagLabel = (id: string) => tags.find(t => t.id === id)?.label ?? '—'

  // ── tag actions ──
  const addTag = async () => {
    if (!newTagSlug.trim() || !newTagLabel.trim()) return
    setBusy(true)
    try {
      await adminApiClient.post('/admin/tags', {
        slug: newTagSlug.trim(),
        label: newTagLabel.trim(),
      })
      setNewTagSlug('')
      setNewTagLabel('')
      await load()
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? 'Could not add tag')
    } finally {
      setBusy(false)
    }
  }
  const toggleTag = async (tag: Tag) => {
    await adminApiClient.put(`/admin/tags/${tag.id}`, { is_active: !tag.is_active })
    await load()
  }
  const deleteTag = async (tag: Tag) => {
    if (!confirm(`Delete the "${tag.label}" tag? It will be removed from any tips and situations.`))
      return
    await adminApiClient.delete(`/admin/tags/${tag.id}`)
    await load()
  }

  // ── tip actions ──
  const startNew = () => {
    setDraft({ ...emptyDraft, display_order: tips.length + 1 })
    setEditing('new')
  }
  const startEdit = (tip: Tip) => {
    setDraft({
      title: tip.title,
      body: tip.body,
      always_show: tip.always_show,
      display_order: tip.display_order,
      is_active: tip.is_active,
      audience: tip.audience ?? 'teen',
      tag_ids: [...tip.tag_ids],
    })
    setEditing(tip.id)
  }
  const saveTip = async () => {
    if (!draft.title.trim() || !draft.body.trim()) return
    setBusy(true)
    try {
      if (editing === 'new') {
        await adminApiClient.post('/admin/jit-tips', draft)
      } else {
        await adminApiClient.put(`/admin/jit-tips/${editing}`, draft)
      }
      setEditing(null)
      await load()
    } catch (e: any) {
      alert(e?.response?.data?.detail ?? 'Could not save tip')
    } finally {
      setBusy(false)
    }
  }
  const deleteTip = async (tip: Tip) => {
    if (!confirm(`Delete the tip "${tip.title}"?`)) return
    await adminApiClient.delete(`/admin/jit-tips/${tip.id}`)
    await load()
  }
  const toggleDraftTag = (id: string) => {
    setDraft(d => ({
      ...d,
      tag_ids: d.tag_ids.includes(id) ? d.tag_ids.filter(x => x !== id) : [...d.tag_ids, id],
    }))
  }

  const tipForm = (
    <div style={{ background: 'var(--float-surface-muted)', borderRadius: 'var(--float-radius-card)', padding: '18px', marginTop: '12px' }}>
      <div style={{ marginBottom: '12px' }}>
        <span style={label}>Title</span>
        <input
          style={{ ...input, width: '100%' }}
          value={draft.title}
          onChange={e => setDraft({ ...draft, title: e.target.value })}
          placeholder="The goal isn't to feel calm"
        />
      </div>
      <div style={{ marginBottom: '12px' }}>
        <span style={label}>Body</span>
        <textarea
          style={{ ...input, width: '100%', minHeight: '64px', resize: 'vertical', fontFamily: 'inherit' }}
          value={draft.body}
          onChange={e => setDraft({ ...draft, body: e.target.value })}
          placeholder="It's to find out what actually happens when you don't avoid it."
        />
      </div>
      <div style={{ marginBottom: '12px' }}>
        <span style={label}>Tags</span>
        {draft.always_show && (
          <p style={{ fontSize: '12px', color: 'var(--float-text-hint)', margin: '0 0 6px' }}>
            Always-show tips appear on every exposure regardless of tags.
          </p>
        )}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          {tags.map(tag => {
            const on = draft.tag_ids.includes(tag.id)
            return (
              <button
                key={tag.id}
                onClick={() => toggleDraftTag(tag.id)}
                style={{
                  fontSize: '12px',
                  fontWeight: 600,
                  padding: '5px 11px',
                  borderRadius: 'var(--float-radius-pill)',
                  cursor: 'pointer',
                  border: `1px solid ${on ? 'var(--float-primary)' : 'var(--float-border-strong)'}`,
                  background: on ? 'var(--float-primary)' : 'var(--float-surface)',
                  color: on ? '#fff' : 'var(--float-text-secondary)',
                }}
              >
                {tag.label}
              </button>
            )
          })}
          {tags.length === 0 && (
            <span style={{ fontSize: '12px', color: 'var(--float-text-hint)' }}>No tags yet — add some above.</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--float-text)' }}>
          <input
            type="checkbox"
            checked={draft.always_show}
            onChange={e => setDraft({ ...draft, always_show: e.target.checked })}
          />
          Always show
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--float-text)' }}>
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={e => setDraft({ ...draft, is_active: e.target.checked })}
          />
          Active
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--float-text)' }}>
          Audience
          <select
            style={{ ...input, width: '110px' }}
            value={draft.audience}
            onChange={e => setDraft({ ...draft, audience: e.target.value })}
          >
            <option value="teen">Child</option>
            <option value="parent">Parent</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--float-text)' }}>
          Order
          <input
            type="number"
            style={{ ...input, width: '64px' }}
            value={draft.display_order}
            onChange={e => setDraft({ ...draft, display_order: parseInt(e.target.value) || 0 })}
          />
        </label>
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        <Button kind="primary" size="md" onClick={saveTip} disabled={busy}>
          {busy ? 'Saving…' : editing === 'new' ? 'Add tip' : 'Save changes'}
        </Button>
        <Button kind="quiet" size="md" onClick={() => setEditing(null)}>
          Cancel
        </Button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--float-bg)' }}>
      <header
        style={{
          background: 'var(--float-surface)',
          borderBottom: '1px solid var(--float-border)',
          padding: '16px 32px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <FloatLogo size="sm" />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 600,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--float-text-secondary)',
              background: 'var(--float-surface-sunken)',
              padding: '4px 10px',
              borderRadius: 'var(--float-radius-pill)',
            }}
          >
            Admin · Content
          </span>
          <button
            onClick={() => navigate('/admin/dashboard')}
            style={{ fontSize: '13px', color: 'var(--float-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ← Dashboard
          </button>
        </div>
        <button
          onClick={() => {
            logout()
            navigate('/admin/login')
          }}
          style={{ fontSize: '13px', color: 'var(--float-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </header>

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '32px' }}>
        {loading ? (
          <p style={{ color: 'var(--float-text-hint)' }}>Loading…</p>
        ) : (
          <>
            <ChecklistAdmin />

            {/* Tags */}
            <section style={card}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 4px', color: 'var(--float-text-strong)' }}>Tags</h2>
              <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', margin: '0 0 16px' }}>
                The vocabulary that connects tips to situations. Clinicians tag each situation; a tip
                shows when its tags overlap.
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                {tags.map(tag => (
                  <div
                    key={tag.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      border: '1px solid var(--float-border)',
                      borderRadius: 'var(--float-radius-pill)',
                      padding: '4px 6px 4px 12px',
                      opacity: tag.is_active ? 1 : 0.5,
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--float-text)' }}>{tag.label}</span>
                    <span style={{ fontSize: '11px', color: 'var(--float-text-hint)' }}>{tag.slug}</span>
                    <Button kind="secondary" size="sm" onClick={() => toggleTag(tag)}>
                      {tag.is_active ? 'Hide' : 'Show'}
                    </Button>
                    <Button kind="danger" size="sm" onClick={() => deleteTag(tag)}>
                      Delete
                    </Button>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <span style={label}>Label</span>
                  <input
                    style={input}
                    value={newTagLabel}
                    onChange={e => setNewTagLabel(e.target.value)}
                    placeholder="Social"
                  />
                </div>
                <div>
                  <span style={label}>Slug</span>
                  <input
                    style={input}
                    value={newTagSlug}
                    onChange={e => setNewTagSlug(e.target.value)}
                    placeholder="social"
                  />
                </div>
                <Button kind="primary" size="md" onClick={addTag} disabled={busy}>
                  Add tag
                </Button>
              </div>
            </section>

            {/* Tips */}
            <section style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--float-text-strong)' }}>Tips</h2>
                {editing !== 'new' && (
                  <Button kind="primary" size="md" onClick={startNew}>
                    + New tip
                  </Button>
                )}
              </div>
              <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', margin: '0 0 8px' }}>
                Shown on the teen exposure screen under “How to handle it.”
              </p>

              {editing === 'new' && tipForm}

              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {tips.map(tip => (
                  <div
                    key={tip.id}
                    style={{
                      border: '1px solid var(--float-border)',
                      borderRadius: 'var(--float-radius-card)',
                      padding: '16px',
                      opacity: tip.is_active ? 1 : 0.55,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', color: 'var(--float-text-hint)', fontFamily: 'monospace' }}>
                            #{tip.display_order}
                          </span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text-strong)' }}>{tip.title}</span>
                          {tip.audience === 'parent' && <Badge tone="primary">Parent</Badge>}
                          {tip.always_show && <Badge tone="primary">Always show</Badge>}
                          {!tip.is_active && <Badge tone="neutral">Inactive</Badge>}
                        </div>
                        <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', margin: '6px 0 0' }}>{tip.body}</p>
                        {tip.tag_ids.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                            {tip.tag_ids.map(id => (
                              <span
                                key={id}
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  padding: '3px 8px',
                                  borderRadius: 'var(--float-radius-pill)',
                                  background: 'var(--float-accent-purple-bg)',
                                  color: 'var(--float-accent-purple-text)',
                                }}
                              >
                                {tagLabel(id)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flex: 'none' }}>
                        <Button kind="secondary" size="sm" onClick={() => startEdit(tip)}>
                          Edit
                        </Button>
                        <Button kind="danger" size="sm" onClick={() => deleteTip(tip)}>
                          Delete
                        </Button>
                      </div>
                    </div>
                    {editing === tip.id && tipForm}
                  </div>
                ))}
                {tips.length === 0 && (
                  <p style={{ fontSize: '13px', color: 'var(--float-text-hint)' }}>No tips yet.</p>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
