import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTeenAuth } from '../../context/TeenAuthContext'
import { teenApiClient } from '../../api/client'
import { calculateStreak } from '../../api/streak'

type TeenRung = {
  id: string
  behavior_name: string | null
  dt: number | null
  completed: boolean
  experiment_count: number
  rung_order: number
}

type TeenSituation = {
  id: string
  name: string
  is_active: boolean
  feared_outcome: string | null
  da_approved: boolean
  rungs: TeenRung[]
}

export default function TeenHomePage() {
  const { patientId, logout } = useTeenAuth()
  const navigate = useNavigate()
  const [selectedSituationId, setSelectedSituationId] = useState<string | null>(null)
  const [jumpWarning, setJumpWarning] = useState<{ targetRungId: string; suggestedRungId: string; suggestedName: string } | null>(null)

  const { data: ladderData } = useQuery({
    queryKey: ['teen-ladder', patientId],
    queryFn: async () => (await teenApiClient.get('/patient/ladder')).data,
    enabled: !!patientId
  })

  const { data: me } = useQuery({
    queryKey: ['teen-me', patientId],
    queryFn: async () => (await teenApiClient.get('/auth/me')).data,
    enabled: !!patientId
  })

  const { data: pendingExperiments } = useQuery({
    queryKey: ['teen-pending', patientId],
    queryFn: async () => (await teenApiClient.get('/patient/experiments/pending')).data,
    enabled: !!patientId
  })

  const situations: TeenSituation[] = ladderData?.situations ?? []

  // Get all experiments for streak calculation
  const allRungIds = situations.flatMap(s => s.rungs.map(r => r.id))
  const { data: allExperiments } = useQuery({
    queryKey: ['teen-all-experiments', patientId, allRungIds.join(',')],
    queryFn: async () => {
      const results: any[] = []
      for (const rungId of allRungIds) {
        const res = await teenApiClient.get(`/rungs/${rungId}/experiments`)
        results.push(...res.data)
      }
      return results
    },
    enabled: allRungIds.length > 0
  })

  const streak = allExperiments ? calculateStreak(allExperiments) : 0
  const firstName = me?.patient_name?.split(' ')[0] ?? ''

  // Default-select the active situation (or first if none)
  useEffect(() => {
    if (!selectedSituationId && situations.length > 0) {
      const active = situations.find(s => s.is_active)
      setSelectedSituationId(active?.id ?? situations[0].id)
    }
  }, [situations, selectedSituationId])

  const selectedSituation = situations.find(s => s.id === selectedSituationId)

  // Determine suggested rung = lowest DT incomplete rung
  const suggestedRung = selectedSituation?.rungs.find(r => !r.completed) ?? null

  // Record banner
  const now = new Date()
  const readyToRecord = pendingExperiments?.filter((e: any) => {
    if (e.status !== 'committed') return false
    if (!e.scheduled_date) return true
    return new Date(e.scheduled_date) <= now
  }) ?? []

  const handleRungTap = (rung: TeenRung) => {
    if (rung.completed) return
    // Jump warning: if DT more than 2 above suggested
    if (
      suggestedRung &&
      rung.id !== suggestedRung.id &&
      rung.dt != null &&
      suggestedRung.dt != null &&
      rung.dt - suggestedRung.dt > 2
    ) {
      setJumpWarning({
        targetRungId: rung.id,
        suggestedRungId: suggestedRung.id,
        suggestedName: suggestedRung.behavior_name || `Step ${suggestedRung.rung_order + 1}`
      })
      return
    }
    navigate(`/teen/experiment/${rung.id}`)
  }

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
        {/* Greeting */}
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '22px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
            Hi {firstName} 👋
          </p>
          {streak > 0 && (
            <p style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
              🔥 {streak} day streak
            </p>
          )}
        </div>

        {/* Record banner — always at top when applicable */}
        {readyToRecord.length > 0 && (
          <button
            onClick={() => navigate(`/teen/record/${readyToRecord[0].id}`)}
            style={{
              width: '100%', padding: '16px 20px', background: '#fffbeb', border: '1px solid #fde68a',
              borderRadius: '14px', cursor: 'pointer', textAlign: 'left', marginBottom: '20px'
            }}
          >
            <p style={{ fontSize: '15px', fontWeight: '600', color: '#92400e', margin: 0 }}>
              📋 Time to record your experiment
              {readyToRecord[0].scheduled_date && ` from ${new Date(readyToRecord[0].scheduled_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`} →
            </p>
          </button>
        )}

        {/* No situations */}
        {situations.length === 0 && (
          <div style={{ background: '#fff', borderRadius: '14px', padding: '20px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
            <p style={{ fontSize: '15px', color: '#64748b' }}>
              Your clinician hasn't set up your plan yet. Check back soon.
            </p>
          </div>
        )}

        {/* Situation tabs (only if multiple) */}
        {situations.length > 1 && (
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', marginBottom: '20px', paddingBottom: '4px' }}>
            {situations.map(s => {
              const isSelected = s.id === selectedSituationId
              const isActive = s.is_active
              let border: string
              let background: string
              let color: string
              if (isSelected) {
                border = '2px solid #0d9488'
                background = '#f0fdfa'
                color = '#0d9488'
              } else if (isActive) {
                border = '1px solid #5eead4'
                background = '#f0fdfa'
                color = '#0d9488'
              } else {
                border = '1px solid #e2e8f0'
                background = '#f8fafc'
                color = '#94a3b8'
              }
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSituationId(s.id)}
                  style={{
                    flex: '0 0 auto', padding: '8px 14px', borderRadius: '999px',
                    border, background, color,
                    fontSize: '13px', fontWeight: '600',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  {isActive && <span style={{ fontSize: '8px', color: '#0d9488' }}>●</span>}
                  <span>{s.name}</span>
                  {isActive && (
                    <span style={{ fontSize: '10px', fontWeight: 600, color: '#0d9488', opacity: 0.85 }}>
                      suggested
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        )}

        {/* Selected situation */}
        {selectedSituation && (
          <div>
            <p style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>
              Working on
            </p>
            <p style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', marginBottom: '6px' }}>
              {selectedSituation.name}
            </p>
            {selectedSituation.feared_outcome && (
              <p style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic', marginBottom: '20px' }}>
                Your worry: &ldquo;{selectedSituation.feared_outcome}&rdquo;
              </p>
            )}
            {!selectedSituation.feared_outcome && <div style={{ height: '20px' }} />}

            {/* Jump warning */}
            {jumpWarning && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '14px 16px', marginBottom: '16px' }}>
                <p style={{ fontSize: '14px', color: '#78350f', margin: '0 0 10px', lineHeight: '1.5' }}>
                  This step is quite a jump from where you are. Your clinician suggested starting with <strong>{jumpWarning.suggestedName}</strong>.
                </p>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => { const id = jumpWarning.targetRungId; setJumpWarning(null); navigate(`/teen/experiment/${id}`) }}
                    style={{ fontSize: '13px', padding: '8px 14px', background: '#fff', border: '1px solid #fcd34d', borderRadius: '8px', color: '#92400e', cursor: 'pointer', fontWeight: '600' }}
                  >
                    Start here anyway
                  </button>
                  <button
                    onClick={() => { const id = jumpWarning.suggestedRungId; setJumpWarning(null); navigate(`/teen/experiment/${id}`) }}
                    style={{ fontSize: '13px', padding: '8px 14px', background: '#0d9488', border: 'none', borderRadius: '8px', color: '#fff', cursor: 'pointer', fontWeight: '600' }}
                  >
                    Go to suggested step
                  </button>
                </div>
              </div>
            )}

            {/* Ladder */}
            {selectedSituation.rungs.length > 0 ? (
              <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
                  Your ladder
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[...selectedSituation.rungs].reverse().map((rung, i) => {
                    const displayNum = selectedSituation.rungs.length - i
                    const isCurrent = rung.id === suggestedRung?.id
                    const isComplete = rung.completed
                    return (
                      <button
                        key={rung.id}
                        onClick={() => handleRungTap(rung)}
                        disabled={isComplete}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '12px',
                          padding: '12px 14px', borderRadius: '12px', border: 'none',
                          background: isComplete ? '#f0fdf4' : isCurrent ? '#f0fdfa' : '#f8fafc',
                          cursor: isComplete ? 'default' : 'pointer', textAlign: 'left',
                          outline: isCurrent ? '2px solid #99f6e4' : 'none',
                          width: '100%',
                          position: 'relative',
                        }}
                      >
                        <div style={{
                          width: '32px', height: '32px', borderRadius: '50%', flexShrink: 0,
                          background: isComplete ? '#22c55e' : isCurrent ? '#0d9488' : '#e2e8f0',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: '13px', fontWeight: '700',
                          color: isComplete || isCurrent ? '#fff' : '#94a3b8',
                        }}>
                          {isComplete ? '✓' : displayNum}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {rung.behavior_name || `Step ${displayNum}`}
                          </p>
                          {isCurrent && (
                            <p style={{ fontSize: '11px', color: '#0d9488', fontWeight: '600', margin: '2px 0 0' }}>suggested</p>
                          )}
                        </div>
                        {rung.dt != null && (
                          <span style={{
                            fontSize: '12px', fontWeight: '600', padding: '2px 8px', borderRadius: '10px',
                            background: isCurrent ? '#ccfbf1' : '#f1f5f9',
                            color: isCurrent ? '#0d9488' : '#94a3b8'
                          }}>
                            {rung.dt}/10
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div style={{ background: '#fff', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                <p style={{ fontSize: '14px', color: '#64748b' }}>No steps yet for this situation.</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
