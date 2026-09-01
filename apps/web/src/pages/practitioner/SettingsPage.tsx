import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

import PractitionerNav from '../../components/ui/PractitionerNav'
import { changeMyPassword, getMyProfile, updateMyProfile } from '../../api/me_practitioner'

/**
 * Settings — "Your account".
 *
 * Step one of docs/plans/clinician-settings.md. Most of what belongs on this page already existed
 * in the data and had nowhere to live: a clinician's name, credentials and phone are on their
 * profile, shown on the patient page, and could not be edited anywhere.
 *
 * The clinic half of the plan — the consultation checklist, the sign-out timer, who can open which
 * patients — is not here yet. Nothing on this page is a switch that controls nothing.
 */
export default function SettingsPage() {
  const qc = useQueryClient()
  const { data: profile, isLoading } = useQuery({
    queryKey: ['my-profile'],
    queryFn: getMyProfile,
  })

  const [name, setName] = useState('')
  const [credentials, setCredentials] = useState('')
  const [phone, setPhone] = useState('')
  const [saved, setSaved] = useState(false)
  const [detailsError, setDetailsError] = useState<string | null>(null)

  // Fill the form once the profile arrives, and again if it is refetched from elsewhere.
  useEffect(() => {
    if (!profile) return
    setName(profile.name)
    setCredentials(profile.credentials ?? '')
    setPhone(profile.phone_number ?? '')
  }, [profile])

  const message = (e: unknown, fallback: string) => {
    const detail = axios.isAxiosError(e) ? e.response?.data?.detail : null
    return typeof detail === 'string' ? detail : fallback
  }

  const saveDetails = useMutation({
    mutationFn: () => updateMyProfile({
      name,
      credentials: credentials.trim() || null,
      phone_number: phone.trim() || null,
    }),
    onSuccess: () => {
      setDetailsError(null)
      setSaved(true)
      qc.invalidateQueries({ queryKey: ['my-profile'] })
      // The name shows on every patient page, so those are stale now.
      qc.invalidateQueries({ queryKey: ['patients'] })
      setTimeout(() => setSaved(false), 3000)
    },
    onError: (e) => setDetailsError(message(e, 'Could not save your details.')),
  })

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [passwordChanged, setPasswordChanged] = useState(false)

  const savePassword = useMutation({
    mutationFn: () => changeMyPassword(currentPassword, newPassword),
    onSuccess: () => {
      setPasswordError(null)
      setPasswordChanged(true)
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('')
      setTimeout(() => setPasswordChanged(false), 5000)
    },
    onError: (e) => setPasswordError(message(e, 'Could not change your password.')),
  })

  const submitPassword = () => {
    // Caught here rather than at the server because the server never sees the confirmation field.
    if (newPassword !== confirmPassword) {
      setPasswordError('The two new passwords do not match.')
      return
    }
    setPasswordError(null)
    savePassword.mutate()
  }

  const detailsChanged =
    !!profile &&
    (name !== profile.name ||
      credentials !== (profile.credentials ?? '') ||
      phone !== (profile.phone_number ?? ''))

  return (
    <div className="min-h-screen" style={{ background: 'var(--float-bg)' }}>
      <PractitionerNav activePage="settings" />

      <main className="max-w-2xl mx-auto px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--float-text)' }}>Settings</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--float-text-secondary)' }}>
            Your account
          </p>
        </div>

        {isLoading ? (
          <p className="text-sm" style={{ color: 'var(--float-text-hint)' }}>Loading…</p>
        ) : (
          <>
            <section className={CARD} style={CARD_STYLE}>
              <h2 style={SECTION_TITLE}>Your details</h2>
              <p style={SECTION_NOTE}>
                Your name and credentials appear on your patients&rsquo; records.
              </p>

              {detailsError && <div style={ERROR_BOX}>{detailsError}</div>}

              <div style={{ display: 'grid', gap: '14px', marginTop: '16px' }}>
                <Field label="Name">
                  <input value={name} onChange={e => setName(e.target.value)} style={INPUT} />
                </Field>
                <Field label="Credentials" hint="For example PsyD, or LCSW.">
                  <input value={credentials} onChange={e => setCredentials(e.target.value)} style={INPUT} />
                </Field>
                <Field label="Phone">
                  <input value={phone} onChange={e => setPhone(e.target.value)} style={INPUT} />
                </Field>
                <Field label="Email" hint="This is how you sign in. Ask Float to change it.">
                  <input value={profile?.email ?? ''} readOnly style={{ ...INPUT, background: '#f1f5f9', color: '#64748b' }} />
                </Field>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
                <button
                  onClick={() => saveDetails.mutate()}
                  disabled={!detailsChanged || !name.trim() || saveDetails.isPending}
                  className="bg-teal-600 text-white rounded text-sm font-medium disabled:opacity-40 border-none cursor-pointer"
                  style={{ padding: '8px 16px' }}
                >
                  {saveDetails.isPending ? 'Saving…' : 'Save'}
                </button>
                {saved && <span style={{ fontSize: '13px', color: '#0d3d3a' }}>Saved.</span>}
              </div>
            </section>

            <section className={CARD} style={{ ...CARD_STYLE, marginTop: '16px' }}>
              <h2 style={SECTION_TITLE}>Change your password</h2>
              <p style={SECTION_NOTE}>
                You need the password you use now. That way a signed-in browser someone else gets
                hold of cannot lock you out of your own account.
              </p>

              {passwordError && <div style={ERROR_BOX}>{passwordError}</div>}

              <div style={{ display: 'grid', gap: '14px', marginTop: '16px' }}>
                <Field label="Current password">
                  <input type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} style={INPUT} />
                </Field>
                <Field label="New password" hint="At least 8 characters.">
                  <input type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={INPUT} />
                </Field>
                <Field label="New password again">
                  <input type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} style={INPUT} />
                </Field>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
                <button
                  onClick={submitPassword}
                  disabled={!currentPassword || !newPassword || !confirmPassword || savePassword.isPending}
                  className="bg-teal-600 text-white rounded text-sm font-medium disabled:opacity-40 border-none cursor-pointer"
                  style={{ padding: '8px 16px' }}
                >
                  {savePassword.isPending ? 'Changing…' : 'Change password'}
                </button>
                {passwordChanged && (
                  <span style={{ fontSize: '13px', color: '#0d3d3a' }}>
                    Password changed. You stay signed in here.
                  </span>
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}

const CARD = 'bg-white rounded-xl'
const CARD_STYLE: React.CSSProperties = { border: '1px solid var(--float-border)', padding: '20px' }
const SECTION_TITLE: React.CSSProperties = { fontSize: '15px', fontWeight: 600, color: 'var(--float-text)', margin: 0 }
const SECTION_NOTE: React.CSSProperties = { fontSize: '13px', color: 'var(--float-text-secondary)', margin: '6px 0 0', lineHeight: 1.5 }
const INPUT: React.CSSProperties = { width: '100%', padding: '8px 10px', boxSizing: 'border-box', fontSize: '14px', border: '1px solid #cbd5e1', borderRadius: '6px' }
const ERROR_BOX: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', marginTop: '14px', fontSize: '13px', color: '#991b1b' }

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{hint}</span>}
    </label>
  )
}
