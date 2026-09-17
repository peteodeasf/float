import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { errorMessage } from '../ui/form'
import { inviteTeen, inviteParent, listParents, removeParent, setChildConnectConsent, setParentProgressSharing, setAccommodationRatingsSharing } from '../../api/patients'

/**
 * Persistent teen-access manager for a patient.
 *
 * Available from the patient header at all times — during setup and after
 * activation — so a clinician can invite the teen before the plan goes active,
 * then come back to resend, change the email, or jump to the teen↔clinician
 * messages. Self-contained (owns its own invite state + mutation) to keep the
 * footprint in PatientPage minimal.
 */
export default function TeenAccessPanel({
  patientId,
  focus,
  teenEmail,
  teenInvitedAt,
  consentAt,
  progressSharedAt,
  ratingsSharedAt,
  fallbackEmail,
  onViewMessages,
  onClose,
}: {
  patientId: string
  focus: 'teen' | 'parent'
  teenEmail: string | null | undefined
  teenInvitedAt: string | null | undefined
  consentAt: string | null | undefined
  progressSharedAt?: string | null
  ratingsSharedAt?: string | null
  fallbackEmail: string | null | undefined
  onViewMessages: () => void
  onClose: () => void
}) {
  const qc = useQueryClient()
  const invited = !!teenInvitedAt
  const consentGiven = !!consentAt
  const [email, setEmail] = useState(teenEmail || fallbackEmail || '')
  const [confirmation, setConfirmation] = useState<string | null>(null)

  const inviteMut = useMutation({
    mutationFn: (addr: string) => inviteTeen(patientId, addr),
    onSuccess: (data) => {
      setConfirmation(data.email)
      qc.invalidateQueries({ queryKey: ['patient', patientId] })
      setTimeout(() => setConfirmation(null), 4000)
    },
  })

  // Parental consent to connect the child gates the teen invite; clinician can
  // record it here when consent was obtained offline.
  const consentMut = useMutation({
    mutationFn: () => setChildConnectConsent(patientId, true),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patient', patientId] }),
  })

  const emailChanged = invited && email.trim().toLowerCase() !== (teenEmail || '').toLowerCase()
  const sendLabel = !invited ? 'Send invite' : emailChanged ? 'Update & resend' : 'Resend invite'

  // Parent invite — no stored status yet; a case can have any number of parents.
  const [parentEmail, setParentEmail] = useState('')
  const [parentConfirmation, setParentConfirmation] = useState<string | null>(null)
  const [alreadyAParent, setAlreadyAParent] = useState<string | null>(null)
  const { data: parents = [] } = useQuery({
    queryKey: ['parents', patientId],
    queryFn: () => listParents(patientId),
    enabled: !!patientId && focus === 'parent',
  })
  const parentInviteMut = useMutation({
    mutationFn: (addr: string) => inviteParent(patientId, addr),
    onSuccess: (data) => {
      if (data.already_a_parent) {
        setAlreadyAParent(data.email)
        setTimeout(() => setAlreadyAParent(null), 4000)
        return
      }
      setParentEmail('')
      setParentConfirmation(data.email)
      qc.invalidateQueries({ queryKey: ['parents', patientId] })
      setTimeout(() => setParentConfirmation(null), 4000)
    },
  })
  const parentRemoveMut = useMutation({
    mutationFn: (parentUserId: string) => removeParent(patientId, parentUserId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parents', patientId] }),
  })

  // Peter, 2026-09-10: the parent can see the child's ladder, what's planned and what's done, once
  // the clinician switches it on — after asking the child.
  const shared = !!progressSharedAt
  const shareMut = useMutation({
    mutationFn: (on: boolean) => setParentProgressSharing(patientId, on),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patient', patientId] }),
  })

  // Peter, 2026-09-10: the clinician sees the child's ratings of the accommodations beside the
  // parent's estimates, and can choose to show the child's ratings to the parent.
  const ratingsShared = !!ratingsSharedAt
  const ratingsMut = useMutation({
    mutationFn: (on: boolean) => setAccommodationRatingsSharing(patientId, on),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['patient', patientId] }),
  })

  const label: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600, color: 'var(--float-text-secondary)', display: 'block', marginBottom: '4px',
  }

  return (
    <div
      style={{
        background: 'var(--float-surface)',
        border: '1px solid var(--float-border-strong)',
        borderRadius: 'var(--float-radius-card)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        padding: '18px 20px',
        marginBottom: '16px',
        maxWidth: '560px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--float-text-hint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {focus === 'teen' ? 'Teen access' : 'Parent access'}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--float-text-hint)', fontSize: '16px', lineHeight: 1, padding: '2px' }}
        >
          ×
        </button>
      </div>

      {focus === 'teen' && (
      <>
      <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>Teen</div>
      {/* Status */}
      <div style={{ marginBottom: '14px' }}>
        {invited ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#16a34a', background: '#f0fdf4', borderRadius: 'var(--float-radius-control)', padding: '8px 12px' }}>
            <span>&#10003;</span>
            <span style={{ color: '#166534' }}>
              Invited {new Date(teenInvitedAt!).toLocaleDateString()}
              {teenEmail ? ` · ${teenEmail}` : ''}
            </span>
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: 'var(--float-text-secondary)', background: 'var(--float-surface-muted)', borderRadius: 'var(--float-radius-control)', padding: '8px 12px' }}>
            The teen hasn't been invited yet. Invite them so they can sign in and see their ladder once you activate a situation.
          </div>
        )}
      </div>

      {/* Parent-consent gate — a teen can't be invited until consent is on record */}
      {!consentGiven ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 'var(--float-radius-control)', padding: '10px 12px', marginBottom: '14px' }}>
          <div style={{ fontSize: '13px', color: '#92400e', fontWeight: 600, marginBottom: '2px' }}>Awaiting parent consent</div>
          <p style={{ fontSize: '12px', color: '#b45309', margin: '0 0 8px', lineHeight: 1.5 }}>
            A parent must give permission to connect the child before the teen can be invited. It's captured on the parent monitoring form — or record it here if you obtained it offline.
          </p>
          <button
            onClick={() => consentMut.mutate()}
            disabled={consentMut.isPending}
            style={{ fontSize: '12px', fontWeight: 600, color: '#fff', background: '#b45309', border: 'none', borderRadius: 'var(--float-radius-sm)', padding: '7px 12px', cursor: 'pointer', opacity: consentMut.isPending ? 0.6 : 1 }}
          >
            {consentMut.isPending ? 'Recording…' : 'Record consent (obtained offline)'}
          </button>
          {/* Said out loud. It used to fail silently — the button just reset — and on 2026-09-10 a
              clinician pressed it eight times thinking the panel had frozen. */}
          {consentMut.isError && (
            <p role="alert" style={{ fontSize: '12px', color: '#b91c1c', margin: '8px 0 0' }}>
              That didn&rsquo;t save. Please try again.
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#16a34a', marginBottom: '12px' }}>
          <span>&#10003;</span> Parent consent on record.
        </div>
      )}

      {/* Editable email + send */}
      <label style={label}>Teen's email</label>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && email.trim() && consentGiven) inviteMut.mutate(email.trim())
          }}
          placeholder="teen@example.com"
          disabled={!consentGiven}
          style={{
            flex: '1 1 220px',
            padding: '9px 12px',
            fontSize: '13px',
            color: 'var(--float-text)',
            border: '1px solid var(--float-border)',
            borderRadius: 'var(--float-radius-control)',
            boxSizing: 'border-box',
            background: consentGiven ? 'var(--float-surface)' : 'var(--float-surface-sunken)',
          }}
        />
        <button
          onClick={() => email.trim() && consentGiven && inviteMut.mutate(email.trim())}
          disabled={!email.trim() || inviteMut.isPending || !consentGiven}
          title={!consentGiven ? 'Parent consent required first' : undefined}
          style={{
            flex: 'none',
            fontSize: '13px',
            fontWeight: 600,
            color: '#fff',
            background: 'var(--float-primary)',
            border: 'none',
            borderRadius: 'var(--float-radius-control)',
            padding: '9px 16px',
            cursor: 'pointer',
            opacity: !email.trim() || inviteMut.isPending || !consentGiven ? 0.5 : 1,
          }}
        >
          {inviteMut.isPending ? 'Sending…' : sendLabel}
        </button>
      </div>
      {emailChanged && (
        <p style={{ fontSize: '12px', color: 'var(--float-text-hint)', margin: '6px 0 0' }}>
          Sending will re-invite the teen at the new address with a fresh temporary password.
        </p>
      )}
      {confirmation && (
        <p style={{ fontSize: '12px', color: '#16a34a', margin: '8px 0 0' }}>
          &#10003; Invitation sent to {confirmation}
        </p>
      )}
      {inviteMut.isError && (
        <p role="alert" style={{ fontSize: '12px', color: '#b91c1c', margin: '8px 0 0' }}>
          {errorMessage(inviteMut.error, 'The invitation didn’t send. Please try again.')}
        </p>
      )}

      {/* Communication */}
      {invited && (
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--float-surface-sunken)' }}>
          <button
            onClick={onViewMessages}
            style={{ fontSize: '13px', fontWeight: 500, color: 'var(--float-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            View messages with the teen &rarr;
          </button>
        </div>
      )}

      </>
      )}

      {/* Parent access */}
      {focus === 'parent' && (
      <div>
        <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>Parent</div>

        <div style={{ background: 'var(--float-surface-muted)', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-control)', padding: '10px 12px', marginBottom: '14px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={shared}
              disabled={shareMut.isPending}
              onChange={e => shareMut.mutate(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Parents can see the child's progress
          </label>
          <p style={{ fontSize: '12px', color: 'var(--float-text-secondary)', margin: '6px 0 0', lineHeight: 1.5 }}>
            The ladder, what's planned and what's done. Not what the child writes, or how they rate each
            exposure. Ask the child first.
            {shared && ` Shared since ${new Date(progressSharedAt!).toLocaleDateString()}.`}
          </p>
          {shareMut.isError && (
            <p role="alert" style={{ fontSize: '12px', color: '#b91c1c', margin: '6px 0 0' }}>
              That didn&rsquo;t save. Please try again.
            </p>
          )}
        </div>

        <div style={{ background: 'var(--float-surface-muted)', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-control)', padding: '10px 12px', marginBottom: '14px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: '#334155', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={ratingsShared}
              disabled={ratingsMut.isPending}
              onChange={e => ratingsMut.mutate(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Parents can see the child's ratings of the accommodations
          </label>
          <p style={{ fontSize: '12px', color: 'var(--float-text-secondary)', margin: '6px 0 0', lineHeight: 1.5 }}>
            How hard the child says it would be if the parent stopped each one. The child never sees
            the parent's estimates.
          </p>
          {ratingsMut.isError && (
            <p role="alert" style={{ fontSize: '12px', color: '#b91c1c', margin: '6px 0 0' }}>
              That didn&rsquo;t save. Please try again.
            </p>
          )}
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={label}>{parents.length === 1 ? "This child's parent" : "This child's parents"}</label>
          {parents.length === 0 && (
            <p style={{ fontSize: '12.5px', color: 'var(--float-text-hint)', margin: '4px 0 0' }}>
              Nobody yet. Invite a parent below.
            </p>
          )}
          {parents.map(p => (
            <div key={p.parent_user_id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 0', borderBottom: '1px solid var(--float-surface-sunken)' }}>
              <span style={{ flex: 1, minWidth: 0, fontSize: '13px', color: '#334155', overflowWrap: 'anywhere' }}>
                {p.email}
                <span style={{ display: 'block', fontSize: '11.5px', color: 'var(--float-text-hint)' }}>
                  {p.has_signed_in ? 'Has signed in' : 'Has not signed in yet'}
                  {p.reminder_emails_off ? ' · reminder emails off' : ''}
                </span>
              </span>
              <button
                onClick={() => { if (confirm(`Remove ${p.email}? Their app stops working for this child. What they have written stays on the record.`)) parentRemoveMut.mutate(p.parent_user_id) }}
                disabled={parentRemoveMut.isPending}
                style={{ flex: 'none', fontSize: '12px', fontWeight: 600, color: '#b91c1c', background: 'none', border: '1px solid #fecaca', borderRadius: 'var(--float-radius-sm)', padding: '5px 10px', cursor: 'pointer' }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <label style={label}>Invite another parent</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="email"
            value={parentEmail}
            onChange={e => setParentEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && parentEmail.trim()) parentInviteMut.mutate(parentEmail.trim()) }}
            placeholder="parent@example.com"
            style={{ flex: '1 1 220px', padding: '9px 12px', fontSize: '13px', color: 'var(--float-text)', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-control)', boxSizing: 'border-box' }}
          />
          <button
            onClick={() => parentEmail.trim() && parentInviteMut.mutate(parentEmail.trim())}
            disabled={!parentEmail.trim() || parentInviteMut.isPending}
            style={{ flex: 'none', fontSize: '13px', fontWeight: 600, color: '#fff', background: 'var(--float-primary)', border: 'none', borderRadius: 'var(--float-radius-control)', padding: '9px 16px', cursor: 'pointer', opacity: !parentEmail.trim() || parentInviteMut.isPending ? 0.5 : 1 }}
          >
            {parentInviteMut.isPending ? 'Sending…' : 'Invite parent'}
          </button>
        </div>
        <p style={{ fontSize: '12px', color: 'var(--float-text-hint)', margin: '6px 0 0' }}>
          Emails a temporary password to sign in at /parent/login. A child can have more than one parent.
        </p>
        {alreadyAParent && (
          <p style={{ fontSize: '12px', color: '#b45309', margin: '8px 0 0' }}>
            {alreadyAParent} is already a parent of this child. Nothing was sent, and their password is unchanged.
          </p>
        )}
        {parentInviteMut.isError && (
          <p role="alert" style={{ fontSize: '12px', color: '#b91c1c', margin: '8px 0 0' }}>
            {errorMessage(parentInviteMut.error, 'The invitation didn’t send. Please try again.')}
          </p>
        )}
        {parentConfirmation && (
          <p style={{ fontSize: '12px', color: '#16a34a', margin: '8px 0 0' }}>
            &#10003; Invitation sent to {parentConfirmation}
          </p>
        )}
      </div>
      )}
    </div>
  )
}
