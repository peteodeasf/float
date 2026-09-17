import { useEffect, useState } from 'react'
import { adminApiClient } from '../../context/AdminAuthContext'
import { Button } from '../../components/ui/primitives'
import { tdStyle as td, thStyle as th } from './tableStyles'

/**
 * Practices asking to use Float, from the public Request access page. Approving creates the
 * practice and emails the person a setup link. Not the waitlist.
 * docs/plans/clinician-practice-onboarding.md, step 2.
 */
type AccessRequest = {
  id: string
  name: string
  email: string
  role: 'practitioner' | 'practice_manager'
  credentials: string | null
  practice_name: string
  state: string
  practice_size: number
  status: 'new' | 'approved' | 'declined'
  created_at: string | null
}

export default function AccessRequestsSection({ cardStyle, onApproved }: {
  cardStyle: React.CSSProperties
  onApproved: () => void
}) {
  const [requests, setRequests] = useState<AccessRequest[]>([])
  const [showDone, setShowDone] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => setRequests((await adminApiClient.get('/admin/access-requests')).data)
  useEffect(() => { load() }, [])

  const act = async (id: string, action: 'approve' | 'decline') => {
    setBusyId(id)
    try {
      await adminApiClient.post(`/admin/access-requests/${id}/${action}`)
      if (action === 'approve') onApproved()
    } catch (err: any) {
      alert(err?.response?.data?.detail ?? 'Something went wrong. Please try again.')
    } finally {
      setBusyId(null)
      await load()
    }
  }

  const shown = requests.filter(r => showDone || r.status === 'new')
  const waiting = requests.filter(r => r.status === 'new').length

  return (
    <section style={{ ...cardStyle, marginBottom: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--float-text-strong)', margin: 0 }}>
          Access requests {waiting > 0 && <span style={{ color: 'var(--float-success)' }}>({waiting} waiting)</span>}
        </h2>
        <label style={{ fontSize: '13px', color: 'var(--float-text-secondary)', display: 'flex', gap: '6px', alignItems: 'center' }}>
          <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
          Show approved and declined
        </label>
      </div>
      <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', margin: '0 0 12px' }}>
        Approving creates the practice and emails the person a link to set it up. Declining sends nothing.
      </p>
      {shown.length === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', margin: 0 }}>No requests waiting.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Practice</th><th style={th}>Person</th><th style={th}>Role</th>
              <th style={th}>Size</th><th style={th}>Received</th><th style={th}></th>
            </tr>
          </thead>
          <tbody>
            {shown.map(r => (
              <tr key={r.id}>
                <td style={td}>{r.practice_name}<div style={{ color: 'var(--float-text-hint)' }}>{r.state}</div></td>
                <td style={td}>
                  {r.name}{r.credentials ? `, ${r.credentials}` : ''}
                  <div style={{ color: 'var(--float-text-hint)' }}>{r.email}</div>
                </td>
                <td style={td}>{r.role === 'practice_manager' ? 'Office manager' : 'Clinician'}</td>
                <td style={td}>{r.practice_size}</td>
                <td style={td}>{r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}</td>
                <td style={td}>
                  {r.status === 'new' ? (
                    <>
                      <Button kind="primary" size="sm" disabled={busyId === r.id} onClick={() => act(r.id, 'approve')}
                        style={{ marginRight: '6px' }}>Approve</Button>
                      <Button kind="quiet" size="sm" disabled={busyId === r.id} onClick={() => act(r.id, 'decline')}>Decline</Button>
                    </>
                  ) : (
                    <span style={{ color: r.status === 'approved' ? 'var(--float-success)' : 'var(--float-text-hint)' }}>
                      {r.status === 'approved' ? 'Approved' : 'Declined'}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
