/**
 * Review results: what each reviewer said on a review link. Float admins only.
 * The review link itself only shows a reviewer their own marks. Backend: routers/admin_reviews.py.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth, adminApiClient } from '../../context/AdminAuthContext'
import FloatLogo from '../../components/ui/FloatLogo'

type Option = { v: string; label: string }
type Row = { id: string; text: string; detail?: string; compare?: { label: string; lines: string[] }[]; options: Option[]; proposed?: string }
type LogEntry = { situation?: string; fear?: string | number | null; child?: string | null; parent?: string | null }
type Item = { key: string; situation: string; log?: LogEntry[]; rows?: Row[]; suggestions?: string[] }
type Reviewer = { id: string; name: string; last_seen_at: string | null }
type RoundSummary = { id: string; slug: string; title: string; created_at: string | null; to_mark: number; reviewers: { name: string; marked: number; last_seen_at: string | null }[] }
type RoundDetail = {
  id: string; slug: string; title: string; items: Item[]; reviewers: Reviewer[]
  marks: Record<string, Record<string, string>>
  additions: Record<string, Record<string, string[]>>
  comments: Record<string, Record<string, string>>
}

const SHOW_HIDE: Option[] = [{ v: 'show', label: 'Show' }, { v: 'hide', label: 'Don’t show' }]

/** Every markable row in an item, in the same shape whether it is a sub-situation or an extraction round. */
export function rowsOf(item: Item): Row[] {
  return [
    ...(item.rows ?? []),
    ...(item.suggestions ?? []).map((text, i) => ({ id: String(i), text, options: SHOW_HIDE })),
  ]
}

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'not opened'

const card: React.CSSProperties = {
  background: 'var(--float-surface)', borderRadius: 'var(--float-radius-lg)', boxShadow: 'var(--float-shadow-sm)',
  padding: '20px 24px', marginBottom: '16px',
}

export default function AdminReviewsPage() {
  const navigate = useNavigate()
  const { logout } = useAdminAuth()
  const [rounds, setRounds] = useState<RoundSummary[] | null>(null)
  const [open, setOpen] = useState<RoundDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminApiClient.get('/admin/review-rounds')
      .then(r => setRounds(r.data))
      .catch(() => setError('Could not load review rounds.'))
  }, [])

  const openRound = (id: string) => {
    setError(null)
    adminApiClient.get(`/admin/review-rounds/${id}`)
      .then(r => setOpen(r.data))
      .catch(() => setError('Could not load that round.'))
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--float-bg)' }}>
      <header style={{ background: 'var(--float-surface)', borderBottom: '1px solid #e2e8f0', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <FloatLogo size="sm" />
          <span style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#64748b', background: '#f1f5f9', padding: '4px 10px', borderRadius: '999px' }}>
            Admin · Reviews
          </span>
          <button onClick={() => navigate('/admin/dashboard')} style={{ fontSize: '13px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
            ← Dashboard
          </button>
        </div>
        <button onClick={() => { logout(); navigate('/admin/login') }} style={{ fontSize: '13px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer' }}>
          Sign out
        </button>
      </header>

      <main style={{ maxWidth: '980px', margin: '0 auto', padding: '28px 16px' }}>
        {error && <p role="alert" style={{ color: '#b91c1c', fontSize: '13px' }}>{error}</p>}

        {!open && (
          <>
            <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: '0 0 16px' }}>Review rounds</h1>
            {rounds === null && !error && <p style={{ color: '#64748b', fontSize: '13px' }}>Loading…</p>}
            {rounds?.length === 0 && <p style={{ color: '#64748b', fontSize: '13px' }}>No review rounds yet.</p>}
            {rounds?.map(r => (
              <button key={r.id} onClick={() => openRound(r.id)} style={{ ...card, display: 'block', width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer' }}>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>{r.title}</div>
                <div style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 8px' }}>{r.slug} · {r.to_mark} to mark</div>
                <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                  {r.reviewers.map(v => (
                    <span key={v.name} style={{ fontSize: '12.5px', color: '#334155' }}>
                      <strong>{v.name}</strong>: {v.marked} of {r.to_mark} · {when(v.last_seen_at)}
                    </span>
                  ))}
                </div>
              </button>
            ))}
          </>
        )}

        {open && <RoundResults round={open} onBack={() => setOpen(null)} />}
      </main>
    </div>
  )
}

export function RoundResults({ round, onBack }: { round: RoundDetail; onBack: () => void }) {
  return (
    <>
      <button onClick={onBack} style={{ fontSize: '13px', color: '#64748b', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '10px' }}>← All rounds</button>
      <h1 style={{ fontSize: '20px', fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>{round.title}</h1>
      <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 18px' }}>
        {round.slug} · {round.reviewers.map(v => `${v.name} (${when(v.last_seen_at)})`).join(', ') || 'no reviewers'}
      </p>

      {round.items.map(item => {
        const said = round.reviewers.filter(v => round.comments[v.id]?.[item.key] || round.additions[v.id]?.[item.key]?.length)
        return (
          <section key={item.key} style={card}>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>{item.situation}</h2>
            {item.log && item.log.length > 0 && (
              <details style={{ marginBottom: '10px' }}>
                <summary style={{ fontSize: '12px', color: '#64748b', cursor: 'pointer' }}>What the parent wrote</summary>
                {item.log.map((e, i) => (
                  <p key={i} style={{ fontSize: '12.5px', color: '#475569', margin: '6px 0 0' }}>
                    <strong>{e.situation}</strong>{e.fear != null && e.fear !== '' ? ` · fear ${e.fear}/10` : ''}. {e.child} {e.parent ? <><em>Parent did:</em> {e.parent}</> : null}
                  </p>
                ))}
              </details>
            )}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead>
                  <tr>
                    <th style={th}>Item</th>
                    {round.reviewers.map(v => <th key={v.id} style={th}>{v.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {rowsOf(item).map(row => (
                    <tr key={row.id}>
                      <td style={td}>
                        <div style={{ color: '#0f172a' }}>{row.text}</div>
                        {row.detail && <div style={{ color: '#94a3b8', fontSize: '11.5px' }}>{row.detail}</div>}
                        {row.compare?.map(side => (
                          <div key={side.label} style={{ color: '#64748b', fontSize: '11.5px' }}><strong>{side.label}:</strong> {side.lines.join('; ')}</div>
                        ))}
                      </td>
                      {round.reviewers.map(v => {
                        const choice = round.marks[v.id]?.[`${item.key}:${row.id}`]
                        const label = row.options.find(o => o.v === choice)?.label
                        const differs = row.proposed && choice && choice !== row.proposed
                        return (
                          <td key={v.id} style={{ ...td, fontWeight: choice ? 600 : 400, color: differs ? '#b45309' : choice ? '#0f172a' : '#cbd5e1' }}>
                            {label ?? '—'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {said.map(v => (
              <div key={v.id} style={{ marginTop: '10px', fontSize: '12.5px', color: '#334155' }}>
                <strong>{v.name}</strong>
                {round.additions[v.id]?.[item.key]?.map((a, i) => <div key={i}>+ {a}</div>)}
                {round.comments[v.id]?.[item.key] && <p style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{round.comments[v.id][item.key]}</p>}
              </div>
            ))}
          </section>
        )
      })}
    </>
  )
}

const th: React.CSSProperties = { textAlign: 'left', fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8', padding: '6px 8px', borderBottom: '1px solid #e2e8f0' }
const td: React.CSSProperties = { padding: '8px', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' }
