/**
 * An on/off switch for the clinician app.
 *
 * The button schema in ./buttons.ts keeps solid teal for the one action a screen is for. A state
 * like "can the patient see this" is not an action, so it should never look like that button. This
 * switch reads as a setting — a track that fills teal when on, with a sliding knob — so it can sit
 * next to a real button without the two being confused.
 */
import type { CSSProperties } from 'react'

export function Switch({ checked, onChange, label, disabled, title }: {
  checked: boolean
  onChange: (next: boolean) => void
  label?: string
  disabled?: boolean
  title?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className="disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '8px',
        background: 'transparent', border: 'none', padding: 0,
        fontFamily: 'inherit', cursor: 'pointer',
      }}
    >
      <span style={track(checked)}>
        <span style={knob(checked)} />
      </span>
      {label && <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--float-text-secondary)' }}>{label}</span>}
    </button>
  )
}

const track = (on: boolean): CSSProperties => ({
  position: 'relative', width: '36px', height: '20px', borderRadius: '999px', flexShrink: 0,
  background: on ? 'var(--float-primary)' : 'var(--float-border-strong)',
  transition: 'background 0.15s ease',
})

const knob = (on: boolean): CSSProperties => ({
  position: 'absolute', top: '2px', left: on ? '18px' : '2px',
  width: '16px', height: '16px', borderRadius: '50%', background: '#fff',
  boxShadow: 'var(--float-shadow-sm)', transition: 'left 0.15s ease',
})
