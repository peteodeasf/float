// The Case Summary as the clinician reads it: what monitoring analysis wrote, with what each
// analyzed session added merged in and marked with its session. The two are stored apart
// (`session_additions`) so re-analyzing monitoring cannot drop a session's items; this puts them
// back together for display.
import type { PreliminaryReport } from '../api/monitoring'

export interface SummaryComment { note: string; from: string }
export interface SummaryItem { text: string; from?: string; comments: SummaryComment[] }
export interface SummarySituation extends SummaryItem { fear: number | null }

export interface MergedSummary {
  situations: SummarySituation[]
  parentalResponses: SummaryItem[]
  safetyBehaviors: SummaryItem[]
  treatmentTargets: SummaryItem[]
  /** Other points from sessions, and comments that match no item. */
  notes: SummaryItem[]
}

/** "from session, Oct 15" */
export function sessionLabel(sessionDate: string): string {
  const d = new Date(sessionDate + 'T00:00:00')
  return `from session, ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

/** The same blunt matching key the backend uses: lowercase, single spaces, no trailing punctuation. */
const key = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ').replace(/^[ .,;:!?\-–—]+|[ .,;:!?\-–—]+$/g, '')

const item = (text: string, from?: string): SummaryItem => ({ text, from, comments: [] })

export function mergeCaseSummary(report: PreliminaryReport): MergedSummary {
  const sessions = report.session_additions ?? []
  const situations: SummarySituation[] = (report.situations ?? []).map(s => ({ ...item(s.name), fear: s.fear_thermometer }))
  const parentalResponses = (report.parental_responses ?? []).map(t => item(t))
  const safetyBehaviors = (report.safety_behaviors ?? []).map(t => item(t))
  const treatmentTargets = (report.treatment_targets ?? []).map(t => item(t))
  const notes: SummaryItem[] = []

  for (const a of sessions) {
    const from = sessionLabel(a.session_date)
    for (const s of a.situations ?? []) situations.push({ ...item(s.name, from), fear: s.fear_thermometer })
    for (const t of a.parental_responses ?? []) parentalResponses.push(item(t, from))
    for (const t of a.safety_behaviors ?? []) safetyBehaviors.push(item(t, from))
    for (const t of a.notes ?? []) notes.push(item(t, from))
  }

  // A comment sits under the item it is about. If that item's wording is not found, the comment is
  // kept as a note rather than lost.
  const everything = [...situations, ...parentalResponses, ...safetyBehaviors, ...treatmentTargets, ...notes]
  for (const a of sessions) {
    const from = sessionLabel(a.session_date)
    for (const c of a.comments ?? []) {
      const target = everything.find(i => key(i.text) === key(c.about))
      if (target) target.comments.push({ note: c.note, from })
      else notes.push(item(`About “${c.about}”: ${c.note}`, from))
    }
  }

  // Lowest Fear Level first, as the treatment targets are ordered. A situation with no number goes last.
  situations.sort((a, b) => (a.fear ?? Infinity) - (b.fear ?? Infinity))
  return { situations, parentalResponses, safetyBehaviors, treatmentTargets, notes }
}
