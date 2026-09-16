import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { btn } from '../ui/buttons'
import { getGettingStarted, markGettingStarted, type GettingStarted } from '../../api/me_practitioner'

/**
 * A short checklist on a new clinician's home screen. Items tick off as the real work is done;
 * nothing is ticked by hand. docs/plans/clinician-practice-onboarding.md, step 5.
 */
const COPY: Record<GettingStarted['items'][number]['key'], { title: string; detail: string; action: string }> = {
  education: {
    title: 'Read the clinician education',
    detail: 'Short modules on exposure-based CBT for childhood anxiety.',
    action: 'Open education',
  },
  invite: {
    title: 'Invite the people in your practice',
    detail: 'Clinicians and office managers each get an email to set up their own account.',
    action: 'Invite',
  },
  patient: {
    title: 'Add your first patient',
    detail: 'A colleague sees your patient only once you give them access. Practice admins see every patient.',
    action: 'Add patient',
  },
  monitoring: {
    title: 'Send a parent the monitoring form',
    detail: 'The parent records what happens at home before your first session. Send it from the patient’s page.',
    action: '',
  },
}

export default function GettingStartedCard() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { data } = useQuery({ queryKey: ['getting-started'], queryFn: getGettingStarted })
  const mark = useMutation({
    mutationFn: markGettingStarted,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['getting-started'] }),
  })

  if (!data || data.hidden || data.items.every(i => i.done)) return null
  const doneCount = data.items.filter(i => i.done).length

  const act = (key: GettingStarted['items'][number]['key']) => {
    if (key === 'education') {
      mark.mutate('read_education')
      navigate('/education')
    } else if (key === 'invite') navigate('/settings')
    else if (key === 'patient') navigate('/patients/new')
  }

  return (
    <section className="bg-white" style={{
      borderRadius: 'var(--float-radius)', border: '1px solid var(--float-border)', padding: '20px 24px',
      marginBottom: '20px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div>
          <h2 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--float-text)', margin: 0 }}>Getting started</h2>
          <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', margin: '4px 0 0' }}>
            {doneCount} of {data.items.length} done
          </p>
        </div>
        {data.can_hide && (
          <button onClick={() => mark.mutate('hide_getting_started')} style={btn('quiet', 'sm')}>Hide</button>
        )}
      </div>
      <ol style={{ listStyle: 'none', margin: '14px 0 0', padding: 0 }}>
        {data.items.map(item => {
          const copy = COPY[item.key]
          return (
            <li key={item.key} style={{
              display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0',
              borderTop: '1px solid var(--float-border)',
            }}>
              <span aria-label={item.done ? 'Done' : 'Not done'} style={{
                width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0, display: 'flex',
                alignItems: 'center', justifyContent: 'center', fontSize: '12px', color: '#fff',
                background: item.done ? 'var(--float-primary)' : 'transparent',
                border: item.done ? '1px solid var(--float-primary)' : '1px solid var(--float-border-strong)',
              }}>{item.done ? '✓' : ''}</span>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontSize: '14px', fontWeight: 500,
                  color: item.done ? 'var(--float-text-hint)' : 'var(--float-text)',
                  textDecoration: item.done ? 'line-through' : 'none',
                }}>{copy.title}</div>
                {!item.done && (
                  <div style={{ fontSize: '12px', color: 'var(--float-text-secondary)', marginTop: '2px' }}>{copy.detail}</div>
                )}
              </div>
              {!item.done && copy.action && (
                <button onClick={() => act(item.key)} style={btn('secondary', 'sm')}>{copy.action}</button>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
