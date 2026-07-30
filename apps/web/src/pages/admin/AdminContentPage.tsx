import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth, adminApiClient } from '../../context/AdminAuthContext'
import FloatLogo from '../../components/ui/FloatLogo'

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
  border: '1px solid #cbd5e1',
  borderRadius: '8px',
  color: '#0f172a',
  background: '#fff',
}
const primaryBtn: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 600,
  padding: '8px 14px',
  borderRadius: '8px',
  border: 'none',
  background: 'var(--float-primary)',
  color: '#fff',
  cursor: 'pointer',
}
const ghostBtn: React.CSSProperties = {
  fontSize: '12px',
  padding: '5px 10px',
  borderRadius: '6px',
  border: '1px solid #e2e8f0',
  background: '#fff',
  color: '#475569',
  cursor: 'pointer',
}
const label: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: '#64748b',
  display: 'block',
  marginBottom: '4px',
}
const pill = (active: boolean): React.CSSProperties => ({
  fontSize: '11px',
  fontWeight: 600,
  padding: '3px 8px',
  borderRadius: '999px',
  background: active ? '#e1f5ee' : '#f1f5f9',
  color: active ? '#0f6e56' : '#94a3b8',
})

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
    <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '18px', marginTop: '12px' }}>
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
          <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 6px' }}>
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
                  borderRadius: '999px',
                  cursor: 'pointer',
                  border: `1px solid ${on ? 'var(--float-primary)' : '#cbd5e1'}`,
                  background: on ? 'var(--float-primary)' : '#fff',
                  color: on ? '#fff' : '#475569',
                }}
              >
                {tag.label}
              </button>
            )
          })}
          {tags.length === 0 && (
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>No tags yet — add some above.</span>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#334155' }}>
          <input
            type="checkbox"
            checked={draft.always_show}
            onChange={e => setDraft({ ...draft, always_show: e.target.checked })}
          />
          Always show
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#334155' }}>
          <input
            type="checkbox"
            checked={draft.is_active}
            onChange={e => setDraft({ ...draft, is_active: e.target.checked })}
          />
          Active
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#334155' }}>
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
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#334155' }}>
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
        <button style={primaryBtn} onClick={saveTip} disabled={busy}>
          {busy ? 'Saving…' : editing === 'new' ? 'Add tip' : 'Save changes'}
        </button>
        <button style={ghostBtn} onClick={() => setEditing(null)}>
          Cancel
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--float-bg)' }}>
      <header
        style={{
          background: 'var(--float-surface)',
          borderBottom: '1px solid #e2e8f0',
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
              color: '#64748b',
              background: '#f1f5f9',
              padding: '4px 10px',
              borderRadius: '999px',
            }}
          >
            Admin · Content
          </span>
          <button
            onClick={() => navigate('/admin/dashboard')}
            style={{ fontSize: '13px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ← Dashboard
          </button>
        </div>
        <button
          onClick={() => {
            logout()
            navigate('/admin/login')
          }}
          style={{ fontSize: '13px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </header>

      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '32px' }}>
        {loading ? (
          <p style={{ color: '#94a3b8' }}>Loading…</p>
        ) : (
          <>
            {/* Tags */}
            <section style={card}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 4px', color: '#0f172a' }}>Tags</h2>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 16px' }}>
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
                      border: '1px solid #e2e8f0',
                      borderRadius: '999px',
                      padding: '4px 6px 4px 12px',
                      opacity: tag.is_active ? 1 : 0.5,
                    }}
                  >
                    <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>{tag.label}</span>
                    <span style={{ fontSize: '11px', color: '#94a3b8' }}>{tag.slug}</span>
                    <button style={ghostBtn} onClick={() => toggleTag(tag)}>
                      {tag.is_active ? 'Hide' : 'Show'}
                    </button>
                    <button
                      style={{ ...ghostBtn, color: '#b91c1c', borderColor: '#fecaca' }}
                      onClick={() => deleteTag(tag)}
                    >
                      Delete
                    </button>
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
                <button style={primaryBtn} onClick={addTag} disabled={busy}>
                  Add tag
                </button>
              </div>
            </section>

            {/* Tips */}
            <section style={card}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#0f172a' }}>Tips</h2>
                {editing !== 'new' && (
                  <button style={primaryBtn} onClick={startNew}>
                    + New tip
                  </button>
                )}
              </div>
              <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 8px' }}>
                Shown on the teen exposure screen under “How to handle it.”
              </p>

              {editing === 'new' && tipForm}

              <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {tips.map(tip => (
                  <div
                    key={tip.id}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: '10px',
                      padding: '16px',
                      opacity: tip.is_active ? 1 : 0.55,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>
                            #{tip.display_order}
                          </span>
                          <span style={{ fontSize: '14px', fontWeight: 600, color: '#0f172a' }}>{tip.title}</span>
                          {tip.audience === 'parent' && <span style={pill(true)}>Parent</span>}
                          {tip.always_show && <span style={pill(true)}>Always show</span>}
                          {!tip.is_active && <span style={pill(false)}>Inactive</span>}
                        </div>
                        <p style={{ fontSize: '13px', color: '#475569', margin: '6px 0 0' }}>{tip.body}</p>
                        {tip.tag_ids.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                            {tip.tag_ids.map(id => (
                              <span
                                key={id}
                                style={{
                                  fontSize: '11px',
                                  fontWeight: 600,
                                  padding: '3px 8px',
                                  borderRadius: '999px',
                                  background: '#eef2ff',
                                  color: '#4338ca',
                                }}
                              >
                                {tagLabel(id)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flex: 'none' }}>
                        <button style={ghostBtn} onClick={() => startEdit(tip)}>
                          Edit
                        </button>
                        <button
                          style={{ ...ghostBtn, color: '#b91c1c', borderColor: '#fecaca' }}
                          onClick={() => deleteTip(tip)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {editing === tip.id && tipForm}
                  </div>
                ))}
                {tips.length === 0 && (
                  <p style={{ fontSize: '13px', color: '#94a3b8' }}>No tips yet.</p>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
