import { useEffect, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
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
type Phase = 'outcome' | 'toohard' | 'capture'

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

export default function TeenRecordPage() {
  const { experimentId } = useParams<{ experimentId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  // Arriving via the in-the-moment bail ("It felt like too much") opens straight
  // on the too-hard screen instead of the outcome question.
  const startTooHard = searchParams.get('toohard') === '1'

  const [phase, setPhase] = useState<Phase>(startTooHard ? 'toohard' : 'outcome')

  const [actualDT, setActualDT] = useState<number | null>(null)
  const [bipAfterRaw, setBipAfterRaw] = useState<number | null>(null)
  const [fearedOccurred, setFearedOccurred] = useState<boolean | null>(null)
  const [whatHappened, setWhatHappened] = useState<string | null>(null)
  const [happenedText, setHappenedText] = useState('')
  const [whatLearned, setWhatLearned] = useState<string | null>(null)
  const [learnedText, setLearnedText] = useState('')

  const [tooHardReason, setTooHardReason] = useState('')
  const [tooHardOpen, setTooHardOpen] = useState(false)
  const [tooHardMarked, setTooHardMarked] = useState(false)
  const [reasonSent, setReasonSent] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { data: experiment } = useQuery({
    queryKey: ['teen-experiment', experimentId],
    queryFn: async () => (await teenApiClient.get(`/experiments/${experimentId}`)).data,
    enabled: !!experimentId,
  })

  // The situation isn't on the experiment payload; fetch the behavior for it.
  const bipBefore: number | null = experiment?.bip_before ?? null
  const prediction: string | null = experiment?.prediction ?? null
  const dtExpected: number | null = experiment?.distress_thermometer_expected ?? null

  // Starts where their belief started, so the slider shows movement they make.
  const bipAfter = bipAfterRaw ?? (bipBefore != null ? Math.round(bipBefore) : 50)

  const learnedOptions = fearedOccurred ? WHAT_LEARNED_COPED : WHAT_LEARNED_DISCONFIRMED

  const recordMutation = useMutation({
    mutationFn: async () => {
      await teenApiClient.put(`/patient/experiments/${experimentId}/after`, {
        feared_outcome_occurred: fearedOccurred ?? false,
        // A typed answer wins over a picked chip; either is fine, neither is required.
        what_happened: happenedText.trim() || whatHappened || '',
        distress_thermometer_actual: actualDT ?? 0,
        bip_after: bipAfter,
        // Genuinely optional — a fabricated learning would pollute the
        // clinician's recent_learnings digest.
        what_learned: learnedText.trim() || whatLearned || '',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teen-pending'] })
      queryClient.invalidateQueries({ queryKey: ['teen-ladder'] })
      queryClient.invalidateQueries({ queryKey: ['teen-experiment', experimentId] })
      // The result used to be its own screen. Now we hand these numbers to the
      // progress tab, which shows them once in a dismissible tile at the top.
      navigate('/teen/progress', {
        state: {
          scoreboard: {
            dtExpected,
            actualDT: actualDT ?? 0,
            bipBefore: bipBefore != null ? Math.round(bipBefore) : null,
            bipAfter,
          },
        },
      })
    },
    onError: (err: unknown) => {
      // A back-button re-submit lands on an already-completed experiment (400,
      // "Experiment already completed"). The work is logged, so move them on to
      // progress rather than leaving them on a button that can only fail.
      const httpStatus = (err as { response?: { status?: number } })?.response?.status
      if (httpStatus === 400) {
        navigate('/teen/progress')
        return
      }
      setSubmitError("Couldn't save that — check your connection and try again.")
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

  // When the teen bailed in the moment, mark the experiment too_hard once (empty
  // reason) as soon as this screen opens — the effort counts even if they leave.
  useEffect(() => {
    if (startTooHard && !tooHardMarked) {
      setTooHardMarked(true)
      tooHardMutation.mutate('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTooHard])

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
    const canNext = fearedOccurred !== null && actualDT !== null
    return (
      <TeenScreen>
        {renderBack(() => navigate(`/teen/exposure/${experimentId}`))}
        <div className="teen-sheet">
          {/* Content group: even gaps between blocks; slack pools at the bottom above the button
              (CLAUDE.md screen-layout rule). */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>
          {/* Your fear — the thing we're checking against. */}
          <div>
            <div
              style={{
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
                  fontSize: 16,
                  color: teen.color.textSecondary,
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
                marginTop: 8,
              }}
            >
              Your fear strength — {bipBefore ?? '—'}%
            </div>
          </div>

          {/* Did what you feared happen? — a choice; neither is styled as the
              "right" answer until it's picked. */}
          <div>
            <h2 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: '0 0 12px' }}>
              Did what you feared happen?
            </h2>
            {/* A segmented control — one "pick one of two", not two action buttons. The chosen
                half is a light tint; a solid fill is reserved for the main action. */}
            <div
              style={{
                display: 'flex',
                border: `1.5px solid ${teen.color.lineBtn}`,
                borderRadius: teen.radius.pill,
                overflow: 'hidden',
              }}
            >
              {([[false, "No — it didn't"], [true, 'Yeah, it did']] as const).map(([v, label], i) => {
                const on = fearedOccurred === v
                return (
                  <button
                    key={label}
                    onClick={() => setFearedOccurred(v)}
                    style={{
                      flex: 1,
                      padding: '13px 10px',
                      fontFamily: teen.font.sans,
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: 'none',
                      borderRight: i === 0 ? `1.5px solid ${teen.color.lineBtn}` : 'none',
                      background: on ? teen.color.mintSoft : 'transparent',
                      color: on ? teen.color.ink : teen.color.textSecondary,
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Believe it now + the was → now delta. */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 11,
              }}
            >
              <span style={teen.type.label}>How strong is your belief now?</span>
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

          {/* Actual fear level + the expected → actual delta. */}
          <div>
            <div style={{ ...teen.type.label, marginBottom: 10 }}>What was your actual fear level?</div>
            <Thermometer value={actualDT} onChange={setActualDT} height={46} label="Actual Fear Level" />
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

          </div>{/* end content group */}

          <div style={{ marginTop: 'auto', paddingTop: 28, paddingBottom: 16 }}>
            <button
              className="teen-btn teen-btn--primary"
              disabled={!canNext}
              onClick={() => setPhase('capture')}
            >
              Next →
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
              borderRadius: teen.radius.card,
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
        <span style={{ width: 22 }} />
      </div>

      <div className="teen-sheet">
        {/* Content group: even gaps between blocks; slack pools at the bottom above the button
            (CLAUDE.md screen-layout rule). */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 44 }}>
          {/* what happened */}
          <div>
            <h2 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: '0 0 12px' }}>
              What actually happened?
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {WHAT_HAPPENED.map(opt => (
                <Chip
                  key={opt}
                  label={opt}
                  selected={whatHappened === opt}
                  onClick={() => {
                    setWhatHappened(whatHappened === opt ? null : opt)
                    setHappenedText('')
                  }}
                />
              ))}
            </div>
            <input
              value={happenedText}
              onChange={e => {
                setHappenedText(e.target.value)
                if (whatHappened) setWhatHappened(null)
              }}
              placeholder="Something else…"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginTop: 10,
                padding: '11px 13px',
                borderRadius: teen.radius.card,
                border: `1px solid ${teen.color.lineChip}`,
                background: teen.color.cardPure,
                fontFamily: teen.font.sans,
                fontSize: 14,
                color: teen.color.ink,
                outline: 'none',
              }}
            />
          </div>

          {/* what learned — reframed on the came-true path */}
          <div>
            <h2 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: '0 0 12px' }}>
              What'd you learn?
            </h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {learnedOptions.map(opt => (
                <Chip
                  key={opt}
                  label={opt}
                  selected={whatLearned === opt}
                  onClick={() => {
                    setWhatLearned(whatLearned === opt ? null : opt)
                    setLearnedText('')
                  }}
                />
              ))}
            </div>
            <input
              value={learnedText}
              onChange={e => {
                setLearnedText(e.target.value)
                if (whatLearned) setWhatLearned(null)
              }}
              placeholder="Something else…"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                marginTop: 10,
                padding: '11px 13px',
                borderRadius: teen.radius.card,
                border: `1px solid ${teen.color.lineChip}`,
                background: teen.color.cardPure,
                fontFamily: teen.font.sans,
                fontSize: 14,
                color: teen.color.ink,
                outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ marginTop: 'auto', paddingTop: 28, paddingBottom: 16 }}>
          {submitError && (
            <div
              style={{
                ...teen.type.body,
                fontSize: 13,
                color: '#b3261e',
                textAlign: 'center',
                marginBottom: 10,
              }}
            >
              {submitError}
            </div>
          )}
          <button
            className="teen-btn teen-btn--primary"
            disabled={recordMutation.isPending}
            onClick={() => {
              setSubmitError(null)
              recordMutation.mutate()
            }}
          >
            {recordMutation.isPending ? 'Submitting…' : 'Submit'}
          </button>
        </div>
      </div>
    </TeenScreen>
  )
}
