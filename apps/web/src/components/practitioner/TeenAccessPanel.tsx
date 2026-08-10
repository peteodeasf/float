import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { inviteTeen, inviteParent, setChildConnectConsent } from '../../api/patients'

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
  fallbackEmail,
  onViewMessages,
  onClose,
}: {
  patientId: string
  focus: 'teen' | 'parent'
  teenEmail: string | null | undefined
  teenInvitedAt: string | null | undefined
  consentAt: string | null | undefined
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
  const parentInviteMut = useMutation({
    mutationFn: (addr: string) => inviteParent(patientId, addr),
    onSuccess: (data) => {
      setParentConfirmation(data.email)
      setTimeout(() => setParentConfirmation(null), 4000)
    },
  })

  const label: React.CSSProperties = {
    fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px',
  }

  return (
    <div
      style={{
        background: '#ffffff',
        border: '1px solid #cbd5e1',
        borderRadius: '12px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        padding: '18px 20px',
        marginBottom: '16px',
        maxWidth: '560px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {focus === 'teen' ? 'Teen access' : 'Parent access'}
        </span>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px', lineHeight: 1, padding: '2px' }}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#16a34a', background: '#f0fdf4', borderRadius: '8px', padding: '8px 12px' }}>
            <span>&#10003;</span>
            <span style={{ color: '#166534' }}>
              Invited {new Date(teenInvitedAt!).toLocaleDateString()}
              {teenEmail ? ` · ${teenEmail}` : ''}
            </span>
          </div>
        ) : (
          <div style={{ fontSize: '13px', color: '#64748b', background: '#f8fafc', borderRadius: '8px', padding: '8px 12px' }}>
            The teen hasn't been invited yet. Invite them so they can sign in and see their ladder once you activate a situation.
          </div>
        )}
      </div>

      {/* Parent-consent gate — a teen can't be invited until consent is on record */}
      {!consentGiven ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 12px', marginBottom: '14px' }}>
          <div style={{ fontSize: '13px', color: '#92400e', fontWeight: 600, marginBottom: '2px' }}>Awaiting parent consent</div>
          <p style={{ fontSize: '12px', color: '#b45309', margin: '0 0 8px', lineHeight: 1.5 }}>
            A parent must give permission to connect the child before the teen can be invited. It's captured on the parent monitoring form — or record it here if you obtained it offline.
          </p>
          <button
            onClick={() => consentMut.mutate()}
            disabled={consentMut.isPending}
            style={{ fontSize: '12px', fontWeight: 600, color: '#fff', background: '#b45309', border: 'none', borderRadius: '6px', padding: '7px 12px', cursor: 'pointer', opacity: consentMut.isPending ? 0.6 : 1 }}
          >
            {consentMut.isPending ? 'Recording…' : 'Record consent (obtained offline)'}
          </button>
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
            color: '#1e293b',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            boxSizing: 'border-box',
            background: consentGiven ? '#fff' : '#f1f5f9',
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
            borderRadius: '8px',
            padding: '9px 16px',
            cursor: 'pointer',
            opacity: !email.trim() || inviteMut.isPending || !consentGiven ? 0.5 : 1,
          }}
        >
          {inviteMut.isPending ? 'Sending…' : sendLabel}
        </button>
      </div>
      {emailChanged && (
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '6px 0 0' }}>
          Sending will re-invite the teen at the new address with a fresh temporary password.
        </p>
      )}
      {confirmation && (
        <p style={{ fontSize: '12px', color: '#16a34a', margin: '8px 0 0' }}>
          &#10003; Invitation sent to {confirmation}
        </p>
      )}

      {/* Communication */}
      {invited && (
        <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #f1f5f9' }}>
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
        <label style={label}>Parent's email</label>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="email"
            value={parentEmail}
            onChange={e => setParentEmail(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && parentEmail.trim()) parentInviteMut.mutate(parentEmail.trim()) }}
            placeholder="parent@example.com"
            style={{ flex: '1 1 220px', padding: '9px 12px', fontSize: '13px', color: '#1e293b', border: '1px solid #e2e8f0', borderRadius: '8px', boxSizing: 'border-box' }}
          />
          <button
            onClick={() => parentEmail.trim() && parentInviteMut.mutate(parentEmail.trim())}
            disabled={!parentEmail.trim() || parentInviteMut.isPending}
            style={{ flex: 'none', fontSize: '13px', fontWeight: 600, color: '#fff', background: 'var(--float-primary)', border: 'none', borderRadius: '8px', padding: '9px 16px', cursor: 'pointer', opacity: !parentEmail.trim() || parentInviteMut.isPending ? 0.5 : 1 }}
          >
            {parentInviteMut.isPending ? 'Sending…' : 'Invite parent'}
          </button>
        </div>
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: '6px 0 0' }}>
          Emails a temporary password to sign in at /parent/login. No cap on parents per child.
        </p>
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
