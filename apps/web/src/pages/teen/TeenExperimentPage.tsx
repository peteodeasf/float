import { useState, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { teenApiClient } from '../../api/client'
import TeenScreen from '../../components/teen/TeenScreen'
import Chip from '../../components/teen/Chip'
import BeliefSlider from '../../components/teen/BeliefSlider'
import Thermometer from '../../components/teen/Thermometer'
import teen from '../../styles/teenTokens'

type Step = 'before' | 'committed'

/**
 * Word chips map straight onto the backend's confidence_level enum. Keys are
 * unchanged (low/medium/high) — the same values the old emoji faces recorded —
 * so clinician-facing data is identical; only the presentation changed.
 */
const CONFIDENCE = [
  { key: 'low', label: 'Not really' },
  { key: 'medium', label: 'Kind of' },
  { key: 'high', label: 'Ready' },
] as const

type ConfidenceKey = (typeof CONFIDENCE)[number]['key']

/**
 * Coarse "when" buckets. Deliberately not a clock — a specific-ish time makes
 * the teen far likelier to actually do the exposure than "whenever". Labels are
 * provisional; `hour` is the representative time stamped onto scheduled_date so
 * a future reminder has something to fire on.
 */
const TIME_BUCKETS = [
  { key: 'morning', label: 'Morning', hour: 9 },
  { key: 'afternoon', label: 'Afternoon', hour: 14 },
  { key: 'evening', label: 'Evening', hour: 19 },
] as const

type BucketKey = (typeof TIME_BUCKETS)[number]['key']

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
  const [confidence, setConfidence] = useState<ConfidenceKey | null>(null)

  // ── schedule (now part of the before screen) ──
  const [selectedDates, setSelectedDates] = useState<number[]>([0])
  const [bucket, setBucket] = useState<BucketKey | null>(null)

  // ── committed ──
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

  const commitFearDraft = () => {
    const v = fearDraft.trim()
    if (v) setCustomFear(v)
    setFearDraft('')
    setAddingFear(false)
  }

  // Each block contributes its own guard; removing a block means removing its
  // clause here, not restructuring. Schedule (day + bucket) is now required.
  const canLockIn =
    selectedDates.length > 0 && !!bucket && !!fearText.trim() && !!confidence

  const bucketHour = TIME_BUCKETS.find(b => b.key === bucket)?.hour ?? 12

  const handleCommit = async () => {
    if (selectedDates.length === 0 || !bucket) return
    setCommitPending(true)
    try {
      for (const dateIdx of sortedSelectedDates) {
        // Stamp the bucket's representative hour onto the chosen day so the
        // scheduled_date is a real committed moment (and a reminder anchor).
        const date = new Date(next7Days[dateIdx])
        date.setHours(bucketHour, 0, 0, 0)
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
          confidence_level: confidence ?? 'medium',
          scheduled_time_bucket: bucket,
        })
        await teenApiClient.post(`/patient/experiments/${newExp.id}/commit`)
      }
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
              font: '600 30px ' + teen.font.sans,
              color: teen.color.ink,
              lineHeight: 1,
              padding: 0,
            }}
          >
            ‹
          </button>
          {/* Situation moved to the headline below (§2.2) — header is just the back affordance */}
          <span style={{ flex: 1 }} />
          <span style={{ width: 22 }} />
        </div>

        <div className="teen-sheet">
          {/* Situation is the headline; the safety behavior is the "without" sub-line (§2.2 / G6) */}
          {(behaviorData?.situation?.name || behaviorData?.name) && (
            <div>
              <h1
                style={{
                  ...teen.type.headline,
                  fontSize: teen.headSize.md,
                  margin: 0,
                }}
              >
                {behaviorData?.situation?.name ?? 'Your experiment'}
              </h1>
              {behaviorData?.name && (
                <div
                  style={{
                    fontFamily: teen.font.sans,
                    fontSize: 17,
                    fontWeight: 600,
                    color: teen.color.textSecondary,
                    marginTop: 6,
                  }}
                >
                  without {behaviorData.name}
                </div>
              )}
            </div>
          )}

          {/* When — day + coarse time. First thing they set: committing to a
              specific moment (a commitment) comes before the predictions.
              Independently removable, like each block below. */}
          <div>
            <div style={{ ...teen.type.label, marginBottom: 9 }}>When will you do it?</div>
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
                      width: 64,
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
                        fontFamily: teen.font.sans,
                        fontSize: 13,
                        fontWeight: 700,
                        color: isSelected ? teen.color.mint : teen.color.textSecondary,
                      }}
                    >
                      {i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div
                      style={{
                        fontFamily: teen.font.sans,
                        fontSize: 17,
                        fontWeight: 600,
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
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {TIME_BUCKETS.map(b => {
                const isSel = bucket === b.key
                return (
                  <button
                    key={b.key}
                    type="button"
                    aria-pressed={isSel}
                    onClick={() => setBucket(b.key)}
                    style={{
                      flex: 1,
                      padding: '12px 0',
                      borderRadius: 14,
                      cursor: 'pointer',
                      fontFamily: teen.font.sans,
                      fontSize: 14,
                      fontWeight: 600,
                      background: isSel ? teen.color.ink : teen.color.cardPure,
                      border: `1px solid ${isSel ? teen.color.ink : teen.color.lineSoft}`,
                      color: isSel ? '#fff' : teen.color.ink,
                    }}
                  >
                    {b.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ flex: 1 }} aria-hidden="true" />

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
                  color: teen.color.textSecondary,
                  margin: '8px 0 0',
                }}
              >
                You set this one with your clinician.
              </p>
            )}
          </Field>

          <div style={{ flex: 1 }} aria-hidden="true" />

          {/* 02 — belief */}
          <Field
            step="02"
            label="How much do you believe that?"
            value={
              <span style={{ ...teen.type.data, fontSize: teen.dataSize.sm }}>{bip}%</span>
            }
          >
            <BeliefSlider value={bip} onChange={setBip} label="How much you believe it" />
          </Field>

          <div style={{ flex: 1 }} aria-hidden="true" />

          {/* 03 — expected distress */}
          <Field
            step="03"
            label="Expect to feel?"
            value={
              <span style={{ ...teen.type.data, fontSize: teen.dataSize.sm }}>
                {effectiveDT}
                <span
                  style={{ fontFamily: teen.font.sans, fontSize: 13, color: teen.color.textSecondary }}
                >
                  /10
                </span>
              </span>
            }
          >
            <Thermometer
              value={effectiveDT}
              onChange={setDtExpected}
              label="How anxious you expect to feel"
            />
            {/* §3.6 — scale anchors */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginTop: 6,
                fontFamily: teen.font.sans,
                fontSize: 13,
                color: teen.color.textSecondary,
              }}
            >
              <span>a little</span>
              <span>a lot</span>
            </div>
          </Field>

          <div style={{ flex: 1 }} aria-hidden="true" />

          {/* 04 — readiness. Word chips replace the emoji faces; keys still map to
              the confidence_level enum, so the value recorded is unchanged (§1.5). */}
          <Field step="04" label="How ready do you feel?">
            <div style={{ display: 'flex', gap: 9, flexWrap: 'wrap' }}>
              {CONFIDENCE.map(opt => (
                <Chip
                  key={opt.key}
                  label={opt.label}
                  selected={confidence === opt.key}
                  onClick={() => setConfidence(opt.key)}
                />
              ))}
            </div>
          </Field>

          <div style={{ flex: 1 }} aria-hidden="true" />

          <div style={{ paddingBottom: 16 }}>
            <button
              className="teen-btn teen-btn--primary"
              disabled={!canLockIn || commitPending}
              onClick={handleCommit}
            >
              {commitPending ? 'Locking in…' : 'Lock it in'}
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
          . You believe it {bip}%.
        </h2>

        <div className="teen-card" style={{ marginTop: 20, padding: 22 }}>
          <div style={{ ...teen.type.eyebrow, fontSize: 13 }}>The plan</div>
          <div
            style={{
              ...teen.type.headline,
              fontSize: teen.headSize.sm,
              margin: '10px 0 0',
            }}
          >
            {behaviorData?.situation?.name ?? 'Your experiment'}
          </div>
          {behaviorData?.name && (
            <div
              style={{
                fontFamily: teen.font.sans,
                fontSize: 17,
                fontWeight: 600,
                color: teen.color.textSecondary,
                marginTop: 4,
              }}
            >
              without {behaviorData.name}
            </div>
          )}
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
                  fontFamily: teen.font.sans,
                  fontSize: 13,
                  fontWeight: 700,
                  padding: '4px 10px',
                  borderRadius: teen.radius.pill,
                  background: teen.color.mintSoft,
                  color: teen.color.teal,
                }}
              >
                {next7Days[idx].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {bucket ? ` · ${TIME_BUCKETS.find(b => b.key === bucket)?.label}` : ''}
              </span>
            ))}
          </div>
        </div>

        <p style={{ ...teen.type.body, color: teen.color.textSecondary, marginTop: 22 }}>
          Come back and tell me how it went.
        </p>
      </div>

      <div style={{ position: 'relative', padding: `0 ${teen.space.padLg} 34px` }}>
        {/* TODO: "Add to reminder/calendar" action belongs here — depends on the separate reminders work */}
        <button className="teen-btn teen-btn--primary" onClick={() => navigate('/teen/home')}>
          Home
        </button>
      </div>
    </TeenScreen>
  )
}
