/**
 * Tap-first selection chip.
 *
 * `variant="mint"` is the multi-select styling used for tempting behaviours;
 * the default ink fill is used for single-select fields.
 */
export default function Chip({
  label,
  selected = false,
  onClick,
  variant = 'ink',
  disabled = false,
}: {
  label: string
  selected?: boolean
  onClick?: () => void
  variant?: 'ink' | 'mint'
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`teen-chip${variant === 'mint' ? ' teen-chip--mint' : ''}`}
    >
      {label}
    </button>
  )
}
