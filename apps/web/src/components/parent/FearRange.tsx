import teen from '../../styles/teenTokens'

/**
 * A Fear Level, or a range of one. Tap a number for one Fear Level; tap a second for a range; tap
 * again to start over. The book's answers are ranges (2–4, 5–9) because it depends on the day.
 */
export default function FearRange({
  lo,
  hi,
  onChange,
}: {
  lo: number | null
  hi: number | null
  onChange: (lo: number, hi: number) => void
}) {
  const pick = (n: number) => {
    // Nothing yet, or a range already: start again from this one.
    if (lo == null || hi == null || lo !== hi) return onChange(n, n)
    onChange(Math.min(lo, n), Math.max(lo, n))
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
          const on = lo != null && hi != null && n >= lo && n <= hi
          return (
            <button
              key={n}
              aria-label={`Fear Level ${n}`}
              aria-pressed={on}
              onClick={() => pick(n)}
              style={{
                flex: 1, height: 46, borderRadius: 10, cursor: 'pointer',
                fontFamily: teen.font.sans, fontSize: 15, fontWeight: 700,
                border: `2px solid ${on ? teen.color.teal : teen.color.lineChip}`,
                background: on ? teen.color.teal : teen.color.cardPure,
                color: on ? '#fff' : teen.color.ink,
              }}
            >
              {n}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontFamily: teen.font.sans, fontSize: 13, color: teen.color.textSecondary }}>
        <span>a little</span>
        <span>a lot</span>
      </div>
    </div>
  )
}
