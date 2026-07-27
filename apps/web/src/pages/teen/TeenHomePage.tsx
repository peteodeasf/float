import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTeenAuth } from '../../context/TeenAuthContext'
import { teenApiClient } from '../../api/client'
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
    refetchInterval: 30000,
  })
  const unreadMessageCount = (messages ?? []).filter(
    m => m.sender_user_id !== me?.user_id && !m.read_at
  ).length

  const situations: TeenSituation[] = ladderData?.situations ?? []
  // Only situations the clinician has set active are "experiments the teen can
  // do now". Inactive ones (built but not turned on) don't appear on the home;
  // the ladder already gates non-activated plans out entirely.
  const activeSituations = situations.filter(s => s.is_active)
  const firstName = me?.patient_name?.split(' ')[0] ?? ''

  useEffect(() => {
    if (!selectedSituationId && activeSituations.length > 0) {
      setSelectedSituationId(activeSituations[0].id)
    }
  }, [activeSituations, selectedSituationId])

  const selectedSituation = activeSituations.find(s => s.id === selectedSituationId)

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

  // ── Front-door routing ─────────────────────────────────────────────
  // One home screen, four states, picked automatically from the experiment
  // lifecycle + scheduled time — the teen never chooses "scheduling or
  // reporting". A locked-in experiment is 'committed' with a scheduled_date;
  // once reported it becomes 'completed' and drops out of the pending set. No
  // new status field is needed — the existing lifecycle already expresses this.
  const now = Date.now()
  const schedTime = (e: any) =>
    e.scheduled_date ? new Date(e.scheduled_date).getTime() : 0
  const committedExps = ((pendingExperiments ?? []) as any[])
    .filter(e => e.status === 'committed' && e.scheduled_date)
    .sort((a, b) => schedTime(a) - schedTime(b))
  const dueExps = committedExps.filter(e => schedTime(e) <= now) // State 3
  const futureExps = committedExps.filter(e => schedTime(e) > now) // State 2
  const dueExp = dueExps[0] ?? null
  const upcomingExp = futureExps[0] ?? null

  type HomeState = 'empty' | 'schedule' | 'pre' | 'report' | 'browse'
  const homeState: HomeState =
    activeSituations.length === 0 && committedExps.length === 0
      ? 'empty'
      : dueExp
        ? 'report' // State 3 — scheduled, time reached, not yet reported
        : upcomingExp
          ? 'pre' // State 2 — scheduled, still ahead
          : suggestedBehavior
            ? 'schedule' // State 1 — approved experiment, nothing committed
            : 'browse' // State 4 — nothing pending; progress / browse ladder

  const behaviorById: Record<string, TeenBehavior> = {}
  const situationNameByBehaviorId: Record<string, string> = {}
  for (const s of situations) {
    for (const b of s.behaviors) {
      behaviorById[b.id] = b
      situationNameByBehaviorId[b.id] = s.name
    }
  }

  // Display helpers for a committed experiment (used by the report + pre states).
  const expName = (e: any) =>
    e?.plan_description || behaviorById[e?.avoidance_behavior_id]?.name || 'Your experiment'
  const expSituation = (e: any) => situationNameByBehaviorId[e?.avoidance_behavior_id] ?? null
  const expWhen = (e: any) => {
    if (!e?.scheduled_date) return null
    const day = new Date(e.scheduled_date).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
    })
    const b: string | null = e.scheduled_time_bucket ?? null
    return b ? `${day} · ${b.charAt(0).toUpperCase()}${b.slice(1)}` : day
  }

  // State 2 lightens as the moment arrives: tips are prominent in the calmer
  // days before, then recede near the scheduled time so the "just before"
  // moment stays a get-out-of-the-way one. Provisional — flag for testing.
  const hoursUntil = upcomingExp ? (schedTime(upcomingExp) - now) / 3.6e6 : Infinity
  const nearMoment = hoursUntil <= 3

  // Teen-side JIT tips for the pre-exposure state. PROVISIONAL placeholder —
  // these should be sourced from the shared JIT education content model once it
  // exists (same content model scoped elsewhere), not authored here.
  const EXPOSURE_TIPS = [
    { t: 'The goal isn’t to feel calm', d: 'It’s to find out what actually happens when you don’t avoid it.' },
    { t: 'Anxiety comes down on its own', d: 'It rises, peaks, then fades — you don’t have to make it stop.' },
    { t: 'Skip the safety moves', d: 'Let yourself be in it without the little things you’d do to feel safer.' },
  ]

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
            {firstName ? `Hi ${firstName}, your` : 'Your'} clinician has invited you to use
            the Float platform.
          </h1>
        </div>

        <div style={{ padding: `0 ${teen.space.padLg} 34px` }}>
          <button className="teen-btn teen-btn--mint" onClick={handleDismissWelcome}>
            Let's go →
          </button>
        </div>
      </TeenScreen>
    )
  }

  // Shared bits of the primary "card" look, reused across the states.
  const forLabel = {
    fontFamily: teen.font.mono,
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
    color: teen.color.inkSoft,
  }
  const metaRow = {
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
  }
  // Teal, not mint: this dot sits on the white card, where mint is 1.26:1.
  const metaDot = { width: 7, height: 7, borderRadius: '50%' as const, background: teen.color.tealMid }

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
        {/* ── primary state — exactly one of the four ── */}
        <div style={{ padding: `0 ${teen.space.pad}` }}>
          {/* No active experiments at all */}
          {homeState === 'empty' && (
            <div style={{ marginTop: 30 }}>
              <div style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>Nothing yet</div>
              <div className="teen-card" style={{ marginTop: 16, padding: '24px 22px' }}>
                <h2 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: 0 }}>
                  You have no active experiments yet.
                </h2>
                <p style={{ ...teen.type.body, margin: '12px 0 0' }}>
                  Your clinician will set these up with you. Reach out with any questions in
                  the meantime.
                </p>
              </div>
              <div style={{ marginTop: 20 }}>
                <button className="teen-btn teen-btn--primary" onClick={() => navigate('/teen/messages')}>
                  Message your clinician
                </button>
              </div>
            </div>
          )}

          {/* State 3 — scheduled time has arrived: tell me how it went */}
          {homeState === 'report' && dueExp && (
            <>
              <div style={{ ...teen.type.eyebrow, color: teen.color.tealMid, marginTop: 30 }}>
                Ready to report
              </div>
              <div className="teen-card" style={{ marginTop: 16, padding: '24px 22px' }}>
                {expSituation(dueExp) && <div style={forLabel}>For · {expSituation(dueExp)}</div>}
                <h2 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: '14px 0 0' }}>
                  {expName(dueExp)}
                </h2>
                {expWhen(dueExp) && (
                  <div style={metaRow}>
                    <span aria-hidden="true" style={metaDot} />
                    {expWhen(dueExp)}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 20 }}>
                <button
                  className="teen-btn teen-btn--primary"
                  onClick={() => navigate(`/teen/record/${dueExp.id}`)}
                >
                  Tell me how it went →
                </button>
              </div>
            </>
          )}

          {/* State 2 — scheduled, still ahead: pre-exposure check-in. Reminders
              deep-link here. Tips recede as the moment gets close. */}
          {homeState === 'pre' && upcomingExp && (
            <>
              <div style={{ ...teen.type.eyebrow, color: teen.color.tealMid, marginTop: 30 }}>
                Coming up
              </div>
              <div className="teen-card" style={{ marginTop: 16, padding: '24px 22px' }}>
                {expSituation(upcomingExp) && (
                  <div style={forLabel}>For · {expSituation(upcomingExp)}</div>
                )}
                <h2 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: '14px 0 0' }}>
                  {expName(upcomingExp)}
                </h2>
                {expWhen(upcomingExp) && (
                  <div style={metaRow}>
                    <span aria-hidden="true" style={metaDot} />
                    {expWhen(upcomingExp)}
                  </div>
                )}
              </div>

              {nearMoment ? (
                <p style={{ ...teen.type.body, color: teen.color.mutedQuiet, marginTop: 20 }}>
                  It’s almost time. You know the plan — you’ve got this. When it’s done, come
                  back and tell me how it went.
                </p>
              ) : (
                <div style={{ marginTop: 24 }}>
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
                        <div
                          style={{
                            ...teen.type.body,
                            fontSize: 13,
                            color: teen.color.muted,
                            marginTop: 4,
                          }}
                        >
                          {tip.d}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* State 1 — approved experiment, nothing committed: schedule + commit */}
          {homeState === 'schedule' && suggestedBehavior && (
            <>
              <div style={{ ...teen.type.eyebrow, color: teen.color.tealMid, marginTop: 30 }}>
                Approved experiment
              </div>
              <div className="teen-card" style={{ marginTop: 16, padding: '24px 22px' }}>
                {selectedSituation && <div style={forLabel}>For · {selectedSituation.name}</div>}
                <h2 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: '14px 0 0' }}>
                  {suggestedBehavior.name}
                </h2>
                {suggestedIndex >= 0 && (
                  <div style={metaRow}>
                    <span aria-hidden="true" style={metaDot} />
                    Step {suggestedIndex + 1} of {sortedBehaviors.length}
                  </div>
                )}
              </div>
              <div style={{ marginTop: 20 }}>
                <button
                  className="teen-btn teen-btn--primary"
                  onClick={() => handleBehaviorTap(suggestedBehavior)}
                >
                  I'm going to do it
                </button>
              </div>
            </>
          )}

          {/* State 4 — nothing pending: browse / progress */}
          {homeState === 'browse' && (
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

        {/* ── the ladder — only in the schedule/browse states ── */}
        {(homeState === 'schedule' || homeState === 'browse') && activeSituations.length > 0 && (
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

            {activeSituations.length > 1 && (
              <div
                style={{
                  display: 'flex',
                  gap: 7,
                  overflowX: 'auto',
                  margin: '12px 0 0',
                  paddingBottom: 4,
                }}
              >
                {activeSituations.map(s => (
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

        {/* ── Scheduled — the teen's upcoming commitments. Home is a hub, not a
            "today" screen, so it always shows the schedule when there's more
            than the one already in focus above. ── */}
        {committedExps.length > 1 && (
          <div style={{ padding: `28px ${teen.space.pad} 0` }}>
            <div style={teen.type.eyebrow}>Scheduled</div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {committedExps.map((exp: any) => {
                const isDue = schedTime(exp) <= now
                const isFocus = exp.id === (dueExp?.id ?? upcomingExp?.id)
                const tag = isFocus ? (isDue ? 'Now' : 'Next') : isDue ? 'Ready' : null
                return (
                  <button
                    key={exp.id}
                    onClick={() => {
                      if (isDue) {
                        navigate(`/teen/record/${exp.id}`)
                      } else {
                        setToastMessage(`That one's for ${expWhen(exp) ?? 'later'}`)
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
                      border: `1px solid ${isFocus ? teen.color.mint : teen.color.lineCard}`,
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
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {expName(exp)}
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
                        {expWhen(exp) ?? 'Not scheduled'}
                      </span>
                    </span>
                    {tag && (
                      <span
                        style={{
                          fontFamily: teen.font.mono,
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          padding: '3px 8px',
                          borderRadius: teen.radius.pill,
                          flex: 'none',
                          background: isDue ? teen.color.mintSoft : teen.color.card,
                          color: isDue ? teen.color.teal : teen.color.muted,
                          border: isDue ? 'none' : `1px solid ${teen.color.lineCard}`,
                        }}
                      >
                        {tag}
                      </span>
                    )}
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
            // Push to the bottom of the scroll area so the nav holds its
            // position even when the page content is short (empty state).
            marginTop: 'auto',
            display: 'flex',
            justifyContent: 'center',
            gap: 20,
            padding: `32px ${teen.space.pad} 34px`,
          }}
        >
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
            Chat{unreadMessageCount > 0 ? ` (${unreadMessageCount})` : ''}
          </button>
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
