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
import { PatientRow } from './DashboardPage'
import type { Patient } from '../../api/patients'

// Patient list rows with what needs attention, for the 'patient-list' view.
const LIST_ROW = (name: string, attention: Patient['attention'], phase = 'In treatment'): Patient => ({
  id: name, name, email: `${name.split(' ')[0].toLowerCase()}@example.com`, created_at: '2026-08-01T00:00:00Z',
  last_activity_at: '2026-09-10T15:00:00Z', has_monitoring_form: true, situation_count: 3,
  has_consultation_1_note: true, has_parent_da: false, has_consultation_2_note: true, has_patient_da: true,
  has_active_situation_with_behaviors: true, plan_status: 'active', teen_invited: true,
  completed_experiment_count: 4, has_weekly_note: true, overdue_experiment_count: 0,
  active_plan_with_no_recent_activity: false, monitoring_entries_count: 6, monitoring_form_sent: true,
  checklist_checked_items: {}, phase: 'in_treatment', phase_label: phase, closed_at: null, attention,
})
const LIST_ROWS: Patient[] = [
  LIST_ROW('Sam Rivera', [
    { kind: 'overdue', tone: 'problem', text: '1 exposure passed with nothing recorded', items: [] },
    { kind: 'checkin_missed', tone: 'problem', text: 'No weekly check-in from the parent last week', items: [] },
    { kind: 'ratings_done', tone: 'new', text: 'Rated the accommodations: ready to sort by Fear Level', items: [] },
  ]),
  LIST_ROW('Maya Chen', [
    { kind: 'parent_named', tone: 'new', text: 'The parent named 2 accommodations: see the suggestions', items: [] },
  ]),
  LIST_ROW('Leo Park', []),
  LIST_ROW('Ava Singh', [
    { kind: 'monitoring', tone: 'problem', text: 'Monitoring form sent; 1 of 3 entries back', items: [] },
  ], 'Monitoring'),
]

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
  const [view, setView] = useState<'editor' | 'builder' | 'arrow-intro' | 'arrow-pick' | 'arrow-chain' | 'flat-ladder' | 'parent-plan' | 'patient-list'>('editor')

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
    qc.setQueryData(['accommodation-checkins', 'p1'], [
      { id: 'k1', accommodation_id: 'c2', accommodation_name: 'Lies down with them at bedtime', parent_email: 'dana@example.com', week_start: '2026-09-07', answer: 'mostly', updated_at: null },
      { id: 'k2', accommodation_id: 'c2', accommodation_name: 'Lies down with them at bedtime', parent_email: 'dana@example.com', week_start: '2026-08-31', answer: 'gave_in', updated_at: null },
      { id: 'k3', accommodation_id: 'c1', accommodation_name: 'Answers for them at the doctor’s', parent_email: 'dana@example.com', week_start: '2026-08-24', answer: 'every_time', updated_at: null },
    ])
    qc.setQueryData(['parent-experiments', 'p1'], [
      { id: 'x1', accommodation_id: 'c2', accommodation_name: 'Lies down with them at bedtime', status: 'planned', set_up_in_session: true,
        scheduled_date: '2026-09-15T23:00:00Z', scheduled_time_bucket: 'evening', instead: 'Say goodnight and leave', prediction: 'She’ll cry for an hour',
        belief_before: 80, expected_fear: 8, readiness: 'medium', did_it: null, what_happened: null, actual_fear: null, prediction_happened: null,
        belief_after: null, what_learned: null, too_hard_reason: null, recorded_at: null, created_at: null },
      { id: 'x2', accommodation_id: 'c2', accommodation_name: 'Lies down with them at bedtime', status: 'recorded', set_up_in_session: false,
        scheduled_date: '2026-09-09T23:00:00Z', scheduled_time_bucket: 'evening', instead: 'Say goodnight and leave', prediction: 'She’ll cry for an hour',
        belief_before: 80, expected_fear: 8, readiness: 'medium', did_it: 'yes', what_happened: 'Ten minutes, then asleep', actual_fear: 5, prediction_happened: 'no',
        belief_after: 30, what_learned: 'She settles faster than I think', too_hard_reason: null, recorded_at: '2026-09-10T08:00:00Z', created_at: null },
    ])
    qc.setQueryData(['insights', 'pt1', 'accommodation'], [
      { id: 'n1', kind: 'accommodation', name: 'Sits outside the door until they fall asleep', evidence_count: 0, sources: ['parent'], added: false, parent_name: 'Sleepovers at a friend’s house', parent_estimate_min: 6, parent_estimate_max: 8, still_does: true, named_by_parent: true },
    ])
    qc.setQueryData(['conversation-in-session', 'pt1'], {
      child_name: 'Sam',
      situations: [
        { id: 't1', name: 'Raising my hand in class', items: [
          { id: 'i1', name: 'Emails the teacher to excuse them', from_record: true, still_does: true, estimate_min: 5, estimate_max: 8 },
          { id: 'i2', name: 'Answers questions for them at parents’ evening', from_record: true, still_does: false, estimate_min: null, estimate_max: null },
        ] },
        { id: 't3', name: 'Sleepovers at a friend’s house', items: [] },
      ],
    })
    setReady(true)
  }, [qc])

  if (!ready) return null
  const noop = () => {}
  return (
    <div style={{ minHeight: '100vh', background: '#eef4f3', padding: 20 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {(['editor', 'builder', 'flat-ladder', 'parent-plan', 'patient-list', 'arrow-intro', 'arrow-pick', 'arrow-chain'] as const).map(v => (
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
        {view === 'patient-list' && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>{LIST_ROWS.map(p => <PatientRow key={p.id} patient={p} onClick={noop} />)}</tbody>
            </table>
          </div>
        )}
        {view === 'builder' && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }}>
            <BehaviorPanel trigger={TRIGGERS[0]} planId="p1" patientId="p-1" planStatus="setup" />
          </div>
        )}
      </div>
    </div>
  )
}
