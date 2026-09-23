import { btn } from '../../components/ui/buttons'
import { Button, Banner } from '../../components/ui/primitives'
import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth, adminApiClient, createClinician } from '../../context/AdminAuthContext'
import FloatLogo from '../../components/ui/FloatLogo'
import AccessRequestsSection from './AccessRequestsSection'
import { tdStyle, thStyle } from './tableStyles'

type Stats = {
  total_users: number
  total_clinicians: number
  total_patients: number
  total_organizations: number
  total_experiments_completed: number
  recent_signups: Array<{ id: string; email: string; role: string | null; created_at: string | null }>
}

type AdminUser = {
  id: string
  email: string
  role: string | null
  organization: string | null
  created_at: string | null
  last_login: string | null
  must_change_password: boolean
  awaiting_setup: boolean
}

type AdminOrg = {
  id: string
  name: string
  status: 'setting_up' | 'active'
  suspended: boolean
  clinician_count: number
  patient_count: number
  created_at: string | null
}

type AdminOrgDetail = {
  id: string
  name: string
  clinicians: Array<{ id: string; name: string; email: string | null }>
  patients: Array<{ id: string; name: string; age: number | null }>
}

type AdminPatient = {
  id: string
  name: string
  age: number | null
  gender: string | null
  organization: string | null
  clinician: string | null
  plan_status: string | null
  experiment_count: number
  last_activity: string | null
}

type WaitlistEntry = {
  id: string
  first_name: string
  last_name: string
  email: string
  role: string
  created_at: string | null
}

const cardStyle: React.CSSProperties = {
  background: 'var(--float-surface)',
  borderRadius: 'var(--float-radius-lg)',
  boxShadow: 'var(--float-shadow-sm)',
  padding: '24px',
}

// A form field inside the admin panels. One border, radius and padding for all of them.
const formInput: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  fontSize: '13px',
  border: '1px solid var(--float-border)',
  borderRadius: 'var(--float-radius-control)',
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString()
  } catch {
    return iso
  }
}

export default function AdminDashboardPage() {
  const { logout } = useAdminAuth()
  const navigate = useNavigate()

  const [stats, setStats] = useState<Stats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [orgs, setOrgs] = useState<AdminOrg[]>([])
  const [patients, setPatients] = useState<AdminPatient[]>([])
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [userFilter, setUserFilter] = useState<'all' | 'practitioner' | 'patient' | 'admin'>('all')

  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null)
  const [confirmDeletePatientId, setConfirmDeletePatientId] = useState<string | null>(null)
  const [confirmDeleteWaitlistId, setConfirmDeleteWaitlistId] = useState<string | null>(null)
  const [resetSentFor, setResetSentFor] = useState<string | null>(null)

  const [showNewOrg, setShowNewOrg] = useState(false)
  const [newOrgName, setNewOrgName] = useState('')
  const [newOrgAdminEmail, setNewOrgAdminEmail] = useState('')

  const [showNewClinician, setShowNewClinician] = useState(false)
  const [newClinicianName, setNewClinicianName] = useState('')
  const [newClinicianEmail, setNewClinicianEmail] = useState('')
  const [newClinicianOrgId, setNewClinicianOrgId] = useState('')
  const [newClinicianError, setNewClinicianError] = useState<string | null>(null)
  const [newClinicianSubmitting, setNewClinicianSubmitting] = useState(false)
  const [clinicianCreatedMsg, setClinicianCreatedMsg] = useState<string | null>(null)

  const [expandedOrgId, setExpandedOrgId] = useState<string | null>(null)
  const [expandedOrgDetail, setExpandedOrgDetail] = useState<AdminOrgDetail | null>(null)

  const loadAll = async () => {
    const [s, u, o, p, w] = await Promise.all([
      adminApiClient.get('/admin/stats'),
      adminApiClient.get('/admin/users'),
      adminApiClient.get('/admin/organizations'),
      adminApiClient.get('/admin/patients'),
      adminApiClient.get('/waitlist'),
    ])
    setStats(s.data)
    setUsers(u.data)
    setOrgs(o.data)
    setPatients(p.data)
    setWaitlist(w.data)
  }

  useEffect(() => {
    loadAll().catch(() => {})
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/admin/login')
  }

  const handleDeleteUser = async (id: string) => {
    console.log('delete user clicked', id)
    try {
      await adminApiClient.delete(`/admin/users/${id}`)
      setConfirmDeleteUserId(null)
      await loadAll()
    } catch (err) {
      console.error('delete user failed', err)
      alert('Failed to delete user. See console for details.')
      setConfirmDeleteUserId(null)
    }
  }

  // A clinician who has never chosen a password gets a new setup link; everyone else a reset email.
  const handleSendPasswordEmail = async (u: AdminUser) => {
    const path = u.awaiting_setup
      ? `/admin/clinicians/${u.id}/setup-link`
      : `/admin/users/${u.id}/reset-password`
    try {
      await adminApiClient.post(path)
    } catch (err: any) {
      // Most likely the clinician finished setup after this list loaded. Say so and refresh the row.
      alert(err?.response?.data?.detail ?? 'Failed to send the email. Please try again.')
      await loadAll()
      return
    }
    setResetSentFor(u.id)
    setTimeout(() => setResetSentFor((cur) => (cur === u.id ? null : cur)), 3000)
  }

  const handleDeletePatient = async (id: string) => {
    console.log('delete patient clicked', id)
    try {
      await adminApiClient.delete(`/admin/patients/${id}`)
      setConfirmDeletePatientId(null)
      await loadAll()
    } catch (err) {
      console.error('delete patient failed', err)
      alert('Failed to delete patient. See console for details.')
      setConfirmDeletePatientId(null)
    }
  }

  const handleDeleteWaitlist = async (id: string) => {
    try {
      await adminApiClient.delete(`/waitlist/${id}`)
      setConfirmDeleteWaitlistId(null)
      await loadAll()
    } catch (err) {
      console.error('delete waitlist entry failed', err)
      alert('Failed to delete the waitlist entry. See console for details.')
      setConfirmDeleteWaitlistId(null)
    }
  }

  const handleCreateClinician = async (e: React.FormEvent) => {
    e.preventDefault()
    setNewClinicianError(null)
    setNewClinicianSubmitting(true)
    try {
      const email = newClinicianEmail.trim()
      await createClinician({
        name: newClinicianName.trim(),
        email,
        organization_id: newClinicianOrgId,
      })
      setClinicianCreatedMsg(`✓ Clinician account created and invitation sent to ${email}`)
      setShowNewClinician(false)
      setNewClinicianName('')
      setNewClinicianEmail('')
      setNewClinicianOrgId('')
      await loadAll()
      setTimeout(() => setClinicianCreatedMsg(null), 5000)
    } catch (err: any) {
      if (err?.response?.status === 400) {
        setNewClinicianError('A user with that email already exists.')
      } else {
        setNewClinicianError('Failed to create clinician. Please try again.')
      }
    } finally {
      setNewClinicianSubmitting(false)
    }
  }

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await adminApiClient.post('/admin/organizations', {
        name: newOrgName,
        admin_email: newOrgAdminEmail || null,
      })
    } catch (err: any) {
      alert(err?.response?.data?.detail ?? 'Failed to create the organization.')
      return
    }
    setShowNewOrg(false)
    setNewOrgName('')
    setNewOrgAdminEmail('')
    await loadAll()
  }

  const handleOrgSuspended = async (org: AdminOrg) => {
    if (!org.suspended && !confirm(`Suspend ${org.name}? Nobody there will be able to use Float until you let them back in.`)) return
    await adminApiClient.put(`/admin/organizations/${org.id}/suspended`, { suspended: !org.suspended })
    await loadAll()
  }

  const handleExpandOrg = async (orgId: string) => {
    if (expandedOrgId === orgId) {
      setExpandedOrgId(null)
      setExpandedOrgDetail(null)
      return
    }
    setExpandedOrgId(orgId)
    setExpandedOrgDetail(null)
    const res = await adminApiClient.get(`/admin/organizations/${orgId}`)
    setExpandedOrgDetail(res.data)
  }

  const filteredUsers = users.filter((u) =>
    userFilter === 'all' ? true : u.role === userFilter
  )

  return (
    <div style={{ minHeight: '100vh', background: 'var(--float-bg)' }}>
      {/* Top nav */}
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
            Admin
          </span>
          <button
            onClick={() => navigate('/admin/content')}
            style={{ fontSize: '13px', color: 'var(--float-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Content
          </button>
          <button
            onClick={() => navigate('/admin/reviews')}
            style={{ fontSize: '13px', color: 'var(--float-text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Reviews
          </button>
        </div>
        <button
          onClick={handleLogout}
          style={{
            fontSize: '13px',
            color: 'var(--float-text-secondary)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Sign out
        </button>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '32px' }}>
        {/* Stats row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '16px',
            marginBottom: '32px',
          }}
        >
          {[
            { label: 'Total users', value: stats?.total_users ?? '—' },
            { label: 'Clinicians', value: stats?.total_clinicians ?? '—' },
            { label: 'Patients', value: stats?.total_patients ?? '—' },
            { label: 'Experiments completed', value: stats?.total_experiments_completed ?? '—' },
          ].map((s) => (
            <div key={s.label} style={cardStyle}>
              <p style={{ fontSize: '12px', color: 'var(--float-text-secondary)', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {s.label}
              </p>
              <p style={{ fontSize: '32px', fontWeight: 600, color: 'var(--float-text-strong)', margin: '8px 0 0' }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Recent signups */}
        <section style={{ ...cardStyle, marginBottom: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px', color: 'var(--float-text-strong)' }}>
            Recent signups
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Joined</th>
              </tr>
            </thead>
            <tbody>
              {(stats?.recent_signups ?? []).map((u) => (
                <tr key={u.id}>
                  <td style={tdStyle}>{u.email}</td>
                  <td style={tdStyle}>{u.role ?? '—'}</td>
                  <td style={tdStyle}>{formatDate(u.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <AccessRequestsSection cardStyle={cardStyle} onApproved={loadAll} />

        {/* Users */}
        <section style={{ ...cardStyle, marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--float-text-strong)' }}>Users</h2>
              <Button
                kind="primary"
                size="sm"
                onClick={() => {
                  setShowNewClinician((v) => !v)
                  setNewClinicianError(null)
                }}
              >
                + New clinician
              </Button>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['all', 'practitioner', 'patient', 'admin'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setUserFilter(f)}
                  style={{
                    ...btn('secondary', 'sm'),
                    background: userFilter === f ? 'var(--float-primary)' : 'var(--float-surface)',
                    color: userFilter === f ? '#fff' : 'var(--float-text)',
                    borderColor: userFilter === f ? 'var(--float-primary)' : 'var(--float-border)',
                    textTransform: 'capitalize',
                  }}
                >
                  {f === 'all' ? 'All' : f === 'practitioner' ? 'Clinicians' : f + 's'}
                </button>
              ))}
            </div>
          </div>

          {clinicianCreatedMsg && (
            <Banner tone="success" style={{ marginBottom: '12px' }}>
              {clinicianCreatedMsg}
            </Banner>
          )}

          {showNewClinician && (
            <form
              onSubmit={handleCreateClinician}
              style={{
                background: 'var(--float-surface-muted)',
                padding: '16px',
                borderRadius: 'var(--float-radius-card)',
                marginBottom: '16px',
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
              }}
            >
              <div style={{ flex: '1 1 180px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--float-text-secondary)', marginBottom: '4px' }}>
                  Name
                </label>
                <input
                  value={newClinicianName}
                  onChange={(e) => setNewClinicianName(e.target.value)}
                  required
                  style={formInput}
                />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--float-text-secondary)', marginBottom: '4px' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={newClinicianEmail}
                  onChange={(e) => setNewClinicianEmail(e.target.value)}
                  required
                  style={formInput}
                />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--float-text-secondary)', marginBottom: '4px' }}>
                  Organization
                </label>
                <select
                  value={newClinicianOrgId}
                  onChange={(e) => setNewClinicianOrgId(e.target.value)}
                  required
                  style={{ ...formInput, background: 'var(--float-surface)' }}
                >
                  <option value="">Select an organization</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <Button type="submit" kind="primary" size="sm" disabled={newClinicianSubmitting}>
                  {newClinicianSubmitting ? 'Creating...' : 'Create clinician'}
                </Button>
                <Button
                  type="button"
                  kind="quiet"
                  size="sm"
                  onClick={() => {
                    setShowNewClinician(false)
                    setNewClinicianError(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
              {newClinicianError && (
                <div style={{ flexBasis: '100%', fontSize: '13px', color: 'var(--float-danger)' }}>
                  {newClinicianError}
                </div>
              )}
            </form>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Role</th>
                <th style={thStyle}>Organization</th>
                <th style={thStyle}>Joined</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td style={tdStyle}>{u.email}</td>
                  <td style={tdStyle}>{u.role ?? '—'}</td>
                  <td style={tdStyle}>{u.organization ?? '—'}</td>
                  <td style={tdStyle}>{formatDate(u.created_at)}</td>
                  <td style={tdStyle}>
                    {confirmDeleteUserId === u.id ? (
                      <div style={{ fontSize: '12px', color: 'var(--float-danger)' }}>
                        Delete {u.email} and all their data? This cannot be undone.{' '}
                        <Button
                          kind="danger"
                          size="sm"
                          onClick={() => handleDeleteUser(u.id)}
                          style={{ marginRight: '6px', marginLeft: '6px' }}
                        >
                          Confirm delete
                        </Button>
                        <Button
                          kind="quiet"
                          size="sm"
                          onClick={() => setConfirmDeleteUserId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : resetSentFor === u.id ? (
                      <span style={{ fontSize: '12px', color: 'var(--float-success)' }}>
                        {u.awaiting_setup ? '✓ Setup link sent' : '✓ Reset email sent'}
                      </span>
                    ) : (
                      <>
                        <Button kind="secondary" size="sm" onClick={() => handleSendPasswordEmail(u)} style={{ marginRight: '6px' }}>
                          {u.awaiting_setup ? 'Resend setup link' : 'Reset password'}
                        </Button>
                        <Button
                          kind="danger"
                          size="sm"
                          onClick={() => setConfirmDeleteUserId(u.id)}
                        >
                          Delete
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Organizations */}
        <section style={{ ...cardStyle, marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--float-text-strong)' }}>
              Organizations
            </h2>
            <Button kind="primary" size="sm" onClick={() => setShowNewOrg((v) => !v)}>
              + New organization
            </Button>
          </div>

          {showNewOrg && (
            <form
              onSubmit={handleCreateOrg}
              style={{
                background: 'var(--float-surface-muted)',
                padding: '16px',
                borderRadius: 'var(--float-radius-card)',
                marginBottom: '16px',
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
              }}
            >
              <div style={{ flex: '1 1 200px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--float-text-secondary)', marginBottom: '4px' }}>
                  Organization name
                </label>
                <input
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  required
                  style={formInput}
                />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'var(--float-text-secondary)', marginBottom: '4px' }}>
                  Admin email (optional, gets a setup link)
                </label>
                <input
                  type="email"
                  value={newOrgAdminEmail}
                  onChange={(e) => setNewOrgAdminEmail(e.target.value)}
                  style={formInput}
                />
              </div>
              <Button type="submit" kind="primary" size="sm">
                Create
              </Button>
            </form>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Clinicians</th>
                <th style={thStyle}>Patients</th>
                <th style={thStyle}>Created</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <Fragment key={o.id}>
                  <tr>
                    <td style={tdStyle}>{o.name}</td>
                    <td style={tdStyle}>
                      {o.suspended ? 'Suspended' : o.status === 'setting_up' ? 'Setting up' : 'Active'}
                    </td>
                    <td style={tdStyle}>{o.clinician_count}</td>
                    <td style={tdStyle}>{o.patient_count}</td>
                    <td style={tdStyle}>{formatDate(o.created_at)}</td>
                    <td style={tdStyle}>
                      <Button kind="secondary" size="sm" onClick={() => handleExpandOrg(o.id)} style={{ marginRight: '6px' }}>
                        {expandedOrgId === o.id ? 'Hide' : 'View'}
                      </Button>
                      <Button kind={o.suspended ? 'secondary' : 'danger'} size="sm" onClick={() => handleOrgSuspended(o)}>
                        {o.suspended ? 'Let back in' : 'Suspend'}
                      </Button>
                    </td>
                  </tr>
                  {expandedOrgId === o.id && (
                    <tr>
                      <td colSpan={6} style={{ ...tdStyle, background: 'var(--float-surface-muted)' }}>
                        {!expandedOrgDetail ? (
                          <span style={{ color: 'var(--float-text-hint)' }}>Loading...</span>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            <div>
                              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--float-text-secondary)', margin: '0 0 8px' }}>
                                Clinicians ({expandedOrgDetail.clinicians.length})
                              </p>
                              {expandedOrgDetail.clinicians.length === 0 ? (
                                <p style={{ fontSize: '12px', color: 'var(--float-text-hint)', margin: 0 }}>None</p>
                              ) : (
                                <ul style={{ margin: 0, paddingLeft: '18px' }}>
                                  {expandedOrgDetail.clinicians.map((c) => (
                                    <li key={c.id} style={{ fontSize: '13px', color: 'var(--float-text)' }}>
                                      {c.name} {c.email ? <span style={{ color: 'var(--float-text-hint)' }}>· {c.email}</span> : null}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div>
                              <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--float-text-secondary)', margin: '0 0 8px' }}>
                                Patients ({expandedOrgDetail.patients.length})
                              </p>
                              {expandedOrgDetail.patients.length === 0 ? (
                                <p style={{ fontSize: '12px', color: 'var(--float-text-hint)', margin: 0 }}>None</p>
                              ) : (
                                <ul style={{ margin: 0, paddingLeft: '18px' }}>
                                  {expandedOrgDetail.patients.map((p) => (
                                    <li key={p.id} style={{ fontSize: '13px', color: 'var(--float-text)' }}>
                                      {p.name} {p.age !== null ? <span style={{ color: 'var(--float-text-hint)' }}>· {p.age}</span> : null}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </section>

        {/* Patients */}
        <section style={{ ...cardStyle, marginBottom: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px', color: 'var(--float-text-strong)' }}>
            Patients
          </h2>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
                <th style={thStyle}>Age</th>
                <th style={thStyle}>Org</th>
                <th style={thStyle}>Clinician</th>
                <th style={thStyle}>Plan</th>
                <th style={thStyle}>Experiments</th>
                <th style={thStyle}>Last activity</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id}>
                  <td style={tdStyle}>{p.name}</td>
                  <td style={tdStyle}>{p.age ?? '—'}</td>
                  <td style={tdStyle}>{p.organization ?? '—'}</td>
                  <td style={tdStyle}>{p.clinician ?? '—'}</td>
                  <td style={tdStyle}>{p.plan_status ?? '—'}</td>
                  <td style={tdStyle}>{p.experiment_count}</td>
                  <td style={tdStyle}>{formatDate(p.last_activity)}</td>
                  <td style={tdStyle}>
                    {confirmDeletePatientId === p.id ? (
                      <div style={{ fontSize: '12px', color: 'var(--float-danger)' }}>
                        Delete {p.name} and all their data?{' '}
                        <Button
                          kind="danger"
                          size="sm"
                          onClick={() => handleDeletePatient(p.id)}
                          style={{ marginRight: '6px', marginLeft: '6px' }}
                        >
                          Confirm
                        </Button>
                        <Button kind="quiet" size="sm" onClick={() => setConfirmDeletePatientId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button kind="danger" size="sm" onClick={() => setConfirmDeletePatientId(p.id)}>
                        Delete
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Waitlist */}
        <section style={{ ...cardStyle, marginBottom: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px', color: 'var(--float-text-strong)' }}>
            Waitlist
          </h2>
          {waitlist.length === 0 ? (
            <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', margin: 0 }}>No waitlist entries yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Name</th>
                  <th style={thStyle}>Email</th>
                  <th style={thStyle}>Role</th>
                  <th style={thStyle}>Date submitted</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {waitlist.map((w) => (
                  <tr key={w.id}>
                    <td style={tdStyle}>{w.first_name} {w.last_name}</td>
                    <td style={tdStyle}>{w.email}</td>
                    <td style={tdStyle}>{w.role}</td>
                    <td style={tdStyle}>{formatDate(w.created_at)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {confirmDeleteWaitlistId === w.id ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '12px', color: 'var(--float-text-secondary)' }}>Delete this entry?</span>
                          <Button kind="danger" size="sm" onClick={() => handleDeleteWaitlist(w.id)}>Confirm delete</Button>
                          <Button kind="quiet" size="sm" onClick={() => setConfirmDeleteWaitlistId(null)}>Cancel</Button>
                        </span>
                      ) : (
                        <Button kind="danger" size="sm" onClick={() => setConfirmDeleteWaitlistId(w.id)}>Delete</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </div>
  )
}
