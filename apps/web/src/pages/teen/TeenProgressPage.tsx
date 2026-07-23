import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTeenAuth } from '../../context/TeenAuthContext'
import { teenApiClient } from '../../api/client'
import TeenScreen from '../../components/teen/TeenScreen'
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

export default function TeenProgressPage() {
  const { patientId } = useTeenAuth()
  const navigate = useNavigate()
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
              background: 'none',
              border: 0,
              cursor: 'pointer',
              font: `600 22px ${teen.font.sans}`,
              color: teen.color.ink,
              lineHeight: 1,
              padding: 0,
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
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
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

          <div style={{ flex: 1, minHeight: 4 }} />

          <div style={{ paddingBottom: 18 }}>
            <button className="teen-btn teen-btn--outline" onClick={() => setSelectedId(null)}>
              Back
            </button>
          </div>
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
          overflowY: 'auto',
          padding: `6px ${teen.space.pad} 0`,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
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
                    fontSize: 12,
                    color: teen.color.onDark,
                    marginTop: 5,
                  }}
                >
                  {label}
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
                fontSize: 12,
                color: teen.chart.label,
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

        <div style={{ flex: 1, minHeight: 4 }} />

        <div style={{ paddingBottom: 18 }}>
          <button className="teen-btn teen-btn--outline" onClick={() => navigate('/teen/home')}>
            Back to today
          </button>
        </div>
      </div>
    </TeenScreen>
  )
}
