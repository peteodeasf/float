import { useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
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

const ORDINALS = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth']
const ordinal = (n: number) => ORDINALS[n] ?? `${n}th`

/** Handed over by the record flow via navigation state — shown once, then dismissed. */
type Scoreboard = {
  dtExpected: number | null
  actualDT: number
  bipBefore: number | null
  bipAfter: number
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

  const effort = useMemo(() => deriveEffort(situations), [situations])
  const progress = useMemo(
    () => situations.map(deriveSituationProgress),
    [situations]
  )

  const selected = progress.find(p => p.id === selectedId) ?? null

  // The just-finished result, if we arrived here straight from submitting one.
  // It rides in on navigation state, so a later visit to this tab won't show it.
  const location = useLocation()
  const scoreboard = (location.state as { scoreboard?: Scoreboard } | null)?.scoreboard ?? null
  const [scoreDismissed, setScoreDismissed] = useState(false)
  const showScore = !!scoreboard && !scoreDismissed

  // How many predictions the child has beaten in the last seven days — makes the
  // headline's claim true. Reads the raw ladder, which is refetched after a submit.
  const beatThisWeek = useMemo(() => {
    const list: Array<{ behaviors?: Array<{ experiments?: Array<Record<string, unknown>> }> }> =
      ladderData?.situations ?? []
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    let count = 0
    for (const s of list) {
      for (const b of s.behaviors ?? []) {
        for (const e of b.experiments ?? []) {
          if (e.feared_outcome_occurred !== false) continue
          const raw = e.scheduled_date as string | null | undefined
          const when = raw ? new Date(raw).getTime() : null
          if (when != null && when >= weekAgo) count++
        }
      }
    }
    return count
  }, [ladderData])

  const scoreHeadline = useMemo(() => {
    if (!scoreboard) return ''
    const dropped = scoreboard.bipBefore != null ? scoreboard.bipBefore - scoreboard.bipAfter : 0
    if (beatThisWeek >= 2) return `${ordinal(beatThisWeek)} time you beat your prediction this week.`
    if (dropped > 0) return `Your belief dropped ${dropped} points.`
    return 'You showed up and got the data.'
  }, [scoreboard, beatThisWeek])

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
        {/* Just-finished result — a compact tile shown once, then dismissed. */}
        {showScore && scoreboard && (
          <div
            style={{
              position: 'relative',
              background: teen.color.ink,
              borderRadius: 20,
              padding: '16px 16px 15px',
              color: teen.color.white,
            }}
          >
            <button
              onClick={() => setScoreDismissed(true)}
              aria-label="Dismiss"
              style={{
                position: 'absolute',
                top: 8,
                right: 10,
                background: 'none',
                border: 0,
                cursor: 'pointer',
                color: teen.color.onDark,
                font: `400 22px ${teen.font.sans}`,
                lineHeight: 1,
                padding: 6,
              }}
            >
              ×
            </button>
            <span style={{ ...teen.type.eyebrow, color: teen.color.mint }}>Scoreboard</span>
            <p
              style={{
                fontFamily: teen.font.sans,
                fontSize: 18,
                fontWeight: 600,
                lineHeight: 1.3,
                color: teen.color.white,
                textWrap: 'balance',
                margin: '8px 24px 0 0',
              }}
            >
              {scoreHeadline}
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <div
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.10)',
                  borderRadius: teen.radius.btn,
                  padding: '12px 13px',
                }}
              >
                <div style={{ fontFamily: teen.font.sans, fontSize: 12, color: teen.color.mint }}>Fear Level</div>
                <div style={{ fontFamily: teen.font.mono, fontSize: 20, color: teen.color.white, marginTop: 5 }}>
                  {scoreboard.dtExpected ?? '—'}
                  <span style={{ color: teen.color.mint, fontSize: 14 }}> → {scoreboard.actualDT}</span>
                </div>
              </div>
              <div
                style={{
                  flex: 1,
                  background: 'rgba(255,255,255,0.10)',
                  borderRadius: teen.radius.btn,
                  padding: '12px 13px',
                }}
              >
                <div style={{ fontFamily: teen.font.sans, fontSize: 12, color: teen.color.mint }}>Belief</div>
                <div style={{ fontFamily: teen.font.mono, fontSize: 20, color: teen.color.white, marginTop: 5 }}>
                  {scoreboard.bipBefore ?? '—'}
                  <span style={{ color: teen.color.mint, fontSize: 14 }}> → {scoreboard.bipAfter}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* They agreed to this with their clinician. Said here, whatever else is on the tab, so it
            stays true to them. */}
        {ladderData?.plan?.shared_with_parent && (
          <p style={{ ...teen.type.body, fontSize: 13, color: teen.color.textSecondary, margin: 0 }}>
            Your parent can see your ladder, what's planned and what you've done. Not what you write.
          </p>
        )}

        {/* Effort leads — never open on a lone red line. */}
        <div
          style={{
            background: teen.color.ink,
            borderRadius: 22,
            padding: 20,
            color: teen.color.white,
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
                    color: teen.color.white,
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
