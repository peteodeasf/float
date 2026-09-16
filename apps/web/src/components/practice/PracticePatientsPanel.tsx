import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { btn } from '../ui/buttons'
import { CARD, CARD_STYLE, ERROR_BOX, INPUT, SECTION_NOTE, SECTION_TITLE, errorMessage } from '../ui/form'
import { getPracticeClinicians, getPracticePatients, setPatientClinician, type PracticePatient } from '../../api/practice'

/**
 * For an office manager: each patient's name and clinician, and a way to hand a patient to another
 * clinician. No patient records. Opening this list is written to each patient's access log.
 * docs/plans/clinician-practice-onboarding.md, step 6.
 */
export default function PracticePatientsPanel() {
  const qc = useQueryClient()
  const { data: patients, isLoading } = useQuery({ queryKey: ['practice-patients'], queryFn: getPracticePatients })
  const { data: clinicians } = useQuery({ queryKey: ['practice-clinicians'], queryFn: getPracticeClinicians })
  const [editing, setEditing] = useState<string | null>(null)
  const [chosen, setChosen] = useState('')

  const hand = useMutation({
    mutationFn: (p: PracticePatient) => setPatientClinician(p.patient_id, chosen),
    onSuccess: () => {
      setEditing(null); setChosen('')
      qc.invalidateQueries({ queryKey: ['practice-patients'] })
    },
  })

  return (
    <section className={CARD} style={CARD_STYLE}>
      <h2 style={SECTION_TITLE}>Patients</h2>
      <p style={SECTION_NOTE}>
        Who each patient&rsquo;s clinician is. When a clinician leaves, give their patients to someone else here.
      </p>
      {hand.isError && <div style={ERROR_BOX}>{errorMessage(hand.error, 'Could not change the clinician.')}</div>}
      {isLoading ? <p style={SECTION_NOTE}>Loading…</p> : patients?.length === 0 ? (
        <p style={{ ...SECTION_NOTE, marginTop: '16px' }}>No patients yet.</p>
      ) : (
        <div style={{ marginTop: '16px' }}>
          {patients?.map(p => (
            <div key={p.patient_id} style={{ padding: '10px 0', borderTop: '1px solid var(--float-border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--float-text)' }}>
                    {p.name}{p.closed ? ' · Treatment closed' : ''}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--float-text-secondary)' }}>
                    Clinician: {p.clinician?.name ?? 'None'}
                    {p.others_with_access.length > 0 && ` · Also has access: ${p.others_with_access.map(c => c.name).join(', ')}`}
                  </div>
                </div>
                {editing !== p.patient_id && (
                  <button onClick={() => { setEditing(p.patient_id); setChosen('') }} style={btn('secondary', 'sm')}>
                    Change clinician
                  </button>
                )}
              </div>
              {editing === p.patient_id && (
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px' }}>
                  <select value={chosen} onChange={e => setChosen(e.target.value)} style={{ ...INPUT, maxWidth: '260px' }}>
                    <option value="">Choose a clinician</option>
                    {clinicians?.filter(c => c.practitioner_id !== p.clinician?.practitioner_id).map(c => (
                      <option key={c.practitioner_id} value={c.practitioner_id}>{c.name}</option>
                    ))}
                  </select>
                  <button onClick={() => hand.mutate(p)} disabled={!chosen || hand.isPending} style={btn('primary', 'sm')}>
                    {hand.isPending ? 'Saving…' : 'Make their clinician'}
                  </button>
                  <button onClick={() => setEditing(null)} style={btn('quiet', 'sm')}>Cancel</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
