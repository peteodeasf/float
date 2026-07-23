import { useRef } from 'react'
import { BIP_STEP } from '../../styles/teenTokens'

const clamp = (n: number) => Math.max(0, Math.min(100, n))
const snap = (n: number) => Math.round(n / BIP_STEP) * BIP_STEP

/**
 * Belief-in-prediction slider (0–100, snapping to 5).
 *
 * Tap anywhere on the track to set, or drag the knob. Arrow keys step by 5 so
 * the control is usable without a pointer.
 */
export default function BeliefSlider({
  value,
  onChange,
  label = 'How much you believe it',
}: {
  value: number
  onChange: (value: number) => void
  label?: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)

  const setFromClientX = (clientX: number) => {
    const el = trackRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    if (rect.width === 0) return
    onChange(clamp(snap(((clientX - rect.left) / rect.width) * 100)))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const nudge: Record<string, number> = {
      ArrowLeft: -BIP_STEP,
      ArrowDown: -BIP_STEP,
      ArrowRight: BIP_STEP,
      ArrowUp: BIP_STEP,
    }
    if (e.key in nudge) {
      e.preventDefault()
      onChange(clamp(value + nudge[e.key]))
    } else if (e.key === 'Home') {
      e.preventDefault()
      onChange(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      onChange(100)
    }
  }

  return (
    <div
      ref={trackRef}
      className="teen-slider"
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`${value} percent`}
      onKeyDown={handleKeyDown}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId)
        setFromClientX(e.clientX)
      }}
      onPointerMove={e => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
          setFromClientX(e.clientX)
        }
      }}
      onPointerUp={e => {
        e.currentTarget.releasePointerCapture(e.pointerId)
      }}
    >
      <div className="teen-slider__fill" style={{ width: `${value}%` }} />
      <div className="teen-slider__knob" style={{ left: `${value}%` }} />
    </div>
  )
}
