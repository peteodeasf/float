import teen from '../../styles/teenTokens'
import { weeksSpanned, type SeriesPoint } from '../../lib/teenProgress'

// Plot area, per the design's 256×172 viewBox.
const X0 = 30
const X1 = 248
const Y_TOP = 10
const Y_BOTTOM = 146

const GRID = [0, 25, 50, 75, 100]

/**
 * Belief and anxiety over time for one situation.
 *
 * Belief is plotted directly (0–100). Anxiety is 1–10, so it's scaled ×10 onto
 * the same axis — the dashed line is therefore a shape comparison, not a
 * second scale.
 */
export default function SituationChart({ points }: { points: SeriesPoint[] }) {
  const n = points.length
  if (n < 2) return null

  const cx = (i: number) => X0 + (i / (n - 1)) * (X1 - X0)
  const cy = (v: number) => Y_TOP + (1 - v / 100) * (Y_BOTTOM - Y_TOP)

  const bipPoints = points.map((p, i) => `${cx(i).toFixed(1)},${cy(p.bip).toFixed(1)}`).join(' ')

  const dtIndexed = points
    .map((p, i) => ({ i, dt: p.dt }))
    .filter((p): p is { i: number; dt: number } => p.dt != null)
  const dtPoints = dtIndexed
    .map(p => `${cx(p.i).toFixed(1)},${cy(p.dt * 10).toFixed(1)}`)
    .join(' ')

  const weeks = weeksSpanned(points)
  const startLabel = weeks && weeks > 0 ? `${weeks} wks ago` : 'first one'

  return (
    <div>
      {/* legend */}
      <div style={{ display: 'flex', gap: 16, padding: '0 4px 12px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{ width: 16, height: 3, borderRadius: 2, background: teen.chart.bip }}
            aria-hidden="true"
          />
          <span style={{ fontFamily: teen.font.sans, fontSize: 11, color: teen.color.inkSoft }}>
            Believe it'll go wrong
          </span>
        </span>
        {dtIndexed.length >= 2 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{ width: 16, height: 0, borderTop: `2px dashed ${teen.chart.dt}` }}
              aria-hidden="true"
            />
            <span style={{ fontFamily: teen.font.sans, fontSize: 11, color: teen.color.inkSoft }}>
              How anxious
            </span>
          </span>
        )}
      </div>

      <svg viewBox="0 0 256 172" style={{ width: '100%', height: 'auto', display: 'block' }}>
        {GRID.map(value => {
          const y = cy(value)
          const isBase = value === 0
          return (
            <g key={value}>
              <line
                x1={X0}
                y1={y}
                x2={X1}
                y2={y}
                stroke={isBase ? teen.chart.axis : teen.chart.grid}
                strokeWidth={isBase ? 1.5 : 1}
              />
              <text
                x={X0 - 6}
                y={y + 3}
                textAnchor="end"
                fontFamily="'Courier New', monospace"
                fontSize={8}
                fill={teen.chart.label}
              >
                {value}
              </text>
            </g>
          )
        })}

        {dtIndexed.length >= 2 && (
          <polyline
            points={dtPoints}
            fill="none"
            stroke={teen.chart.dt}
            strokeWidth={2}
            strokeDasharray="4 4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        <polyline
          points={bipPoints}
          fill="none"
          stroke={teen.chart.bip}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {dtIndexed.length >= 2 &&
          dtIndexed.map(p => (
            <circle
              key={`dt-${p.i}`}
              cx={cx(p.i)}
              cy={cy(p.dt * 10)}
              r={2.5}
              fill="#fff"
              stroke={teen.chart.dt}
              strokeWidth={1.5}
            />
          ))}
        {points.map((p, i) => (
          <circle key={`bip-${i}`} cx={cx(i)} cy={cy(p.bip)} r={3.5} fill={teen.chart.bip} />
        ))}

        <text
          x={X0}
          y={164}
          textAnchor="start"
          fontFamily="Arial"
          fontSize={9}
          fill={teen.color.muted}
        >
          {startLabel}
        </text>
        <text
          x={X1}
          y={164}
          textAnchor="end"
          fontFamily="Arial"
          fontSize={9}
          fontWeight="bold"
          fill={teen.color.ink}
        >
          now
        </text>
      </svg>
    </div>
  )
}
