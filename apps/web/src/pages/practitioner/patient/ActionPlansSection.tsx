/**
 * Action plans on the Sessions tab, as cards like the rest of the patient page. The newest plan is
 * the card you work in; earlier ones sit in a card below and open in place, read only.
 * Mockup agreed with Peter 2026-11-27. docs/plans/action-plans-build.md
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getActionPlans } from '../../../api/action_plans'
import { getPatient } from '../../../api/patients'
import { btn } from '../../../components/ui/buttons'
import { PlanCard, StartCard } from './ActionPlanCard'
import { card } from './actionPlanCardStyle'

const day = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export default function ActionPlansSection({ patientId }: { patientId: string }) {
  const { data: plans } = useQuery({ queryKey: ['action-plans', patientId], queryFn: () => getActionPlans(patientId) })
  const { data: patient } = useQuery({ queryKey: ['patient', patientId], queryFn: () => getPatient(patientId) })
  const childName = patient?.name?.split(' ')[0] || 'the child'
  const [starting, setStarting] = useState(false)
  const [openEarlier, setOpenEarlier] = useState<string | null>(null)

  if (!plans) return null
  const [latest, ...earlier] = plans
  const nextNumber = (latest?.session_number ?? 0) + 1

  return (
    <>
      {starting ? (
        <StartCard patientId={patientId} last={latest ?? null} nextNumber={nextNumber}
          onStarted={() => setStarting(false)} onCancel={() => setStarting(false)} />
      ) : latest ? (
        <PlanCard patientId={patientId} childName={childName} plan={latest} isLatest onNew={() => setStarting(true)} />
      ) : (
        <div style={{ ...card, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span className="text-sm font-semibold text-slate-700">Action plan</span>
            <button onClick={() => setStarting(true)} style={btn('primary', 'sm')}>+ New action plan</button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--float-text-hint)', margin: '10px 0 0' }}>
            None yet. Make one in the last part of the session, with {childName}.
          </p>
        </div>
      )}

      {earlier.length > 0 && (
        <div style={{ ...card, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <span className="text-sm font-semibold text-slate-700">Earlier action plans</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{earlier.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {earlier.map(p => {
              const unanswered = p.items.filter(i => i.kind === 'reward' && i.reward_given == null).length
              const open = openEarlier === p.id
              return (
                <div key={p.id}>
                  <button onClick={() => setOpenEarlier(open ? null : p.id)} aria-expanded={open}
                    style={{ width: '100%', textAlign: 'left', fontFamily: 'inherit', background: 'var(--float-surface)', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-card)', padding: '10px 13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--float-text)' }}>Session {p.session_number}</span>
                    <span style={{ fontSize: 12, color: 'var(--float-text-secondary)' }}>
                      {day(p.session_date)} · {p.items.length} {p.items.length === 1 ? 'item' : 'items'}
                      {unanswered > 0 && ` · ${unanswered} ${unanswered === 1 ? 'reward' : 'rewards'} not marked yet`}
                    </span>
                    <span style={{ marginLeft: 'auto', color: 'var(--float-text-hint)' }} aria-hidden="true">{open ? '▾' : '›'}</span>
                  </button>
                  {open && (
                    <div style={{ marginTop: 8 }}>
                      <PlanCard patientId={patientId} childName={childName} plan={p} isLatest={false} onNew={() => {}} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
