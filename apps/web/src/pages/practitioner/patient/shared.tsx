/**
 * Shared bits of the clinician patient page.
 *
 * Extracted from PatientPage.tsx, which had grown to 3,931 lines — long enough that two people
 * (or two agents) editing it collide on nearly every change. Behaviour is unchanged; this is a
 * move, not a rewrite.
 */
// Sub-behaviours ("+ step" under a ladder rung) are hidden pending a decision on sub-SITUATIONS,
// which is what Dr. Walker's method actually calls for — a sub-situation is a smaller trigger
// situation with its own distress rating, not a smaller behaviour. Existing sub-behaviour rows
// still render; only creating new ones is switched off. Flip to true to restore.
export const SUB_BEHAVIOR_ADD_ENABLED = false

// A ladder rung is a sentence and a number. `behavior_type` is a free string column, so a rung
// that describes a VERSION OF THE SITUATION rather than a thing the child does needs no migration.
// See docs/plans/ladder-rung-shape.md.
export const BEHAVIOR_TYPE_SCENARIO = 'scenario'

// point so an out-of-range value (e.g. a typed "16", or an AI-extracted number)
// can never be stored. clampDt normalizes a value for sending to the API; DT_MIN/
// DT_MAX back the number inputs' live clamping.
export const DT_MIN = 1
export const DT_MAX = 10
export function clampDt(v: number | string | null | undefined): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  if (Number.isNaN(n)) return undefined
  return Math.min(DT_MAX, Math.max(DT_MIN, n))
}
// Live-clamp for a number <input>'s onChange: cap the upper bound as the clinician
// types (the reported bug), but leave partial/empty input alone so typing stays smooth.
export function clampDtInput(raw: string): string {
  if (raw === '') return ''
  const n = Number(raw)
  if (Number.isNaN(n)) return raw
  if (n > DT_MAX) return String(DT_MAX)
  return raw
}


export function DTBadge({ value, max }: { value: number | null | undefined; max?: number | null }) {
  if (value == null) return null
  const v = Number(value)
  const hasRange = max != null && Number(max) > v
  const hi = hasRange ? Number(max) : v
  const color = hi >= 7 ? 'bg-red-100 text-red-700' : hi >= 4 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
  return <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${color}`}>{hasRange ? `${v}–${hi}` : v}</span>
}

// Shared teal section header for the Step-2 Preliminary Report

// Next school day (Mon-Fri) after today
export function getNextSchoolDayISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

export const CONFIDENCE_OPTIONS: { key: string; label: string; emoji: string }[] = [
  { key: 'low', label: 'Low', emoji: '\u{1F630}' },
  { key: 'medium', label: 'Medium', emoji: '\u{1F610}' },
  { key: 'high', label: 'High', emoji: '\u{1F4AA}' },
]
