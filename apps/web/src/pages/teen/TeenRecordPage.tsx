import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { teenApiClient } from '../../api/client'
import { calculateStreak } from '../../api/streak'

type Phase = 'record' | 'results'

export default function TeenRecordPage() {
  const { experimentId } = useParams<{ experimentId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<Phase>('record')

  // Form state
  const [didIt, setDidIt] = useState<'yes' | 'partially' | 'no' | null>(null)
  const [skipReason, setSkipReason] = useState('')
  const [actualDT, setActualDT] = useState<number | null>(null)
  const [bipAfter, setBipAfter] = useState(50)
  const [fearedOccurred, setFearedOccurred] = useState<boolean | null>(null)
  const [whatLearned, setWhatLearned] = useState('')

  const { data: experiment } = useQuery({
    queryKey: ['teen-experiment', experimentId],
    queryFn: async () => (await teenApiClient.get(`/experiments/${experimentId}`)).data,
    enabled: !!experimentId
  })

  // For streak on results page
  const { data: allExperiments } = useQuery({
    queryKey: ['teen-streak-experiments'],
    queryFn: async () => {
      if (!experiment?.ladder_rung_id) return []
      const res = await teenApiClient.get(`/rungs/${experiment.ladder_rung_id}/experiments`)
      return res.data
    },
    enabled: !!experiment?.ladder_rung_id && phase === 'results'
  })

  const bipBefore = experiment?.bip_before

  // Initialize bipAfter from bipBefore
  useState(() => {
    if (bipBefore != null) setBipAfter(bipBefore)
  })

  const recordMutation = useMutation({
    mutationFn: async () => {
      await teenApiClient.put(`/patient/experiments/${experimentId}/after`, {
        feared_outcome_occurred: fearedOccurred ?? false,
        what_happened: didIt === 'no' ? `Did not attempt: ${skipReason}` :
          fearedOccurred ? 'Feared outcome occurred' : 'Feared outcome did not occur',
        distress_thermometer_actual: actualDT ?? 0,
        bip_after: bipAfter,
        what_learned: whatLearned || 'Completed experiment'
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teen-pending'] })
      queryClient.invalidateQueries({ queryKey: ['teen-experiment', experimentId] })
      setPhase('results')
    }
  })

  const skipMutation = useMutation({
    mutationFn: async () => {
      // Send skip reason as a message to clinician
      await teenApiClient.post(`/patient/experiments/${experimentId}/too-hard`, {
        reason: skipReason || 'Could not attempt the experiment'
      })
    },
    onSuccess: () => navigate('/teen/home')
  })

  const streak = allExperiments ? calculateStreak(allExperiments) : 0
  const bipDrop = bipBefore != null ? bipBefore - bipAfter : null

  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div style={{ minHeight: '100vh', background: '#f0fdfa', maxWidth: '480px', margin: '0 auto' }}>
      <div style={{ background: '#fff', padding: '14px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => navigate('/teen/home')} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', padding: '4px', color: '#64748b' }}>
          &larr;
        </button>
        <span style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>
          {phase === 'record' ? 'How did it go?' : 'Experiment complete'}
        </span>
      </div>
      <div style={{ padding: '20px 24px 80px' }}>{children}</div>
    </div>
  )

  // ── Results Phase ──
  if (phase === 'results') {
    return (
      <Shell>
        <div style={{ textAlign: 'center', paddingTop: '20px', marginBottom: '24px' }}>
          <div style={{ fontSize: '48px', marginBottom: '8px' }}>🎉</div>
          <h2 style={{ fontSize: '22px', fontWeight: '600', color: '#1e293b' }}>
            Experiment complete
          </h2>
        </div>

        {/* Comparison */}
        <div style={{ background: '#fff', borderRadius: '14px', padding: '20px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>My prediction</p>
              <p style={{ fontSize: '24px', fontWeight: '700', color: '#64748b' }}>{bipBefore ?? '—'}%</p>
            </div>
            <div style={{ fontSize: '20px', color: '#94a3b8', alignSelf: 'center' }}>&rarr;</div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>Now</p>
              <p style={{ fontSize: '24px', fontWeight: '700', color: '#0d9488' }}>{bipAfter}%</p>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>Expected fear</p>
              <p style={{ fontSize: '18px', fontWeight: '600', color: '#f59e0b' }}>{experiment?.distress_thermometer_expected ?? '—'}/10</p>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>Actual fear</p>
              <p style={{ fontSize: '18px', fontWeight: '600', color: '#f59e0b' }}>{actualDT}/10</p>
            </div>
          </div>

          <div>
            <p style={{ fontSize: '11px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>Feared outcome</p>
            <p style={{ fontSize: '16px', fontWeight: '600', color: fearedOccurred ? '#ef4444' : '#22c55e' }}>
              {fearedOccurred ? 'Happened' : 'Did not happen'}
            </p>
          </div>
        </div>

        {/* Insight */}
        <div style={{ background: '#f0fdfa', borderRadius: '14px', padding: '16px 20px', border: '1px solid #99f6e4', marginBottom: '16px' }}>
          <p style={{ fontSize: '14px', color: '#134e4a', lineHeight: '1.5' }}>
            {bipDrop != null && bipDrop > 0
              ? `Your prediction dropped from ${bipBefore}% to ${bipAfter}%. Your brain is updating — that's real progress.`
              : !fearedOccurred
                ? `Your anxiety predicted it would happen. It didn't. That's important data.`
                : `Even when things are tough, you showed up. That takes strength.`
            }
          </p>
        </div>

        {/* Streak */}
        {streak > 0 && (
          <div style={{ textAlign: 'center', marginBottom: '20px' }}>
            <span style={{ fontSize: '28px' }}>🔥</span>
            <p style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginTop: '4px' }}>
              You're on a {streak} day streak!
            </p>
          </div>
        )}

        <button
          onClick={() => navigate('/teen/home')}
          style={{
            width: '100%', padding: '16px', background: '#0d9488', color: '#fff',
            border: 'none', borderRadius: '14px', fontSize: '16px', fontWeight: '600', cursor: 'pointer'
          }}
        >
          Back to home
        </button>
      </Shell>
    )
  }

  // ── Record Phase ──
  return (
    <Shell>
      {/* Did you do it? */}
      <div style={{ marginBottom: '24px' }}>
        <p style={{ fontSize: '15px', fontWeight: '600', color: '#1e293b', marginBottom: '10px' }}>
          Did you do the experiment?
        </p>
        <div style={{ display: 'flex', gap: '8px' }}>
          {([
            { key: 'yes', label: 'Yes', emoji: '✅' },
            { key: 'partially', label: 'Partially', emoji: '〰️' },
            { key: 'no', label: 'No', emoji: '❌' },
          ] as const).map(opt => (
            <button
              key={opt.key}
              onClick={() => setDidIt(opt.key)}
              style={{
                flex: 1, padding: '14px 8px', borderRadius: '12px', cursor: 'pointer',
                border: didIt === opt.key ? '2px solid #0d9488' : '1px solid #e2e8f0',
                background: didIt === opt.key ? '#f0fdfa' : '#fff', textAlign: 'center'
              }}
            >
              <div style={{ fontSize: '20px', marginBottom: '4px' }}>{opt.emoji}</div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: didIt === opt.key ? '#0d9488' : '#64748b' }}>
                {opt.label}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* No — what got in the way */}
      {didIt === 'no' && (
        <div style={{ marginBottom: '24px' }}>
          <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
            What got in the way?
          </p>
          <textarea
            value={skipReason}
            onChange={e => setSkipReason(e.target.value)}
            placeholder="It's okay — tell your clinician what happened"
            rows={3}
            style={{
              width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0',
              fontSize: '14px', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: '12px'
            }}
          />
          <button
            onClick={() => skipMutation.mutate()}
            disabled={skipMutation.isPending}
            style={{
              width: '100%', padding: '14px', background: '#f59e0b', color: '#fff',
              border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '600',
              cursor: 'pointer', opacity: skipMutation.isPending ? 0.6 : 1
            }}
          >
            {skipMutation.isPending ? 'Sending...' : 'Send to my clinician'}
          </button>
        </div>
      )}

      {/* Fear thermometer */}
      {didIt && didIt !== 'no' && (
        <>
          <div style={{ marginBottom: '24px' }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '10px' }}>
              Fear thermometer during the experiment
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '6px' }}>
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                <button
                  key={n}
                  onClick={() => setActualDT(n)}
                  style={{
                    padding: '12px 4px', borderRadius: '10px', cursor: 'pointer',
                    border: actualDT === n ? '2px solid #0d9488' : '1px solid #e2e8f0',
                    background: actualDT === n ? '#f0fdfa' : '#fff',
                    fontSize: '16px', fontWeight: '700',
                    color: actualDT === n ? '#0d9488' : n >= 7 ? '#dc2626' : n >= 4 ? '#d97706' : '#64748b'
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
              <span>Calm</span><span>Extreme</span>
            </div>
          </div>

          {/* BIP after */}
          <div style={{ background: '#fff', borderRadius: '14px', padding: '20px', border: '1px solid #e2e8f0', marginBottom: '24px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
              Update your prediction
            </p>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
              How likely is the feared outcome now?
            </p>
            <p style={{ fontSize: '40px', fontWeight: '700', color: '#0d9488', margin: '0 0 12px' }}>
              {bipAfter}%
            </p>
            <input type="range" min={0} max={100} step={5} value={bipAfter}
              onChange={e => setBipAfter(Number(e.target.value))}
              style={{ width: '100%', maxWidth: '280px' }}
            />
          </div>

          {/* Feared outcome occurred */}
          <div style={{ marginBottom: '24px' }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
              Did your feared outcome actually happen?
            </p>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginBottom: '10px' }}>
              Think about what actually happened — not how you felt, but what you could observe.
            </p>
            <div style={{ display: 'flex', gap: '10px' }}>
              {[{ label: 'No', value: false }, { label: 'Yes', value: true }].map(opt => (
                <button
                  key={String(opt.value)}
                  onClick={() => setFearedOccurred(opt.value)}
                  style={{
                    flex: 1, padding: '14px', borderRadius: '12px', cursor: 'pointer',
                    border: fearedOccurred === opt.value ? '2px solid #0d9488' : '1px solid #e2e8f0',
                    background: fearedOccurred === opt.value ? '#f0fdfa' : '#fff',
                    fontSize: '15px', fontWeight: '600',
                    color: fearedOccurred === opt.value ? '#0d9488' : '#64748b'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* What I learned */}
          <div style={{ marginBottom: '24px' }}>
            <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
              What did you learn?
            </p>
            <textarea
              value={whatLearned}
              onChange={e => setWhatLearned(e.target.value)}
              placeholder="e.g. It wasn't as bad as I thought. Nobody actually noticed me."
              rows={3}
              style={{
                width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0',
                fontSize: '14px', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box'
              }}
            />
          </div>

          {/* Submit */}
          <button
            onClick={() => recordMutation.mutate()}
            disabled={recordMutation.isPending || actualDT === null || fearedOccurred === null}
            style={{
              width: '100%', padding: '16px', background: '#0d9488', color: '#fff',
              border: 'none', borderRadius: '14px', fontSize: '16px', fontWeight: '600',
              cursor: 'pointer',
              opacity: (recordMutation.isPending || actualDT === null || fearedOccurred === null) ? 0.5 : 1
            }}
          >
            {recordMutation.isPending ? 'Saving...' : 'Submit &rarr;'}
          </button>
        </>
      )}
    </Shell>
  )
}
