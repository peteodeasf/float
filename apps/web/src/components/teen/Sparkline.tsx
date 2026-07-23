import teen from '../../styles/teenTokens'

const W = 60
const H = 24

/** Small belief trend line for a situation row. Needs at least two points. */
export default function Sparkline({
  values,
  improving,
}: {
  values: number[]
  improving: boolean
}) {
  if (values.length < 2) return <span style={{ width: W, flex: 'none' }} aria-hidden="true" />

  const x = (i: number) => (i / (values.length - 1)) * W
  const y = (v: number) => 2 + (1 - v / 100) * (H - 6)

  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const stroke = improving ? teen.chart.sparkUp : teen.chart.sparkFlat

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: W, height: H, flex: 'none', overflow: 'visible' }}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx={x(values.length - 1)}
        cy={y(values[values.length - 1])}
        r={3}
        fill={stroke}
      />
    </svg>
  )
}
