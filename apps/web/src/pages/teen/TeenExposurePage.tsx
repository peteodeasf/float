import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { teenApiClient } from '../../api/client'
import TeenScreen from '../../components/teen/TeenScreen'
import teen from '../../styles/teenTokens'

/**
 * The screen for an experiment the teen has already committed to. Reached by
 * tapping a "Coming up" / "Scheduled" item on the home (and, once notifications
 * exist, by the reminder deep-link).
 *
 * `overview` carries the plan, the "how to handle it" tips, and two paths whose
 * emphasis depends on timing: "Do it now" (a guided in-the-moment view) and
 * "Tell me how it went" (straight to reporting). `now` is that guided view —
 * the app says its piece and gets out of the way.
 */
type Phase = 'overview' | 'now'

// Teen-side JIT tips. PROVISIONAL placeholder — should be sourced from the
// shared JIT education content model once that has a teen-side implementation.
const EXPOSURE_TIPS = [
  { t: 'The goal isn’t to feel calm', d: 'It’s to find out what actually happens when you don’t avoid it.' },
  { t: 'Anxiety comes down on its own', d: 'It rises, peaks, then fades — you don’t have to make it stop.' },
  { t: 'Skip the safety moves', d: 'Let yourself be in it without the little things you’d do to feel safer.' },
]

export default function TeenExposurePage() {
  const { experimentId } = useParams<{ experimentId: string }>()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('overview')

  const { data: experiment } = useQuery({
    queryKey: ['teen-experiment', experimentId],
    queryFn: async () => (await teenApiClient.get(`/experiments/${experimentId}`)).data,
    enabled: !!experimentId,
  })

  const behaviorId: string | undefined = experiment?.avoidance_behavior_id ?? undefined
  const { data: behaviorData } = useQuery({
    queryKey: ['teen-behavior', behaviorId],
    queryFn: async () => (await teenApiClient.get(`/patient/behaviors/${behaviorId}`)).data,
    enabled: !!behaviorId,
  })

  const tooHard = useMutation({
    mutationFn: async () => {
      await teenApiClient.post(`/patient/experiments/${experimentId}/too-hard`, { reason: '' })
    },
    onSuccess: () => navigate('/teen/progress'),
  })

  const planText: string | null = experiment?.plan_description || behaviorData?.name || null
  const situationName: string | null = behaviorData?.situation?.name ?? null
  const prediction: string | null = experiment?.prediction ?? null
  const bipBefore: number | null = experiment?.bip_before ?? null

  const scheduledTime = experiment?.scheduled_date
    ? new Date(experiment.scheduled_date).getTime()
    : null
  // No date, or the time has arrived → they're clear to report.
  const isDue = scheduledTime == null || scheduledTime <= Date.now()

  const whenLabel = (() => {
    if (!experiment?.scheduled_date) return null
    const day = new Date(experiment.scheduled_date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
    const b: string | null = experiment.scheduled_time_bucket ?? null
    return b ? `${day} · ${b.charAt(0).toUpperCase()}${b.slice(1)}` : day
  })()

  const goReport = () => navigate(`/teen/record/${experimentId}`)

  // ─────────────────────────────── NOW ──────────────────────────────────
  // The guided moment. Deliberately spare: prediction thrown back, then out of
  // the way.
  if (phase === 'now') {
    return (
      <TeenScreen bubbles>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            padding: `16px ${teen.space.pad} 0`,
            flex: 'none',
          }}
        >
          <button
            onClick={() => setPhase('overview')}
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
        </div>
        <div
          style={{
            position: 'relative',
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            padding: `0 ${teen.space.padLg}`,
          }}
        >
          <span style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>You're in it</span>

          {planText && (
            <h2
              style={{ ...teen.type.headline, fontSize: teen.headSize.sm, margin: '14px 0 30px' }}
            >
              {planText}
            </h2>
          )}

          <div
            style={{
              width: '100%',
              background: teen.color.ink,
              borderRadius: teen.radius.cardLg,
              padding: '30px 24px',
              boxShadow: teen.shadow.cardDark,
            }}
          >
            <div style={{ fontFamily: teen.font.sans, fontSize: 14, color: teen.color.onDark }}>
              You said
            </div>
            <div
              style={{
                fontFamily: teen.font.mono,
                fontSize: teen.dataSize.xl,
                color: '#fff',
                lineHeight: 1,
                margin: '6px 0',
              }}
            >
              {bipBefore ?? '—'}
              <span style={{ fontSize: 26, color: teen.color.mint }}>%</span>
            </div>
            {prediction && (
              <div
                style={{
                  fontFamily: teen.font.sans,
                  fontSize: 18,
                  color: teen.color.mintSoft,
                  lineHeight: 1.4,
                }}
              >
                {prediction}
              </div>
            )}
          </div>

          <p style={{ ...teen.type.body, color: teen.color.mutedQuiet, marginTop: 26 }}>
            Don’t do anything to feel safer. Just let yourself be in it.
          </p>
        </div>

        <div
          style={{ position: 'relative', padding: `0 ${teen.space.padLg} 34px`, textAlign: 'center' }}
        >
          <p
            style={{
              fontFamily: teen.font.sans,
              fontSize: 14,
              color: teen.color.mutedQuiet,
              margin: '0 0 14px',
            }}
          >
            Come back and tell me how it went.
          </p>
          <button className="teen-btn teen-btn--primary" onClick={goReport}>
            I'm through it →
          </button>
          <div style={{ marginTop: 14 }}>
            <button
              className="teen-btn teen-btn--quiet"
              disabled={tooHard.isPending}
              onClick={() => tooHard.mutate()}
            >
              It felt like too much
            </button>
          </div>
        </div>
      </TeenScreen>
    )
  }

  // ───────────────────────────── OVERVIEW ───────────────────────────────
  return (
    <TeenScreen bubbles>
      <div
        style={{
          position: 'relative',
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
            flex: 1,
            minWidth: 0,
            textAlign: 'center',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {situationName || 'Your experiment'}
        </span>
        <span style={{ width: 22 }} />
      </div>

      <div
        style={{
          position: 'relative',
          flex: 1,
          overflowY: 'auto',
          padding: `0 ${teen.space.pad}`,
        }}
      >
        <div style={{ ...teen.type.eyebrow, color: teen.color.tealMid, marginTop: 12 }}>
          {isDue ? 'Ready when you are' : 'Coming up'}
        </div>
        <div className="teen-card" style={{ marginTop: 14, padding: '22px' }}>
          <h1 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: 0 }}>
            {planText ?? 'Your experiment'}
          </h1>
          {whenLabel && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginTop: 18,
                paddingTop: 16,
                borderTop: `1px solid ${teen.color.line}`,
                fontFamily: teen.font.sans,
                fontSize: 13,
                fontWeight: 600,
                color: teen.color.tealMid,
              }}
            >
              <span
                aria-hidden="true"
                style={{ width: 7, height: 7, borderRadius: '50%', background: teen.color.tealMid }}
              />
              {whenLabel}
            </div>
          )}
        </div>

        <div style={{ marginTop: 26 }}>
          <div style={teen.type.eyebrow}>How to handle it</div>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {EXPOSURE_TIPS.map((tip, i) => (
              <div key={i} className="teen-card" style={{ padding: '14px 16px' }}>
                <div
                  style={{
                    fontFamily: teen.font.sans,
                    fontSize: 14,
                    fontWeight: 600,
                    color: teen.color.ink,
                  }}
                >
                  {tip.t}
                </div>
                <div style={{ ...teen.type.body, fontSize: 13, color: teen.color.muted, marginTop: 4 }}>
                  {tip.d}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ height: 18 }} />
      </div>

      {/* Two paths — emphasis follows the timing. */}
      <div
        style={{
          position: 'relative',
          flex: 'none',
          padding: `12px ${teen.space.pad} 30px`,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {isDue ? (
          <>
            <button className="teen-btn teen-btn--primary" onClick={goReport}>
              Tell me how it went →
            </button>
            <button className="teen-btn teen-btn--outline" onClick={() => setPhase('now')}>
              Do it now
            </button>
          </>
        ) : (
          <>
            <button className="teen-btn teen-btn--primary" onClick={() => setPhase('now')}>
              Do it now
            </button>
            <button className="teen-btn teen-btn--outline" onClick={goReport}>
              I already did it
            </button>
          </>
        )}
      </div>
    </TeenScreen>
  )
}
