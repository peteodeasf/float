import teen, { THERMOMETER_BAR_HEIGHTS } from '../../styles/teenTokens'

/**
 * Distress thermometer — ten rising bars, tap one to set 1–10.
 * Bars below the current value fill teal. The 1–10 scale numbers and the
 * end labels ("1 · no big deal", "10 · the worst") are always shown, mirroring
 * the clinician portal's fear scale so the scale reads the same everywhere.
 */
export default function Thermometer({
  value,
  onChange,
  height = 48,
  label = 'Fear Level',
}: {
  value: number | null
  onChange: (value: number) => void
  height?: number
  label?: string
}) {
  return (
    <div>
      <div className="teen-therm" style={{ height }} role="group" aria-label={label}>
        {THERMOMETER_BAR_HEIGHTS.map((barHeight, i) => {
          const rating = i + 1
          return (
            <button
              key={rating}
              type="button"
              className="teen-therm__bar"
              data-filled={value != null && i < value}
              style={{ height: `${barHeight}%` }}
              aria-label={`${rating} out of 10`}
              aria-pressed={value === rating}
              onClick={() => onChange(rating)}
            />
          )
        })}
      </div>

      {/* The scale numbers, aligned under the bars — always shown. */}
      <div style={{ display: 'flex', gap: 5, marginTop: 6 }} aria-hidden="true">
        {THERMOMETER_BAR_HEIGHTS.map((_, i) => {
          const rating = i + 1
          const on = value === rating
          return (
            <span
              key={rating}
              style={{
                flex: 1,
                textAlign: 'center',
                fontFamily: teen.font.mono,
                fontSize: 12,
                fontWeight: on ? 700 : 400,
                color: on ? teen.color.teal : teen.color.textTertiary,
              }}
            >
              {rating}
            </span>
          )
        })}
      </div>

      {/* End labels, mirroring the clinician scale. */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 4,
          fontFamily: teen.font.sans,
          fontSize: 12,
          fontWeight: 600,
          color: teen.color.textTertiary,
        }}
      >
        <span>1 · no big deal</span>
        <span>10 · the worst</span>
      </div>
    </div>
  )
}
