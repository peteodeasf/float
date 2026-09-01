import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

import {
  getColleagues,
  getPatientAccess,
  grantPatientAccess,
  revokePatientAccess,
  setPatientOwner,
} from '../../api/access'

/**
 * Who else at this clinic can open this patient.
 *
 * Peter, 2026-09-01: the patient has an owner, and it is the therapist who started with them. A
 * colleague brought in to cover does the clinical work and can see who else has access — they
 * cannot hand the patient around, and they certainly cannot remove the owner.
 *
 * Every rule below is enforced by the backend; this screen only shows what is true:
 *  - only the owner or a clinic admin can add or remove anyone
 *  - the owner's own access cannot be removed, by anybody. Hand the patient over first.
 *  - a clinic admin can open every patient here without a grant, so admins are not listed
 *  - the last remaining clinician cannot be removed
 */
export default function ClinicianAccessPanel({
  patientId,
  patientName,
  onClose,
}: {
  patientId: string
  patientName: string
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [chosen, setChosen] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null)
  const [confirmingOwner, setConfirmingOwner] = useState<string | null>(null)

  const { data: access, isLoading: loadingAccess } = useQuery({
    queryKey: ['patient-access', patientId],
    queryFn: () => getPatientAccess(patientId),
  })
  const {
    data: colleagues,
    isLoading: loadingColleagues,
    isError: colleaguesFailed,
  } = useQuery({
    queryKey: ['colleagues'],
    queryFn: getColleagues,
    // A covering colleague cannot add anyone, so there is nothing to pick from.
    enabled: access?.can_manage === true,
  })

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['patient-access', patientId] })
    // The roster only shows patients you hold, so granting or revoking changes it.
    qc.invalidateQueries({ queryKey: ['patients'] })
    qc.invalidateQueries({ queryKey: ['patient', patientId] })
  }

  /** The backend's message, which says the actual rule that was broken. */
  const explain = (e: unknown, fallback: string) => {
    const detail = axios.isAxiosError(e) ? e.response?.data?.detail : null
    setError(typeof detail === 'string' ? detail : fallback)
  }

  const grantMut = useMutation({
    mutationFn: (practitionerId: string) => grantPatientAccess(patientId, practitionerId),
    onSuccess: () => { setChosen(''); setError(null); refresh() },
    onError: (e) => explain(e, 'Could not give access.'),
  })

  const revokeMut = useMutation({
    mutationFn: (practitionerId: string) => revokePatientAccess(patientId, practitionerId),
    onSuccess: () => { setConfirmingRemove(null); setError(null); refresh() },
    onError: (e) => { setConfirmingRemove(null); explain(e, 'Could not remove access.') },
  })

  const ownerMut = useMutation({
    mutationFn: (practitionerId: string) => setPatientOwner(patientId, practitionerId),
    onSuccess: () => { setConfirmingOwner(null); setError(null); refresh() },
    onError: (e) => { setConfirmingOwner(null); explain(e, 'Could not hand the patient over.') },
  })

  const grants = access?.grants ?? []
  const canManage = access?.can_manage === true
  const granted = useMemo(() => new Set(grants.map(g => g.practitioner_id)), [grants])
  // Admins are left out on purpose: granting one changes nothing, and offering it would suggest
  // their access comes from a grant that could later be taken away here.
  const canBeAdded = (colleagues ?? []).filter(c => !granted.has(c.id) && !c.is_org_admin)
  const admins = (colleagues ?? []).filter(c => c.is_org_admin)
  const busy = revokeMut.isPending || ownerMut.isPending

  return (
    <div
      style={{
        background: '#fff',
        border: '1px solid #cbd5e1',
        borderRadius: '12px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        padding: '20px',
        marginBottom: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          Who can open this patient
        </span>
        <button onClick={onClose} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">Close</button>
      </div>
      <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 14px' }}>
        {canManage
          ? `Only these clinicians can open ${patientName}’s record.`
          : `Only these clinicians can open ${patientName}’s record. This is not your patient, so only their own clinician or an admin here can change the list.`}
      </p>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
          <span style={{ fontSize: '12px', color: '#991b1b' }}>{error}</span>
        </div>
      )}

      {loadingAccess ? (
        <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Loading…</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
          {grants.map(g => (
            <div
              key={g.practitioner_id}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', padding: '8px 10px', background: '#f8fafc', borderRadius: '6px' }}
            >
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b' }}>{g.practitioner_name}</span>
                {g.is_owner && (
                  <span
                    className="px-1 py-0.5 rounded font-medium"
                    style={{ fontSize: '11px', background: '#eafaf6', color: '#0d3d3a' }}
                  >
                    Their clinician
                  </span>
                )}
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  {g.granted_by_backfill
                    ? 'had access before this screen existed'
                    : `added ${new Date(g.granted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`}
                </span>
              </div>

              {!canManage ? null : confirmingRemove === g.practitioner_id ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <span style={{ fontSize: '11px', color: '#991b1b' }}>Remove {g.practitioner_name}?</span>
                  <button
                    onClick={() => revokeMut.mutate(g.practitioner_id)}
                    disabled={busy}
                    className="text-[11px] text-white font-medium border-none cursor-pointer disabled:opacity-50"
                    style={{ background: '#dc2626', padding: '4px 10px', borderRadius: '4px' }}
                  >
                    Yes, remove
                  </button>
                  <button onClick={() => setConfirmingRemove(null)} className="text-[11px] text-slate-500 bg-transparent border-none cursor-pointer">Cancel</button>
                </div>
              ) : confirmingOwner === g.practitioner_id ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  <span style={{ fontSize: '11px', color: '#475569' }}>
                    Make {g.practitioner_name} this patient&rsquo;s clinician?
                  </span>
                  <button
                    onClick={() => ownerMut.mutate(g.practitioner_id)}
                    disabled={busy}
                    className="text-[11px] text-white font-medium border-none cursor-pointer disabled:opacity-50"
                    style={{ background: 'var(--float-primary)', padding: '4px 10px', borderRadius: '4px' }}
                  >
                    Yes, hand over
                  </button>
                  <button onClick={() => setConfirmingOwner(null)} className="text-[11px] text-slate-500 bg-transparent border-none cursor-pointer">Cancel</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  {!g.is_owner && (
                    <button
                      onClick={() => { setError(null); setConfirmingRemove(null); setConfirmingOwner(g.practitioner_id) }}
                      className="text-[11px] bg-transparent border-none cursor-pointer"
                      style={{ color: 'var(--float-primary)' }}
                    >
                      Make their clinician
                    </button>
                  )}
                  <button
                    onClick={() => { setError(null); setConfirmingOwner(null); setConfirmingRemove(g.practitioner_id) }}
                    disabled={g.is_owner || grants.length === 1}
                    title={
                      g.is_owner
                        ? 'This patient’s own clinician. Hand the patient to someone else first.'
                        : grants.length === 1
                          ? 'Add someone else first — a patient cannot be left with nobody'
                          : undefined
                    }
                    className="text-[11px] bg-transparent border-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                    style={{ color: '#dc2626' }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
          {grants.length === 0 && (
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Nobody has been given access yet.</p>
          )}
        </div>
      )}

      {canManage && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <select
            disabled={loadingColleagues || colleaguesFailed}
            value={chosen}
            onChange={e => { setChosen(e.target.value); setError(null) }}
            className="text-xs border border-slate-200 rounded"
            style={{ padding: '6px 8px', minWidth: '220px' }}
          >
            <option value="">Give another clinician access…</option>
            {canBeAdded.map(c => (
              <option key={c.id} value={c.id}>
                {c.name}{c.credentials ? `, ${c.credentials}` : ''}{c.is_me ? ' (you)' : ''}
              </option>
            ))}
          </select>
          <button
            onClick={() => chosen && grantMut.mutate(chosen)}
            disabled={!chosen || grantMut.isPending}
            className="bg-teal-600 text-white rounded text-xs font-medium disabled:opacity-40 border-none cursor-pointer"
            style={{ padding: '6px 12px' }}
          >
            {grantMut.isPending ? 'Adding…' : 'Add'}
          </button>
          {/* Say which of the three it is. A failed request must not read as "nobody left to add" —
              that is a wrong answer wearing the same words as a right one. */}
          {colleaguesFailed ? (
            <span style={{ fontSize: '11px', color: '#991b1b' }}>Could not load who works here.</span>
          ) : loadingColleagues ? (
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Loading…</span>
          ) : canBeAdded.length === 0 ? (
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>Everyone here already has access.</span>
          ) : null}
        </div>
      )}

      {canManage && admins.length > 0 && (
        <p style={{ fontSize: '11px', color: '#94a3b8', margin: '14px 0 0', lineHeight: 1.5 }}>
          {admins.length === 1 ? `${admins[0].name} is` : `${admins.map(a => a.name).join(', ')} are`}
          {' '}an admin here and can open every patient at this clinic. That is not something this
          screen can change.
        </p>
      )}
    </div>
  )
}
