import { useEffect, useState, type CSSProperties } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import PractitionerNav from '../../components/ui/PractitionerNav'
import PracticeMembersPanel from '../../components/practice/PracticeMembersPanel'
import { Banner, Button, Field, TextInput } from '../../components/ui/primitives'
import { SECTION_NOTE, SECTION_TITLE, errorMessage } from '../../components/ui/form'
import { changeMyPassword, getMyProfile, updateMyProfile } from '../../api/me_practitioner'

/**
 * Settings — "Your account".
 *
 * Step one of docs/plans/clinician-settings.md. Most of what belongs on this page already existed
 * in the data and had nowhere to live: a clinician's name, credentials and phone are on their
 * profile, shown on the patient page, and could not be edited anywhere.
 *
 * "Your clinic" shows practice admins the people in the practice (docs/plans/clinician-practice-onboarding.md).
 * The consultation checklist and sign-out timer from the settings plan are not here yet.
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
    onError: (e) => setDetailsError(errorMessage(e, 'Could not save your details.')),
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
    onError: (e) => setPasswordError(errorMessage(e, 'Could not change your password.')),
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

  const cardStyle: CSSProperties = {
    background: 'var(--float-surface)',
    border: '1px solid var(--float-border)',
    borderRadius: 'var(--float-radius-card)',
    padding: '20px',
  }

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
            <section style={cardStyle}>
              <h2 style={SECTION_TITLE}>Your details</h2>
              <p style={SECTION_NOTE}>
                Your name and credentials appear on your patients&rsquo; records.
              </p>

              {detailsError && <Banner tone="danger" style={{ marginTop: '14px' }}>{detailsError}</Banner>}

              <div style={{ display: 'grid', gap: '14px', marginTop: '16px' }}>
                <Field label="Name">
                  <TextInput block value={name} onChange={e => setName(e.target.value)} />
                </Field>
                <Field label="Credentials" hint="For example PsyD, or LCSW.">
                  <TextInput block value={credentials} onChange={e => setCredentials(e.target.value)} />
                </Field>
                <Field label="Phone">
                  <TextInput block value={phone} onChange={e => setPhone(e.target.value)} />
                </Field>
                <Field label="Email" hint="This is how you sign in. Ask Float to change it.">
                  <TextInput block value={profile?.email ?? ''} readOnly style={{ background: 'var(--float-surface-sunken)', color: 'var(--float-text-secondary)' }} />
                </Field>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
                <Button
                  kind="primary"
                  onClick={() => saveDetails.mutate()}
                  disabled={!detailsChanged || !name.trim() || saveDetails.isPending}
                >
                  {saveDetails.isPending ? 'Saving…' : 'Save'}
                </Button>
                {saved && <span style={{ fontSize: '13px', color: 'var(--float-primary-dark)' }}>Saved.</span>}
              </div>
            </section>

            <section style={{ ...cardStyle, marginTop: '16px' }}>
              <h2 style={SECTION_TITLE}>Change your password</h2>
              <p style={SECTION_NOTE}>
                You need the password you use now. That way a signed-in browser someone else gets
                hold of cannot lock you out of your own account.
              </p>

              {passwordError && <Banner tone="danger" style={{ marginTop: '14px' }}>{passwordError}</Banner>}

              <div style={{ display: 'grid', gap: '14px', marginTop: '16px' }}>
                <Field label="Current password">
                  <TextInput block type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                </Field>
                <Field label="New password" hint="At least 8 characters.">
                  <TextInput block type="password" autoComplete="new-password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
                </Field>
                <Field label="New password again">
                  <TextInput block type="password" autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                </Field>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px' }}>
                <Button
                  kind="primary"
                  onClick={submitPassword}
                  disabled={!currentPassword || !newPassword || !confirmPassword || savePassword.isPending}
                >
                  {savePassword.isPending ? 'Changing…' : 'Change password'}
                </Button>
                {passwordChanged && (
                  <span style={{ fontSize: '13px', color: 'var(--float-primary-dark)' }}>
                    Password changed. You stay signed in here.
                  </span>
                )}
              </div>
            </section>

            {profile?.is_org_admin && (
              <div style={{ marginTop: '32px' }}>
                <h2 className="text-lg font-bold" style={{ color: 'var(--float-text)', marginBottom: '12px' }}>Your clinic</h2>
                <PracticeMembersPanel myEmail={profile.email} />
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
