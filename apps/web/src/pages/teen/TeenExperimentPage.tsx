import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { teenApiClient } from '../../api/client'
import { useTeenAuth } from '../../context/TeenAuthContext'

type Step = 'plan' | 'commit' | 'record' | 'done'

export default function TeenExperimentPage() {
  const { rungId } = useParams<{ rungId: string }>()
  const navigate = useNavigate()
  const { patientId } = useTeenAuth()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>('plan')

  // Record form state
  const [fearedOccurred, setFearedOccurred] = useState<boolean | null>(null)
  const [actualDT, setActualDT] = useState<number>(5)
  const [bipAfter, setBipAfter] = useState<number>(50)
  const [whatLearned, setWhatLearned] = useState('')

  // Fetch downward arrow for this rung
  const { data: arrow } = useQuery({
    queryKey: ['teen-arrow', rungId],
    queryFn: async () => {
      const res = await teenApiClient.get(`/rungs/${rungId}/downward-arrow`)
      return res.data
    },
    enabled: !!rungId
  })

  // Fetch experiments for this rung
  const { data: experiments } = useQuery({
    queryKey: ['teen-experiments', rungId],
    queryFn: async () => {
      const res = await teenApiClient.get(`/rungs/${rungId}/experiments`)
      return res.data
    },
    enabled: !!rungId
  })

  // Get or use the most recent experiment
  const experiment = experiments?.sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )?.[0]

  // Create experiment if none exists
  const createExperiment = useMutation({
    mutationFn: async () => {
      const res = await teenApiClient.post(`/rungs/${rungId}/experiments`, {})
      return res.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teen-experiments', rungId] })
  })

  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: async (experimentId: string) => {
      await teenApiClient.post(`/patient/experiments/${experimentId}/commit`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teen-experiments', rungId] })
      setStep('record')
    }
  })

  // Record after state
  const recordMutation = useMutation({
    mutationFn: async (experimentId: string) => {
      await teenApiClient.put(`/experiments/${experimentId}/after`, {
        feared_outcome_occurred: fearedOccurred,
        what_happened: fearedOccurred ? 'Feared outcome occurred' : 'Feared outcome did not occur',
        distress_thermometer_actual: actualDT,
        bip_after: bipAfter,
        what_learned: whatLearned
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teen-experiments', rungId] })
      setStep('done')
    }
  })

  const handleCommit = async () => {
    let exp = experiment
    if (!exp) {
      exp = await createExperiment.mutateAsync()
    }
    commitMutation.mutate(exp.id)
  }

  const handleRecord = () => {
    if (!experiment || fearedOccurred === null || !whatLearned.trim()) return
    recordMutation.mutate(experiment.id)
  }

  const fearedOutcome = arrow?.feared_outcome || 'your feared outcome'
  const bipBefore = arrow?.bip_derived ?? experiment?.bip_before
  const expectedDT = experiment?.distress_thermometer_expected
  const confidence = experiment?.confidence_level

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f0f9ff',
      maxWidth: '480px',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{
        background: '#fff',
        padding: '16px 24px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
      }}>
        <button
          onClick={() => navigate('/teen/home')}
          style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', padding: '4px' }}
        >
          ←
        </button>
        <span style={{ fontSize: '17px', fontWeight: '600', color: '#1e293b' }}>My Experiment</span>
      </div>

      {/* Progress dots */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '8px',
        padding: '20px 24px 8px'
      }}>
        {(['plan', 'commit', 'record', 'done'] as Step[]).map((s, i) => (
          <div key={s} style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            background: s === step ? '#2563eb' :
              (['plan', 'commit', 'record', 'done'].indexOf(step) > i) ? '#22c55e' : '#cbd5e1'
          }} />
        ))}
      </div>

      <div style={{ padding: '16px 24px 80px' }}>
        {/* ── Step 1: Plan ── */}
        {step === 'plan' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
              The Plan
            </h2>

            <div style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '16px',
              border: '1px solid #e2e8f0'
            }}>
              <p style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Feared outcome
              </p>
              <p style={{ fontSize: '16px', color: '#1e293b', fontWeight: '500' }}>
                {fearedOutcome}
              </p>
            </div>

            {bipBefore != null && (
              <div style={{
                background: '#fff',
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '16px',
                border: '1px solid #e2e8f0'
              }}>
                <p style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  Belief in prediction (BIP)
                </p>
                <p style={{ fontSize: '28px', fontWeight: '700', color: '#2563eb' }}>
                  {bipBefore}%
                </p>
                <p style={{ fontSize: '13px', color: '#64748b' }}>
                  How strongly you believe this will happen
                </p>
              </div>
            )}

            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
              {expectedDT != null && (
                <div style={{
                  flex: 1,
                  background: '#fff',
                  borderRadius: '16px',
                  padding: '16px',
                  border: '1px solid #e2e8f0',
                  textAlign: 'center'
                }}>
                  <p style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Expected DT
                  </p>
                  <p style={{ fontSize: '24px', fontWeight: '700', color: '#f59e0b' }}>
                    {expectedDT}/10
                  </p>
                </div>
              )}
              {confidence && (
                <div style={{
                  flex: 1,
                  background: '#fff',
                  borderRadius: '16px',
                  padding: '16px',
                  border: '1px solid #e2e8f0',
                  textAlign: 'center'
                }}>
                  <p style={{ fontSize: '11px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Confidence
                  </p>
                  <p style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b', textTransform: 'capitalize' }}>
                    {confidence}
                  </p>
                </div>
              )}
            </div>

            <button
              onClick={() => setStep('commit')}
              style={{
                width: '100%',
                padding: '16px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '14px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                marginTop: '8px'
              }}
            >
              I've seen the plan — next
            </button>
          </div>
        )}

        {/* ── Step 2: Commit ── */}
        {step === 'commit' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
              Ready to commit?
            </h2>
            <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '24px' }}>
              You're about to face your fear. This takes courage.
            </p>

            <div style={{
              background: '#eff6ff',
              borderRadius: '16px',
              padding: '24px',
              marginBottom: '24px',
              border: '1px solid #bfdbfe',
              textAlign: 'center'
            }}>
              <p style={{ fontSize: '15px', color: '#1e3a5f', marginBottom: '8px' }}>
                The exposure:
              </p>
              <p style={{ fontSize: '17px', fontWeight: '600', color: '#1e293b' }}>
                {experiment?.plan_description || fearedOutcome}
              </p>
            </div>

            <button
              onClick={handleCommit}
              disabled={commitMutation.isPending || createExperiment.isPending}
              style={{
                width: '100%',
                padding: '18px',
                background: '#16a34a',
                color: '#fff',
                border: 'none',
                borderRadius: '14px',
                fontSize: '17px',
                fontWeight: '700',
                cursor: 'pointer',
                marginBottom: '12px',
                opacity: (commitMutation.isPending || createExperiment.isPending) ? 0.6 : 1
              }}
            >
              {commitMutation.isPending ? 'Committing...' : 'I commit to doing this'}
            </button>

            <button
              onClick={() => {
                if (experiment) {
                  teenApiClient.post(`/patient/experiments/${experiment.id}/too-hard`)
                    .then(() => navigate('/teen/home'))
                } else {
                  navigate('/teen/home')
                }
              }}
              style={{
                width: '100%',
                padding: '14px',
                background: 'transparent',
                color: '#94a3b8',
                border: '1px solid #e2e8f0',
                borderRadius: '14px',
                fontSize: '15px',
                cursor: 'pointer'
              }}
            >
              This feels too hard right now
            </button>
          </div>
        )}

        {/* ── Step 3: Record ── */}
        {step === 'record' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
              How did it go?
            </h2>
            <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '24px' }}>
              Record what happened during your experiment.
            </p>

            {/* Feared outcome occurred */}
            <div style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '16px',
              border: '1px solid #e2e8f0'
            }}>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '12px' }}>
                Did the feared outcome happen?
              </p>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[
                  { label: 'No', value: false },
                  { label: 'Yes', value: true }
                ].map(opt => (
                  <button
                    key={String(opt.value)}
                    onClick={() => setFearedOccurred(opt.value)}
                    style={{
                      flex: 1,
                      padding: '14px',
                      borderRadius: '12px',
                      border: fearedOccurred === opt.value ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      background: fearedOccurred === opt.value ? '#eff6ff' : '#fff',
                      fontSize: '15px',
                      fontWeight: '600',
                      color: fearedOccurred === opt.value ? '#2563eb' : '#64748b',
                      cursor: 'pointer'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Actual DT slider */}
            <div style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '16px',
              border: '1px solid #e2e8f0'
            }}>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                Actual distress level
              </p>
              <p style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b', textAlign: 'center', margin: '8px 0' }}>
                {actualDT}/10
              </p>
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={actualDT}
                onChange={e => setActualDT(Number(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                <span>Calm</span><span>Extreme</span>
              </div>
            </div>

            {/* BIP after slider */}
            <div style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '16px',
              border: '1px solid #e2e8f0'
            }}>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
                Updated BIP — how much do you believe it now?
              </p>
              <p style={{ fontSize: '32px', fontWeight: '700', color: '#2563eb', textAlign: 'center', margin: '8px 0' }}>
                {bipAfter}%
              </p>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={bipAfter}
                onChange={e => setBipAfter(Number(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8' }}>
                <span>No chance</span><span>Certain</span>
              </div>
            </div>

            {/* What I learned */}
            <div style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '20px',
              border: '1px solid #e2e8f0'
            }}>
              <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
                What I learned
              </p>
              <textarea
                value={whatLearned}
                onChange={e => setWhatLearned(e.target.value)}
                placeholder="What did you notice? What surprised you?"
                rows={3}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '10px',
                  border: '1px solid #e2e8f0',
                  fontSize: '15px',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <button
              onClick={handleRecord}
              disabled={recordMutation.isPending || fearedOccurred === null || !whatLearned.trim()}
              style={{
                width: '100%',
                padding: '16px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '14px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                opacity: (recordMutation.isPending || fearedOccurred === null || !whatLearned.trim()) ? 0.5 : 1
              }}
            >
              {recordMutation.isPending ? 'Saving...' : 'Save my results'}
            </button>
          </div>
        )}

        {/* ── Step 4: Done ── */}
        {step === 'done' && (
          <div style={{ textAlign: 'center', paddingTop: '40px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>🎉</div>
            <h2 style={{ fontSize: '22px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
              Amazing work!
            </h2>
            <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '32px', lineHeight: '1.5' }}>
              Every experiment you complete builds new evidence that your feared outcomes are less likely than you think.
              That takes real courage.
            </p>

            {/* Summary card */}
            <div style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '24px',
              border: '1px solid #e2e8f0',
              textAlign: 'left'
            }}>
              <p style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
                Summary
              </p>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>Feared outcome</p>
                  <p style={{ fontSize: '15px', fontWeight: '600', color: fearedOccurred ? '#ef4444' : '#22c55e' }}>
                    {fearedOccurred ? 'Happened' : 'Did not happen'}
                  </p>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>Actual DT</p>
                  <p style={{ fontSize: '15px', fontWeight: '600', color: '#f59e0b' }}>{actualDT}/10</p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>BIP before</p>
                  <p style={{ fontSize: '15px', fontWeight: '600', color: '#64748b' }}>{bipBefore ?? '—'}%</p>
                </div>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '2px' }}>BIP after</p>
                  <p style={{ fontSize: '15px', fontWeight: '600', color: '#2563eb' }}>{bipAfter}%</p>
                </div>
              </div>
              {whatLearned && (
                <div>
                  <p style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>What I learned</p>
                  <p style={{ fontSize: '14px', color: '#1e293b', lineHeight: '1.4' }}>{whatLearned}</p>
                </div>
              )}
            </div>

            <button
              onClick={() => navigate('/teen/home')}
              style={{
                width: '100%',
                padding: '16px',
                background: '#2563eb',
                color: '#fff',
                border: 'none',
                borderRadius: '14px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              Back to home
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
