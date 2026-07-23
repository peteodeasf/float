import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTeenAuth } from '../../context/TeenAuthContext'
import { teenApiClient } from '../../api/client'
import { readTimesPerDay } from '../../lib/temptingBehaviors'
import TeenScreen from '../../components/teen/TeenScreen'
import teen from '../../styles/teenTokens'

type TeenExperiment = {
  id: string
  status: string
  scheduled_date: string | null
  dt_actual: number | null
  bip_before: number | null
  bip_after: number | null
  feared_outcome_occurred: boolean | null
}

type TeenBehavior = {
  id: string
  name: string
  behavior_type: string
  dt: number | null
  experiment_count: number
  latest_dt_actual: number | null
  status: 'mastered' | 'in_progress' | 'not_started'
  experiments: TeenExperiment[]
}

type TeenSituation = {
  id: string
  name: string
  is_active: boolean
  feared_outcome: string | null
  da_approved: boolean
  behaviors: TeenBehavior[]
}

function ChatButton({ unread, onClick }: { unread: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={unread > 0 ? `Messages, ${unread} unread` : 'Messages'}
      style={{
        position: 'relative',
        width: 36,
        height: 36,
        borderRadius: '50%',
        background: teen.color.cardPure,
        border: `1px solid ${teen.color.lineSoft}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        cursor: 'pointer',
        flex: 'none',
      }}
    >
      {[0, 1, 2].map(i => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: teen.color.tealMid,
          }}
        />
      ))}
      {unread > 0 && (
        <span
          style={{
            position: 'absolute',
            top: -2,
            right: -4,
            minWidth: 16,
            height: 16,
            padding: '0 4px',
            background: teen.color.ink,
            color: '#fff',
            borderRadius: 999,
            fontFamily: teen.font.mono,
            fontSize: 10,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
        >
          {unread}
        </span>
      )}
    </button>
  )
}

export default function TeenHomePage() {
  const { patientId, logout } = useTeenAuth()
  const navigate = useNavigate()
  const [selectedSituationId, setSelectedSituationId] = useState<string | null>(null)
  const [jumpWarning, setJumpWarning] = useState<{
    targetBehaviorId: string
    suggestedBehaviorId: string
    suggestedName: string
  } | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [showWelcome, setShowWelcome] = useState(false)
  const [showLadderHint, setShowLadderHint] = useState(false)

  useEffect(() => {
    if (!patientId) return
    const onboardedKey = `float_onboarded_${patientId}`
    const hintDismissedKey = `float_ladder_hint_dismissed_${patientId}`
    if (!localStorage.getItem(onboardedKey)) {
      setShowWelcome(true)
    } else if (!localStorage.getItem(hintDismissedKey)) {
      setShowLadderHint(true)
    }
  }, [patientId])

  const handleDismissWelcome = () => {
    if (patientId) localStorage.setItem(`float_onboarded_${patientId}`, '1')
    setShowWelcome(false)
    if (patientId && !localStorage.getItem(`float_ladder_hint_dismissed_${patientId}`)) {
      setShowLadderHint(true)
    }
  }

  const { data: ladderData } = useQuery({
    queryKey: ['teen-ladder', patientId],
    queryFn: async () => (await teenApiClient.get('/patient/ladder')).data,
    enabled: !!patientId,
  })

  const { data: me } = useQuery({
    queryKey: ['teen-me', patientId],
    queryFn: async () => (await teenApiClient.get('/auth/me')).data,
    enabled: !!patientId,
  })

  const { data: pendingExperiments } = useQuery({
    queryKey: ['teen-pending', patientId],
    queryFn: async () => (await teenApiClient.get('/patient/experiments/pending')).data,
    enabled: !!patientId,
  })

  const { data: messages } = useQuery<
    Array<{ id: string; sender_user_id: string; read_at: string | null }>
  >({
    queryKey: ['teen-messages', patientId],
    queryFn: async () => (await teenApiClient.get('/patient/messages')).data,
    enabled: !!patientId,
  })
  const unreadMessageCount = (messages ?? []).filter(
    m => m.sender_user_id !== me?.user_id && !m.read_at
  ).length

  const situations: TeenSituation[] = ladderData?.situations ?? []
  const firstName = me?.patient_name?.split(' ')[0] ?? ''

  useEffect(() => {
    if (!selectedSituationId && situations.length > 0) {
      const active = situations.find(s => s.is_active)
      setSelectedSituationId(active?.id ?? situations[0].id)
    }
  }, [situations, selectedSituationId])

  const selectedSituation = situations.find(s => s.id === selectedSituationId)

  // Easiest first — lowest distress rating at the top, nulls last.
  const sortedBehaviors: TeenBehavior[] = selectedSituation
    ? [...selectedSituation.behaviors].sort((a, b) => {
        if (a.dt == null && b.dt == null) return 0
        if (a.dt == null) return 1
        if (b.dt == null) return -1
        return a.dt - b.dt
      })
    : []

  const suggestedBehavior = sortedBehaviors.find(b => b.status !== 'mastered') ?? null
  const suggestedIndex = suggestedBehavior
    ? sortedBehaviors.findIndex(b => b.id === suggestedBehavior.id)
    : -1

  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)

  const readyToRecord = (pendingExperiments ?? []).filter((e: any) => {
    if (e.status !== 'committed') return false
    if (!e.scheduled_date) return true
    return new Date(e.scheduled_date) <= endOfToday
  })

  const upcomingExperiments = ((pendingExperiments ?? []).filter(
    (e: any) => e.status === 'committed' || e.status === 'planned'
  ) as any[]).sort((a, b) => {
    if (!a.scheduled_date && !b.scheduled_date) return 0
    if (!a.scheduled_date) return 1
    if (!b.scheduled_date) return -1
    return new Date(a.scheduled_date).getTime() - new Date(b.scheduled_date).getTime()
  })

  const behaviorById: Record<string, TeenBehavior> = {}
  for (const s of situations) {
    for (const b of s.behaviors) behaviorById[b.id] = b
  }

  const dismissLadderHint = () => {
    if (patientId) localStorage.setItem(`float_ladder_hint_dismissed_${patientId}`, '1')
    setShowLadderHint(false)
  }

  const handleBehaviorTap = (behavior: TeenBehavior) => {
    if (behavior.status === 'mastered') return
    dismissLadderHint()
    if (
      suggestedBehavior &&
      behavior.id !== suggestedBehavior.id &&
      behavior.dt != null &&
      suggestedBehavior.dt != null &&
      behavior.dt - suggestedBehavior.dt > 2
    ) {
      setJumpWarning({
        targetBehaviorId: behavior.id,
        suggestedBehaviorId: suggestedBehavior.id,
        suggestedName: suggestedBehavior.name,
      })
      return
    }
    navigate(`/teen/experiment/${behavior.id}`)
  }

  // ───────────────────────────── WELCOME ──────────────────────────────
  if (showWelcome) {
    return (
      <TeenScreen variant="dark">
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: `0 ${teen.space.padLg}`,
          }}
        >
          <span style={{ ...teen.type.eyebrow, color: teen.color.mint }}>Welcome to float</span>
          <h1
            style={{
              ...teen.type.headline,
              fontSize: teen.headSize.xl,
              color: '#fff',
              margin: '16px 0 0',
            }}
          >
            Hi {firstName}. Let's find out what's actually true.
          </h1>
          <p
            style={{
              ...teen.type.body,
              color: teen.color.onDark,
              marginTop: 16,
            }}
          >
            Your clinician set up some experiments for you.
          </p>

          <div style={{ marginTop: 30, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {[
              'Pick a step and say you’ll do it',
              'Guess what’ll happen before you go',
              'Come back and tell me what really happened',
            ].map((line, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                <span
                  style={{
                    fontFamily: teen.font.mono,
                    fontSize: 10,
                    fontWeight: 700,
                    color: teen.color.mint,
                    flex: 'none',
                  }}
                >
                  0{i + 1}
                </span>
                <span
                  style={{ fontFamily: teen.font.sans, fontSize: 16, color: '#fff', lineHeight: 1.5 }}
                >
                  {line}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding: `0 ${teen.space.padLg} 34px` }}>
          <button className="teen-btn teen-btn--mint" onClick={handleDismissWelcome}>
            Let's go →
          </button>
        </div>
      </TeenScreen>
    )
  }

  // Hero: reporting a due experiment takes priority over starting a new one.
  const dueExperiment = readyToRecord[0] ?? null
  const heroTitle: string | null = dueExperiment
    ? (dueExperiment.plan_description ?? 'Your experiment')
    : (suggestedBehavior?.name ?? null)
  const heroMeta = dueExperiment
    ? dueExperiment.scheduled_date
      ? new Date(dueExperiment.scheduled_date).toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'short',
          day: 'numeric',
        })
      : 'Whenever you’re ready'
    : suggestedIndex >= 0
      ? `Step ${suggestedIndex + 1} of ${sortedBehaviors.length}`
      : null

  return (
    <TeenScreen bubbles>
      {/* header */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: `24px ${teen.space.pad} 0`,
          flex: 'none',
        }}
      >
        <span style={teen.type.wordmark}>float</span>
        <ChatButton unread={unreadMessageCount} onClick={() => navigate('/teen/messages')} />
      </div>

      <div
        style={{
          position: 'relative',
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── hero ── */}
        <div style={{ padding: `0 ${teen.space.pad}` }}>
          {situations.length === 0 ? (
            <div className="teen-card" style={{ marginTop: 30, padding: '24px 22px' }}>
              <p style={{ ...teen.type.body, margin: 0 }}>
                Your clinician hasn't set up your plan yet. Check back soon.
              </p>
            </div>
          ) : heroTitle ? (
            <>
              <div style={{ ...teen.type.eyebrow, color: teen.color.tealMid, marginTop: 30 }}>
                {dueExperiment ? 'Ready to report' : 'Approved experiment'}
              </div>

              <div className="teen-card" style={{ marginTop: 16, padding: '24px 22px' }}>
                {selectedSituation && (
                  <div
                    style={{
                      fontFamily: teen.font.mono,
                      fontSize: 11,
                      fontWeight: 600,
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                      color: teen.color.muted,
                    }}
                  >
                    For · {selectedSituation.name}
                  </div>
                )}
                <h2
                  style={{
                    ...teen.type.headline,
                    fontSize: teen.headSize.md,
                    margin: '14px 0 0',
                  }}
                >
                  {heroTitle}
                </h2>
                {heroMeta && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 20,
                      paddingTop: 18,
                      borderTop: `1px solid ${teen.color.line}`,
                      fontFamily: teen.font.sans,
                      fontSize: 13,
                      fontWeight: 600,
                      color: teen.color.tealMid,
                    }}
                  >
                    <span
                      aria-hidden="true"
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: teen.color.mint,
                      }}
                    />
                    {heroMeta}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 20 }}>
                <button
                  className="teen-btn teen-btn--primary"
                  onClick={() =>
                    dueExperiment
                      ? navigate(`/teen/record/${dueExperiment.id}`)
                      : suggestedBehavior && handleBehaviorTap(suggestedBehavior)
                  }
                >
                  {dueExperiment ? 'Tell me how it went →' : "I'm going to do it"}
                </button>
                <div style={{ textAlign: 'center', padding: '16px 0 0' }}>
                  <button
                    onClick={() => navigate('/teen/messages')}
                    style={{
                      background: 'none',
                      border: 0,
                      cursor: 'pointer',
                      fontFamily: teen.font.sans,
                      fontSize: 13,
                      fontWeight: 600,
                      color: teen.color.teal,
                    }}
                  >
                    Talk to float first
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="teen-card" style={{ marginTop: 30, padding: '24px 22px' }}>
              <div style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>Nice work</div>
              <p style={{ ...teen.type.body, marginTop: 12, marginBottom: 0 }}>
                You've worked through every step here. Your clinician will add more.
              </p>
            </div>
          )}
        </div>

        {/* ── jump warning ── */}
        {jumpWarning && (
          <div style={{ padding: `20px ${teen.space.pad} 0` }}>
            <div
              className="teen-card"
              style={{ padding: 18, boxShadow: teen.shadow.cardSoft }}
            >
              <p style={{ ...teen.type.body, fontSize: 14, margin: '0 0 12px' }}>
                That's a big jump from where you are. Your clinician suggested starting with{' '}
                <b style={{ color: teen.color.ink }}>{jumpWarning.suggestedName}</b>.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="teen-chip"
                  onClick={() => {
                    const id = jumpWarning.suggestedBehaviorId
                    setJumpWarning(null)
                    navigate(`/teen/experiment/${id}`)
                  }}
                >
                  Go to that one
                </button>
                <button
                  className="teen-chip"
                  onClick={() => {
                    const id = jumpWarning.targetBehaviorId
                    setJumpWarning(null)
                    navigate(`/teen/experiment/${id}`)
                  }}
                >
                  Start here anyway
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── the ladder ── */}
        {situations.length > 0 && (
          <div style={{ padding: `28px ${teen.space.pad} 0` }}>
            <div style={teen.type.eyebrow}>Your ladder</div>
            {showLadderHint && sortedBehaviors.length > 0 && (
              <p
                style={{
                  ...teen.type.body,
                  fontSize: 12,
                  color: teen.color.muted,
                  margin: '6px 0 0',
                }}
              >
                Easiest at the top. Tap any step to start it.
              </p>
            )}

            {situations.length > 1 && (
              <div
                style={{
                  display: 'flex',
                  gap: 7,
                  overflowX: 'auto',
                  margin: '12px 0 0',
                  paddingBottom: 4,
                }}
              >
                {situations.map(s => (
                  <button
                    key={s.id}
                    className="teen-chip"
                    aria-pressed={s.id === selectedSituationId}
                    style={{ flex: '0 0 auto', whiteSpace: 'nowrap' }}
                    onClick={() => setSelectedSituationId(s.id)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            )}

            <div
              style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {sortedBehaviors.map((behavior, i) => {
                const isCurrent = behavior.id === suggestedBehavior?.id
                const isMastered = behavior.status === 'mastered'
                return (
                  <button
                    key={behavior.id}
                    onClick={() => handleBehaviorTap(behavior)}
                    disabled={isMastered}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 15px',
                      borderRadius: teen.radius.btn,
                      background: teen.color.card,
                      border: `1px solid ${isCurrent ? teen.color.mint : teen.color.lineCard}`,
                      cursor: isMastered ? 'default' : 'pointer',
                      textAlign: 'left',
                      width: '100%',
                      opacity: isMastered ? 0.55 : 1,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: teen.font.mono,
                        fontSize: 11,
                        fontWeight: 700,
                        color: isCurrent ? teen.color.teal : teen.chart.label,
                        flex: 'none',
                        width: 18,
                      }}
                    >
                      {isMastered ? '✓' : `0${i + 1}`.slice(-2)}
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontFamily: teen.font.sans,
                          fontSize: 14,
                          fontWeight: 600,
                          color: teen.color.ink,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {behavior.name}
                      </span>
                      {isCurrent && (
                        <span
                          className="teen-pill teen-pill--progressing"
                          style={{ marginTop: 6 }}
                        >
                          suggested
                        </span>
                      )}
                    </span>
                    {behavior.dt != null && (
                      <span
                        style={{
                          fontFamily: teen.font.mono,
                          fontSize: 12,
                          color: teen.color.muted,
                          flex: 'none',
                        }}
                      >
                        {Math.round(behavior.dt)}/10
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── upcoming ── */}
        {upcomingExperiments.length > 0 && (
          <div style={{ padding: `28px ${teen.space.pad} 0` }}>
            <div style={teen.type.eyebrow}>Coming up</div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {upcomingExperiments.map((exp: any) => {
                const name = behaviorById[exp.avoidance_behavior_id]?.name ?? 'Experiment'
                const scheduled = exp.scheduled_date ? new Date(exp.scheduled_date) : null
                const dateLabel = scheduled
                  ? scheduled.toLocaleDateString('en-US', {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                    })
                  : 'Not scheduled'
                const times = readTimesPerDay(exp)
                return (
                  <button
                    key={exp.id}
                    onClick={() => {
                      if (!scheduled || scheduled <= endOfToday) {
                        navigate(`/teen/record/${exp.id}`)
                      } else {
                        setToastMessage(`That one's for ${dateLabel}`)
                        setTimeout(() => setToastMessage(null), 2500)
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 15px',
                      borderRadius: teen.radius.btn,
                      background: teen.color.card,
                      border: `1px solid ${teen.color.lineCard}`,
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontFamily: teen.font.sans,
                          fontSize: 14,
                          fontWeight: 600,
                          color: teen.color.ink,
                        }}
                      >
                        {name}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontFamily: teen.font.mono,
                          fontSize: 11,
                          color: teen.color.muted,
                          marginTop: 4,
                        }}
                      >
                        {dateLabel}
                        {times > 1 ? ` · ×${times}` : ''}
                      </span>
                    </span>
                    <span style={{ color: teen.color.chevron, flex: 'none' }}>›</span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ── quiet footer ── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 20,
            padding: `32px ${teen.space.pad} 34px`,
          }}
        >
          <button
            onClick={() => navigate('/teen/progress')}
            style={{
              background: 'none',
              border: 0,
              cursor: 'pointer',
              fontFamily: teen.font.sans,
              fontSize: 13,
              fontWeight: 600,
              color: teen.color.teal,
            }}
          >
            My progress
          </button>
          <button
            onClick={() => navigate('/teen/plans')}
            style={{
              background: 'none',
              border: 0,
              cursor: 'pointer',
              fontFamily: teen.font.sans,
              fontSize: 13,
              fontWeight: 600,
              color: teen.color.teal,
            }}
          >
            My plans
          </button>
          <button
            onClick={() => {
              logout()
              navigate('/teen/login')
            }}
            style={{
              background: 'none',
              border: 0,
              cursor: 'pointer',
              fontFamily: teen.font.sans,
              fontSize: 13,
              color: teen.color.muted,
            }}
          >
            Sign out
          </button>
        </div>
      </div>

      {toastMessage && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            background: teen.color.ink,
            color: '#fff',
            padding: '12px 20px',
            borderRadius: teen.radius.pill,
            fontFamily: teen.font.sans,
            fontSize: 13,
            fontWeight: 500,
            maxWidth: '90%',
            textAlign: 'center',
            zIndex: 100,
          }}
        >
          {toastMessage}
        </div>
      )}
    </TeenScreen>
  )
}
