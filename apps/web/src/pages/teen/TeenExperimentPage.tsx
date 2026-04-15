import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { teenApiClient } from '../../api/client'

type Step = 1 | 2 | 3 | 4

const encouragements = [
  "The fact that you're doing this is already brave. Trust the process.",
  "Your anxiety is trying to protect you. Show it that you're safe.",
  "Every experiment makes the next one easier.",
]

export default function TeenExperimentPage() {
  const { rungId } = useParams<{ rungId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [step, setStep] = useState<Step>(1)

  // Step 1 state
  const [customFearedOutcome, setCustomFearedOutcome] = useState('')

  // Step 2 state
  const [bip, setBip] = useState(50)
  const [confidence, setConfidence] = useState<'low' | 'medium' | 'high' | null>(null)

  // Step 3 state
  const [selectedDate, setSelectedDate] = useState(0) // index into next 7 days
  const [times, setTimes] = useState(1)

  // Step 4 state
  const [tooHardOpen, setTooHardOpen] = useState(false)
  const [tooHardReason, setTooHardReason] = useState('')
  const [tooHardSent, setTooHardSent] = useState(false)

  // Fetch data
  const { data: fearedOutcomeData } = useQuery({
    queryKey: ['teen-feared-outcome', rungId],
    queryFn: async () => (await teenApiClient.get(`/patient/rungs/${rungId}/feared-outcome`)).data,
    enabled: !!rungId
  })

  const { data: experiments } = useQuery({
    queryKey: ['teen-experiments', rungId],
    queryFn: async () => (await teenApiClient.get(`/rungs/${rungId}/experiments`)).data,
    enabled: !!rungId
  })

  const experiment = experiments?.sort(
    (a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )?.[0]

  const fearedOutcome = fearedOutcomeData?.feared_outcome || null
  const rungDT = experiment?.distress_thermometer_expected

  // Generate next 7 days
  const next7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return d
  })

  const scheduledDate = next7Days[selectedDate]

  // Create experiment
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await teenApiClient.post(`/patient/rungs/${rungId}/experiments`, {
        scheduled_date: scheduledDate.toISOString()
      })
      return res.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['teen-experiments', rungId] })
  })

  // Save before state
  const beforeMutation = useMutation({
    mutationFn: async (experimentId: string) => {
      await teenApiClient.put(`/patient/experiments/${experimentId}/before`, {
        plan_description: fearedOutcome || customFearedOutcome || 'Experiment planned',
        prediction: fearedOutcome || customFearedOutcome,
        bip_before: bip,
        distress_thermometer_expected: rungDT ?? 5,
        confidence_level: confidence || 'medium'
      })
    }
  })

  // Commit
  const commitMutation = useMutation({
    mutationFn: async (experimentId: string) => {
      await teenApiClient.post(`/patient/experiments/${experimentId}/commit`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teen-experiments', rungId] })
      queryClient.invalidateQueries({ queryKey: ['teen-pending'] })
      setStep(4)
    }
  })

  // Too hard
  const tooHardMutation = useMutation({
    mutationFn: async (experimentId: string) => {
      await teenApiClient.post(`/patient/experiments/${experimentId}/too-hard`, {
        reason: tooHardReason
      })
    },
    onSuccess: () => setTooHardSent(true)
  })

  const handleCommit = async () => {
    let exp = experiment
    if (!exp || exp.status === 'completed') {
      exp = await createMutation.mutateAsync()
    }
    await beforeMutation.mutateAsync(exp.id)
    commitMutation.mutate(exp.id)
  }

  const encouragement = encouragements[Math.floor(Math.random() * encouragements.length)]

  // Shared wrapper
  const Shell = ({ children }: { children: React.ReactNode }) => (
    <div style={{ minHeight: '100vh', background: '#f0fdfa', maxWidth: '480px', margin: '0 auto' }}>
      <div style={{ background: '#fff', padding: '14px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button onClick={() => step === 1 ? navigate('/teen/home') : setStep((step - 1) as Step)} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', padding: '4px', color: '#64748b' }}>
          &larr;
        </button>
        <span style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b' }}>
          {step === 1 ? 'Your experiment' : step === 2 ? 'My prediction' : step === 3 ? 'Schedule it' : 'Committed'}
        </span>
      </div>
      {/* Progress bar */}
      <div style={{ display: 'flex', gap: '4px', padding: '16px 24px 0' }}>
        {[1, 2, 3, 4].map(s => (
          <div key={s} style={{ flex: 1, height: '3px', borderRadius: '2px', background: s <= step ? '#0d9488' : '#e2e8f0', transition: 'background 0.3s ease' }} />
        ))}
      </div>
      <div style={{ padding: '20px 24px 80px' }}>{children}</div>
    </div>
  )

  // ── Step 1: The Experiment ──
  if (step === 1) {
    return (
      <Shell>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '20px' }}>
          Here's what you'll try
        </h2>

        {/* Situation + DT */}
        {rungDT != null && (
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <div style={{ flex: 1, background: '#fff', borderRadius: '14px', padding: '16px', border: '1px solid #e2e8f0' }}>
              <p style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>Fear level</p>
              <p style={{ fontSize: '24px', fontWeight: '700', color: '#f59e0b' }}>{rungDT}/10</p>
            </div>
          </div>
        )}

        {/* Feared outcome */}
        <div style={{ background: '#fff', borderRadius: '14px', padding: '20px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
          {fearedOutcome ? (
            <>
              <p style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase', marginBottom: '8px' }}>
                Your feared outcome
              </p>
              <p style={{ fontSize: '16px', color: '#1e293b', fontWeight: '500', fontStyle: 'italic', lineHeight: '1.5' }}>
                "{fearedOutcome}"
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: '14px', color: '#1e293b', fontWeight: '600', marginBottom: '8px' }}>
                What are you worried might happen?
              </p>
              <textarea
                value={customFearedOutcome}
                onChange={e => setCustomFearedOutcome(e.target.value)}
                placeholder="e.g. Everyone will ignore me"
                rows={2}
                style={{
                  width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0',
                  fontSize: '15px', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box'
                }}
              />
            </>
          )}
        </div>

        <button
          onClick={() => setStep(2)}
          disabled={!fearedOutcome && !customFearedOutcome.trim()}
          style={{
            width: '100%', padding: '16px', background: '#0d9488', color: '#fff',
            border: 'none', borderRadius: '14px', fontSize: '16px', fontWeight: '600',
            cursor: 'pointer', opacity: (!fearedOutcome && !customFearedOutcome.trim()) ? 0.5 : 1
          }}
        >
          Looks good &rarr;
        </button>
      </Shell>
    )
  }

  // ── Step 2: My Prediction ──
  if (step === 2) {
    return (
      <Shell>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
          My prediction
        </h2>
        <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '28px' }}>
          Before you do this, let's capture what you think will happen.
        </p>

        {/* BIP */}
        <div style={{ background: '#fff', borderRadius: '14px', padding: '24px', border: '1px solid #e2e8f0', marginBottom: '20px', textAlign: 'center' }}>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '12px' }}>
            How likely is it that your feared outcome will happen?
          </p>
          <p style={{ fontSize: '48px', fontWeight: '700', color: '#0d9488', margin: '0 0 16px' }}>
            {bip}%
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            <button onClick={() => setBip(Math.max(0, bip - 5))} style={{
              width: '48px', height: '48px', borderRadius: '50%', border: '1px solid #e2e8f0',
              background: '#f8fafc', fontSize: '20px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>−</button>
            <input
              type="range" min={0} max={100} step={5} value={bip}
              onChange={e => setBip(Number(e.target.value))}
              style={{ flex: 1, maxWidth: '200px' }}
            />
            <button onClick={() => setBip(Math.min(100, bip + 5))} style={{
              width: '48px', height: '48px', borderRadius: '50%', border: '1px solid #e2e8f0',
              background: '#f8fafc', fontSize: '20px', cursor: 'pointer', color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>+</button>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginTop: '8px', padding: '0 8px' }}>
            <span>Definitely won't</span><span>Definitely will</span>
          </div>
        </div>

        {/* Confidence */}
        <div style={{ marginBottom: '24px' }}>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '10px' }}>
            How confident are you about doing this experiment?
          </p>
          <div style={{ display: 'flex', gap: '8px' }}>
            {([
              { key: 'low', emoji: '😰', label: 'Not sure' },
              { key: 'medium', emoji: '😐', label: 'Getting there' },
              { key: 'high', emoji: '💪', label: "I've got this" },
            ] as const).map(opt => (
              <button
                key={opt.key}
                onClick={() => setConfidence(opt.key)}
                style={{
                  flex: 1, padding: '14px 8px', borderRadius: '12px', cursor: 'pointer',
                  border: confidence === opt.key ? '2px solid #0d9488' : '1px solid #e2e8f0',
                  background: confidence === opt.key ? '#f0fdfa' : '#fff',
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: '24px', marginBottom: '4px' }}>{opt.emoji}</div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: confidence === opt.key ? '#0d9488' : '#64748b' }}>
                  {opt.label}
                </div>
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setStep(3)}
          disabled={!confidence}
          style={{
            width: '100%', padding: '16px', background: '#0d9488', color: '#fff',
            border: 'none', borderRadius: '14px', fontSize: '16px', fontWeight: '600',
            cursor: 'pointer', opacity: !confidence ? 0.5 : 1
          }}
        >
          Next &rarr;
        </button>
      </Shell>
    )
  }

  // ── Step 3: Schedule It ──
  if (step === 3) {
    return (
      <Shell>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
          Schedule it
        </h2>
        <p style={{ fontSize: '14px', color: '#64748b', marginBottom: '24px' }}>
          Experiments work best when they're planned ahead.
        </p>

        {/* Day picker */}
        <div style={{ marginBottom: '24px' }}>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '10px' }}>When will you do this?</p>
          <div style={{ display: 'flex', gap: '6px', overflowX: 'auto' }}>
            {next7Days.map((d, i) => {
              const isSelected = selectedDate === i
              const isToday = i === 0
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(i)}
                  style={{
                    flex: '0 0 auto', width: '56px', padding: '10px 4px', borderRadius: '12px',
                    border: isSelected ? '2px solid #0d9488' : '1px solid #e2e8f0',
                    background: isSelected ? '#f0fdfa' : '#fff',
                    cursor: 'pointer', textAlign: 'center'
                  }}
                >
                  <div style={{ fontSize: '11px', color: isSelected ? '#0d9488' : '#94a3b8', fontWeight: '600' }}>
                    {isToday ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: '700', color: isSelected ? '#0d9488' : '#1e293b', marginTop: '2px' }}>
                    {d.getDate()}
                  </div>
                  <div style={{ fontSize: '10px', color: '#94a3b8' }}>
                    {d.toLocaleDateString('en-US', { month: 'short' })}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Times */}
        <div style={{ marginBottom: '32px' }}>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '10px' }}>How many times?</p>
          <div style={{ display: 'flex', gap: '8px' }}>
            {[1, 2, 3].map(n => (
              <button
                key={n}
                onClick={() => setTimes(n)}
                style={{
                  flex: 1, padding: '14px', borderRadius: '12px', cursor: 'pointer',
                  border: times === n ? '2px solid #0d9488' : '1px solid #e2e8f0',
                  background: times === n ? '#f0fdfa' : '#fff',
                  fontSize: '18px', fontWeight: '700',
                  color: times === n ? '#0d9488' : '#64748b'
                }}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleCommit}
          disabled={commitMutation.isPending || createMutation.isPending || beforeMutation.isPending}
          style={{
            width: '100%', padding: '18px', background: '#0d9488', color: '#fff',
            border: 'none', borderRadius: '14px', fontSize: '17px', fontWeight: '700',
            cursor: 'pointer',
            opacity: (commitMutation.isPending || createMutation.isPending || beforeMutation.isPending) ? 0.6 : 1
          }}
        >
          {commitMutation.isPending ? 'Committing...' : 'Commit to this experiment &rarr;'}
        </button>
      </Shell>
    )
  }

  // ── Step 4: Committed ──
  return (
    <Shell>
      <div style={{ textAlign: 'center', paddingTop: '24px' }}>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>💪</div>
        <h2 style={{ fontSize: '22px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
          You're committed
        </h2>
      </div>

      {/* Summary card */}
      <div style={{ background: '#fff', borderRadius: '14px', padding: '20px', border: '1px solid #e2e8f0', marginTop: '20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <p style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600' }}>When</p>
            <p style={{ fontSize: '15px', color: '#1e293b', fontWeight: '500' }}>
              {scheduledDate.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600' }}>My prediction</p>
            <p style={{ fontSize: '15px', color: '#0d9488', fontWeight: '700' }}>{bip}%</p>
          </div>
        </div>
        <div>
          <p style={{ fontSize: '12px', color: '#94a3b8', fontWeight: '600' }}>Confidence</p>
          <p style={{ fontSize: '15px', color: '#1e293b', fontWeight: '500', textTransform: 'capitalize' }}>
            {confidence === 'low' ? '😰 Not sure' : confidence === 'medium' ? '😐 Getting there' : "💪 I've got this"}
          </p>
        </div>
      </div>

      {/* Encouragement */}
      <p style={{ fontSize: '15px', color: '#64748b', textAlign: 'center', lineHeight: '1.5', marginBottom: '24px', fontStyle: 'italic' }}>
        "{encouragement}"
      </p>

      <button
        onClick={() => navigate('/teen/home')}
        style={{
          width: '100%', padding: '16px', background: '#0d9488', color: '#fff',
          border: 'none', borderRadius: '14px', fontSize: '16px', fontWeight: '600', cursor: 'pointer'
        }}
      >
        Back to home
      </button>

      {/* Too hard */}
      {!tooHardSent && (
        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button
            onClick={() => setTooHardOpen(true)}
            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '14px', cursor: 'pointer', textDecoration: 'underline' }}
          >
            This feels too hard
          </button>
        </div>
      )}

      {/* Too hard modal */}
      {tooHardOpen && !tooHardSent && (
        <div style={{ background: '#fff', borderRadius: '14px', padding: '20px', border: '1px solid #e2e8f0', marginTop: '16px' }}>
          <p style={{ fontSize: '14px', fontWeight: '600', color: '#1e293b', marginBottom: '8px' }}>
            What made this feel too hard?
          </p>
          <textarea
            value={tooHardReason}
            onChange={e => setTooHardReason(e.target.value)}
            placeholder="Tell your clinician what's making this difficult..."
            rows={3}
            style={{
              width: '100%', padding: '12px', borderRadius: '10px', border: '1px solid #e2e8f0',
              fontSize: '14px', resize: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: '12px'
            }}
          />
          <button
            onClick={() => experiment && tooHardMutation.mutate(experiment.id)}
            disabled={!tooHardReason.trim() || tooHardMutation.isPending}
            style={{
              width: '100%', padding: '12px', background: '#f59e0b', color: '#fff',
              border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '600',
              cursor: 'pointer', opacity: (!tooHardReason.trim() || tooHardMutation.isPending) ? 0.5 : 1
            }}
          >
            {tooHardMutation.isPending ? 'Sending...' : 'Send to my clinician'}
          </button>
        </div>
      )}

      {tooHardSent && (
        <div style={{ textAlign: 'center', marginTop: '16px', padding: '12px', background: '#f0fdfa', borderRadius: '10px' }}>
          <p style={{ fontSize: '14px', color: '#0d9488', fontWeight: '500' }}>
            Sent — your clinician will be in touch.
          </p>
        </div>
      )}
    </Shell>
  )
}
