import { Fragment, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth, adminApiClient, createClinician } from '../../context/AdminAuthContext'
import FloatLogo from '../../components/ui/FloatLogo'

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
}

type AdminOrg = {
  id: string
  name: string
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

const cardStyle: React.CSSProperties = {
  background: 'var(--float-surface)',
  borderRadius: 'var(--float-radius-lg)',
  boxShadow: 'var(--float-shadow-sm)',
  padding: '24px',
}

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: '12px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: '#64748b',
  borderBottom: '1px solid #e2e8f0',
}

const tdStyle: React.CSSProperties = {
  padding: '12px',
  fontSize: '13px',
  color: '#334155',
  borderBottom: '1px solid #f1f5f9',
}

const smallBtn: React.CSSProperties = {
  fontSize: '12px',
  padding: '5px 10px',
  borderRadius: '6px',
  border: '1px solid #e2e8f0',
  background: '#fff',
  cursor: 'pointer',
  marginRight: '6px',
}

const dangerBtn: React.CSSProperties = {
  ...smallBtn,
  borderColor: '#fecaca',
  color: '#b91c1c',
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
  const [userFilter, setUserFilter] = useState<'all' | 'practitioner' | 'patient' | 'admin'>('all')

  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null)
  const [confirmDeletePatientId, setConfirmDeletePatientId] = useState<string | null>(null)
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
    const [s, u, o, p] = await Promise.all([
      adminApiClient.get('/admin/stats'),
      adminApiClient.get('/admin/users'),
      adminApiClient.get('/admin/organizations'),
      adminApiClient.get('/admin/patients'),
    ])
    setStats(s.data)
    setUsers(u.data)
    setOrgs(o.data)
    setPatients(p.data)
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

  const handleResetPassword = async (id: string) => {
    await adminApiClient.post(`/admin/users/${id}/reset-password`)
    setResetSentFor(id)
    setTimeout(() => setResetSentFor((cur) => (cur === id ? null : cur)), 3000)
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
    await adminApiClient.post('/admin/organizations', {
      name: newOrgName,
      admin_email: newOrgAdminEmail || null,
    })
    setShowNewOrg(false)
    setNewOrgName('')
    setNewOrgAdminEmail('')
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
            Admin
          </span>
        </div>
        <button
          onClick={handleLogout}
          style={{
            fontSize: '13px',
            color: '#64748b',
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
              <p style={{ fontSize: '12px', color: '#64748b', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {s.label}
              </p>
              <p style={{ fontSize: '32px', fontWeight: 600, color: '#0f172a', margin: '8px 0 0' }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        {/* Recent signups */}
        <section style={{ ...cardStyle, marginBottom: '32px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px', color: '#0f172a' }}>
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

        {/* Users */}
        <section style={{ ...cardStyle, marginBottom: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#0f172a' }}>Users</h2>
              <button
                onClick={() => {
                  setShowNewClinician((v) => !v)
                  setNewClinicianError(null)
                }}
                style={{
                  ...smallBtn,
                  background: 'var(--float-primary)',
                  color: '#fff',
                  borderColor: 'var(--float-primary)',
                  marginRight: 0,
                }}
              >
                + New clinician
              </button>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {(['all', 'practitioner', 'patient', 'admin'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setUserFilter(f)}
                  style={{
                    ...smallBtn,
                    background: userFilter === f ? 'var(--float-primary)' : '#fff',
                    color: userFilter === f ? '#fff' : '#334155',
                    borderColor: userFilter === f ? 'var(--float-primary)' : '#e2e8f0',
                    marginRight: 0,
                    textTransform: 'capitalize',
                  }}
                >
                  {f === 'all' ? 'All' : f === 'practitioner' ? 'Clinicians' : f + 's'}
                </button>
              ))}
            </div>
          </div>

          {clinicianCreatedMsg && (
            <div
              style={{
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#047857',
                padding: '10px 12px',
                borderRadius: '8px',
                fontSize: '13px',
                marginBottom: '12px',
              }}
            >
              {clinicianCreatedMsg}
            </div>
          )}

          {showNewClinician && (
            <form
              onSubmit={handleCreateClinician}
              style={{
                background: '#f8fafc',
                padding: '16px',
                borderRadius: '8px',
                marginBottom: '16px',
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
              }}
            >
              <div style={{ flex: '1 1 180px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                  Name
                </label>
                <input
                  value={newClinicianName}
                  onChange={(e) => setNewClinicianName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '13px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                  }}
                />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={newClinicianEmail}
                  onChange={(e) => setNewClinicianEmail(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '13px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                  }}
                />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                  Organization
                </label>
                <select
                  value={newClinicianOrgId}
                  onChange={(e) => setNewClinicianOrgId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '13px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                    background: '#fff',
                  }}
                >
                  <option value="">Select an organization</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="submit"
                  disabled={newClinicianSubmitting}
                  style={{
                    ...smallBtn,
                    background: 'var(--float-primary)',
                    color: '#fff',
                    borderColor: 'var(--float-primary)',
                    marginRight: 0,
                    padding: '8px 14px',
                    opacity: newClinicianSubmitting ? 0.6 : 1,
                  }}
                >
                  {newClinicianSubmitting ? 'Creating...' : 'Create clinician'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewClinician(false)
                    setNewClinicianError(null)
                  }}
                  style={{ ...smallBtn, marginRight: 0, padding: '8px 14px' }}
                >
                  Cancel
                </button>
              </div>
              {newClinicianError && (
                <div style={{ flexBasis: '100%', fontSize: '13px', color: '#b91c1c' }}>
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
                      <div style={{ fontSize: '12px', color: '#b91c1c' }}>
                        Delete {u.email} and all their data? This cannot be undone.{' '}
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          style={{ ...dangerBtn, marginLeft: '6px' }}
                        >
                          Confirm delete
                        </button>
                        <button
                          onClick={() => setConfirmDeleteUserId(null)}
                          style={smallBtn}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : resetSentFor === u.id ? (
                      <span style={{ fontSize: '12px', color: '#059669' }}>
                        ✓ Reset email sent
                      </span>
                    ) : (
                      <>
                        <button onClick={() => handleResetPassword(u.id)} style={smallBtn}>
                          Reset password
                        </button>
                        <button
                          onClick={() => setConfirmDeleteUserId(u.id)}
                          style={dangerBtn}
                        >
                          Delete
                        </button>
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
            <h2 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#0f172a' }}>
              Organizations
            </h2>
            <button
              onClick={() => setShowNewOrg((v) => !v)}
              style={{
                ...smallBtn,
                background: 'var(--float-primary)',
                color: '#fff',
                borderColor: 'var(--float-primary)',
                marginRight: 0,
              }}
            >
              + New organization
            </button>
          </div>

          {showNewOrg && (
            <form
              onSubmit={handleCreateOrg}
              style={{
                background: '#f8fafc',
                padding: '16px',
                borderRadius: '8px',
                marginBottom: '16px',
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                alignItems: 'flex-end',
              }}
            >
              <div style={{ flex: '1 1 200px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                  Organization name
                </label>
                <input
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '13px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                  }}
                />
              </div>
              <div style={{ flex: '1 1 200px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                  Admin email (optional)
                </label>
                <input
                  type="email"
                  value={newOrgAdminEmail}
                  onChange={(e) => setNewOrgAdminEmail(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 10px',
                    fontSize: '13px',
                    border: '1px solid #e2e8f0',
                    borderRadius: '6px',
                  }}
                />
              </div>
              <button
                type="submit"
                style={{
                  ...smallBtn,
                  background: 'var(--float-primary)',
                  color: '#fff',
                  borderColor: 'var(--float-primary)',
                  marginRight: 0,
                  padding: '8px 14px',
                }}
              >
                Create
              </button>
            </form>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Name</th>
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
                    <td style={tdStyle}>{o.clinician_count}</td>
                    <td style={tdStyle}>{o.patient_count}</td>
                    <td style={tdStyle}>{formatDate(o.created_at)}</td>
                    <td style={tdStyle}>
                      <button onClick={() => handleExpandOrg(o.id)} style={smallBtn}>
                        {expandedOrgId === o.id ? 'Hide' : 'View'}
                      </button>
                    </td>
                  </tr>
                  {expandedOrgId === o.id && (
                    <tr>
                      <td colSpan={5} style={{ ...tdStyle, background: '#f8fafc' }}>
                        {!expandedOrgDetail ? (
                          <span style={{ color: '#94a3b8' }}>Loading...</span>
                        ) : (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            <div>
                              <p style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', margin: '0 0 8px' }}>
                                Clinicians ({expandedOrgDetail.clinicians.length})
                              </p>
                              {expandedOrgDetail.clinicians.length === 0 ? (
                                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>None</p>
                              ) : (
                                <ul style={{ margin: 0, paddingLeft: '18px' }}>
                                  {expandedOrgDetail.clinicians.map((c) => (
                                    <li key={c.id} style={{ fontSize: '13px', color: '#334155' }}>
                                      {c.name} {c.email ? <span style={{ color: '#94a3b8' }}>· {c.email}</span> : null}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div>
                              <p style={{ fontSize: '12px', fontWeight: 600, color: '#64748b', margin: '0 0 8px' }}>
                                Patients ({expandedOrgDetail.patients.length})
                              </p>
                              {expandedOrgDetail.patients.length === 0 ? (
                                <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>None</p>
                              ) : (
                                <ul style={{ margin: 0, paddingLeft: '18px' }}>
                                  {expandedOrgDetail.patients.map((p) => (
                                    <li key={p.id} style={{ fontSize: '13px', color: '#334155' }}>
                                      {p.name} {p.age !== null ? <span style={{ color: '#94a3b8' }}>· {p.age}</span> : null}
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
          <h2 style={{ fontSize: '16px', fontWeight: 600, margin: '0 0 16px', color: '#0f172a' }}>
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
                      <div style={{ fontSize: '12px', color: '#b91c1c' }}>
                        Delete {p.name} and all their data?{' '}
                        <button
                          onClick={() => handleDeletePatient(p.id)}
                          style={{ ...dangerBtn, marginLeft: '6px' }}
                        >
                          Confirm
                        </button>
                        <button onClick={() => setConfirmDeletePatientId(null)} style={smallBtn}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDeletePatientId(p.id)} style={dangerBtn}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  )
}
