// Local design preview for session mode — `/__session-preview`, dev builds only (see main.tsx).
//
// Seeds the react-query cache with fixtures so the phases render without an API and without
// writing anything. This exists because the only database reachable from a dev machine is
// PRODUCTION, so clicking through the real route to check a design is not an option.
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ListPhase, RatePhase, SituationPhase, IntroPhase, ReviewPhase } from './SessionPage'
import { BehaviorPanel } from './PatientPage'
import { ArrowIntro, PickPhase, ChainPhase } from './ArrowPage'

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
  const [view, setView] = useState<'intro' | 'list' | 'rate' | 'sit-start' | 'sit-mid' | 'ladder' | 'builder' | 'arrow-intro' | 'arrow-pick' | 'arrow-chain'>('list')

  useEffect(() => {
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
    qc.setQueryData(['situation-da', 't1'], { id: 'a1', arrow_steps: [], feared_outcome: 'Everyone will laugh and I’ll have to leave', is_approved: true })
    // Downward-arrow fixtures
    qc.setQueryData(['situation-da', 't2'], { id: 'a2', arrow_steps: [], feared_outcome: 'People will think I’m weird', is_approved: true })
    qc.setQueryData(['situation-da', 't3'], null)
    setReady(true)
  }, [qc])

  if (!ready) return null
  const noop = () => {}
  return (
    <div style={{ minHeight: '100vh', background: '#eef4f3', padding: 20 }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
          {(['intro', 'list', 'rate', 'sit-start', 'sit-mid', 'ladder', 'builder', 'arrow-intro', 'arrow-pick', 'arrow-chain'] as const).map(v => (
            <button key={v} onClick={() => setView(v)}
              style={{ fontSize: 12, fontWeight: 700, padding: '6px 12px', borderRadius: 999, cursor: 'pointer',
                background: view === v ? '#135450' : '#fff', color: view === v ? '#fff' : '#475569', border: '1px solid #cbd5e1' }}>{v}</button>
          ))}
        </div>
        {view === 'intro' && <IntroPhase onStart={noop} />}
        {view === 'list' && <ListPhase triggers={TRIGGERS} planId="p1" onDone={noop} onOpen={noop} />}
        {view === 'rate' && <RatePhase planId="p1" triggers={TRIGGERS} index={2} onIndex={noop} onBack={noop} onDone={noop} />}
        {view === 'sit-start' && <SituationPhase key="t3" trigger={TRIGGERS[2]} isLast={true} onOpenArrow={noop} onSeeAll={noop} onFinished={noop} />}
        {view === 'sit-mid' && <SituationPhase key="t1" trigger={TRIGGERS[0]} isLast={false} onOpenArrow={noop} onSeeAll={noop} onFinished={noop} />}
        {view === 'ladder' && <ReviewPhase triggers={TRIGGERS} onBack={noop} onOpenBuilder={noop} />}
        {view === 'arrow-intro' && <ArrowIntro onStart={noop} />}
        {view === 'arrow-pick' && <PickPhase situations={TRIGGERS} onOpen={noop} />}
        {view === 'arrow-chain' && <ChainPhase trigger={TRIGGERS[0]} onBack={noop} onDone={noop} />}
        {view === 'builder' && (
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12 }}>
            <BehaviorPanel trigger={TRIGGERS[0]} planId="p1" patientId="p-1" planStatus="setup" />
          </div>
        )}
      </div>
    </div>
  )
}
