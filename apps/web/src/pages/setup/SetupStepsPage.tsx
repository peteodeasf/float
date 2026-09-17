import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import FloatLogo from '../../components/ui/FloatLogo'
import { Button, Banner } from '../../components/ui/primitives'
import { Field, INPUT, SECTION_NOTE, errorMessage } from '../../components/ui/form'
import { useAuth } from '../../context/AuthContext'
import {
  acceptAgreements, getAgreements, getSetupState, saveSetupDetails, saveSetupPractice,
  type SetupState,
} from '../../api/setup'

/**
 * The setup screens a new clinician or office manager goes through after choosing a password, and
 * before they can use anything else. The server decides which screens they need and which is next,
 * so closing the tab and signing in again carries on where they left off.
 *
 * docs/plans/clinician-practice-onboarding.md, step 4.
 */
export default function SetupStepsPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { logout, refreshAccount } = useAuth()
  const { data: state, isLoading, isError } = useQuery({ queryKey: ['setup'], queryFn: getSetupState })

  const onSaved = async (next: SetupState) => {
    qc.setQueryData(['setup'], next)
    if (next.setup_complete) {
      await refreshAccount()
      navigate(next.role === 'practice_manager' ? '/practice' : '/dashboard', { replace: true })
    }
  }

  const step = state?.next_step
  const stepNumber = state && step ? state.steps.indexOf(step) + 1 : 0

  return (
    <div className="min-h-screen flex items-start justify-center px-4 py-12" style={{ background: 'var(--float-bg)' }}>
      <div className="w-full" style={{
        maxWidth: '560px', background: 'var(--float-surface)', borderRadius: 'var(--float-radius-lg)',
        boxShadow: 'var(--float-shadow-md)', padding: '40px',
      }}>
        <div className="flex items-center justify-between" style={{ marginBottom: '28px' }}>
          <FloatLogo size="md" />
          <Button kind="quiet" size="sm" onClick={logout}>Sign out</Button>
        </div>

        {isLoading && <p style={SECTION_NOTE}>Loading…</p>}
        {isError && <Banner tone="danger" style={{ marginTop: '14px' }}>Could not load your setup. Try reloading the page.</Banner>}

        {state && step && (
          <>
            <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--float-text-hint)', margin: '0 0 6px' }}>
              Step {stepNumber} of {state.steps.length}
            </p>
            {step === 'details' && <DetailsStep state={state} onSaved={onSaved} />}
            {step === 'practice' && <PracticeStep state={state} onSaved={onSaved} />}
            {step === 'agreements' && <AgreementsStep state={state} onSaved={onSaved} />}
          </>
        )}
      </div>
    </div>
  )
}

interface StepProps {
  state: SetupState
  onSaved: (next: SetupState) => void
}

const TITLE: React.CSSProperties = { fontSize: '20px', fontWeight: 700, color: 'var(--float-text)', margin: 0 }

function StepFooter({ label, pending, disabled, onClick }: {
  label: string; pending: boolean; disabled: boolean; onClick: () => void
}) {
  return (
    <div style={{ marginTop: '24px' }}>
      <Button kind="primary" onClick={onClick} disabled={disabled || pending}>
        {pending ? 'Saving…' : label}
      </Button>
    </div>
  )
}

function DetailsStep({ state, onSaved }: StepProps) {
  const isManager = state.role === 'practice_manager'
  const [name, setName] = useState(state.details.name)
  const [credentials, setCredentials] = useState(state.details.credentials ?? '')
  const [phone, setPhone] = useState(state.details.phone_number ?? '')
  const save = useMutation({
    mutationFn: () => saveSetupDetails({
      name, credentials: isManager ? null : credentials.trim() || null, phone_number: phone.trim() || null,
    }),
    onSuccess: onSaved,
  })

  return (
    <>
      <h1 style={TITLE}>Your details</h1>
      <p style={SECTION_NOTE}>
        {isManager
          ? 'Your name is shown to the clinicians in your practice.'
          : 'Your name and credentials appear on your patients’ records.'}
      </p>
      {save.isError && <Banner tone="danger" style={{ marginTop: '14px' }}>{errorMessage(save.error, 'Could not save your details.')}</Banner>}
      <div style={{ display: 'grid', gap: '14px', marginTop: '20px' }}>
        <Field label="Name">
          <input value={name} onChange={e => setName(e.target.value)} style={INPUT} autoFocus />
        </Field>
        {!isManager && (
          <Field label="Credentials" hint="For example PsyD, or LCSW.">
            <input value={credentials} onChange={e => setCredentials(e.target.value)} style={INPUT} />
          </Field>
        )}
        <Field label="Phone" hint="Optional.">
          <input value={phone} onChange={e => setPhone(e.target.value)} style={INPUT} />
        </Field>
        <Field label="Email" hint="This is how you sign in.">
          <input value={state.email} readOnly style={{ ...INPUT, background: 'var(--float-surface-sunken)', color: 'var(--float-text-secondary)' }} />
        </Field>
      </div>
      <StepFooter label="Continue" pending={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()} />
    </>
  )
}

function PracticeStep({ state, onSaved }: StepProps) {
  const [name, setName] = useState(state.practice.name)
  const [practiceState, setPracticeState] = useState(state.practice.state ?? '')
  const [phone, setPhone] = useState(state.practice.phone ?? '')
  const save = useMutation({
    mutationFn: () => saveSetupPractice({ name, state: practiceState, phone: phone.trim() || null }),
    onSuccess: onSaved,
  })

  return (
    <>
      <h1 style={TITLE}>Your practice</h1>
      <p style={SECTION_NOTE}>You can invite the other people in your practice once setup is finished.</p>
      {save.isError && <Banner tone="danger" style={{ marginTop: '14px' }}>{errorMessage(save.error, 'Could not save the practice details.')}</Banner>}
      <div style={{ display: 'grid', gap: '14px', marginTop: '20px' }}>
        <Field label="Practice name">
          <input value={name} onChange={e => setName(e.target.value)} style={INPUT} autoFocus />
        </Field>
        <Field label="State" hint="For example CA.">
          <input value={practiceState} onChange={e => setPracticeState(e.target.value)} style={INPUT} />
        </Field>
        <Field label="Practice phone" hint="Optional.">
          <input value={phone} onChange={e => setPhone(e.target.value)} style={INPUT} />
        </Field>
      </div>
      <StepFooter label="Continue" pending={save.isPending}
        disabled={!name.trim() || !practiceState.trim()} onClick={() => save.mutate()} />
    </>
  )
}

function AgreementsStep({ state, onSaved }: StepProps) {
  const { data: documents, isLoading } = useQuery({ queryKey: ['setup-agreements'], queryFn: getAgreements })
  const [accepted, setAccepted] = useState<Record<string, boolean>>({})
  const [authorized, setAuthorized] = useState(false)
  useEffect(() => { setAccepted({}) }, [documents])

  const save = useMutation({
    mutationFn: () => acceptAgreements(documents ?? [], authorized),
    onSuccess: onSaved,
  })
  const allAccepted = !!documents?.length && documents.every(d => accepted[d.document])
  const needsAuthority = state.is_practice_owner

  return (
    <>
      <h1 style={TITLE}>{needsAuthority ? 'Terms and BAA' : 'Terms of use'}</h1>
      <p style={SECTION_NOTE}>
        {needsAuthority
          ? 'Your practice has to accept the Business Associate Agreement (BAA) before any patient information is added. You accept it once, for the whole practice.'
          : 'Please read and accept the terms of use.'}
      </p>
      {save.isError && <Banner tone="danger" style={{ marginTop: '14px' }}>{errorMessage(save.error, 'Could not save.')}</Banner>}
      {isLoading && <p style={SECTION_NOTE}>Loading…</p>}

      <div style={{ display: 'grid', gap: '18px', marginTop: '20px' }}>
        {documents?.map(d => (
          <div key={d.document}>
            <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text)', margin: '0 0 8px' }}>{d.title}</p>
            <div style={{
              maxHeight: '180px', overflowY: 'auto', whiteSpace: 'pre-wrap', fontSize: '13px', lineHeight: 1.6,
              color: 'var(--float-text-secondary)', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-control)',
              padding: '12px 14px', background: 'var(--float-surface-muted)',
            }}>
              {d.body}
            </div>
            <label style={CHECK_ROW}>
              <input type="checkbox" checked={!!accepted[d.document]}
                onChange={e => setAccepted(a => ({ ...a, [d.document]: e.target.checked }))} />
              I accept the {d.title}
            </label>
          </div>
        ))}
        {needsAuthority && documents && (
          <label style={CHECK_ROW}>
            <input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)} />
            I am allowed to sign agreements on behalf of {state.practice.name}
          </label>
        )}
      </div>
      <StepFooter label="Accept and finish" pending={save.isPending}
        disabled={!allAccepted || (needsAuthority && !authorized)} onClick={() => save.mutate()} />
    </>
  )
}

const CHECK_ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', fontSize: '14px', color: 'var(--float-text)',
  cursor: 'pointer',
}

