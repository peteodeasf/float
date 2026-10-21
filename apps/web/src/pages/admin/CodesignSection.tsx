import { useEffect, useState } from 'react'
import { cardStyle, tdStyle as td, thStyle as th } from './tableStyles'

/**
 * Teens signed up for the November co-design sessions from floatcbt.com/codesign, by date, with
 * what the permission form said: confirmed or declined, and whether recording and quotes are
 * allowed. Sally sends the invites and payments by hand.
 * docs/plans/codesign-signup.md
 *
 * Read-only. Shown in the admin dashboard and on /codesign/signups for the clinicians named in
 * CODESIGN_VIEWERS (docs/plans/codesign-viewer.md); each passes in how it fetches the list.
 */
type Signup = {
  id: string
  teen_first_name: string
  teen_last_name: string
  teen_age: number
  teen_email: string
  parent_name: string
  parent_email: string
  permission: 'confirmed' | 'declined' | 'waiting' | 'released'
  permission_given_at: string | null
  permission_given_by: string | null
  form_submitted_at: string | null
  recording_allowed: boolean
  quotes_allowed: boolean
  completed_by: string | null
  parent_relationship: string | null
  parent_session_phone: string | null
  hold_ends_at: string
}

export type CodesignSession = {
  id: string
  week: number
  label: string
  seats: number
  taken: number
  signups: Signup[]
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const sub = { fontSize: '12px', color: 'var(--float-text-secondary)', marginTop: '2px' }

// Recording and quotes are only known once the form is sent; before that they show as a dash.
const answered = (s: Signup) => s.form_submitted_at !== null

function Permission({ s }: { s: Signup }) {
  if (s.permission === 'confirmed') {
    return <span style={{ color: 'var(--float-success)' }}>Confirmed by {s.permission_given_by}, {when(s.permission_given_at!)}</span>
  }
  if (s.permission === 'declined') {
    return <span style={{ color: 'var(--float-danger)' }}>Declined, {when(s.form_submitted_at!)} · seats released</span>
  }
  if (s.permission === 'waiting') {
    return <span style={{ color: 'var(--float-warning)' }}>Waiting · seats held until {when(s.hold_ends_at)}</span>
  }
  return <span style={{ color: 'var(--float-text-hint)' }}>No permission after 3 days · seats released</span>
}

export default function CodesignSection({ load }: { load: () => Promise<CodesignSession[]> }) {
  const [sessions, setSessions] = useState<CodesignSession[] | null>(null)
  // Said out loud rather than shown as an empty list, which would read as "nobody signed up".
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    load().then(setSessions).catch(() => setFailed(true))
  }, [load])

  const teens = new Set((sessions ?? []).flatMap(s => s.signups.map(x => x.id))).size

  return (
    <section style={{ ...cardStyle, marginBottom: '32px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--float-text-strong)', margin: '0 0 4px' }}>
        Teen co-design sign-ups {teens > 0 && <span style={{ color: 'var(--float-text-secondary)', fontWeight: 400 }}>({teens})</span>}
      </h2>
      <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', margin: '0 0 16px' }}>
        From floatcbt.com/codesign. Each teen appears under both of their dates. Seats count confirmed
        teens, plus those still inside their 3 days with no answer yet. Recording is allowed only when
        the parent and the teen both said yes.
      </p>
      {failed && (
        <p style={{ fontSize: '13px', color: 'var(--float-danger)', margin: 0 }}>
          Could not load the sign-ups. Reload the page to try again.
        </p>
      )}
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
              <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Teen</th>
                    <th style={th}>Teen email</th>
                    <th style={th}>Parent</th>
                    <th style={th}>Parent email</th>
                    <th style={th}>Number during session</th>
                    <th style={th}>Status</th>
                    <th style={th}>Recording</th>
                    <th style={th}>Quotes</th>
                    <th style={th}>Completed by</th>
                  </tr>
                </thead>
                <tbody>
                  {sess.signups.map(s => (
                    <tr key={s.id}>
                      <td style={td}>
                        {s.teen_first_name} {s.teen_last_name}
                        <div style={sub}>Age {s.teen_age}</div>
                      </td>
                      <td style={td}>{s.teen_email}</td>
                      <td style={td}>
                        {s.parent_name}
                        {s.parent_relationship && <div style={sub}>{s.parent_relationship}</div>}
                      </td>
                      <td style={td}>{s.parent_email}</td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>{s.parent_session_phone ?? '—'}</td>
                      <td style={{ ...td, minWidth: '180px' }}><Permission s={s} /></td>
                      <td style={td}>{answered(s) ? (s.recording_allowed ? 'Yes' : 'No') : '—'}</td>
                      <td style={td}>{answered(s) ? (s.quotes_allowed ? 'Yes' : 'No') : '—'}</td>
                      <td style={td}>{s.completed_by ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        )
      })}
    </section>
  )
}
