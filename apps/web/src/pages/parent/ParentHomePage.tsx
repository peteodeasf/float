import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParentAuth } from '../../context/ParentAuthContext'
import { parentApiClient } from '../../api/client'
import TeenScreen from '../../components/teen/TeenScreen'
import ParentTabBar from '../../components/parent/ParentTabBar'
import teen from '../../styles/teenTokens'
import {
  getUpcomingExposures,
  getChildProgress,
  getParentAccommodations,
  getSituationTips,
  getMyCheckins,
  saveCheckin,
  type UpcomingExposure,
} from '../../api/parent'
import { CHECKIN_ANSWERS, answerInfo, weekStartOf, type CheckinAnswer } from '../../lib/checkin'

function whenLabel(e: UpcomingExposure): string {
  if (!e.scheduled_date) return 'Not scheduled'
  const day = new Date(e.scheduled_date).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
  const b = e.scheduled_time_bucket
  return b ? `${day} · ${b.charAt(0).toUpperCase()}${b.slice(1)}` : day
}

/** Parent-audience situational tips for one situation, fetched on demand. */
function TipsList({ situationId }: { situationId: string }) {
  const { data: tips = [], isLoading } = useQuery({
    queryKey: ['parent-tips', situationId],
    queryFn: () => getSituationTips(situationId),
  })
  const hint: React.CSSProperties = {
    ...teen.type.body,
    fontSize: 13,
    color: teen.color.textSecondary,
    margin: '8px 0 0',
  }
  if (isLoading) return <p style={hint}>Loading tips…</p>
  if (tips.length === 0) return <p style={hint}>No tips for this one yet.</p>
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {tips.map(t => (
        <div key={t.id} className="teen-card" style={{ padding: '12px 14px' }}>
          <div style={{ fontFamily: teen.font.sans, fontSize: 14, fontWeight: 600, color: teen.color.ink }}>
            {t.title}
          </div>
          <div style={{ ...teen.type.body, fontSize: 13, color: teen.color.inkSoft, marginTop: 3 }}>
            {t.body}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function ParentHomePage() {
  const { logout } = useParentAuth()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [openSituation, setOpenSituation] = useState<string | null>(null)
  const [changing, setChanging] = useState(false)

  const { data: me } = useQuery({
    queryKey: ['parent-me'],
    queryFn: async () => (await parentApiClient.get('/auth/me')).data,
  })
  const childName: string = me?.patient_name?.split(' ')[0] ?? 'your child'

  const { data: exposures = [] } = useQuery({
    queryKey: ['parent-upcoming'],
    queryFn: getUpcomingExposures,
  })
  // Whether the clinician has switched on sharing the child's progress. Off, the week below is
  // empty because nothing is shared, not because nothing is planned — so it says that instead.
  const { data: progress } = useQuery({ queryKey: ['parent-progress'], queryFn: getChildProgress })
  const { data: accommodations = [] } = useQuery({
    queryKey: ['parent-accommodations'],
    queryFn: getParentAccommodations,
  })

  const focus = accommodations.find(a => a.is_weekly_focus) ?? null
  const others = accommodations.filter(a => !a.is_weekly_focus)

  // Once a week, one question about the focus. Peter, 2026-09-10: it replaces logging each moment.
  // docs/plans/weekly-checkin.md
  const thisWeek = weekStartOf(new Date())
  const { data: checkins = [] } = useQuery({ queryKey: ['parent-checkins'], queryFn: getMyCheckins })
  const answered = focus
    ? checkins.find(c => c.accommodation_id === focus.id && c.week_start === thisWeek) ?? null
    : null
  const checkinMut = useMutation({
    mutationFn: (answer: CheckinAnswer) =>
      saveCheckin({ accommodation_id: focus!.id, answer, week_start: thisWeek }),
    onSuccess: () => {
      setChanging(false)
      qc.invalidateQueries({ queryKey: ['parent-checkins'] })
    },
  })

  return (
    <TeenScreen bubbles>
      {/* header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: `24px ${teen.space.pad} 0`,
          flex: 'none',
        }}
      >
        <span style={teen.type.wordmark}>float</span>
        <button
          onClick={() => {
            logout()
            navigate('/parent/login')
          }}
          style={{
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
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: `0 ${teen.space.pad}`,
        }}
      >
        {/* This week's focus */}
        <div style={{ ...teen.type.eyebrow, marginTop: 12 }}>This week's focus</div>
        {focus ? (
          <div className="teen-card" style={{ marginTop: 14, padding: 22 }}>
            <h1 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: 0 }}>{focus.name}</h1>
            <p style={{ ...teen.type.body, fontSize: 15, color: teen.color.inkSoft, marginTop: 6 }}>
              When it comes up, try not to step in. {childName} may be distressed — that's the work.
            </p>
            {/* Only there when the clinician has chosen to show the child's rating. */}
            {focus.child_rating_min != null && (
              <p style={{ ...teen.type.body, fontSize: 14, color: teen.color.textSecondary, marginTop: 6 }}>
                {childName} said stopping would be a {focus.child_rating_min === focus.child_rating_max
                  ? focus.child_rating_min
                  : `${focus.child_rating_min}–${focus.child_rating_max}`}.
              </p>
            )}

            {/* This week's check-in: once a week, one question, instead of logging each moment. */}
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${teen.color.line}` }}>
              {answered && !changing ? (
                <p style={{ ...teen.type.body, fontSize: 14, color: teen.color.teal, margin: 0 }}>
                  {answerInfo(answered.answer)?.summary} Your clinician will see it.{' '}
                  <button
                    onClick={() => setChanging(true)}
                    style={{ background: 'none', border: 0, color: teen.color.tealMid, fontWeight: 600, cursor: 'pointer', fontFamily: teen.font.sans, fontSize: 14, padding: 0 }}
                  >
                    Change
                  </button>
                </p>
              ) : (
                <>
                  <div style={{ fontFamily: teen.font.sans, fontSize: 14, fontWeight: 600, color: teen.color.ink, marginBottom: 10 }}>
                    This week, did you hold the line?
                  </div>
                  {/* Equal weight on purpose, like the child's "did it happen?" answers: no answer
                      is the right one to tap. */}
                  <div style={{ display: 'flex', gap: 8 }}>
                    {CHECKIN_ANSWERS.map(a => (
                      <button
                        key={a.key}
                        className="teen-btn teen-btn--outline"
                        style={{ flex: 1, paddingLeft: 6, paddingRight: 6 }}
                        aria-pressed={answered?.answer === a.key}
                        disabled={checkinMut.isPending}
                        onClick={() => checkinMut.mutate(a.key)}
                      >
                        {a.parentLabel}
                      </button>
                    ))}
                  </div>
                  {checkinMut.isError && (
                    <p role="alert" style={{ ...teen.type.body, fontSize: 13, color: '#b91c1c', margin: '8px 0 0' }}>
                      That didn't save. Please try again.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* how to support (tips for the focus situation) */}
            {focus.trigger_situation_id && (
              <div style={{ marginTop: 18 }}>
                <div style={teen.type.eyebrow}>How to support {childName}</div>
                <TipsList situationId={focus.trigger_situation_id} />
              </div>
            )}
          </div>
        ) : (
          <div className="teen-card" style={{ marginTop: 14, padding: 22 }}>
            <p style={{ ...teen.type.body, margin: 0 }}>
              Your clinician hasn't set a focus for this week yet. You'll see it here when they do.
            </p>
          </div>
        )}

        {/* The parent's half of the accommodation conversation. docs/plans/accommodation-conversation.md */}
        <div className="teen-card" style={{ marginTop: 16, padding: '18px 20px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: teen.font.sans, fontSize: 15, fontWeight: 700, color: teen.color.ink }}>
              What do you do when {childName} is anxious?
            </div>
            <div style={{ ...teen.type.body, fontSize: 13, color: teen.color.textSecondary, marginTop: 2 }}>
              Go through it one situation at a time.
            </div>
          </div>
          <button className="teen-btn teen-btn--outline" style={{ flex: 'none', width: 'auto', padding: '10px 16px' }}
            onClick={() => navigate('/parent/accommodations')}>
            Start
          </button>
        </div>

        {/* Child's week */}
        <div style={{ ...teen.type.eyebrow, marginTop: 28 }}>{childName}'s week</div>
        {progress && !progress.shared ? (
          <p style={{ ...teen.type.body, fontSize: 14, color: teen.color.textSecondary, marginTop: 8 }}>
            Your clinician hasn't shared {childName}'s plan with you yet.
          </p>
        ) : exposures.length === 0 ? (
          <p style={{ ...teen.type.body, fontSize: 14, color: teen.color.textSecondary, marginTop: 8 }}>
            Nothing scheduled in the next 7 days.
          </p>
        ) : (
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {exposures.map(e => {
              const open = openSituation === e.situation_id
              return (
                <div key={e.id} className="teen-card" style={{ padding: '14px 16px' }}>
                  <button
                    onClick={() => e.situation_id && setOpenSituation(open ? null : e.situation_id)}
                    style={{
                      display: 'flex',
                      width: '100%',
                      alignItems: 'center',
                      gap: 10,
                      background: 'none',
                      border: 0,
                      cursor: e.situation_id ? 'pointer' : 'default',
                      textAlign: 'left',
                      padding: 0,
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span
                        style={{
                          display: 'block',
                          fontFamily: teen.font.sans,
                          fontSize: 15,
                          fontWeight: 600,
                          color: teen.color.ink,
                        }}
                      >
                        {e.situation_name ?? e.behavior_name ?? 'Exposure'}
                      </span>
                      <span
                        style={{
                          display: 'block',
                          fontFamily: teen.font.sans,
                          fontSize: 13,
                          fontWeight: 600,
                          color: teen.color.tealMid,
                          marginTop: 3,
                        }}
                      >
                        {whenLabel(e)}
                      </span>
                    </span>
                    {e.situation_id && (
                      <span style={{ color: teen.color.chevron, fontSize: 18 }}>{open ? '▾' : '›'}</span>
                    )}
                  </button>
                  {open && e.situation_id && (
                    <div>
                      <div style={{ ...teen.type.eyebrow, marginTop: 12 }}>Your role here</div>
                      <TipsList situationId={e.situation_id} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Other accommodations — awareness */}
        {others.length > 0 && (
          <>
            <div style={{ ...teen.type.eyebrow, marginTop: 28 }}>Also working toward</div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {others.map(a => (
                <div
                  key={a.id}
                  style={{
                    fontFamily: teen.font.sans,
                    fontSize: 14,
                    color: teen.color.inkSoft,
                    padding: '10px 14px',
                    background: teen.color.card,
                    border: `1px solid ${teen.color.lineCard}`,
                    borderRadius: teen.radius.btn,
                  }}
                >
                  {a.name}
                  {a.child_rating_min != null && (
                    <span style={{ color: teen.color.textSecondary }}>
                      {' · '}{childName}: {a.child_rating_min === a.child_rating_max ? a.child_rating_min : `${a.child_rating_min}–${a.child_rating_max}`}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ height: 24 }} />
      </div>

      <ParentTabBar active="home" />
    </TeenScreen>
  )
}
