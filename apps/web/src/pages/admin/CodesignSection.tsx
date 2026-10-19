import { useEffect, useState } from 'react'
import { adminApiClient } from '../../context/AdminAuthContext'
import { tdStyle as td, thStyle as th } from './tableStyles'

/**
 * Teens signed up for the November co-design sessions from floatcbt.com/codesign, by date, with
 * whether their parent has given permission. Sally sends the invites and payments by hand.
 * docs/plans/codesign-signup.md
 */
type Signup = {
  id: string
  teen_first_name: string
  teen_last_name: string
  teen_age: number
  teen_email: string
  parent_name: string
  parent_email: string
  permission: 'given' | 'waiting' | 'released'
  permission_given_at: string | null
  permission_given_by: string | null
  hold_ends_at: string
}

type Session = {
  id: string
  week: number
  label: string
  seats: number
  taken: number
  signups: Signup[]
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

function Permission({ s }: { s: Signup }) {
  if (s.permission === 'given') {
    return <span style={{ color: 'var(--float-success)' }}>Given by {s.permission_given_by}, {when(s.permission_given_at!)}</span>
  }
  if (s.permission === 'waiting') {
    return <span style={{ color: 'var(--float-warning)' }}>Waiting · seats held until {when(s.hold_ends_at)}</span>
  }
  return <span style={{ color: 'var(--float-text-hint)' }}>No permission after 3 days · seats released</span>
}

export default function CodesignSection({ cardStyle }: { cardStyle: React.CSSProperties }) {
  const [sessions, setSessions] = useState<Session[] | null>(null)

  useEffect(() => {
    adminApiClient.get('/codesign/signups').then(r => setSessions(r.data.sessions)).catch(() => setSessions([]))
  }, [])

  const teens = new Set((sessions ?? []).flatMap(s => s.signups.map(x => x.id))).size

  return (
    <section style={{ ...cardStyle, marginBottom: '32px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--float-text-strong)', margin: '0 0 4px' }}>
        Teen co-design sign-ups {teens > 0 && <span style={{ color: 'var(--float-text-secondary)', fontWeight: 400 }}>({teens})</span>}
      </h2>
      <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', margin: '0 0 16px' }}>
        From floatcbt.com/codesign. Each teen appears under both of their dates. Seats count teens with
        permission, plus those still inside their 3 days.
      </p>
      {sessions === null ? null : sessions.map(sess => {
        const over = sess.taken > sess.seats
        return (
          <div key={sess.id} style={{ marginBottom: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text)', margin: '0 0 8px' }}>
              Week {sess.week} · {sess.label}{' '}
              <span style={{ fontWeight: 400, color: over ? 'var(--float-danger)' : 'var(--float-text-secondary)' }}>
                {sess.taken} of {sess.seats} seats{over ? ' (over the limit)' : ''}
              </span>
            </h3>
            {sess.signups.length === 0 ? (
              <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', margin: 0 }}>No one yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Teen</th>
                    <th style={th}>Age</th>
                    <th style={th}>Teen email</th>
                    <th style={th}>Parent</th>
                    <th style={th}>Parent email</th>
                    <th style={th}>Permission</th>
                  </tr>
                </thead>
                <tbody>
                  {sess.signups.map(s => (
                    <tr key={s.id}>
                      <td style={td}>{s.teen_first_name} {s.teen_last_name}</td>
                      <td style={td}>{s.teen_age}</td>
                      <td style={td}>{s.teen_email}</td>
                      <td style={td}>{s.parent_name}</td>
                      <td style={td}>{s.parent_email}</td>
                      <td style={td}><Permission s={s} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}
    </section>
  )
}
