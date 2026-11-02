import { useEffect, useState, type ReactNode } from 'react'
import { cardStyle, tdStyle as td, thStyle as th } from './tableStyles'

/**
 * Who signed up for the November co-design sessions from floatcbt.com/codesign, in two groups kept
 * apart: high school (13 to 17), by date, with what the parent's permission form said; and college
 * (18 to 20), who agreed for themselves when they signed up. Sally sends the invites and payments
 * by hand. docs/plans/codesign-signup.md
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
  parent_relationship: string | null
  parent_session_phone: string | null
  parent_phone: string | null
  parent_contact_email: string | null
  hold_ends_at: string
}

type CollegeSignup = {
  id: string
  first_name: string
  last_name: string
  age: number
  email: string
  confirmed_at: string
  recording_agreed: boolean
}

type Session<S> = {
  id: string
  week: number
  label: string
  seats: number
  taken: number
  signups: S[]
}

export type CodesignSession = Session<Signup>
export type CollegeSession = Session<CollegeSignup>
export type CodesignSignups = { sessions: CodesignSession[]; college_sessions: CollegeSession[] }

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

const sub = { fontSize: '12px', color: 'var(--float-text-secondary)', marginTop: '2px' }
const note = { fontSize: '13px', color: 'var(--float-text-secondary)', margin: '0 0 16px' }

// Recording is only known once the form is sent; before that they show as a dash.
const answered = (s: Signup) => s.form_submitted_at !== null

const people = (sessions: Session<{ id: string }>[]) =>
  new Set(sessions.flatMap(s => s.signups.map(x => x.id))).size

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

function GroupHeading({ title, count }: { title: string; count: number }) {
  return (
    <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--float-text-strong)', margin: '0 0 4px' }}>
      {title} {count > 0 && <span style={{ color: 'var(--float-text-secondary)', fontWeight: 400 }}>({count})</span>}
    </h3>
  )
}

/** One date: its heading with the seat count, then its table, or "No one yet." */
function SessionBlock<S>({ sess, title, table }: {
  sess: Session<S>
  title: string
  table: (signups: S[]) => ReactNode
}) {
  const over = sess.taken > sess.seats
  return (
    <div style={{ marginBottom: '20px' }}>
      <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text)', margin: '0 0 8px' }}>
        {title}{' '}
        <span style={{ fontWeight: 400, color: over ? 'var(--float-danger)' : 'var(--float-text-secondary)' }}>
          {sess.taken} of {sess.seats} seats{over ? ' (over the limit)' : ''}
        </span>
      </h4>
      {sess.signups.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', margin: 0 }}>No one yet.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>{table(sess.signups)}</table>
        </div>
      )}
    </div>
  )
}

const highSchoolTable = (signups: Signup[]) => (
  <>
    <thead>
      <tr>
        <th style={th}>Teen</th>
        <th style={th}>Parent</th>
        <th style={th}>Number during session</th>
        <th style={th}>Status</th>
        <th style={th}>Recording</th>
      </tr>
    </thead>
    <tbody>
      {signups.map(s => (
        <tr key={s.id}>
          <td style={td}>
            {s.teen_first_name} {s.teen_last_name}
            <div style={sub}>Age {s.teen_age} · {s.teen_email}</div>
          </td>
          <td style={td}>
            {s.parent_name}{s.parent_relationship && ` (${s.parent_relationship})`}
            <div style={sub}>{s.parent_email}</div>
            {s.parent_contact_email && s.parent_contact_email !== s.parent_email && (
              <div style={sub}>On the form: {s.parent_contact_email}</div>
            )}
          </td>
          <td style={{ ...td, whiteSpace: 'nowrap' }}>
            {s.parent_session_phone ?? '—'}
            {s.parent_phone && s.parent_phone !== s.parent_session_phone && (
              <div style={sub}>Other: {s.parent_phone}</div>
            )}
          </td>
          <td style={{ ...td, minWidth: '180px' }}><Permission s={s} /></td>
          <td style={td}>{answered(s) ? (s.recording_allowed ? 'Yes' : 'No') : '—'}</td>
        </tr>
      ))}
    </tbody>
  </>
)

// No parent, no permission status: a college student is confirmed when they sign up.
const collegeTable = (signups: CollegeSignup[]) => (
  <>
    <thead>
      <tr>
        <th style={th}>Student</th>
        <th style={th}>Age</th>
        <th style={th}>Email</th>
        <th style={th}>Confirmed</th>
        <th style={th}>Recording agreed</th>
      </tr>
    </thead>
    <tbody>
      {signups.map(s => (
        <tr key={s.id}>
          <td style={td}>{s.first_name} {s.last_name}</td>
          <td style={td}>{s.age}</td>
          <td style={td}>{s.email}</td>
          <td style={{ ...td, color: 'var(--float-success)' }}>{when(s.confirmed_at)}</td>
          <td style={td}>{s.recording_agreed ? 'Yes' : 'No'}</td>
        </tr>
      ))}
    </tbody>
  </>
)

export default function CodesignSection({ load }: { load: () => Promise<CodesignSignups> }) {
  const [list, setList] = useState<CodesignSignups | null>(null)
  // Said out loud rather than shown as an empty list, which would read as "nobody signed up".
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    load().then(setList).catch(() => setFailed(true))
  }, [load])

  return (
    <section style={{ ...cardStyle, marginBottom: '32px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--float-text-strong)', margin: '0 0 16px' }}>
        Co-design sign-ups
      </h2>
      {failed && (
        <p style={{ fontSize: '13px', color: 'var(--float-danger)', margin: 0 }}>
          Could not load the sign-ups. Reload the page to try again.
        </p>
      )}
      {list && (
        <>
          <div data-testid="codesign-high-school" style={{ marginBottom: '32px' }}>
            <GroupHeading title="High school, ages 13 to 17" count={people(list.sessions)} />
            <p style={note}>
              From floatcbt.com/codesign/high-school. Each teen appears under both of their dates. Seats
              count confirmed teens, plus those still inside their 3 days with no answer yet. Recording
              is the parent's answer on the permission form.
            </p>
            {list.sessions.map(sess => (
              <SessionBlock key={sess.id} sess={sess} title={`Week ${sess.week} · ${sess.label}`} table={highSchoolTable} />
            ))}
          </div>
          <div data-testid="codesign-college">
            <GroupHeading title="College, ages 18 to 20" count={people(list.college_sessions)} />
            <p style={note}>
              From floatcbt.com/codesign/college. One session each. No parent: each student ticked both
              boxes, agreeing to take part and to the recording, and was confirmed when they signed up.
            </p>
            {list.college_sessions.map(sess => (
              <SessionBlock key={sess.id} sess={sess} title={sess.label} table={collegeTable} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
