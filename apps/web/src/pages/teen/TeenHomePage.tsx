import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTeenAuth } from '../../context/TeenAuthContext'
import { teenApiClient } from '../../api/client'
import { calculateStreak } from '../../api/streak'

export default function TeenHomePage() {
  const { patientId, logout } = useTeenAuth()
  const navigate = useNavigate()

  const { data: plan } = useQuery({
    queryKey: ['teen-plan', patientId],
    queryFn: async () => (await teenApiClient.get('/patient/plan')).data,
    enabled: !!patientId
  })

  const { data: triggers } = useQuery({
    queryKey: ['teen-triggers', plan?.id],
    queryFn: async () => (await teenApiClient.get('/patient/plan/triggers')).data,
    enabled: !!plan?.id
  })

  const firstTrigger = triggers?.[0]

  const { data: ladder } = useQuery({
    queryKey: ['teen-ladder', firstTrigger?.id],
    queryFn: async () => (await teenApiClient.get(`/patient/plan/triggers/${firstTrigger!.id}/ladder`)).data,
    enabled: !!firstTrigger?.id
  })

  const { data: pendingExperiments } = useQuery({
    queryKey: ['teen-pending', patientId],
    queryFn: async () => (await teenApiClient.get('/patient/experiments/pending')).data,
    enabled: !!patientId
  })

  // Get all experiments for streak calculation
  const { data: allExperiments } = useQuery({
    queryKey: ['teen-all-experiments', patientId],
    queryFn: async () => {
      if (!firstTrigger?.id || !ladder) return []
      const results: any[] = []
      for (const rung of ladder.rungs) {
        const res = await teenApiClient.get(`/rungs/${rung.id}/experiments`)
        results.push(...res.data)
      }
      return results
    },
    enabled: !!ladder?.rungs?.length
  })

  const sortedRungs = ladder?.rungs
    ? [...ladder.rungs].sort((a: any, b: any) => a.rung_order - b.rung_order)
    : []

  const currentRung = sortedRungs.find((r: any) => r.status !== 'complete')
  const streak = allExperiments ? calculateStreak(allExperiments) : 0

  // Find committed experiments ready to record (from today or earlier)
  const now = new Date()
  const readyToRecord = pendingExperiments?.filter((e: any) => {
    if (e.status !== 'committed') return false
    if (!e.scheduled_date) return true
    return new Date(e.scheduled_date) <= now
  }) ?? []

  return (
    <div style={{ minHeight: '100vh', background: '#f0fdfa', maxWidth: '480px', margin: '0 auto', paddingBottom: '100px' }}>
      {/* Header */}
      <div style={{ background: '#fff', padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '20px' }}>~</span>
          <span style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>Float</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/teen/plans')} style={{ fontSize: '13px', color: '#0d9488', background: 'none', border: 'none', cursor: 'pointer', fontWeight: '500' }}>
            My plans
          </button>
          <button onClick={() => { logout(); navigate('/teen/login') }} style={{ fontSize: '13px', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>
            Sign out
          </button>
        </div>
      </div>

      <div style={{ padding: '24px' }}>
        {/* Streak */}
        {streak > 0 && (
          <div style={{ textAlign: 'center', marginBottom: '20px', padding: '12px', background: '#fff', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '24px' }}>🔥</span>
            <span style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', marginLeft: '8px' }}>
              {streak} day streak
            </span>
          </div>
        )}

        {/* Situation */}
        {firstTrigger && (
          <div style={{ marginBottom: '20px' }}>
            <p style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
              Working on
            </p>
            <p style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>
              {firstTrigger.name}
            </p>
            {firstTrigger.description && (
              <p style={{ fontSize: '14px', color: '#64748b', marginTop: '2px' }}>{firstTrigger.description}</p>
            )}
          </div>
        )}

        {/* Record banner */}
        {readyToRecord.length > 0 && (
          <button
            onClick={() => navigate(`/teen/record/${readyToRecord[0].id}`)}
            style={{
              width: '100%', padding: '16px 20px', background: '#fffbeb', border: '1px solid #fde68a',
              borderRadius: '14px', cursor: 'pointer', textAlign: 'left', marginBottom: '16px'
            }}
          >
            <p style={{ fontSize: '15px', fontWeight: '600', color: '#92400e', margin: 0 }}>
              Record your experiment
            </p>
            <p style={{ fontSize: '13px', color: '#b45309', marginTop: '2px' }}>
              You committed to an experiment — how did it go?
            </p>
          </button>
        )}

        {/* CTA button */}
        {currentRung && readyToRecord.length === 0 && (
          <button
            onClick={() => navigate(`/teen/experiment/${currentRung.id}`)}
            style={{
              width: '100%', padding: '16px', background: '#0d9488', color: '#fff',
              border: 'none', borderRadius: '14px', fontSize: '16px', fontWeight: '600',
              cursor: 'pointer', marginBottom: '20px'
            }}
          >
            Start my experiment &rarr;
          </button>
        )}

        {!currentRung && readyToRecord.length === 0 && (
          <div style={{ background: '#f0fdf4', borderRadius: '16px', padding: '20px', border: '1px solid #bbf7d0', textAlign: 'center', marginBottom: '20px' }}>
            <p style={{ fontSize: '16px', color: '#166534', fontWeight: '500' }}>All steps complete!</p>
            <p style={{ fontSize: '14px', color: '#16a34a', marginTop: '4px' }}>Talk to your clinician about what's next.</p>
          </div>
        )}

        {/* Ladder */}
        {sortedRungs.length > 0 && (
          <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0' }}>
            <p style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
              Your ladder
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[...sortedRungs].reverse().map((rung: any) => {
                const isCurrent = rung.id === currentRung?.id
                const isComplete = rung.status === 'complete'
                const canTap = !isComplete
                return (
                  <button
                    key={rung.id}
                    onClick={() => canTap && navigate(`/teen/experiment/${rung.id}`)}
                    disabled={!canTap}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      padding: '12px 14px', borderRadius: '12px', border: 'none',
                      background: isComplete ? '#f0fdf4' : isCurrent ? '#f0fdfa' : '#f8fafc',
                      cursor: canTap ? 'pointer' : 'default', textAlign: 'left',
                      outline: isCurrent ? '2px solid #99f6e4' : 'none',
                      width: '100%',
                      transition: 'transform 0.15s ease',
                    }}
                  >
                    <div style={{
                      width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                      background: isComplete ? '#22c55e' : isCurrent ? '#0d9488' : '#e2e8f0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '13px', fontWeight: '700',
                      color: isComplete || isCurrent ? '#fff' : '#94a3b8',
                    }}>
                      {isComplete ? '✓' : rung.rung_order + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b', margin: 0 }}>
                        Step {rung.rung_order + 1}
                      </p>
                    </div>
                    {rung.distress_thermometer_rating != null && (
                      <span style={{
                        fontSize: '12px', fontWeight: '600', padding: '2px 8px', borderRadius: '10px',
                        background: isCurrent ? '#ccfbf1' : '#f1f5f9',
                        color: isCurrent ? '#0d9488' : '#94a3b8'
                      }}>
                        {rung.distress_thermometer_rating}/10
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
