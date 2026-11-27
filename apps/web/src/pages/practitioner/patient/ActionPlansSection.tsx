/**
 * Action plans on the Sessions tab: the list, and the way into building one.
 * docs/plans/action-plans-build.md
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createActionPlan, getActionPlans, type ActionPlan } from '../../../api/action_plans'
import { getPatient } from '../../../api/patients'
import { btn } from '../../../components/ui/buttons'
import { ActionPlanBuilder, LastPlanReview } from './ActionPlanBuilder'

const card = {
  background: 'var(--float-surface)', borderRadius: 'var(--float-radius-card)', border: '1px solid var(--float-border-strong)',
  boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', padding: '20px', width: '100%', boxSizing: 'border-box' as const,
}

const day = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export default function ActionPlansSection({ patientId }: { patientId: string }) {
  const { data: plans } = useQuery({ queryKey: ['action-plans', patientId], queryFn: () => getActionPlans(patientId) })
  const { data: patient } = useQuery({ queryKey: ['patient', patientId], queryFn: () => getPatient(patientId) })
  const childName = patient?.name?.split(' ')[0] || 'the child'
  const [open, setOpen] = useState<ActionPlan | null>(null)
  const [reviewing, setReviewing] = useState(false)

  const latest = plans?.[0]
  const draft = latest && !latest.published_at ? latest : null

  const qc = useQueryClient()
  // The first plan has nothing to look back on, so it starts straight away.
  const firstMut = useMutation({
    mutationFn: () => createActionPlan(patientId, []),
    onSuccess: p => { qc.invalidateQueries({ queryKey: ['action-plans', patientId] }); setOpen(p) },
  })
  const start = () => {
    if (draft) setOpen(draft)
    else if (latest) setReviewing(true)
    else firstMut.mutate()
  }

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: 'var(--float-primary-dark)' }}>Action plans</h3>
        <button onClick={start} disabled={firstMut.isPending} style={{ ...btn('secondary', 'sm'), marginLeft: 'auto' }}>
          {draft ? 'Continue the draft' : 'New action plan'}
        </button>
      </div>

      {plans && plans.length === 0 && (
        <p style={{ fontSize: 13, color: 'var(--float-text-hint)', margin: 0 }}>
          None yet. Make one in the last part of the session, with {childName}.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(plans ?? []).map(p => {
          const unanswered = p.items.filter(i => i.kind === 'reward' && i.reward_given == null).length
          return (
            <button key={p.id} onClick={() => setOpen(p)}
              style={{ textAlign: 'left', background: 'var(--float-surface)', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-card)', padding: '10px 13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#334155' }}>Session {p.session_number}</span>
              <span style={{ fontSize: 12.5, color: '#6b7a79' }}>{day(p.session_date)} · {p.items.length} {p.items.length === 1 ? 'item' : 'items'}</span>
              {p.published_at && unanswered > 0 && p === latest && (
                <span style={{ fontSize: 11.5, color: '#6b7a79' }}>· {unanswered} {unanswered === 1 ? 'reward' : 'rewards'} not marked yet</span>
              )}
              <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 800, borderRadius: 'var(--float-radius-pill)', padding: '2px 9px',
                color: p.published_at ? '#3f8a78' : 'var(--float-primary-dark)', background: p.published_at ? '#eef7f4' : '#fff7e6',
                border: `1px solid ${p.published_at ? '#bcdfd4' : '#f3dca8'}` }}>
                {p.published_at ? 'Shared' : 'Draft'}
              </span>
            </button>
          )
        })}
      </div>

      {reviewing && latest && !draft && (
        <LastPlanReview patientId={patientId} last={latest}
          onStarted={p => { setReviewing(false); setOpen(p) }} onClose={() => setReviewing(false)} />
      )}
      {open && <ActionPlanBuilder patientId={patientId} childName={childName} plan={open}
        readOnly={open.id !== latest?.id} onClose={() => setOpen(null)} />}
    </div>
  )
}

