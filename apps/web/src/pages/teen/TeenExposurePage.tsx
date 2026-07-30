import { useEffect, useState } from 'react'
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
type Tip = { id: string; title: string; body: string }

export default function TeenExposurePage() {
  const { experimentId } = useParams<{ experimentId: string }>()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('overview')

  const { data: experiment } = useQuery({
    queryKey: ['teen-experiment', experimentId],
    queryFn: async () => (await teenApiClient.get(`/experiments/${experimentId}`)).data,
    enabled: !!experimentId,
  })

  // JIT "how to handle it" tips: always-show ones plus any whose tags match the
  // situation's tags, resolved server-side.
  const { data: tips } = useQuery<Tip[]>({
    queryKey: ['teen-exp-tips', experimentId],
    queryFn: async () =>
      (await teenApiClient.get(`/patient/experiments/${experimentId}/tips`)).data,
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

  // Deep-link guard: if the situation was deactivated, this experiment is no
  // longer something the teen should work on — send them home.
  useEffect(() => {
    if (behaviorData?.situation && behaviorData.situation.is_active === false) {
      navigate('/teen/home', { replace: true })
    }
  }, [behaviorData, navigate])

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
              font: '600 30px ' + teen.font.sans,
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

          {situationName && (
            <h2 style={{ ...teen.type.headline, fontSize: teen.headSize.sm, margin: '14px 0 2px' }}>
              {situationName}
            </h2>
          )}
          {planText && (
            <div
              style={{
                fontFamily: teen.font.sans,
                fontSize: 17,
                fontWeight: 600,
                color: teen.color.textSecondary,
                margin: '0 0 28px',
                // §3.9 — left-align so a long behavior doesn't orphan one word when centered
                width: '100%',
                textAlign: 'left',
              }}
            >
              without {planText}
            </div>
          )}

          <div
            style={{
              width: '100%',
              background: teen.color.ink,
              borderRadius: teen.radius.cardLg,
              padding: '26px 24px',
              boxShadow: teen.shadow.cardDark,
              textAlign: 'left',
            }}
          >
            <div
              style={{
                fontFamily: teen.font.sans,
                fontSize: 13,
                fontWeight: 700,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: teen.color.mint,
              }}
            >
              Your fear
            </div>
            {prediction && (
              <div
                style={{
                  fontFamily: teen.font.sans,
                  fontSize: 20,
                  color: '#fff',
                  lineHeight: 1.35,
                  marginTop: 8,
                }}
              >
                “{prediction}”
              </div>
            )}
            <div
              style={{
                fontFamily: teen.font.sans,
                fontSize: 14,
                color: teen.color.onDark,
                marginTop: 12,
              }}
            >
              You put it at {bipBefore ?? '—'}%
            </div>
          </div>

          <p style={{ ...teen.type.body, color: teen.color.inkSoft, marginTop: 26 }}>
            Don’t do anything to feel safer. Just be in it.
          </p>
        </div>

        <div
          style={{ position: 'relative', padding: `0 ${teen.space.padLg} 34px`, textAlign: 'center' }}
        >
          <p
            style={{
              fontFamily: teen.font.sans,
              fontSize: 14,
              color: teen.color.textSecondary,
              margin: '0 0 14px',
            }}
          >
            Come back and tell me how it went.
          </p>
          <button className="teen-btn teen-btn--primary" onClick={goReport}>
            I'm through it →
          </button>
          <div style={{ marginTop: 14 }}>
            {/* §2.6 — real tertiary escape hatch: bordered chip, teal, ≥48px tap height */}
            <button
              disabled={tooHard.isPending}
              onClick={() => tooHard.mutate()}
              style={{
                fontFamily: teen.font.sans,
                fontSize: 16,
                fontWeight: 700,
                color: teen.color.teal,
                background: 'transparent',
                border: `1.5px solid ${teen.color.lineBtn}`,
                borderRadius: teen.radius.pill,
                minHeight: 48,
                padding: '12px 22px',
                cursor: tooHard.isPending ? 'default' : 'pointer',
                opacity: tooHard.isPending ? 0.5 : 1,
              }}
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
            font: '600 30px ' + teen.font.sans,
            color: teen.color.ink,
            lineHeight: 1,
            padding: 0,
          }}
        >
          ‹
        </button>
        <span style={{ flex: 1 }} />
        <span style={{ width: 22 }} />
      </div>

      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: `0 ${teen.space.pad}`,
        }}
      >
        <div style={{ ...teen.type.eyebrow, color: teen.color.tealMid, marginTop: 12 }}>
          {isDue ? 'Ready when you are' : 'Coming up'}
        </div>
        <div className="teen-card" style={{ marginTop: 14, padding: '22px' }}>
          <h1 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: 0 }}>
            {situationName ?? 'Your experiment'}
          </h1>
          {planText && (
            <div
              style={{
                fontFamily: teen.font.sans,
                fontSize: 17,
                fontWeight: 600,
                color: teen.color.textSecondary,
                marginTop: 6,
              }}
            >
              without {planText}
            </div>
          )}
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

        {tips && tips.length > 0 && (
          <div style={{ marginTop: 26 }}>
            <div style={teen.type.eyebrow}>How to handle it</div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {tips.map(tip => (
                <div key={tip.id} className="teen-card" style={{ padding: '14px 16px' }}>
                  <div
                    style={{
                      fontFamily: teen.font.sans,
                      fontSize: 14,
                      fontWeight: 600,
                      color: teen.color.ink,
                    }}
                  >
                    {tip.title}
                  </div>
                  <div
                    style={{
                      ...teen.type.body,
                      fontSize: 13,
                      color: teen.color.inkSoft,
                      marginTop: 4,
                    }}
                  >
                    {tip.body}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
            {/* §1.3 — equal-prominence peer (crisp ink border), not a downgrade */}
            <button
              className="teen-btn teen-btn--outline"
              style={{ borderColor: teen.color.ink }}
              onClick={goReport}
            >
              I already did it
            </button>
          </>
        )}
      </div>
    </TeenScreen>
  )
}
