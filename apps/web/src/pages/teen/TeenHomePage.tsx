import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTeenAuth } from '../../context/TeenAuthContext'
import { teenApiClient } from '../../api/client'
import TeenScreen from '../../components/teen/TeenScreen'
import TeenTabBar from '../../components/teen/TeenTabBar'
import TodayCard from '../../components/teen/TodayCard'
import FloatLogo from '../../components/ui/FloatLogo'
import teen from '../../styles/teenTokens'
import {
  dueToday,
  stepState,
  waitingCount,
  whenLabel,
  type LadderRung,
  type PendingExperiment,
  type StepState,
} from '../../lib/teenWork'

type TeenSituation = {
  id: string
  name: string
  behaviors: Array<{ id: string; name: string }>
}

/**
 * The child's home is their ladder. Peter, 2026-09-10: "we should show the ladder and allow them to
 * select from the ladder to set it up. we want to highlight any exposures that have been set up."
 *
 * Each step shows its own state — done, set up for a day, set up with the clinician and waiting on
 * them, or not set up — and tapping it does the next thing for that state. What they're working on
 * is listed on Progress; the home only lifts out what is due today.
 *
 * Plan: docs/plans/teen-home-ladder-and-session-setup.md
 */
export default function TeenHomePage() {
  const { patientId, logout } = useTeenAuth()
  const navigate = useNavigate()
  const [jumpWarning, setJumpWarning] = useState<{
    targetId: string
    suggestedId: string
    suggestedName: string
  } | null>(null)
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => {
    if (!patientId) return
    if (!localStorage.getItem(`float_onboarded_${patientId}`)) setShowWelcome(true)
  }, [patientId])

  const handleDismissWelcome = () => {
    if (patientId) localStorage.setItem(`float_onboarded_${patientId}`, '1')
    setShowWelcome(false)
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
  const firstName = me?.patient_name?.split(' ')[0] ?? ''

  // One ladder, easiest first, already ordered by the server. Nothing comes back until the
  // clinician has turned the ladder on, and that is all or nothing (Peter, 2026-09-01).
  const rungs: LadderRung[] = ladderData?.rungs ?? []

  // The switch is the only gate on committed work too. What they agreed to do does not depend on
  // how its step is typed — it depends on whether their clinician has this switched on.
  const ladderOn = ladderData?.plan?.ladder_active !== false
  const pending: PendingExperiment[] = ladderOn ? pendingExperiments ?? [] : []
  const now = new Date()
  const today = dueToday(pending, now)

  // Names for exposures whose step is not on the ladder — steps from before the ladder change.
  const nameById: Record<string, string> = {}
  const situationById: Record<string, string> = {}
  for (const s of situations) {
    for (const b of s.behaviors ?? []) {
      nameById[b.id] = b.name
      situationById[b.id] = s.name
    }
  }
  const expName = (e: PendingExperiment) =>
    e.plan_description || (e.avoidance_behavior_id ? nameById[e.avoidance_behavior_id] : '') || 'Your experiment'
  const expSituation = (e: PendingExperiment) =>
    (e.avoidance_behavior_id && situationById[e.avoidance_behavior_id]) || null

  // What their clinician suggests next, or else the easiest step not done — the yardstick for
  // "that's a big jump".
  const recommended = rungs.find(r => r.is_recommended && r.status !== 'mastered') ?? null
  const yardstick = recommended ?? rungs.find(r => r.status !== 'mastered') ?? null

  const isEmpty = rungs.length === 0 && pending.length === 0
  // Turned off by the clinician, as opposed to never set up. `situations` is not gated by the
  // switch, so it still says whether a ladder was ever built. Peter, 2026-09-01.
  const ladderTurnedOff = !ladderOn && situations.length > 0
  const allDone = rungs.length > 0 && rungs.every(r => r.status === 'mastered') && pending.length === 0

  const openSetup = (rung: LadderRung) => {
    if (
      yardstick &&
      rung.id !== yardstick.id &&
      rung.dt != null &&
      yardstick.dt != null &&
      rung.dt - yardstick.dt > 2
    ) {
      setJumpWarning({ targetId: rung.id, suggestedId: yardstick.id, suggestedName: yardstick.name })
      return
    }
    navigate(`/teen/experiment/${rung.id}`)
  }

  // Tapping a step does the next thing for where it has got to.
  const tapStep = (rung: LadderRung, state: StepState) => {
    if (state.kind === 'done') return
    if (state.kind === 'setup' && state.exp) return navigate(`/teen/exposure/${state.exp.id}`)
    if (state.kind === 'started' && state.exp) {
      return navigate(`/teen/experiment/${rung.id}?experiment=${state.exp.id}`)
    }
    openSetup(rung)
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
        <button
          onClick={() => {
            logout()
            navigate('/teen/login')
          }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            padding: '8px 4px',
            margin: '-8px -4px',
            background: 'none',
            border: 0,
            cursor: 'pointer',
            fontFamily: teen.font.sans,
            fontSize: 13,
            fontWeight: 600,
            color: teen.color.textSecondary,
          }}
        >
          Sign out
        </button>
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
          {/* Nothing on the ladder and nothing pending */}
          {isEmpty && (
            <div style={{ marginTop: 30 }}>
              <div style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>
                {ladderTurnedOff ? 'Paused for now' : 'Ready when you are'}
              </div>
              <div className="teen-card" style={{ marginTop: 16, padding: '24px 22px' }}>
                <h2 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: 0 }}>
                  {ladderTurnedOff
                    ? 'Your steps are turned off right now.'
                    : "You're just getting started."}
                </h2>
                <p style={{ ...teen.type.body, margin: '12px 0 0' }}>
                  {ladderTurnedOff
                    ? "Your clinician has switched this off for the moment, so there is nothing to do here. Anything you had planned is on hold, not gone. Message them if you're not sure why."
                    : "You and your clinician will set up your first steps together — small, doable challenges that build real confidence. Each one you try makes the next a little easier. You've got this."}
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

          {/* Due today — the only exposure the home lifts out of the list. Everything else they
              are working on is on Progress. */}
          {today.length > 0 && (
            <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {today.map(e => (
                <TodayCard
                  key={e.id}
                  when={whenLabel(e, now)}
                  name={expName(e)}
                  situation={expSituation(e)}
                  onDoItNow={() => navigate(`/teen/exposure/${e.id}?now=1`)}
                  onTellMe={() => navigate(`/teen/record/${e.id}`)}
                />
              ))}
            </div>
          )}

          {allDone && (
            <div className="teen-card" style={{ marginTop: 30, padding: '24px 22px' }}>
              <div style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>Nice work</div>
              <p style={{ ...teen.type.body, marginTop: 12, marginBottom: 0 }}>
                You've worked through every step here. Your clinician will add more.
              </p>
            </div>
          )}
        </div>

        {/* ── the ladder — each step shows where it's at, and tapping it is the next thing ── */}
        {rungs.length > 0 && (
          <div style={{ padding: `28px ${teen.space.pad} 0` }}>
            <div style={teen.type.eyebrow}>Your ladder</div>
            <p
              style={{
                ...teen.type.body,
                fontSize: 13,
                color: teen.color.textSecondary,
                margin: '6px 0 0',
              }}
            >
              Tap a rung on the ladder to set up an exposure.
            </p>

            {jumpWarning && (
              <div
                className="teen-card"
                style={{ padding: 18, marginTop: 14, boxShadow: teen.shadow.cardSoft }}
              >
                <p style={{ ...teen.type.body, fontSize: 14, margin: '0 0 12px' }}>
                  That's a big jump from where you are. Your clinician suggested starting with{' '}
                  <b style={{ color: teen.color.ink }}>{jumpWarning.suggestedName}</b>.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <button
                    className="teen-btn teen-btn--primary"
                    onClick={() => {
                      const id = jumpWarning.suggestedId
                      setJumpWarning(null)
                      navigate(`/teen/experiment/${id}`)
                    }}
                  >
                    Set up that one
                  </button>
                  <button
                    className="teen-btn teen-btn--outline"
                    onClick={() => {
                      const id = jumpWarning.targetId
                      setJumpWarning(null)
                      navigate(`/teen/experiment/${id}`)
                    }}
                  >
                    Set up this one anyway
                  </button>
                </div>
              </div>
            )}

            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rungs.map(rung => (
                <LadderStep
                  key={rung.id}
                  rung={rung}
                  state={stepState(rung, pending)}
                  now={now}
                  onTap={tapStep}
                />
              ))}
            </div>
          </div>
        )}

        <div style={{ height: 28, flex: 'none' }} />
      </div>

      <TeenTabBar
        active="home"
        unread={unreadMessageCount}
        progressDot={waitingCount(pending, now) > 0}
      />
    </TeenScreen>
  )
}

/**
 * One step. Every row has the same two columns on the right — the Fear Level, then either a chevron
 * or a tick — so the numbers line up down the ladder.
 */
function LadderStep({
  rung,
  state,
  now,
  onTap,
}: {
  rung: LadderRung
  state: StepState
  now: Date
  onTap: (rung: LadderRung, state: StepState) => void
}) {
  const done = state.kind === 'done'
  const border =
    state.kind === 'setup'
      ? `1.5px solid ${teen.color.mintDeep}`
      : state.kind === 'started'
        ? `1.5px dashed ${teen.color.tealMid}`
        : `1.5px solid ${done ? teen.color.line : teen.color.lineCard}`
  const chip = (bg: string, fg: string, line?: string): React.CSSProperties => ({
    alignSelf: 'flex-start',
    marginTop: 4,
    fontFamily: teen.font.sans,
    fontSize: 12,
    fontWeight: 700,
    borderRadius: 999,
    padding: '3px 9px',
    whiteSpace: 'nowrap',
    background: bg,
    color: fg,
    border: line ? `1px solid ${line}` : undefined,
  })

  return (
    <button
      onClick={() => onTap(rung, state)}
      disabled={done}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 15px',
        borderRadius: teen.radius.btn,
        background: state.kind === 'setup' ? teen.color.mintSoft : done ? 'transparent' : teen.color.card,
        border,
        cursor: done ? 'default' : 'pointer',
        textAlign: 'left',
        width: '100%',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            fontFamily: teen.font.sans,
            fontSize: 14,
            fontWeight: done ? 600 : 700,
            color: done ? teen.color.textTertiary : teen.color.ink,
          }}
        >
          {rung.name}
        </span>
        {rung.situation_name && (
          <span style={{ fontFamily: teen.font.sans, fontSize: 12, color: teen.color.textSecondary }}>
            {rung.situation_name}
          </span>
        )}
        {state.kind === 'setup' && state.exp && (
          <span style={chip(teen.color.ink, '#fff')}>{whenLabel(state.exp, now)}</span>
        )}
        {state.kind === 'started' && (
          <>
            <span style={chip('#fff', teen.color.teal, teen.color.tealMid)}>
              Set up with your clinician
            </span>
            <span
              style={{ fontFamily: teen.font.sans, fontSize: 13, fontWeight: 700, color: teen.color.teal, marginTop: 2 }}
            >
              {state.exp?.scheduled_date ? 'Finish setting it up' : "Pick when you'll do it"}
            </span>
          </>
        )}
        {/* The clinician's suggestion. It came from a person, so it says so; the app no longer
            puts its own guess on a step. */}
        {rung.is_recommended && (state.kind === 'open' || state.kind === 'started') && (
          <span style={chip(teen.color.mint, teen.color.ink)}>Do this next</span>
        )}
        {state.kind === 'open' && state.timesDone > 0 && (
          <span style={{ fontFamily: teen.font.sans, fontSize: 12, color: teen.color.textSecondary, marginTop: 2 }}>
            Done {state.timesDone === 1 ? 'once' : `${state.timesDone} times`}
          </span>
        )}
      </span>

      <span
        style={{
          width: 42,
          flex: 'none',
          textAlign: 'right',
          fontFamily: teen.font.sans,
          fontSize: 15,
          fontWeight: 700,
          color: done ? teen.color.textTertiary : teen.color.teal,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {rung.dt != null ? `${Math.round(rung.dt)}/10` : ''}
      </span>
      {done ? (
        <span
          aria-label="Done"
          style={{
            width: 22,
            height: 22,
            flex: 'none',
            borderRadius: '50%',
            background: teen.color.mintDeep,
            color: teen.color.ink,
            fontSize: 13,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          ✓
        </span>
      ) : (
        <span aria-hidden="true" style={{ width: 22, flex: 'none', textAlign: 'center', color: teen.color.chevron, fontSize: 20, lineHeight: 1 }}>
          ›
        </span>
      )}
    </button>
  )
}
