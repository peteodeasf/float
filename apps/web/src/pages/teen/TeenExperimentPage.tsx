import { useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { teenApiClient } from '../../api/client'
import TeenScreen from '../../components/teen/TeenScreen'
import Chip from '../../components/teen/Chip'
import BeliefSlider from '../../components/teen/BeliefSlider'
import Thermometer from '../../components/teen/Thermometer'
import { encodeSafetyBehaviors } from '../../lib/temptingBehaviors'
import teen from '../../styles/teenTokens'

type Step = 'before' | 'schedule' | 'committed'

/** Face tiles map straight onto the backend's confidence_level enum. */
const CONFIDENCE = [
  { key: 'low', emoji: '😰', label: 'Not sure' },
  { key: 'medium', emoji: '😐', label: 'Getting there' },
  { key: 'high', emoji: '💪', label: "I've got this" },
] as const

type ConfidenceKey = (typeof CONFIDENCE)[number]['key']

/** Generic starting points — safety behaviours aren't modelled per situation. */
const SAFETY_BEHAVIOURS = ['Headphones in', 'Check phone', 'Leave early']

function Field({
  step,
  label,
  value,
  children,
}: {
  step: string
  label: string
  value?: ReactNode
  children: ReactNode
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
          marginBottom: 9,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={teen.type.stepNum}>{step}</span>
          <span style={teen.type.label}>{label}</span>
        </div>
        {value}
      </div>
      {children}
    </div>
  )
}

export default function TeenExperimentPage() {
  const { behaviorId } = useParams<{ behaviorId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<Step>('before')

  // ── before ──
  const [customFear, setCustomFear] = useState('')
  const [addingFear, setAddingFear] = useState(false)
  const [fearDraft, setFearDraft] = useState('')
  const [bip, setBip] = useState(50)
  const [dtExpected, setDtExpected] = useState<number | null>(null)
  const [safety, setSafety] = useState<string[]>([])
  const [customSafety, setCustomSafety] = useState<string[]>([])
  const [addingSafety, setAddingSafety] = useState(false)
  const [safetyDraft, setSafetyDraft] = useState('')
  const [confidence, setConfidence] = useState<ConfidenceKey | null>(null)

  // ── schedule ──
  const [selectedDates, setSelectedDates] = useState<number[]>([0])
  const [times, setTimes] = useState(1)

  // ── committed ──
  const [lastCommittedExperimentId, setLastCommittedExperimentId] = useState<string | null>(null)
  const [tooHardOpen, setTooHardOpen] = useState(false)
  const [tooHardReason, setTooHardReason] = useState('')
  const [tooHardSent, setTooHardSent] = useState(false)
  const [commitPending, setCommitPending] = useState(false)

  const { data: behaviorData } = useQuery({
    queryKey: ['teen-behavior', behaviorId],
    queryFn: async () => (await teenApiClient.get(`/patient/behaviors/${behaviorId}`)).data,
    enabled: !!behaviorId,
  })

  // The feared outcome is set with the clinician (downward arrow) — it is the
  // source of truth. We only ask the teen to name one if none exists yet.
  const clinicianFear: string | null = behaviorData?.situation?.feared_outcome || null
  const behaviorDT: number | null = behaviorData?.dt ?? null
  const fearText = clinicianFear || customFear
  // dt is Numeric(3,1) server-side, so it can arrive as e.g. 7.5 — the
  // thermometer is a 1–10 integer scale.
  const effectiveDT = dtExpected ?? (behaviorDT != null ? Math.round(behaviorDT) : 5)

  const next7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date()
    d.setDate(d.getDate() + i)
    return d
  })
  const sortedSelectedDates = [...selectedDates].sort((a, b) => a - b)

  const allSafety = [...SAFETY_BEHAVIOURS, ...customSafety]
  const toggleSafety = (item: string) =>
    setSafety(prev => (prev.includes(item) ? prev.filter(x => x !== item) : [...prev, item]))

  const commitSafetyDraft = () => {
    const v = safetyDraft.trim()
    if (v && !allSafety.includes(v)) {
      setCustomSafety(prev => [...prev, v])
      setSafety(prev => [...prev, v])
    }
    setSafetyDraft('')
    setAddingSafety(false)
  }

  const commitFearDraft = () => {
    const v = fearDraft.trim()
    if (v) setCustomFear(v)
    setFearDraft('')
    setAddingFear(false)
  }

  const canLockIn = !!fearText.trim() && !!confidence

  const tooHardMutation = useMutation({
    mutationFn: async (experimentId: string) => {
      await teenApiClient.post(`/patient/experiments/${experimentId}/too-hard`, {
        reason: tooHardReason,
      })
    },
    onSuccess: () => setTooHardSent(true),
  })

  const handleCommit = async () => {
    if (selectedDates.length === 0) return
    setCommitPending(true)
    try {
      let lastId: string | null = null
      for (const dateIdx of sortedSelectedDates) {
        const date = next7Days[dateIdx]
        const createRes = await teenApiClient.post(
          `/patient/behaviors/${behaviorId}/experiments`,
          { scheduled_date: date.toISOString() }
        )
        const newExp = createRes.data
        await teenApiClient.put(`/patient/experiments/${newExp.id}/before`, {
          // plan_description is the plan (what they'll do); prediction is the
          // fear. The old flow wrote the fear into both.
          plan_description: behaviorData?.name || 'Experiment planned',
          prediction: fearText,
          bip_before: bip,
          distress_thermometer_expected: effectiveDT,
          tempting_behaviors: encodeSafetyBehaviors(safety),
          confidence_level: confidence ?? 'medium',
          times_per_day: times,
        })
        await teenApiClient.post(`/patient/experiments/${newExp.id}/commit`)
        lastId = newExp.id
      }
      setLastCommittedExperimentId(lastId)
      queryClient.invalidateQueries({ queryKey: ['teen-ladder'] })
      queryClient.invalidateQueries({ queryKey: ['teen-pending'] })
      setStep('committed')
    } finally {
      setCommitPending(false)
    }
  }

  // ────────────────────────────── BEFORE ──────────────────────────────
  if (step === 'before') {
    return (
      <TeenScreen>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `16px ${teen.space.pad} 12px`,
            flex: 'none',
          }}
        >
          <button
            onClick={() => navigate('/teen/home')}
            aria-label="Back"
            style={{
              background: 'none',
              border: 0,
              cursor: 'pointer',
              font: '600 22px ' + teen.font.sans,
              color: teen.color.ink,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ‹
          </button>
          <span
            style={{
              ...teen.type.eyebrow,
              color: teen.color.tealMid,
              letterSpacing: 'var(--teen-eyebrow-track-tight)',
            }}
          >
            Before · 15 sec
          </span>
          <span style={{ width: 22 }} />
        </div>

        <div className="teen-sheet">
          {/* 01 — the prediction */}
          <Field step="01" label="What are you afraid will happen?">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {clinicianFear ? (
                <Chip label={clinicianFear} selected disabled />
              ) : customFear ? (
                <Chip label={customFear} selected onClick={() => setCustomFear('')} />
              ) : addingFear ? (
                <input
                  autoFocus
                  value={fearDraft}
                  onChange={e => setFearDraft(e.target.value)}
                  onBlur={commitFearDraft}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitFearDraft()
                    if (e.key === 'Escape') {
                      setFearDraft('')
                      setAddingFear(false)
                    }
                  }}
                  placeholder="e.g. Everyone will stare"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '8px 13px',
                    borderRadius: teen.radius.pill,
                    border: `1px solid ${teen.color.mint}`,
                    background: teen.color.mintSoft,
                    fontFamily: teen.font.sans,
                    fontSize: 'var(--teen-text-chip)',
                    fontWeight: 600,
                    color: teen.color.ink,
                    outline: 'none',
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="teen-chip teen-chip--add"
                  onClick={() => setAddingFear(true)}
                >
                  <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>
                  Name the worry
                </button>
              )}
            </div>
            {clinicianFear && (
              <p
                style={{
                  ...teen.type.body,
                  fontSize: 'var(--teen-text-sm)',
                  color: teen.color.muted,
                  margin: '8px 0 0',
                }}
              >
                You set this one with your clinician.
              </p>
            )}
          </Field>

          {/* 02 — belief */}
          <Field
            step="02"
            label="Believe that?"
            value={
              <span style={{ ...teen.type.data, fontSize: teen.dataSize.sm }}>{bip}%</span>
            }
          >
            <BeliefSlider value={bip} onChange={setBip} label="How much you believe it" />
          </Field>

          {/* 03 — expected distress */}
          <Field
            step="03"
            label="Expect to feel?"
            value={
              <span style={{ ...teen.type.data, fontSize: teen.dataSize.sm }}>
                {effectiveDT}
                <span style={{ fontSize: 12, color: teen.color.muted }}>/10</span>
              </span>
            }
          >
            <Thermometer
              value={effectiveDT}
              onChange={setDtExpected}
              label="How anxious you expect to feel"
            />
          </Field>

          {/* 04 — safety behaviours */}
          <Field step="04" label="Tempted to do to feel safer?">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {allSafety.map(item => (
                <Chip
                  key={item}
                  label={item}
                  variant="mint"
                  selected={safety.includes(item)}
                  onClick={() => toggleSafety(item)}
                />
              ))}
              {addingSafety ? (
                <input
                  autoFocus
                  value={safetyDraft}
                  onChange={e => setSafetyDraft(e.target.value)}
                  onBlur={commitSafetyDraft}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitSafetyDraft()
                    if (e.key === 'Escape') {
                      setSafetyDraft('')
                      setAddingSafety(false)
                    }
                  }}
                  placeholder="Something else"
                  style={{
                    padding: '8px 13px',
                    borderRadius: teen.radius.pill,
                    border: `1px solid ${teen.color.mint}`,
                    background: teen.color.mintSoft,
                    fontFamily: teen.font.sans,
                    fontSize: 'var(--teen-text-chip)',
                    fontWeight: 600,
                    color: teen.color.ink,
                    outline: 'none',
                    minWidth: 120,
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="teen-chip teen-chip--add"
                  onClick={() => setAddingSafety(true)}
                >
                  <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>
                  Add your own
                </button>
              )}
            </div>
          </Field>

          {/* 05 — confidence */}
          <Field step="05" label="How ready do you feel?">
            <div style={{ display: 'flex', gap: 9 }}>
              {CONFIDENCE.map(opt => (
                <button
                  key={opt.key}
                  type="button"
                  className="teen-face"
                  aria-pressed={confidence === opt.key}
                  aria-label={opt.label}
                  onClick={() => setConfidence(opt.key)}
                >
                  {opt.emoji}
                </button>
              ))}
            </div>
          </Field>

          <div style={{ flex: 1, minHeight: 6 }} />

          <div style={{ paddingBottom: 16 }}>
            <button
              className="teen-btn teen-btn--primary"
              disabled={!canLockIn}
              onClick={() => setStep('schedule')}
            >
              Lock it in
            </button>
          </div>
        </div>
      </TeenScreen>
    )
  }

  // ───────────────────────────── SCHEDULE ─────────────────────────────
  if (step === 'schedule') {
    return (
      <TeenScreen>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `16px ${teen.space.pad} 12px`,
            flex: 'none',
          }}
        >
          <button
            onClick={() => setStep('before')}
            aria-label="Back"
            style={{
              background: 'none',
              border: 0,
              cursor: 'pointer',
              font: '600 22px ' + teen.font.sans,
              color: teen.color.ink,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ‹
          </button>
          <span
            style={{
              ...teen.type.eyebrow,
              color: teen.color.tealMid,
              letterSpacing: 'var(--teen-eyebrow-track-tight)',
            }}
          >
            When
          </span>
          <span style={{ width: 22 }} />
        </div>

        <div className="teen-sheet">
          <h2 style={{ ...teen.type.headline, fontSize: teen.headSize.sm }}>
            When will you do this?
          </h2>

          <div>
            <div style={{ ...teen.type.label, marginBottom: 9 }}>Which days?</div>
            <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
              {next7Days.map((d, i) => {
                const isSelected = selectedDates.includes(i)
                return (
                  <button
                    key={i}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() =>
                      setSelectedDates(prev =>
                        prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]
                      )
                    }
                    style={{
                      flex: '0 0 auto',
                      width: 56,
                      padding: '10px 4px',
                      borderRadius: 14,
                      cursor: 'pointer',
                      textAlign: 'center',
                      background: isSelected ? teen.color.ink : teen.color.cardPure,
                      border: `1px solid ${isSelected ? teen.color.ink : teen.color.lineSoft}`,
                      color: isSelected ? '#fff' : teen.color.ink,
                    }}
                  >
                    <div
                      style={{
                        fontFamily: teen.font.mono,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: '0.06em',
                        textTransform: 'uppercase',
                        color: isSelected ? teen.color.mint : teen.color.muted,
                      }}
                    >
                      {i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div
                      style={{
                        fontFamily: teen.font.mono,
                        fontSize: 18,
                        marginTop: 3,
                        color: isSelected ? '#fff' : teen.color.ink,
                      }}
                    >
                      {d.getDate()}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <div style={{ ...teen.type.label, marginBottom: 9 }}>How many times each day?</div>
            <div style={{ display: 'flex', gap: 9 }}>
              {[1, 2, 3].map(n => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={times === n}
                  onClick={() => setTimes(n)}
                  style={{
                    flex: 1,
                    padding: '14px 0',
                    borderRadius: 15,
                    cursor: 'pointer',
                    fontFamily: teen.font.mono,
                    fontSize: 20,
                    background: times === n ? teen.color.ink : teen.color.cardPure,
                    border: `1px solid ${times === n ? teen.color.ink : teen.color.lineSoft}`,
                    color: times === n ? '#fff' : teen.color.ink,
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 6 }} />

          <div style={{ paddingBottom: 16 }}>
            <button
              className="teen-btn teen-btn--primary"
              disabled={commitPending || selectedDates.length === 0}
              onClick={handleCommit}
            >
              {commitPending ? 'Locking in…' : "I'm going to do it"}
            </button>
          </div>
        </div>
      </TeenScreen>
    )
  }

  // ──────────────────────────── COMMITTED ─────────────────────────────
  return (
    <TeenScreen bubbles>
      <div
        style={{
          position: 'relative',
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: `0 ${teen.space.padLg}`,
        }}
      >
        <span style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>You're locked in</span>
        <h2
          style={{
            ...teen.type.headline,
            fontSize: teen.headSize.lg,
            margin: '16px 0 0',
          }}
        >
          {sortedSelectedDates.length === 1
            ? next7Days[sortedSelectedDates[0]].toLocaleDateString('en-US', {
                weekday: 'long',
              })
            : `${sortedSelectedDates.length} days`}
          . You said {bip}%.
        </h2>

        <div className="teen-card" style={{ marginTop: 20, padding: 22 }}>
          <div style={{ ...teen.type.eyebrow, fontSize: 10 }}>The plan</div>
          <div style={{ ...teen.type.body, color: teen.color.inkSoft, marginTop: 10 }}>
            {behaviorData?.name ?? 'Your experiment'}
          </div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              flexWrap: 'wrap',
              marginTop: 16,
              paddingTop: 16,
              borderTop: `1px solid ${teen.color.line}`,
            }}
          >
            {sortedSelectedDates.map(idx => (
              <span
                key={idx}
                style={{
                  fontFamily: teen.font.mono,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '0.04em',
                  padding: '3px 8px',
                  borderRadius: teen.radius.pill,
                  background: teen.color.mintSoft,
                  color: teen.color.teal,
                }}
              >
                {next7Days[idx].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {times > 1 ? ` ×${times}` : ''}
              </span>
            ))}
          </div>
        </div>

        <p style={{ ...teen.type.body, color: teen.color.mutedQuiet, marginTop: 22 }}>
          Come back and tell me how it went.
        </p>
      </div>

      <div style={{ position: 'relative', padding: `0 ${teen.space.padLg} 34px` }}>
        <button className="teen-btn teen-btn--primary" onClick={() => navigate('/teen/home')}>
          Back to today
        </button>

        {!tooHardSent && !tooHardOpen && (
          <div style={{ textAlign: 'center', marginTop: 14 }}>
            <button className="teen-btn teen-btn--quiet" onClick={() => setTooHardOpen(true)}>
              It feels like too much
            </button>
          </div>
        )}

        {tooHardOpen && !tooHardSent && (
          <div className="teen-card" style={{ marginTop: 16, padding: 18 }}>
            <div style={teen.type.label}>What's making this feel too big?</div>
            <textarea
              value={tooHardReason}
              onChange={e => setTooHardReason(e.target.value)}
              rows={3}
              placeholder="Your clinician will see this."
              style={{
                width: '100%',
                marginTop: 10,
                padding: 12,
                borderRadius: 12,
                border: `1px solid ${teen.color.lineChip}`,
                fontFamily: teen.font.sans,
                fontSize: 14,
                resize: 'none',
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            <button
              className="teen-btn teen-btn--outline"
              style={{ marginTop: 10 }}
              disabled={
                !tooHardReason.trim() || tooHardMutation.isPending || !lastCommittedExperimentId
              }
              onClick={() =>
                lastCommittedExperimentId && tooHardMutation.mutate(lastCommittedExperimentId)
              }
            >
              {tooHardMutation.isPending ? 'Sending…' : 'Tell my clinician'}
            </button>
          </div>
        )}

        {tooHardSent && (
          <div
            style={{
              marginTop: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              background: teen.color.mintSoft,
              border: `1px solid ${teen.color.mint}`,
              borderRadius: 14,
              padding: '14px 16px',
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: teen.color.tealMid,
                flex: 'none',
              }}
            />
            <span
              style={{
                fontFamily: teen.font.sans,
                fontSize: 13,
                fontWeight: 600,
                color: teen.color.teal,
              }}
            >
              Sent — they'll make the next step easier.
            </span>
          </div>
        )}
      </div>
    </TeenScreen>
  )
}
