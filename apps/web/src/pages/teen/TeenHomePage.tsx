import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTeenAuth } from '../../context/TeenAuthContext'
import { teenApiClient } from '../../api/client'
import TeenScreen from '../../components/teen/TeenScreen'
import TeenTabBar from '../../components/teen/TeenTabBar'
import FloatLogo from '../../components/ui/FloatLogo'
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

export default function TeenHomePage() {
  const { patientId } = useTeenAuth()
  const navigate = useNavigate()
  const [selectedSituationId, setSelectedSituationId] = useState<string | null>(null)
  const [selectedBehaviorId, setSelectedBehaviorId] = useState<string | null>(null)
  const [jumpWarning, setJumpWarning] = useState<{
    targetBehaviorId: string
    suggestedBehaviorId: string
    suggestedName: string
  } | null>(null)
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
  // do now". Inactive ones (built but not turned on) don't appear on the home.
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

  // The step previewed in the "set up an experiment" card. Defaults to the
  // suggested next step; tapping a ladder step selects it (updates the card,
  // no navigation). Falls back to the suggested step when the current
  // selection isn't in the active situation.
  const previewBehavior =
    sortedBehaviors.find(b => b.id === selectedBehaviorId && b.status !== 'mastered') ??
    suggestedBehavior

  // ── What the home shows ────────────────────────────────────────────
  // The home is a persistent dashboard, not a single flipping state: what's
  // coming up + everything scheduled, plus a way to start a new experiment. A
  // locked-in experiment is 'committed' with a scheduled_date; once reported it
  // becomes 'completed' and drops out of the pending set. Tapping a scheduled
  // item opens its own exposure screen — the home never becomes a report form.
  const now = Date.now()
  const schedTime = (e: any) =>
    e.scheduled_date ? new Date(e.scheduled_date).getTime() : 0
  // A committed experiment only counts if its situation is still active. When
  // the clinician deactivates a situation, its experiments drop off the home —
  // deactivate all of them and the teen sees the empty state.
  const activeBehaviorIds = new Set<string>()
  for (const s of activeSituations) {
    for (const b of s.behaviors) activeBehaviorIds.add(b.id)
  }
  const committedExps = ((pendingExperiments ?? []) as any[])
    .filter(
      e =>
        e.status === 'committed' &&
        e.scheduled_date &&
        activeBehaviorIds.has(e.avoidance_behavior_id)
    )
    .sort((a, b) => schedTime(a) - schedTime(b))
  const comingUp = committedExps[0] ?? null // soonest — the hero
  const scheduledRest = committedExps.slice(1) // everything after it

  const behaviorById: Record<string, TeenBehavior> = {}
  const situationNameByBehaviorId: Record<string, string> = {}
  for (const s of situations) {
    for (const b of s.behaviors) {
      behaviorById[b.id] = b
      situationNameByBehaviorId[b.id] = s.name
    }
  }

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

  const hasCommitted = committedExps.length > 0
  const hasLadder = !!suggestedBehavior
  const isEmpty = activeSituations.length === 0 && !hasCommitted

  const dismissLadderHint = () => {
    if (patientId) localStorage.setItem(`float_ladder_hint_dismissed_${patientId}`, '1')
    setShowLadderHint(false)
  }

  // Tapping a ladder step just selects it — the top card updates, no navigation.
  const selectBehavior = (behavior: TeenBehavior) => {
    if (behavior.status === 'mastered') return
    dismissLadderHint()
    setSelectedBehaviorId(behavior.id)
  }

  // Only "Set it up" navigates. A big jump from the suggested step is gated
  // behind the clinician's suggestion first.
  const handleSetItUp = () => {
    const b = previewBehavior
    if (!b) return
    dismissLadderHint()
    if (
      suggestedBehavior &&
      b.id !== suggestedBehavior.id &&
      b.dt != null &&
      suggestedBehavior.dt != null &&
      b.dt - suggestedBehavior.dt > 2
    ) {
      setJumpWarning({
        targetBehaviorId: b.id,
        suggestedBehaviorId: suggestedBehavior.id,
        suggestedName: suggestedBehavior.name,
      })
      return
    }
    navigate(`/teen/experiment/${b.id}`)
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

  // Shared bits of the primary "card" look.
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
        <FloatLogo size="md" />
      </div>

      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div style={{ padding: `0 ${teen.space.pad}` }}>
          {/* No active experiments at all */}
          {isEmpty && (
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
                <button
                  className="teen-btn teen-btn--primary"
                  onClick={() => navigate('/teen/messages')}
                >
                  Message your clinician
                </button>
              </div>
            </div>
          )}

          {/* Coming up — the soonest commitment; tap to open its exposure screen */}
          {comingUp &&
            (() => {
              const due = schedTime(comingUp) <= now
              return (
                <>
                  <div style={{ ...teen.type.eyebrow, color: teen.color.tealMid, marginTop: 30 }}>
                    Next experiment
                  </div>
                  <button
                    className="teen-card"
                    onClick={() => navigate(`/teen/exposure/${comingUp.id}`)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      border: 0,
                      cursor: 'pointer',
                      marginTop: 16,
                      padding: '24px 22px',
                    }}
                  >
                    {expSituation(comingUp) && (
                      <div style={forLabel}>For · {expSituation(comingUp)}</div>
                    )}
                    <h2
                      style={{
                        ...teen.type.headline,
                        fontSize: teen.headSize.md,
                        margin: '14px 0 0',
                      }}
                    >
                      {expName(comingUp)}
                    </h2>
                    <div style={metaRow}>
                      <span aria-hidden="true" style={metaDot} />
                      {due ? 'Ready now' : expWhen(comingUp)}
                      <span style={{ marginLeft: 'auto', color: teen.color.chevron }}>›</span>
                    </div>
                  </button>
                </>
              )
            })()}

          {/* Scheduled — everything after the soonest one */}
          {scheduledRest.length > 0 && (
            <div style={{ marginTop: 28 }}>
              <div style={teen.type.eyebrow}>Scheduled experiments</div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {scheduledRest.map((exp: any) => {
                  const due = schedTime(exp) <= now
                  return (
                    <button
                      key={exp.id}
                      onClick={() => navigate(`/teen/exposure/${exp.id}`)}
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
                      {due && (
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
                            background: teen.color.mintSoft,
                            color: teen.color.teal,
                          }}
                        >
                          Ready
                        </span>
                      )}
                      <span style={{ color: teen.color.chevron, flex: 'none' }}>›</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Set up an experiment — a preview of the currently-selected step.
              Pick a situation + step from the ladder below to change it. */}
          {hasLadder && previewBehavior && (
            <div style={{ marginTop: 30 }}>
              <div style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>
                {hasCommitted ? 'Set up another experiment' : 'Set up an experiment'}
              </div>
              <div className="teen-card" style={{ marginTop: 14, padding: '22px' }}>
                {selectedSituation && <div style={forLabel}>For · {selectedSituation.name}</div>}
                <h2
                  style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: '14px 0 0' }}
                >
                  {previewBehavior.name}
                </h2>
                {previewBehavior.dt != null && (
                  <div style={metaRow}>
                    <span aria-hidden="true" style={metaDot} />
                    Feels about {Math.round(previewBehavior.dt)}/10
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Nothing pending and nothing left to start */}
          {!isEmpty && !hasCommitted && !hasLadder && (
            <div className="teen-card" style={{ marginTop: 30, padding: '24px 22px' }}>
              <div style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>Nice work</div>
              <p style={{ ...teen.type.body, marginTop: 12, marginBottom: 0 }}>
                You've worked through every step here. Your clinician will add more.
              </p>
            </div>
          )}
        </div>

        {/* ── the ladder — pick which step to set up ── */}
        {hasLadder && activeSituations.length > 0 && (
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
                Easiest at the top. Tap a step to pick it.
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

            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sortedBehaviors.map((behavior, i) => {
                const isSuggested = behavior.id === suggestedBehavior?.id
                const isSelected = behavior.id === previewBehavior?.id
                const isMastered = behavior.status === 'mastered'
                return (
                  <button
                    key={behavior.id}
                    onClick={() => selectBehavior(behavior)}
                    disabled={isMastered}
                    aria-pressed={isSelected}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '14px 15px',
                      borderRadius: teen.radius.btn,
                      background: isSelected ? teen.color.mintSoft : teen.color.card,
                      border: `1px solid ${isSelected ? teen.color.mint : teen.color.lineCard}`,
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
                        color: isSelected ? teen.color.teal : teen.chart.label,
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
                      {isSuggested && (
                        <span className="teen-pill teen-pill--progressing" style={{ marginTop: 6 }}>
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

        {/* ── set it up — the only thing that navigates to the setup screen ── */}
        {hasLadder && previewBehavior && (
          <div style={{ padding: `24px ${teen.space.pad} 0` }}>
            {jumpWarning && (
              <div
                className="teen-card"
                style={{ padding: 18, marginBottom: 14, boxShadow: teen.shadow.cardSoft }}
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
                    Set up that one
                  </button>
                  <button
                    className="teen-chip"
                    onClick={() => {
                      const id = jumpWarning.targetBehaviorId
                      setJumpWarning(null)
                      navigate(`/teen/experiment/${id}`)
                    }}
                  >
                    Set up this one anyway
                  </button>
                </div>
              </div>
            )}
            <button className="teen-btn teen-btn--primary" onClick={handleSetItUp}>
              Set it up
            </button>
          </div>
        )}

        <div style={{ height: 28, flex: 'none' }} />
      </div>

      <TeenTabBar active="home" unread={unreadMessageCount} />
    </TeenScreen>
  )
}
