import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { btn } from '../ui/buttons'
import { CARD, CARD_STYLE, ERROR_BOX, Field, INPUT, SECTION_NOTE, SECTION_TITLE, errorMessage } from '../ui/form'
import {
  getMembers, inviteMember, removeMember, resendMemberLink, setMemberAdmin, type Member,
} from '../../api/practice'

/**
 * The people in the practice, for a practice admin: invite, resend a setup link, make someone an
 * admin, remove someone. Used on Settings for clinician admins and on the office manager's page.
 * docs/plans/clinician-practice-onboarding.md, step 5.
 */
export default function PracticeMembersPanel({ myEmail }: { myEmail?: string }) {
  const qc = useQueryClient()
  const { data: members, isLoading } = useQuery({ queryKey: ['practice-members'], queryFn: getMembers })
  const [inviting, setInviting] = useState(false)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Member['role']>('clinician')
  const [notice, setNotice] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)

  const done = (message: string) => {
    setError(null)
    setNotice(message)
    qc.invalidateQueries({ queryKey: ['practice-members'] })
    setTimeout(() => setNotice(null), 4000)
  }
  const failed = (e: unknown) => setError(errorMessage(e, 'Something went wrong. Please try again.'))

  const invite = useMutation({
    mutationFn: () => inviteMember({ name: name.trim(), email: email.trim(), role }),
    onSuccess: () => {
      done(`Invitation sent to ${email.trim()}.`)
      setInviting(false); setName(''); setEmail(''); setRole('clinician')
    },
    onError: failed,
  })
  const resend = useMutation({
    mutationFn: (m: Member) => resendMemberLink(m.user_id),
    onSuccess: (_d, m) => done(`A new setup link was sent to ${m.email}.`),
    onError: failed,
  })
  const toggleAdmin = useMutation({
    mutationFn: (m: Member) => setMemberAdmin(m.user_id, !m.is_admin),
    onSuccess: (_d, m) => done(m.is_admin ? `${m.name || m.email} is no longer an admin.` : `${m.name || m.email} is now an admin.`),
    onError: failed,
  })
  const remove = useMutation({
    mutationFn: (m: Member) => removeMember(m.user_id),
    onSuccess: (_d, m) => { setConfirmRemove(null); done(`${m.name || m.email} has been removed.`) },
    onError: failed,
  })

  return (
    <section className={CARD} style={CARD_STYLE}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div>
          <h2 style={SECTION_TITLE}>People in your practice</h2>
          <p style={SECTION_NOTE}>
            A new clinician sees no patients until someone gives them access to one.
          </p>
        </div>
        {!inviting && <button onClick={() => setInviting(true)} style={btn('secondary', 'md')}>Invite someone</button>}
      </div>

      {error && <div style={ERROR_BOX}>{error}</div>}
      {notice && <p style={{ fontSize: '13px', color: '#0d3d3a', margin: '12px 0 0' }}>{notice}</p>}

      {inviting && (
        <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '16px', marginTop: '16px' }}>
          <div style={{ display: 'grid', gap: '12px' }}>
            <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} style={INPUT} autoFocus /></Field>
            <Field label="Email"><input type="email" value={email} onChange={e => setEmail(e.target.value)} style={INPUT} /></Field>
            <Field label="Role" hint={role === 'practice_manager'
              ? 'An office manager runs the practice: invites people and hands patients between clinicians. They never see patient records.'
              : 'They will choose a password, add their details and accept the terms of use.'}>
              <select value={role} onChange={e => setRole(e.target.value as Member['role'])} style={INPUT}>
                <option value="clinician">Clinician</option>
                <option value="practice_manager">Office manager</option>
              </select>
            </Field>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
            <button onClick={() => invite.mutate()} disabled={!name.trim() || !email.trim() || invite.isPending}
              style={btn('primary', 'md')}>{invite.isPending ? 'Sending…' : 'Send invitation'}</button>
            <button onClick={() => setInviting(false)} style={btn('quiet', 'md')}>Cancel</button>
          </div>
        </div>
      )}

      {isLoading ? <p style={SECTION_NOTE}>Loading…</p> : (
        <div style={{ marginTop: '16px' }}>
          {members?.map(m => {
            const isMe = !!myEmail && m.email === myEmail
            return (
              <div key={m.user_id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px',
                padding: '10px 0', borderTop: '1px solid var(--float-border)', opacity: m.status === 'removed' ? 0.55 : 1,
              }}>
                <div>
                  <div style={{ fontSize: '14px', color: 'var(--float-text)', fontWeight: 500 }}>
                    {m.name || m.email}{isMe ? ' (you)' : ''}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--float-text-secondary)' }}>
                    {m.email} · {m.role === 'practice_manager' ? 'Office manager' : 'Clinician'}
                    {m.is_admin ? ' · Admin' : ''}
                    {m.status === 'invited' ? ' · Invited, not set up yet' : ''}
                    {m.status === 'removed' ? ' · Removed' : ''}
                  </div>
                </div>
                {m.status !== 'removed' && !isMe && (
                  confirmRemove === m.user_id ? (
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '12px', color: '#991b1b' }}>
                      Remove? Their patients stay in the practice.
                      <button onClick={() => remove.mutate(m)} style={btn('danger', 'sm')}>Remove</button>
                      <button onClick={() => setConfirmRemove(null)} style={btn('quiet', 'sm')}>Cancel</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {m.can_resend_link && <button onClick={() => resend.mutate(m)} style={btn('secondary', 'sm')}>Resend link</button>}
                      {m.role === 'clinician' && m.status === 'active' && (
                        <button onClick={() => toggleAdmin.mutate(m)} style={btn('secondary', 'sm')}>
                          {m.is_admin ? 'Remove admin' : 'Make admin'}
                        </button>
                      )}
                      <button onClick={() => setConfirmRemove(m.user_id)} style={btn('danger', 'sm')}>Remove</button>
                    </div>
                  )
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
