// Local design preview for session mode — `/__session-preview`, dev builds only (see main.tsx).
//
// Seeds the react-query cache with fixtures so the phases render without an API and without
// writing anything. This exists because the only database reachable from a dev machine is
// PRODUCTION, so clicking through the real route to check a design is not an option.
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LadderEditor } from './SessionPage'
import { BehaviorPanel, FlatLadder } from './PatientPage'
import { ArrowIntro, PickPhase, ChainPhase } from './ArrowPage'
import ParentPlanPanel from '../../components/practitioner/ParentPlanPanel'

const TRIGGERS = [
  { id: 't1', name: 'Raising my hand in class', distress_thermometer_rating: 7, display_order: 0 },
  { id: 't2', name: 'Ordering food for myself', distress_thermometer_rating: 5, display_order: 1 },
  { id: 't3', name: 'Sleepovers at a friend’s house', distress_thermometer_rating: 9, display_order: 2 },
] as any[]

const BEHAVIORS = [
  { id: 'b0', name: 'Avoids Raising my hand in class', behavior_type: 'avoidance', distress_thermometer_when_refraining: 7, parent_behavior_id: null },
  { id: 'b1', name: 'ask a friend to answer for me', behavior_type: 'safety', distress_thermometer_when_refraining: 6, parent_behavior_id: null },
  { id: 'b2', name: 'answering one question the teacher asks me directly', behavior_type: 'scenario', distress_thermometer_when_refraining: 3, parent_behavior_id: null },
  { id: 'b3', name: 'putting my hand up once when I know the answer', behavior_type: 'scenario', distress_thermometer_when_refraining: 5, parent_behavior_id: null },
] as any[]

export default function SessionPreview() {
  const qc = useQueryClient()
  const [ready, setReady] = useState(false)
  const [view, setView] = useState<'editor' | 'builder' | 'arrow-intro' | 'arrow-pick' | 'arrow-chain' | 'flat-ladder' | 'parent-plan'>('editor')

  useEffect(() => {
    // The fixtures below must be the only data. Without this the app re-fetches them as stale, and
    // a request with no sign-in comes back "Not authenticated", which signs the page out to /login
    // (api/session.ts). Dev-only page, so changing the defaults here touches nothing real.
    qc.setDefaultOptions({ queries: { staleTime: Infinity, retry: false } })
    qc.setQueryData(['insights', 'pt1', 'situation'], [])
    qc.setQueryData(['situation-library', ''], [
      { id: 's1', name: 'Speaking in front of the class' },
      { id: 's2', name: 'Being away from home overnight' },
      { id: 's3', name: 'Meeting someone new' },
      { id: 's4', name: 'Going to the school nurse' },
    ])
    qc.setQueryData(['behaviors', 't1'], BEHAVIORS)
    qc.setQueryData(['behaviors', 't3'], [])
    qc.setQueryData(['situation-da', 't1'], null)
    // Plan-tab builder pane (BehaviorPanel) fixtures
    qc.setQueryData(['experiments', 'p-1'], [])
    qc.setQueryData(['ladder', 't1'], { id: 'l1', status: 'not_started' })
    qc.setQueryData(['ladder-flags', 'l1'], [])
    qc.setQueryData(['content-tags'], [
      { id: 'g1', slug: 'social', label: 'Social' },
      { id: 'g2', slug: 'uncertainty', label: 'Uncertainty' },
      { id: 'g3', slug: 'perfectionism', label: 'Perfectionism' },
    ])
    qc.setQueryData(['situation-tags', 't1'], ['g1', 'g2'])
    qc.setQueryData(['plan-rungs', 'p1'], [
      { id: 'r1', trigger_situation_id: 't1', name: 'answering one question the teacher asks me directly', behavior_type: 'scenario', distress_thermometer_when_refraining: 3, parent_behavior_id: null },
      { id: 'r2', trigger_situation_id: 't2', name: 'ordering for myself when the queue is short', behavior_type: 'scenario', distress_thermometer_when_refraining: 4, parent_behavior_id: null },
      { id: 'r3', trigger_situation_id: 't1', name: 'putting my hand up once when I know the answer', behavior_type: 'scenario', distress_thermometer_when_refraining: 5, parent_behavior_id: null },
      { id: 'r4', trigger_situation_id: null, name: 'staying at the sleepover until lights out', behavior_type: 'scenario', distress_thermometer_when_refraining: 6, parent_behavior_id: null },
      { id: 'r5', trigger_situation_id: 't1', name: 'ask a friend to answer for me', behavior_type: 'safety', distress_thermometer_when_refraining: 7, parent_behavior_id: null },
      { id: 'r6', trigger_situation_id: null, name: 'something we have not scored yet', behavior_type: 'scenario', distress_thermometer_when_refraining: null, parent_behavior_id: null },
    ])
    qc.setQueryData(['situation-da', 't1'], { id: 'a1', arrow_steps: [], feared_outcome: 'Everyone will laugh and I’ll have to leave', is_approved: true })
    // Downward-arrow fixtures
    qc.setQueryData(['situation-da', 't2'], { id: 'a2', arrow_steps: [], feared_outcome: 'People will think I’m weird', is_approved: true })
    qc.setQueryData(['situation-da', 't3'], null)
    // Parent Accommodations panel fixtures
    const acc = (id: string, name: string, status: string, focus: boolean, lo: number | null, order: number) => ({
      id, name, status, is_weekly_focus: focus, treatment_plan_id: 'p1', trigger_situation_id: 't3',
      parent_user_id: null, description: null, distress_min: lo, distress_max: lo, display_order: order,
      accommodator: 'parent', created_at: '2026-09-01T00:00:00Z',
    })
    qc.setQueryData(['accommodations', 'p1'], [
      acc('c1', 'Answers for them at the doctor’s', 'stopped', false, 3, 0),
      acc('c2', 'Lies down with them at bedtime', 'started', true, 6, 1),
      acc('c3', 'Texts them every hour at a sleepover', 'not_started', false, 8, 2),
    ])
    qc.setQueryData(['accommodation-moments', 'p1'], [])
    qc.setQueryData(['insights', 'pt1', 'accommodation'], [])
    setReady(true)
  }, [qc])

  if (!ready) return null
  const noop = () => {}
  return (
    <div style={{ minHeight: '100vh', background: '#eef4f3', padding: 20 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {(['editor', 'builder', 'flat-ladder', 'parent-plan', 'arrow-intro', 'arrow-pick', 'arrow-chain'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                background: view === v ? '#135450' : '#fff', color: view === v ? '#fff' : '#475569', border: '1px solid #cbd5e1' }}>{v}</button>
          ))}
        </div>
        {view === 'editor' && <LadderEditor planId="p1" patientId="pt1" triggers={TRIGGERS} onDone={noop} onArrow={noop} />}
        {view === 'arrow-intro' && <ArrowIntro onStart={noop} />}
        {view === 'arrow-pick' && <PickPhase situations={TRIGGERS} onOpen={noop} />}
        {view === 'arrow-chain' && <ChainPhase trigger={TRIGGERS[0]} onBack={noop} onDone={noop} />}
        {view === 'flat-ladder' && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }}>
            <FlatLadder planId="p1" patientId="preview" triggers={TRIGGERS} ladderActive recommendedRungId={null} />
          </div>
        )}
        {view === 'parent-plan' && <ParentPlanPanel planId="p1" patientId="pt1" triggers={TRIGGERS} />}
        {view === 'builder' && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }}>
            <BehaviorPanel trigger={TRIGGERS[0]} planId="p1" patientId="p-1" planStatus="setup" />
          </div>
        )}
      </div>
    </div>
  )
}
