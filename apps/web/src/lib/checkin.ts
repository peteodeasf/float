/**
 * The parent's weekly check-in: once a week, one question about their focus accommodation.
 *
 * Peter, 2026-09-10: it replaces logging each moment. The same answers and words in the parent app
 * and on the clinician's panel. Plan: docs/plans/weekly-checkin.md
 */

export type CheckinAnswer = 'every_time' | 'mostly' | 'gave_in'

export const CHECKIN_ANSWERS: {
  key: CheckinAnswer
  /** The button the parent taps. */
  parentLabel: string
  /** What the parent is shown once they've answered. */
  summary: string
  /** How it reads on the clinician's panel. */
  clinicianLabel: string
  color: string
  bg: string
}[] = [
  { key: 'every_time', parentLabel: 'Every time', summary: 'You held the line every time this week.', clinicianLabel: 'Held every time', color: '#166534', bg: '#f0fdf4' },
  { key: 'mostly', parentLabel: 'Mostly', summary: 'You mostly held the line this week.', clinicianLabel: 'Mostly held', color: '#92400e', bg: '#fffbeb' },
  { key: 'gave_in', parentLabel: 'I gave in', summary: 'You gave in this week.', clinicianLabel: 'Gave in', color: '#b91c1c', bg: '#fef2f2' },
]

export const answerInfo = (key: string) => CHECKIN_ANSWERS.find(a => a.key === key) ?? null

/** The Monday of the week `d` falls in, as YYYY-MM-DD in the viewer's own time. */
export function weekStartOf(d: Date): string {
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${monday.getFullYear()}-${pad(monday.getMonth() + 1)}-${pad(monday.getDate())}`
}

/** "Week of Sep 7" from a YYYY-MM-DD Monday. */
export function weekLabel(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number)
  return `Week of ${new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}
