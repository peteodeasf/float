import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTeenAuth } from '../../context/TeenAuthContext'
import { teenApiClient } from '../../api/client'
import TeenScreen from '../../components/teen/TeenScreen'
import TeenTabBar from '../../components/teen/TeenTabBar'
import Sparkline from '../../components/teen/Sparkline'
import SituationChart from '../../components/teen/SituationChart'
import {
  deriveEffort,
  deriveSituationProgress,
  takeaway,
  effortTiles,
  type LadderSituation,
  type SituationTag,
} from '../../lib/teenProgress'
import teen from '../../styles/teenTokens'
import TodayCard from '../../components/teen/TodayCard'
import {
  comingUp,
  dueToday,
  waitingOnChild,
  whenLabel,
  type PendingExperiment,
} from '../../lib/teenWork'

const PILL_CLASS: Record<SituationTag, string> = {
  manageable: 'teen-pill teen-pill--manageable',
  'getting there': 'teen-pill teen-pill--progressing',
  'still scary': 'teen-pill teen-pill--scary',
  'just started': 'teen-pill teen-pill--scary',
}

// Display-only: plainer teen wording for the effort-tile labels. Values/wiring
// stay exactly as `effortTiles` returns them; only the caption text changes.
const EFFORT_LABEL: Record<string, string> = {
  'times committed': 'times committed',
  'experiments faced': 'experiments',
  'reflections logged': 'reflections',
  'steps mastered': 'steps',
  'situations worked': 'situations',
}

const workName: React.CSSProperties = {
  fontFamily: teen.font.sans, fontSize: 15, fontWeight: 700, color: teen.color.ink, lineHeight: 1.3,
}
const workSit: React.CSSProperties = { fontFamily: teen.font.sans, fontSize: 12, color: teen.color.textSecondary }
const workAction: React.CSSProperties = {
  fontFamily: teen.font.sans, fontSize: 13, fontWeight: 700, color: teen.color.teal, marginTop: 2,
}
function workRow(kind: 'setup' | 'started'): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left', cursor: 'pointer',
    padding: '14px 15px', borderRadius: teen.radius.btn,
    background: kind === 'setup' ? teen.color.mintSoft : teen.color.card,
    border: kind === 'setup' ? `1.5px solid ${teen.color.mintDeep}` : `1.5px dashed ${teen.color.tealMid}`,
  }
}
function chip(kind: 'setup' | 'started' | 'next'): React.CSSProperties {
  const base: React.CSSProperties = {
    alignSelf: 'flex-start', marginTop: 4, fontFamily: teen.font.sans, fontSize: 12, fontWeight: 700,
    borderRadius: 999, padding: '3px 9px', whiteSpace: 'nowrap',
  }
  if (kind === 'setup') return { ...base, background: teen.color.ink, color: '#fff' }
  if (kind === 'started') return { ...base, background: '#fff', color: teen.color.teal, border: `1px solid ${teen.color.tealMid}` }
  return { ...base, background: teen.color.mint, color: teen.color.ink }
}

export default function TeenProgressPage() {
  const { patientId } = useTeenAuth()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const { data: ladderData } = useQuery({
    queryKey: ['teen-ladder', patientId],
    queryFn: async () => (await teenApiClient.get('/patient/ladder')).data,
    enabled: !!patientId,
  })

  const situations: LadderSituation[] = useMemo(
    () => ladderData?.situations ?? [],
    [ladderData]
  )

  // What they're working on now. Peter, 2026-09-10: with the home as the ladder, current
  // experiments needed a place of their own — so they lead this tab.
  const navigate = useNavigate()
  const { data: pendingData } = useQuery({
    queryKey: ['teen-pending', patientId],
    queryFn: async () => (await teenApiClient.get('/patient/experiments/pending')).data,
    enabled: !!patientId,
  })
  // Same gate as the home: when the clinician has the ladder switched off, nothing is current.
  const ladderOn = ladderData?.plan?.ladder_active !== false
  const pending: PendingExperiment[] = ladderOn ? pendingData ?? [] : []
  const now = new Date()
  const today = dueToday(pending, now)
  const waiting = waitingOnChild(pending)
  const later = comingUp(pending, now)
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
  const hasWork = today.length + waiting.length + later.length > 0
  const effort = useMemo(() => deriveEffort(situations), [situations])
  const progress = useMemo(
    () => situations.map(deriveSituationProgress),
    [situations]
  )

  const selected = progress.find(p => p.id === selectedId) ?? null

  // ───────────────────────── SITUATION DETAIL ─────────────────────────
  if (selected) {
    return (
      <TeenScreen>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: `16px ${teen.space.pad} 12px`,
            flex: 'none',
          }}
        >
          <button
            onClick={() => setSelectedId(null)}
            aria-label="Back to progress"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 44,
              minHeight: 44,
              background: 'none',
              border: 0,
              cursor: 'pointer',
              font: `600 22px ${teen.font.sans}`,
              color: teen.color.ink,
              lineHeight: 1,
              padding: 0,
              margin: '-8px -10px',
            }}
          >
            ‹
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: teen.font.sans,
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: teen.color.ink,
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {selected.name}
            </div>
          </div>
          <span className={PILL_CLASS[selected.tag]}>{selected.tag}</span>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            padding: `2px ${teen.space.pad} 0`,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {selected.plottable ? (
            <div
              style={{
                background: teen.color.card,
                border: `1px solid ${teen.color.lineCard}`,
                borderRadius: teen.radius.card,
                padding: '16px 14px 14px',
              }}
            >
              <SituationChart points={selected.points} />
            </div>
          ) : (
            <div
              style={{
                background: teen.color.card,
                border: `1px solid ${teen.color.lineCard}`,
                borderRadius: teen.radius.card,
                padding: 20,
              }}
            >
              <p style={{ ...teen.type.body, margin: 0 }}>
                Once you've finished a couple of experiments here, this turns into a graph.
              </p>
            </div>
          )}

          <div
            style={{
              background: teen.color.mintSoft,
              border: `1px solid ${teen.color.mint}`,
              borderRadius: teen.radius.btn,
              padding: 16,
            }}
          >
            <p
              style={{
                fontFamily: teen.font.sans,
                fontSize: 16,
                lineHeight: 1.5,
                color: teen.color.ink,
                margin: 0,
              }}
            >
              {takeaway(selected)}
            </p>
          </div>

          <div style={{ height: 20, flex: 'none' }} />
        </div>
      </TeenScreen>
    )
  }

  // ──────────────────────────── PROGRESS ──────────────────────────────
  return (
    <TeenScreen>
      <div style={{ padding: `18px ${teen.space.pad} 10px`, flex: 'none' }}>
        <span
          style={{
            fontFamily: teen.font.sans,
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            color: teen.color.ink,
          }}
        >
          Your progress
        </span>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: `6px ${teen.space.pad} 0`,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {hasWork && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={teen.type.eyebrow}>What you're working on</div>
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
            {waiting.map(e => (
              <button
                key={e.id}
                onClick={() => navigate(`/teen/experiment/${e.avoidance_behavior_id}?experiment=${e.id}`)}
                style={workRow('started')}
              >
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={workName}>{expName(e)}</span>
                  {expSituation(e) && <span style={workSit}>{expSituation(e)}</span>}
                  <span style={chip('started')}>Set up with your clinician</span>
                  <span style={workAction}>{e.scheduled_date ? 'Finish setting it up' : "Pick when you'll do it"}</span>
                </span>
                <span style={{ color: teen.color.chevron, flex: 'none', fontSize: 20 }}>›</span>
              </button>
            ))}
            {later.map(e => (
              <button key={e.id} onClick={() => navigate(`/teen/exposure/${e.id}`)} style={workRow('setup')}>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={workName}>{expName(e)}</span>
                  {expSituation(e) && <span style={workSit}>{expSituation(e)}</span>}
                  <span style={chip('setup')}>{whenLabel(e, now)}</span>
                </span>
                <span style={{ color: teen.color.chevron, flex: 'none', fontSize: 20 }}>›</span>
              </button>
            ))}
            {/* They agreed to this with their clinician. Said here so it stays true to them. */}
            {ladderData?.plan?.shared_with_parent && (
              <p style={{ ...teen.type.body, fontSize: 13, color: teen.color.textSecondary, margin: '10px 0 0' }}>
                Your parent can see your ladder, what's planned and what you've done. Not what you write.
              </p>
            )}
            <div style={{ ...teen.type.eyebrow, marginTop: 10 }}>How it's going</div>
          </div>
        )}

        {/* Effort leads — never open on a lone red line. */}
        <div
          style={{
            background: teen.color.ink,
            borderRadius: 22,
            padding: 20,
            color: '#fff',
          }}
        >
          <span style={{ ...teen.type.eyebrow, color: teen.color.mint }}>Showing up</span>
          <div
            style={{
              marginTop: 16,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px 14px',
            }}
          >
            {effortTiles(effort).map(({ value, label }) => (
              <div key={label}>
                <div
                  style={{
                    fontFamily: teen.font.mono,
                    fontSize: teen.dataSize.md,
                    color: '#fff',
                    lineHeight: 1,
                  }}
                >
                  {value}
                </div>
                <div
                  style={{
                    fontFamily: teen.font.sans,
                    fontSize: 13,
                    color: teen.color.onDark,
                    marginTop: 5,
                  }}
                >
                  {EFFORT_LABEL[label] ?? label}
                </div>
              </div>
            ))}
          </div>
        </div>

        {progress.length > 0 && (
          <div>
            <div style={teen.type.eyebrow}>Getting easier</div>
            <div
              style={{
                fontFamily: teen.font.sans,
                fontSize: 13,
                color: teen.color.textSecondary,
                margin: '2px 0 8px',
              }}
            >
              Tap one to see how it's changed.
            </div>

            {progress.map(situation => (
              <button
                key={situation.id}
                onClick={() => setSelectedId(situation.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  width: '100%',
                  textAlign: 'left',
                  background: teen.color.card,
                  border: `1px solid ${teen.color.lineCard}`,
                  borderRadius: teen.radius.btn,
                  padding: '14px 15px',
                  marginTop: 9,
                  cursor: 'pointer',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontFamily: teen.font.sans,
                      fontSize: 15,
                      fontWeight: 600,
                      color: teen.color.ink,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {situation.name}
                  </span>
                  <span style={{ display: 'block', marginTop: 6 }}>
                    <span className={PILL_CLASS[situation.tag]}>{situation.tag}</span>
                  </span>
                </span>
                <Sparkline
                  values={situation.points.map(p => p.bip)}
                  improving={situation.improving}
                />
                <span style={{ color: teen.color.chevron, flex: 'none', fontSize: 18 }}>›</span>
              </button>
            ))}
          </div>
        )}

        <div style={{ height: 20, flex: 'none' }} />
      </div>

      <TeenTabBar active="progress" />
    </TeenScreen>
  )
}
