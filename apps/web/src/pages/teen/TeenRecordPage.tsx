import { useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { teenApiClient } from '../../api/client'
import TeenScreen from '../../components/teen/TeenScreen'
import Chip from '../../components/teen/Chip'
import BeliefSlider from '../../components/teen/BeliefSlider'
import Thermometer from '../../components/teen/Thermometer'
import teen from '../../styles/teenTokens'

/**
 * The post-exposure reporting journey. The teen reaches this by tapping "Tell
 * me how it went" on a due experiment, so it opens straight on the
 * disconfirmation question (`outcome`) — the app no longer shows a "you're in
 * it" moment here; that now lives on the home's pre-exposure state.
 */
type Phase = 'outcome' | 'toohard' | 'capture' | 'score'

const WHAT_HAPPENED = ['A few glanced', 'Nobody cared', 'Awkward but fine']

/**
 * What they learned reframes by path: when the fear did not come true the
 * learning is about the prediction being wrong; when it did, the learning has
 * to be about coping and survivability, never about the prediction.
 */
const WHAT_LEARNED_DISCONFIRMED = [
  'My anxiety exaggerates',
  'I can handle awkward',
  'Nothing bad happened',
]
const WHAT_LEARNED_COPED = [
  'I got through it',
  'It passed quicker than I thought',
  'I can handle it happening',
]

const ORDINALS = [
  '',
  'First',
  'Second',
  'Third',
  'Fourth',
  'Fifth',
  'Sixth',
  'Seventh',
  'Eighth',
  'Ninth',
  'Tenth',
]
const ordinal = (n: number) => ORDINALS[n] ?? `${n}th`

export default function TeenRecordPage() {
  const { experimentId } = useParams<{ experimentId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [phase, setPhase] = useState<Phase>('outcome')

  const [actualDT, setActualDT] = useState<number | null>(null)
  const [bipAfterRaw, setBipAfterRaw] = useState<number | null>(null)
  const [fearedOccurred, setFearedOccurred] = useState<boolean | null>(null)
  const [whatHappened, setWhatHappened] = useState<string | null>(null)
  const [customHappened, setCustomHappened] = useState<string[]>([])
  const [addingHappened, setAddingHappened] = useState(false)
  const [happenedDraft, setHappenedDraft] = useState('')
  const [whatLearned, setWhatLearned] = useState<string | null>(null)

  const [tooHardReason, setTooHardReason] = useState('')
  const [tooHardOpen, setTooHardOpen] = useState(false)
  const [tooHardMarked, setTooHardMarked] = useState(false)
  const [reasonSent, setReasonSent] = useState(false)

  const { data: experiment } = useQuery({
    queryKey: ['teen-experiment', experimentId],
    queryFn: async () => (await teenApiClient.get(`/experiments/${experimentId}`)).data,
    enabled: !!experimentId,
  })

  // The situation isn't on the experiment payload; fetch the behavior for it.
  const behaviorId: string | undefined = experiment?.avoidance_behavior_id ?? undefined
  const { data: behaviorData } = useQuery({
    queryKey: ['teen-behavior', behaviorId],
    queryFn: async () => (await teenApiClient.get(`/patient/behaviors/${behaviorId}`)).data,
    enabled: !!behaviorId,
  })

  const bipBefore: number | null = experiment?.bip_before ?? null
  const prediction: string | null = experiment?.prediction ?? null
  const planText: string | null = experiment?.plan_description ?? null
  const situationName: string | null = behaviorData?.situation?.name ?? null
  const dtExpected: number | null = experiment?.distress_thermometer_expected ?? null

  // Starts where their belief started, so the slider shows movement they make.
  const bipAfter = bipAfterRaw ?? (bipBefore != null ? Math.round(bipBefore) : 50)

  const learnedOptions = fearedOccurred ? WHAT_LEARNED_COPED : WHAT_LEARNED_DISCONFIRMED
  const happenedOptions = [...WHAT_HAPPENED, ...customHappened]

  /** Pulled once we reach the scoreboard, to make its headline claim true. */
  const { data: ladder } = useQuery({
    queryKey: ['teen-ladder-score'],
    queryFn: async () => (await teenApiClient.get('/patient/ladder')).data,
    enabled: phase === 'score',
  })

  const beatThisWeek = useMemo(() => {
    const situations: Array<{ behaviors: Array<{ experiments: Array<Record<string, unknown>> }> }> =
      ladder?.situations ?? []
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    let count = 0
    for (const s of situations) {
      for (const b of s.behaviors ?? []) {
        for (const e of b.experiments ?? []) {
          if (e.feared_outcome_occurred !== false) continue
          const raw = e.scheduled_date as string | null | undefined
          const when = raw ? new Date(raw).getTime() : null
          // If we don't know when it happened, don't claim it was this week.
          if (when != null && when >= weekAgo) count++
        }
      }
    }
    return count
  }, [ladder])

  const recordMutation = useMutation({
    mutationFn: async () => {
      await teenApiClient.put(`/patient/experiments/${experimentId}/after`, {
        feared_outcome_occurred: fearedOccurred ?? false,
        what_happened: whatHappened ?? '',
        distress_thermometer_actual: actualDT ?? 0,
        bip_after: bipAfter,
        // Genuinely optional — a fabricated learning would pollute the
        // clinician's recent_learnings digest.
        what_learned: whatLearned ?? '',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teen-pending'] })
      queryClient.invalidateQueries({ queryKey: ['teen-ladder'] })
      queryClient.invalidateQueries({ queryKey: ['teen-experiment', experimentId] })
      setPhase('score')
    },
  })

  /**
   * Marks the experiment too_hard. Called with no reason the instant the teen
   * bails — the effort still counts even if they close the app right there —
   * and again, optionally, if they choose to say why (a reason is what
   * generates the message to their clinician).
   */
  const tooHardMutation = useMutation({
    mutationFn: async (reason: string) => {
      await teenApiClient.post(`/patient/experiments/${experimentId}/too-hard`, { reason })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teen-pending'] })
    },
  })

  const enterTooHard = () => {
    if (!tooHardMarked) {
      setTooHardMarked(true)
      tooHardMutation.mutate('')
    }
    setPhase('toohard')
  }

  const commitHappenedDraft = () => {
    const v = happenedDraft.trim()
    if (v && !happenedOptions.includes(v)) {
      setCustomHappened(prev => [...prev, v])
      setWhatHappened(v)
    }
    setHappenedDraft('')
    setAddingHappened(false)
  }

  // A back affordance for the steps a teen might want to reconsider. The
  // terminal screens (scoreboard, too-hard) deliberately omit it.
  const renderBack = (onBack: () => void) => (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: `16px ${teen.space.pad} 0`,
        flex: 'none',
      }}
    >
      <button
        onClick={onBack}
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
    </div>
  )

  // ────────────────────────────── OUTCOME ───────────────────────────────
  if (phase === 'outcome') {
    return (
      <TeenScreen variant="alt">
        {renderBack(() => navigate(`/teen/exposure/${experimentId}`))}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: `0 ${teen.space.pad}`,
          }}
        >
          <div style={{ marginTop: 16 }}>
            <span style={teen.type.eyebrow}>How it went</span>
            {situationName && (
              <div
                style={{ ...teen.type.headline, fontSize: teen.headSize.sm, margin: '10px 0 0' }}
              >
                {situationName}
              </div>
            )}
            {planText && (
              <div
                style={{
                  fontFamily: teen.font.sans,
                  fontSize: 16,
                  fontWeight: 600,
                  color: teen.color.inkSoft,
                  marginTop: 4,
                }}
              >
                without {planText}
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: 24,
              fontFamily: teen.font.sans,
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: teen.color.inkSoft,
            }}
          >
            Your fear
          </div>
          {prediction && (
            <div
              style={{
                fontFamily: teen.font.sans,
                fontSize: 22,
                color: teen.color.inkSoft,
                marginTop: 6,
                lineHeight: 1.35,
                textWrap: 'balance',
              }}
            >
              “{prediction}”
            </div>
          )}
          <div
            style={{
              fontFamily: teen.font.sans,
              fontSize: 14,
              fontWeight: 600,
              color: teen.color.tealMid,
              marginTop: 10,
            }}
          >
            You put it at {bipBefore ?? '—'}%
          </div>

          <h2 style={{ ...teen.type.headline, fontSize: teen.headSize.lg, margin: '30px 0 0' }}>
            Did it happen?
          </h2>

          <div style={{ flex: 1, minHeight: 24 }} />

          {/*
           * Both answers carry equal visual weight — no primary. The result
           * screen does the reframing; the buttons must not put a thumb on the
           * scale toward either outcome.
           */}
          <button
            className="teen-btn teen-btn--outline"
            style={{
              padding: 20,
              fontSize: 17,
              borderRadius: teen.radius.btnLg,
              marginBottom: 12,
              background: 'transparent',
              border: `1.5px solid ${teen.color.teal}`,
              color: teen.color.ink,
            }}
            onClick={() => {
              setFearedOccurred(false)
              setPhase('capture')
            }}
          >
            No — it didn't
          </button>
          <button
            className="teen-btn teen-btn--outline"
            style={{
              padding: 20,
              fontSize: 17,
              borderRadius: teen.radius.btnLg,
              marginBottom: 14,
              background: 'transparent',
              border: `1.5px solid ${teen.color.teal}`,
              color: teen.color.ink,
            }}
            onClick={() => {
              setFearedOccurred(true)
              setPhase('capture')
            }}
          >
            Yeah, it did
          </button>
          {/* Escape for "I couldn't actually do it" — a real tertiary button, credited, not a fail. */}
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <button
              className="teen-btn teen-btn--quiet"
              style={{
                fontFamily: teen.font.sans,
                fontWeight: 700,
                fontSize: 16,
                color: teen.color.teal,
                minHeight: 48,
                padding: '12px 16px',
              }}
              onClick={enterTooHard}
            >
              I couldn't do it this time
            </button>
          </div>
        </div>
      </TeenScreen>
    )
  }

  // ────────────────────────────── TOO HARD ──────────────────────────────
  // No scoreboard, no red. Credit showing up.
  if (phase === 'toohard') {
    return (
      <TeenScreen variant="card">
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: `0 ${teen.space.padLg}`,
            overflowY: 'auto',
          }}
        >
          <span style={teen.type.eyebrow}>Showing up counts</span>
          <h2 style={{ ...teen.type.headline, fontSize: 26, margin: '16px 0 0' }}>
            This one was too big. That's useful, not a fail.
          </h2>
          <p style={{ ...teen.type.body, fontSize: 16, marginTop: 20 }}>
            I'll tell your clinician — they'll make the next step easier.
          </p>

          <div
            style={{
              marginTop: 22,
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
              aria-hidden="true"
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
              Still counts — you showed up today.
            </span>
          </div>

          {/* Saying why is optional — nothing to type at the hard moment. */}
          {!reasonSent && !tooHardOpen && (
            <div style={{ marginTop: 18 }}>
              <button
                className="teen-btn teen-btn--outline"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  minHeight: 48,
                  padding: '14px 16px',
                  fontSize: 16,
                  fontWeight: 600,
                  color: teen.color.ink,
                  textAlign: 'left',
                }}
                onClick={() => setTooHardOpen(true)}
              >
                Want to say what made it too big?
                <span aria-hidden="true" style={{ color: teen.color.teal }}>›</span>
              </button>
            </div>
          )}

          {!reasonSent && tooHardOpen && (
            <div style={{ marginTop: 18 }}>
              <textarea
                value={tooHardReason}
                onChange={e => setTooHardReason(e.target.value)}
                rows={3}
                placeholder="Only your clinician sees this."
                style={{
                  width: '100%',
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
                disabled={!tooHardReason.trim() || tooHardMutation.isPending}
                onClick={() =>
                  tooHardMutation.mutate(tooHardReason.trim(), {
                    onSuccess: () => setReasonSent(true),
                  })
                }
              >
                {tooHardMutation.isPending ? 'Sending…' : 'Send it'}
              </button>
            </div>
          )}

          {reasonSent && (
            <p
              style={{ ...teen.type.body, fontSize: 13, color: teen.color.textSecondary, marginTop: 18 }}
            >
              Sent — they'll see it before your next session.
            </p>
          )}
        </div>

        <div style={{ padding: `0 ${teen.space.padLg} 34px` }}>
          <button
            className="teen-btn teen-btn--primary"
            onClick={() => navigate('/teen/progress')}
          >
            See my progress →
          </button>
        </div>
      </TeenScreen>
    )
  }

  // ─────────────────────────────── SCORE ────────────────────────────────
  if (phase === 'score') {
    const dropped = bipBefore != null ? Math.round(bipBefore) - bipAfter : 0
    const headline =
      beatThisWeek >= 2
        ? `${ordinal(beatThisWeek)} time you beat your prediction this week.`
        : dropped > 0
          ? `Your belief dropped ${dropped} points.`
          : 'You showed up and got the data.'

    return (
      <TeenScreen variant="dark">
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 280,
            height: 280,
            borderRadius: '50%',
            background: teen.decor.glowMintFaint,
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'relative',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 28px',
          }}
        >
          <span style={{ ...teen.type.eyebrow, color: teen.color.mint }}>The scoreboard</span>

          <div style={{ marginTop: 24, display: 'flex', gap: 14 }}>
            <div
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.10)',
                borderRadius: teen.radius.btnLg,
                padding: '18px 16px',
              }}
            >
              <div
                style={{ fontFamily: teen.font.sans, fontSize: 13, color: teen.color.mint }}
              >
                Distress
              </div>
              <div
                style={{
                  fontFamily: teen.font.mono,
                  fontSize: teen.dataSize.sm,
                  color: '#fff',
                  marginTop: 6,
                }}
              >
                {dtExpected ?? '—'}
                <span style={{ color: teen.color.mint, fontSize: 16 }}> → {actualDT ?? '—'}</span>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.10)',
                borderRadius: teen.radius.btnLg,
                padding: '18px 16px',
              }}
            >
              <div
                style={{ fontFamily: teen.font.sans, fontSize: 13, color: teen.color.mint }}
              >
                Belief
              </div>
              <div
                style={{
                  fontFamily: teen.font.mono,
                  fontSize: teen.dataSize.sm,
                  color: '#fff',
                  marginTop: 6,
                }}
              >
                {bipBefore != null ? Math.round(bipBefore) : '—'}
                <span style={{ color: teen.color.mint, fontSize: 16 }}> → {bipAfter}</span>
              </div>
            </div>
          </div>

          <p
            style={{
              fontFamily: teen.font.sans,
              fontSize: 30,
              fontWeight: 600,
              lineHeight: 1.25,
              color: '#fff',
              textWrap: 'balance',
              marginTop: 26,
            }}
          >
            {headline}
          </p>
        </div>

        <div style={{ position: 'relative', padding: `0 ${teen.space.padLg} 34px` }}>
          <button
            className="teen-btn teen-btn--mint"
            onClick={() => navigate('/teen/progress')}
          >
            See my progress →
          </button>
        </div>
      </TeenScreen>
    )
  }

  // ────────────────────────────── CAPTURE ───────────────────────────────
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
          onClick={() => setPhase('outcome')}
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
        <span
          style={{
            ...teen.type.eyebrow,
            color: teen.color.tealMid,
            letterSpacing: 'var(--teen-eyebrow-track-tight)',
          }}
        >
          After · how'd it go
        </span>
        <span style={{ width: 22 }} />
      </div>

      <div className="teen-sheet">
        {/* The disconfirmation / coping moment, inline (no separate screen). */}
        <div
          style={{
            background: fearedOccurred ? teen.color.card : teen.color.mintSoft,
            border: `1px solid ${fearedOccurred ? teen.color.lineCard : teen.color.mint}`,
            borderRadius: 14,
            padding: '14px 16px',
          }}
        >
          <div
            style={{
              fontFamily: teen.font.sans,
              fontSize: 15,
              fontWeight: 600,
              color: teen.color.ink,
            }}
          >
            {fearedOccurred ? 'You did it. That’s the part that counts.' : 'It didn’t happen.'}
          </div>
          <div style={{ ...teen.type.body, fontSize: 13, color: teen.color.inkSoft, marginTop: 4 }}>
            {fearedOccurred
              ? 'It happened — and you got through it.'
              : `You put it at ${bipBefore ?? '—'}% — and it still didn’t happen.`}
          </div>
        </div>

        {/* actual distress + live delta */}
        <div>
          <div style={{ ...teen.type.label, marginBottom: 10 }}>
            How anxious did you actually feel?
          </div>
          <Thermometer
            value={actualDT}
            onChange={setActualDT}
            height={46}
            label="How anxious you actually felt"
          />
          {actualDT != null && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 8,
                fontFamily: teen.font.mono,
                fontSize: 14,
                color: teen.color.textSecondary,
              }}
            >
              <span>expected {dtExpected ?? '—'}</span>
              <span style={{ color: teen.color.inkSoft }}>→</span>
              <span style={{ color: teen.color.teal, fontSize: 15 }}>actual {actualDT}</span>
            </div>
          )}
        </div>

        {/* belief after + live delta */}
        <div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              marginBottom: 11,
            }}
          >
            <span style={teen.type.label}>Believe it now?</span>
            <span style={{ ...teen.type.data, fontSize: teen.dataSize.sm }}>{bipAfter}%</span>
          </div>
          <BeliefSlider
            value={bipAfter}
            onChange={setBipAfterRaw}
            label="How much you believe it now"
          />
          {bipBefore != null && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 8,
                fontFamily: teen.font.mono,
                fontSize: 14,
                color: teen.color.textSecondary,
              }}
            >
              <span>was {Math.round(bipBefore)}%</span>
              <span style={{ color: teen.color.inkSoft }}>→</span>
              <span style={{ color: teen.color.teal, fontSize: 15 }}>now {bipAfter}%</span>
            </div>
          )}
        </div>

        {/* what happened */}
        <div>
          <div style={{ ...teen.type.label, marginBottom: 9 }}>What actually happened?</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {happenedOptions.map(opt => (
              <Chip
                key={opt}
                label={opt}
                selected={whatHappened === opt}
                onClick={() => setWhatHappened(opt)}
              />
            ))}
            {addingHappened ? (
              <input
                autoFocus
                value={happenedDraft}
                onChange={e => setHappenedDraft(e.target.value)}
                onBlur={commitHappenedDraft}
                onKeyDown={e => {
                  if (e.key === 'Enter') commitHappenedDraft()
                  if (e.key === 'Escape') {
                    setHappenedDraft('')
                    setAddingHappened(false)
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
                onClick={() => setAddingHappened(true)}
              >
                <span style={{ fontSize: 15, lineHeight: 1 }}>+</span>
                Add your own
              </button>
            )}
          </div>
        </div>

        {/* what learned — optional, and reframed on the came-true path */}
        <div>
          <div style={{ ...teen.type.label, marginBottom: 9 }}>
            What'd you learn?{' '}
            <span style={{ fontWeight: 400, color: teen.color.textSecondary }}>— if anything</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {learnedOptions.map(opt => (
              <Chip
                key={opt}
                label={opt}
                selected={whatLearned === opt}
                onClick={() => setWhatLearned(whatLearned === opt ? null : opt)}
              />
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 6 }} />

        <div style={{ paddingBottom: 16 }}>
          <button
            className="teen-btn teen-btn--primary"
            disabled={recordMutation.isPending || actualDT === null || !whatHappened}
            onClick={() => recordMutation.mutate()}
          >
            {recordMutation.isPending ? 'Saving…' : 'See the scoreboard →'}
          </button>
        </div>
      </div>
    </TeenScreen>
  )
}
