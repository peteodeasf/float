/**
 * The Plan tab's Action plan sub-tab: the current plan in its check-in view (Edit and New open the
 * edit view, which saves the whole plan), and the closed plans below, each opening in the same view.
 * Peter, 2026-11-27. docs/plans/action-plans-build.md
 */
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createActionPlan, getActionPlans, saveActionPlan, type ActionPlan, type PlanIn } from '../../../api/action_plans'
import { getPatient } from '../../../api/patients'
import { btn } from '../../../components/ui/buttons'
import { PlanEditor, PlanView } from './ActionPlanCard'
import { card, range } from './actionPlanCardStyle'

export default function ActionPlansSection({ patientId }: { patientId: string }) {
  const qc = useQueryClient()
  const { data: plans } = useQuery({ queryKey: ['action-plans', patientId], queryFn: () => getActionPlans(patientId) })
  const { data: patient } = useQuery({ queryKey: ['patient', patientId], queryFn: () => getPatient(patientId) })
  const childName = patient?.name?.split(' ')[0] || 'Child'
  // null: the view. 'new': a new plan. Otherwise the plan being edited.
  const [editing, setEditing] = useState<null | 'new' | ActionPlan>(null)
  const [openClosed, setOpenClosed] = useState<string | null>(null)

  const done = () => { qc.invalidateQueries({ queryKey: ['action-plans', patientId] }); setEditing(null) }
  const saveMut = useMutation({
    mutationFn: (body: PlanIn) => (editing === 'new' || editing === null
      ? createActionPlan(patientId, body)
      : saveActionPlan(editing.id, body)),
    onSuccess: done,
  })

  if (!plans) return null
  // Newest first, so when one plan ends the day the next begins, the new one is current.
  const current = plans.find(p => p.state === 'current') ?? plans.find(p => p.state === 'upcoming') ?? null
  // Everything but the one shown above: closed plans, and one that ended today when a new one began.
  const closed = plans.filter(p => p.id !== current?.id)

  return (
    <>
      {editing !== null ? (
        <PlanEditor key={editing === 'new' ? 'new' : editing.id} patientId={patientId} childName={childName}
          plan={editing === 'new' ? null : editing} saving={saveMut.isPending} error={saveMut.error}
          onSave={body => saveMut.mutate(body)} onCancel={() => { saveMut.reset(); setEditing(null) }} />
      ) : current ? (
        <PlanView patientId={patientId} childName={childName} plan={current}
          onEdit={() => setEditing(current)} onNew={() => setEditing('new')} />
      ) : (
        <div style={{ ...card, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span className="text-sm font-semibold text-slate-700">Action plan</span>
            <button onClick={() => setEditing('new')} style={btn('primary', 'sm')}>+ New action plan</button>
          </div>
          <p style={{ fontSize: 12, color: 'var(--float-text-hint)', margin: '10px 0 0' }}>
            {closed.length > 0 ? 'No plan is running now.' : `None yet. Make one in the last part of the session, with ${childName}.`}
          </p>
        </div>
      )}

      {closed.length > 0 && (
        <div style={{ ...card, padding: '14px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span className="text-sm font-semibold text-slate-700">Earlier action plans</span>
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{closed.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {closed.map(p => {
              const open = openClosed === p.id
              return (
                <div key={p.id}>
                  <button onClick={() => setOpenClosed(open ? null : p.id)} aria-expanded={open}
                    style={{ width: '100%', textAlign: 'left', fontFamily: 'inherit', background: 'none', border: 'none', borderBottom: '1px solid var(--float-surface-sunken)', padding: '7px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--float-text)' }}>{range(p)}</span>
                    <span style={{ fontSize: 12, color: 'var(--float-text-secondary)' }}>{p.done_count} of {p.items.length} done</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--float-text-secondary)', background: 'var(--float-surface-sunken)', borderRadius: 'var(--float-radius-pill)', padding: '2px 8px' }}>Closed</span>
                    <span style={{ marginLeft: 'auto', color: 'var(--float-text-hint)' }} aria-hidden="true">{open ? '▾' : '›'}</span>
                  </button>
                  {open && <div style={{ margin: '8px 0' }}><PlanView patientId={patientId} childName={childName} plan={p} /></div>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
