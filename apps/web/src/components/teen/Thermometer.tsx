import { THERMOMETER_BAR_HEIGHTS } from '../../styles/teenTokens'

/**
 * Distress thermometer — ten rising bars, tap one to set 1–10.
 * Bars below the current value fill teal.
 */
export default function Thermometer({
  value,
  onChange,
  height = 48,
  label = 'How anxious',
}: {
  value: number | null
  onChange: (value: number) => void
  height?: number
  label?: string
}) {
  return (
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
  )
}
