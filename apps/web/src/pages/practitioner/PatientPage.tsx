import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { closePatient, reopenPatient, getPatient, getMessages, sendMessage, getOneParentsMessages, listParents, sendParentMessage, getPatientProgress, updatePatient, getPatientAttention } from '../../api/patients'
import {
  LineChart, Line, XAxis, YAxis,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { CHART } from '../../styles/chartColors'
import {
  getTreatmentPlan, getTriggers, createTreatmentPlan, createTrigger,
  updatePlanNickname, updateTrigger, deleteTrigger,
  getSituationDownwardArrow,
  getPatientExperiments, searchSituationLibrary, type DownwardArrow
} from '../../api/treatment'
import { getMonitoringForm, sendMonitoringForm, getMonitoringReport, generatePreliminaryReport, type PreliminaryReport } from '../../api/monitoring'
import ParentWords from '../../components/practitioner/ParentWords'
import { getSessionNotes, createSessionNote, updateSessionNote, deleteSessionNote, type SessionNote, type SessionParticipant } from '../../api/session_notes'
import { getChecklist, updateChecklist, type ChecklistItems } from '../../api/checklist'
import { PROCESS_CHECKLIST, type ChecklistItemDef, type ChecklistNav } from '../../lib/checklists'
import { getChecklistItems } from '../../api/checklist'
import { CONFIDENCE_OPTIONS } from './patient/shared'
import { FlatLadder } from './patient/FlatLadder'
import { BehaviorPanel } from './patient/BehaviorPanel'
export { FlatLadder } from './patient/FlatLadder'
export { BehaviorPanel } from './patient/BehaviorPanel'
import { getActionPlans, createActionPlan, updateActionPlan, publishActionPlan, deleteActionPlan, type ActionPlan } from '../../api/action_plans'
import { fetchFormulation, createFormulation, updateFormulation } from '../../api/formulation'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import PractitionerNav from '../../components/ui/PractitionerNav'
import ParentPlanPanel from '../../components/practitioner/ParentPlanPanel'
import ParentProgressSection from '../../components/practitioner/ParentProgressSection'
import { RecordingsInProgress, RecordedNoteDetails } from '../../components/practitioner/RecordedNoteParts'
import { btn, buttonRow, countPill, liveDot, statusCard, statusCardState, statusCardTitle, chip, iconBtn, tab, tabCount } from '../../components/ui/buttons'
import { Button } from '../../components/ui/primitives'
import TeenAccessPanel from '../../components/practitioner/TeenAccessPanel'
import ClinicianAccessPanel from '../../components/practitioner/ClinicianAccessPanel'
import { SessionInterview } from './SessionPage'
import { LADDER_MAX_WIDTH, PROCESS_PANEL_WIDTH } from './patient/shared'
import { SHOW_ACTION_PLANS } from '../../lib/featureFlags'

// Flat tabs, in bar order. Also the `?tab=` vocabulary other surfaces navigate with.


const TAB_IDS = ['monitoring', 'sessions', 'plan', 'experiments', 'chat'] as const
type TabId = typeof TAB_IDS[number]

const ACTION_PLAN_TEMPLATE = `<h2>Exposures</h2><ul><li></li></ul><h2>Behaviors to resist</h2><ul><li></li></ul><h2>Parent instructions</h2><ul><li></li></ul><h2>Coping tools</h2><ul><li></li></ul><h2>Notes</h2><p></p>`

function DTBadge({ value, max }: { value: number | null | undefined; max?: number | null }) {
  if (value == null) return null
  const v = Number(value)
  const hasRange = max != null && Number(max) > v
  const hi = hasRange ? Number(max) : v
  const color = hi >= 7 ? 'bg-red-100 text-red-700' : hi >= 4 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
  return <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${color}`}>{hasRange ? `${v}–${hi}` : v}</span>
}

// Shared teal section header for the Step-2 Preliminary Report
const reportSectionHeaderStyle = { fontSize: '12px', fontWeight: 700, color: 'var(--float-primary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '10px' }

// A labelled bulleted section in the Step-2 Preliminary Report (with a divider above)
function ReportSection({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div style={{ borderTop: '1px solid var(--float-border)', paddingTop: '20px' }}>
      <div style={reportSectionHeaderStyle}>{label}</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {items.map((it, i) => (
          <li key={i} style={{ display: 'flex', gap: '8px', fontSize: '13px', color: 'var(--float-text)', lineHeight: 1.5 }}>
            <span style={{ color: 'var(--float-primary)', flexShrink: 0 }}>·</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

interface ConceptualizationDraft {
  situations: string[]            // from extraction
  behaviors: string[]             // from extraction
  accommodationPatterns: string[] // from extraction + parent session
  parentFearedOutcomes: string[]  // from parent DA
  patientFearedOutcomes: string[] // from patient DA
  lastUpdatedStep: number
}

const EMPTY_CONCEPTUALIZATION: ConceptualizationDraft = {
  situations: [],
  behaviors: [],
  accommodationPatterns: [],
  parentFearedOutcomes: [],
  patientFearedOutcomes: [],
  lastUpdatedStep: 0,
}

const ANXIETY_PRESENTATIONS: { value: string; label: string }[] = [
  { value: 'social_anxiety', label: 'Social Anxiety' },
  { value: 'separation_anxiety', label: 'Separation Anxiety' },
  { value: 'specific_phobia', label: 'Specific Phobia' },
  { value: 'generalized_anxiety', label: 'Generalized Anxiety' },
  { value: 'ocd', label: 'OCD / ERP' },
  { value: 'other', label: 'Other' },
]


// Distress-thermometer / fear scores are a 1–10 scale. These guard every entry
// point so an out-of-range value (e.g. a typed "16", or an AI-extracted number)
// can never be stored. clampDt normalizes a value for sending to the API; DT_MIN/
// DT_MAX back the number inputs' live clamping.
const DT_MIN = 1
const DT_MAX = 10
function clampDt(v: number | string | null | undefined): number | undefined {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  if (Number.isNaN(n)) return undefined
  return Math.min(DT_MAX, Math.max(DT_MIN, n))
}
// Live-clamp for a number <input>'s onChange: cap the upper bound as the clinician
// types (the reported bug), but leave partial/empty input alone so typing stays smooth.
function clampDtInput(raw: string): string {
  if (raw === '') return ''
  const n = Number(raw)
  if (Number.isNaN(n)) return raw
  if (n > DT_MAX) return String(DT_MAX)
  return raw
}

const EXPERIMENT_STATUS_LABEL: Record<string, string> = {
  planned: 'planned',
  committed: 'committed',
  in_progress: 'in progress',
  completed: 'completed',
  too_hard: 'too hard',
  skipped: 'skipped',
}

function confidenceMeta(level: string | null | undefined) {
  if (!level) return { emoji: '', label: '' }
  const m = CONFIDENCE_OPTIONS.find(c => c.key === level)
  return m ? { emoji: m.emoji, label: m.label } : { emoji: '', label: level }
}

type SessionPrepType = 'session_1' | 'session_2' | 'session_3' | 'weekly'

const SESSION_PREP_CONTENT: Record<SessionPrepType, { header: string; steps: string[] }> = {
  session_1: {
    header: 'STEP GUIDE — SESSION 1: Parent Consultation',
    steps: [
      'Review the monitoring form data before the session — identify the most frequent trigger situations',
      "Build the trigger situation list with DT ratings from the parent's observations",
      'Identify avoidance and safety behaviors (SABs) and rituals for each situation',
      "Explore parental accommodation behaviors — what does the parent do to reduce the child's distress?",
      'Introduce the CBT model — what anxiety is and why avoidance and accommodation maintain it',
      'Introduce the concept of exposures — what they are and why they work',
      'Agree on the anxiety nickname with the parent before Session 2',
      'Ask the parent: "Do you have a sense of what [child\'s name] fears would happen in that situation?" — capture their response in your session notes',
    ],
  },
  session_2: {
    header: 'STEP GUIDE — SESSION 2: Patient Consultation',
    steps: [
      'Allow up to 5 minutes for rapport — school, friends, favourite things. Keep it brief.',
      'Ask the child what they want help with — use discovery questions from the step guide',
      'Review trigger situations with the child — confirm the list, ask if anything has changed',
      'Introduce the Distress Thermometer — practice rating 2-3 situations together',
      'Introduce the Worry Thermometer nickname — suggest examples, let the child choose',
      'Identify SABs and rituals with the child for each trigger situation',
      'Brief the parent at the end — summarise what was covered and agree on next steps',
    ],
  },
  session_3: {
    header: 'STEP GUIDE — SESSION 3: Worry Hill & Exposure Ladder',
    steps: [
      'Check in on nickname and Distress Thermometer use since last session',
      'Watch the Worry Hill video with the child together',
      'Draw the Worry Hill — explain the stop sign at the top (SABs) and anxiety jail',
      'Teach the Candy Jar analogy — red candies (fear memories) vs green candies (safe experiences)',
      'Build the exposure ladder — start with the trigger situation with the lowest DT',
      'For each SAB in that situation, ask the child: "What would your DT be without doing this?"',
      'Aim for a ladder with a nice range from low DT (2-4) to high (8-10)',
      'Practice the first exposure in session 3-6 times — record DT each time',
      'Assess confidence before sending child home with the first experiment: High / Medium / Low',
      'Only proceed if confidence is High — if not, break the exposure into smaller steps',
    ],
  },
  weekly: {
    header: 'STEP GUIDE — WEEKLY SESSION',
    steps: [
      'Check in on nickname use — "Out of 10 times you felt [nickname], how many times did you use it?"',
      'Review experiment results — check BIP and DT trends since last session',
      'Note any overdue or incomplete experiments before the session',
      'Review the last action plan — what was agreed last time? How did it go?',
      'New experiments for this week — confirm child confidence is High before finalising',
      'Write and publish the new action plan before the child leaves',
      'Bring parent in for the last 5-10 minutes to review the plan together',
    ],
  },
}

function InlineMonitoringReport({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const { data: report, isLoading } = useQuery({
    queryKey: ['monitoring-report', patientId],
    queryFn: () => getMonitoringReport(patientId),
    enabled: !!patientId,
  })

  const backLink = (
    <button
      onClick={onClose}
      className="text-sm text-teal-600 font-medium hover:underline bg-transparent border-none cursor-pointer"
      style={{ padding: 0, marginBottom: '12px' }}
    >
      ← Back
    </button>
  )

  if (isLoading) {
    return (
      <div>
        {backLink}
        <p className="text-slate-400">Loading report...</p>
      </div>
    )
  }

  if (!report || report.total_entries === 0) {
    return (
      <div>
        {backLink}
        <p className="text-slate-400">No observations recorded yet.</p>
      </div>
    )
  }

  const dateFrom = report.date_range
    ? new Date(report.date_range.from + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''
  const dateTo = report.date_range
    ? new Date(report.date_range.to + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div>
      {backLink}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800 mb-1">{report.patient_name}</h1>
        <h2 className="text-base text-slate-500 font-medium mb-2">Monitoring report</h2>
        <div className="text-sm text-slate-400">
          <span>Dates: {dateFrom} &mdash; {dateTo}</span>
          <span style={{ margin: '0 8px' }}>&middot;</span>
          <span>Entries: {report.total_entries}</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--float-border)' }}>
              <th className="text-left py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider" style={{ whiteSpace: 'nowrap' }}>Date</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Situation</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">What I observed about my child</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">How I responded</th>
              <th className="text-center py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider" style={{ whiteSpace: 'nowrap' }}>Fear Level</th>
            </tr>
          </thead>
          <tbody>
            {report.entries.map((entry) => (
              <tr key={entry.id} style={{ borderBottom: '1px solid var(--float-surface-sunken)' }}>
                <td className="py-3 px-3 text-slate-500" style={{ whiteSpace: 'nowrap' }}>
                  {new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </td>
                <td className="py-3 px-3 text-slate-700">
                  {entry.situation || '--'}
                  <ParentWords entry={entry} />
                </td>
                <td className="py-3 px-3 text-slate-600">
                  {entry.child_behavior_observed || '--'}
                </td>
                <td className="py-3 px-3 text-slate-600">
                  {entry.parent_response || '--'}
                </td>
                <td className="py-3 px-3 text-center text-slate-700 font-medium">
                  {entry.fear_thermometer ?? '--'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function formatMsgTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const time = d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase()
    .replace(/\s+/g, '')
  if (isToday) return `Today ${time}`
  const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${datePart}, ${time}`
}

// Monday of the week containing `date` (Mon-Sun weeks), at local midnight
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay() // 0=Sun, 1=Mon, ..., 6=Sat
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  return d
}

// e.g. "May 11-17" or "May 30-Jun 5"
function weekRangeLabel(monday: Date): string {
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)
  const monStr = monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  if (monday.getMonth() === sunday.getMonth()) {
    return `${monStr}-${sunday.getDate()}`
  }
  const sunStr = sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${monStr}-${sunStr}`
}

function trendArrow(seq: number[]): { symbol: string; color: string } {
  if (seq.length < 2) return { symbol: '', color: '' }
  const first = seq[0]
  const last = seq[seq.length - 1]
  if (last < first) return { symbol: '↓', color: 'var(--float-success)' }
  if (last > first) return { symbol: '↑', color: 'var(--float-danger)' }
  return { symbol: '→', color: 'var(--float-text-hint)' }
}

// ── Case Conceptualization (living draft) ──
// ── Consultation checklists (Steps 3 & 4) ──
// Definitions live in ../../lib/checklists so the patient list page can share them.

// Stage 1 parent keys — preserved explicitly so the Step 3 completion logic is unchanged
// by the parent checklist being flattened into a single group.
const STAGE1_PARENT_KEYS = [
  'parent_review_monitoring',
  'parent_trigger_list',
  'parent_behaviors',
  'parent_responses',
  'parent_feared_outcome',
]

function ConsultationChecklist({ patientId, title, collapsed, onToggleCollapse, onNavigate }: {
  patientId: string
  title: string
  collapsed: boolean
  onToggleCollapse: () => void
  onNavigate: (action: ChecklistNav['action']) => void
}) {
  const qc = useQueryClient()
  const [popoverKey, setPopoverKey] = useState<string | null>(null)

  const { data: checked } = useQuery({
    queryKey: ['checklist', patientId],
    queryFn: () => getChecklist(patientId),
    enabled: !!patientId,
  })

  // The organization's configured list. Falls back to the bundled default if the request fails,
  // so a network blip leaves the clinician with a working checklist rather than an empty panel.
  const { data: orgItems } = useQuery({
    queryKey: ['checklist-items'],
    queryFn: getChecklistItems,
  })
  const items: ChecklistItemDef[] = (orgItems && orgItems.length > 0)
    ? orgItems.map(i => ({
        key: i.key,
        text: i.text,
        link: i.link_icon && i.link_label ? { icon: i.link_icon, label: i.link_label } : undefined,
        nav: i.nav_label && i.nav_action ? { label: i.nav_label, action: i.nav_action as ChecklistNav['action'] } : undefined,
      }))
    : PROCESS_CHECKLIST

  const toggleMut = useMutation({
    mutationFn: ({ key, value }: { key: string; value: boolean }) => updateChecklist(patientId, { [key]: value }),
    onMutate: async ({ key, value }) => {
      await qc.cancelQueries({ queryKey: ['checklist', patientId] })
      const prev = qc.getQueryData<ChecklistItems>(['checklist', patientId])
      qc.setQueryData<ChecklistItems>(['checklist', patientId], { ...(prev ?? {}), [key]: value })
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['checklist', patientId], ctx.prev) },
    onSettled: () => qc.invalidateQueries({ queryKey: ['checklist', patientId] }),
  })

  const checkedItems = checked ?? {}
  const allKeys = items.map(i => i.key)
  const total = allKeys.length
  const checkedCount = allKeys.filter(k => !!checkedItems[k]).length
  const progress = `${checkedCount}/${total}`

  const panelStyle = { background: 'var(--float-surface)', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-card)', padding: '16px', width: '100%', boxSizing: 'border-box' as const }

  // Collapsed: slim vertical bar
  if (collapsed) {
    return (
      <div
        onClick={onToggleCollapse}
        title={title}
        style={{ ...panelStyle, padding: '12px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
      >
        <span style={{ fontSize: '12px', color: 'var(--float-text-hint)', lineHeight: 1 }}>›</span>
        <span style={{ writingMode: 'vertical-rl', fontSize: '11px', fontWeight: 700, color: 'var(--float-primary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>CHECKLIST</span>
        <span style={{ fontSize: '12px', color: 'var(--float-text-secondary)' }}>{progress}</span>
      </div>
    )
  }

  return (
    <div style={panelStyle}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }} title={title}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--float-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Checklist</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <span style={{ fontSize: '12px', color: 'var(--float-text-hint)' }}>{progress}</span>
          <button onClick={onToggleCollapse} aria-label="Collapse checklist"
            className="bg-transparent border-none cursor-pointer"
            style={{ fontSize: '14px', color: 'var(--float-text-hint)', padding: 0, lineHeight: 1 }}>›</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {items.map(item => {
          const isChecked = !!checkedItems[item.key]
          return (
            <div key={item.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggleMut.mutate({ key: item.key, value: !isChecked })}
                style={{ accentColor: 'var(--float-primary)', width: '15px', height: '15px', marginTop: '2px', flexShrink: 0, cursor: 'pointer' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '12.5px', lineHeight: 1.4, color: isChecked ? 'var(--float-text-hint)' : 'var(--float-text)' }}>{item.text}</span>
                {item.link && (
                  <div style={{ position: 'relative', marginTop: '3px' }}>
                    <button
                      onClick={() => setPopoverKey(popoverKey === item.key ? null : item.key)}
                      className="bg-transparent border-none cursor-pointer"
                      style={{ fontSize: '11.5px', color: 'var(--float-text-hint)', padding: 0, whiteSpace: 'nowrap' }}
                    >
                      {item.link.icon} {item.link.label}
                    </button>
                    {popoverKey === item.key && (
                      <div style={{ position: 'absolute', left: 0, top: '22px', background: 'var(--float-text)', color: '#fff', fontSize: '11px', padding: '6px 10px', borderRadius: 'var(--float-radius-control)', whiteSpace: 'nowrap', zIndex: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
                        Education content coming soon
                      </div>
                    )}
                  </div>
                )}
                {item.nav && (
                  <button
                    onClick={() => onNavigate(item.nav!.action)}
                    className="bg-transparent border-none cursor-pointer"
                    style={{ display: 'block', fontSize: '11.5px', fontWeight: 600, color: 'var(--float-primary)', padding: 0, marginTop: '3px', textAlign: 'left' }}
                  >
                    {item.nav.label}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Preset session-note tags (multi-select); custom tags can also be typed.
const SESSION_NOTE_TAGS = ['Initial', 'Consult', 'Weekly', 'Review']


// ── Main Page ──
/** One number on the experiments summary. */
function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--float-text-hint)', margin: '0 0 4px' }}>
        {label}
      </p>
      <p style={{ fontSize: '22px', fontWeight: 700, color: 'var(--float-text)', margin: 0, lineHeight: 1.1 }}>
        {value}
      </p>
      {hint && <p style={{ fontSize: '11px', color: 'var(--float-text-hint)', margin: '3px 0 0' }}>{hint}</p>}
    </div>
  )
}

/** An average reduction. Null before anything has been recorded, and a rise is worth seeing too. */
function fmtDrop(v: number | null | undefined): string {
  if (v == null) return '—'
  const rounded = Math.round(v * 10) / 10
  if (rounded === 0) return 'no change'
  return rounded > 0 ? `${rounded} lower` : `${Math.abs(rounded)} higher`
}

export default function PatientPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedTriggerId, setSelectedTriggerId] = useState<string | null>(null)
  const [showTriggerAdd, setShowTriggerAdd] = useState(false)
  const [newTriggerName, setNewTriggerName] = useState('')
  const [newTriggerLibraryId, setNewTriggerLibraryId] = useState<string | null>(null)
  const [showSitSuggest, setShowSitSuggest] = useState(false)
  const [newTriggerDT, setNewTriggerDT] = useState('')
  const [newTriggerDTMax, setNewTriggerDTMax] = useState('')
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null)
  const [editTriggerName, setEditTriggerName] = useState('')
  const [deletingTriggerId, setDeletingTriggerId] = useState<string | null>(null)
  // The conversation is what you land on (Peter, 2026-09-01). Ladder and Situations are the
  // technical view, one switch away — kept, not hidden.
  // One view — the ladder. The conversation is a setup and edit flow that hangs off it, not a
  // second tab showing the same thing (Peter, 2026-09-01). The two-pane Situations builder is
  // hidden: its code is still below and rendered by nothing.
  //
  // `?edit=1` lands straight in the editor: the downward arrow uses it to come back to the screen
  // it was opened from, with `?situation=` saying which one to reopen. Read off the URL directly
  // because this runs above the useSearchParams call below.
  const [planView, setPlanView] = useState<'ladder' | 'conversation'>(
    new URLSearchParams(window.location.search).get('edit') === '1' ? 'conversation' : 'ladder'
  )
  const [deleteTriggerError, setDeleteTriggerError] = useState<string | null>(null)
  const [editingNickname, setEditingNickname] = useState(false)
  const [nicknameVal, setNicknameVal] = useState('')
  const [showSendForm, setShowSendForm] = useState(false)
  const [parentEmail, setParentEmail] = useState('')
  const [parentName, setParentName] = useState('')
  const [parentPhone, setParentPhone] = useState('')
  const [copied, setCopied] = useState(false)
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null)
  const [smsSentTo, setSmsSentTo] = useState<string | null>(null)
  const [showEntries, setShowEntries] = useState(false)
  const [msgContent, setMsgContent] = useState('')
  // 'teen', or a parent's user id: a child can have two parents and each has their own thread
  // (docs/plans/two-parent-accounts.md).
  const [msgThread, setMsgThread] = useState<string>('teen')

  // Inline monitoring report (Step 1)
  const [showInlineReport, setShowInlineReport] = useState(false)


  // Persistent access panel, opened from the patient header (any mode).
  // `accessFocus` scopes it to the card that opened it (Teen vs Parent).
  const [showTeenAccess, setShowTeenAccess] = useState(false)
  const [accessFocus, setAccessFocus] = useState<'teen' | 'parent'>('teen')
  const openAccess = (focus: 'teen' | 'parent') => {
    if (showTeenAccess && accessFocus === focus) { setShowTeenAccess(false); return }
    setAccessFocus(focus)
    setShowTeenAccess(true)
  }

  // Patient profile edit
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileName, setProfileName] = useState('')
  const [profileAge, setProfileAge] = useState('')
  const [profileGender, setProfileGender] = useState('')
  const [profilePresentations, setProfilePresentations] = useState<string[]>([])
  const [profilePhone, setProfilePhone] = useState('')

  // Session notes
  const [showNoteForm, setShowNoteForm] = useState(false)
  const [editingNote, setEditingNote] = useState<SessionNote | null>(null)
  const [noteParticipants, setNoteParticipants] = useState<SessionParticipant[]>([])
  const [noteTags, setNoteTags] = useState<string[]>([])
  const [noteTagInput, setNoteTagInput] = useState('')
  const [noteDate, setNoteDate] = useState(new Date().toISOString().split('T')[0])
  const [noteContent, setNoteContent] = useState('')
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)
  const [openNoteMenuId, setOpenNoteMenuId] = useState<string | null>(null)

  // Flat-tab navigation (replaces the old phase spine + rail + setup-step machine).
  // The tab lives in the URL so other surfaces can land on one — session mode exits back to Plan.
  const [searchParams, setSearchParams] = useSearchParams()
  const tabParam = searchParams.get('tab')
  const hasTabParam = (TAB_IDS as readonly string[]).includes(tabParam ?? '')
  const activeTab: TabId = hasTabParam ? (tabParam as TabId) : 'monitoring'
  const setActiveTab = (id: TabId) => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', id)
    setSearchParams(next, { replace: true })
  }
  const [notesWhoFilter, setNotesWhoFilter] = useState<SessionParticipant | null>(null)
  const [sessionTagFilter, setSessionTagFilter] = useState<string | null>(null)
  const [showClinicianAccess, setShowClinicianAccess] = useState(false)
  const [processPanelOpen, setProcessPanelOpen] = useState(false)
  const [processTab, setProcessTab] = useState<'checklist' | 'tips'>('checklist')
  // An explicit ?tab= is the clinician's intent — don't let the default-tab effect override it.
  const stepInitializedRef = useRef(hasTabParam)

  // Case conceptualization — living draft, persisted to the backend formulation record
  const [conceptualizationDraft, setConceptualizationDraft] = useState<ConceptualizationDraft>(EMPTY_CONCEPTUALIZATION)
  const formulationIdRef = useRef<string | null>(null)
  const formulationHydratedRef = useRef(false)
  const skipNextFormulationSaveRef = useRef(false)
  const formulationSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: formulation } = useQuery({
    queryKey: ['formulation', patientId],
    queryFn: () => fetchFormulation(patientId!),
    enabled: !!patientId,
  })

  // Populate the draft once from the persisted formulation, if one exists
  useEffect(() => {
    if (formulationHydratedRef.current) return
    if (formulation === undefined) return
    if (formulation) {
      formulationIdRef.current = formulation.id
      skipNextFormulationSaveRef.current = true
      setConceptualizationDraft({
        situations: formulation.situations ?? [],
        behaviors: formulation.behaviors ?? [],
        accommodationPatterns: formulation.accommodation_patterns ?? [],
        parentFearedOutcomes: formulation.parent_feared_outcomes ?? [],
        patientFearedOutcomes: formulation.patient_feared_outcomes ?? [],
        lastUpdatedStep: formulation.last_updated_step ?? 0,
      })
    }
    formulationHydratedRef.current = true
  }, [formulation])

  // Persist the draft to the backend on change (1.5s debounce)
  useEffect(() => {
    if (!patientId) return
    if (!formulationHydratedRef.current) return
    if (skipNextFormulationSaveRef.current) { skipNextFormulationSaveRef.current = false; return }
    const draft = conceptualizationDraft
    if (formulationSaveTimerRef.current) clearTimeout(formulationSaveTimerRef.current)
    formulationSaveTimerRef.current = setTimeout(async () => {
      const payload = {
        situations: draft.situations,
        behaviors: draft.behaviors,
        accommodation_patterns: draft.accommodationPatterns,
        parent_feared_outcomes: draft.parentFearedOutcomes,
        patient_feared_outcomes: draft.patientFearedOutcomes,
        last_updated_step: draft.lastUpdatedStep,
      }
      try {
        if (formulationIdRef.current) {
          await updateFormulation(patientId, payload)
        } else {
          const created = await createFormulation(patientId, payload)
          formulationIdRef.current = created.id
        }
      } catch {
        // Draft persists on the next change; a failed autosave is non-blocking.
      }
    }, 1500)
    return () => { if (formulationSaveTimerRef.current) clearTimeout(formulationSaveTimerRef.current) }
  }, [conceptualizationDraft, patientId])

  // Clean up formulation save timer on unmount
  useEffect(() => () => {
    if (formulationSaveTimerRef.current) clearTimeout(formulationSaveTimerRef.current)
  }, [])

  // Action plans
  const [showPlanEditor, setShowPlanEditor] = useState(false)
  const [editingPlan, setEditingPlan] = useState<ActionPlan | null>(null)
  const [planDate, setPlanDate] = useState(new Date().toISOString().split('T')[0])
  const [planNickname, setPlanNickname] = useState('')
  const [planNextAppt, setPlanNextAppt] = useState('')
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null)
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder: 'Start writing...' })],
    content: '',
    editorProps: { attributes: { class: 'prose prose-sm max-w-none focus:outline-none min-h-[180px] px-3 py-2' } },
  })

  // Queries
  const { data: patient } = useQuery({ queryKey: ['patient', patientId], queryFn: () => getPatient(patientId!), enabled: !!patientId })

  // Closing switches off the child's and the parent's apps, so it asks first. Reopening does not —
  // giving someone their app back is not a decision anyone regrets.
  const closing = useMutation({
    mutationFn: (reopen: boolean) =>
      reopen ? reopenPatient(patientId!) : closePatient(patientId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient', patientId] })
      queryClient.invalidateQueries({ queryKey: ['patients'] })
    },
  })

  const handleClose = () => {
    const ok = window.confirm(
      "Close treatment for this patient?\n\n" +
      "They keep everything and you can still see all of it. What stops is their app and their " +
      "parent's app — they will be able to sign in and see \"All done for now\".\n\n" +
      "You can reopen it later."
    )
    if (ok) closing.mutate(false)
  }

  const handleReopen = () => closing.mutate(true)
  const { data: plan } = useQuery({ queryKey: ['plan', patientId], queryFn: () => getTreatmentPlan(patientId!), enabled: !!patientId })
  const { data: rawTriggers } = useQuery({ queryKey: ['triggers', plan?.id], queryFn: () => getTriggers(plan!.id), enabled: !!plan?.id })
  // Placeholder situations (e.g. the parent-DA anchor) are filtered out of every situation list/count
  const triggers = useMemo(() => rawTriggers?.filter(t => !t.is_placeholder), [rawTriggers])
  const { data: monitoringForm } = useQuery({ queryKey: ['monitoring-form', patientId], queryFn: () => getMonitoringForm(patientId!), enabled: !!patientId })
  const { data: sessionNotes } = useQuery({ queryKey: ['session-notes', patientId], queryFn: () => getSessionNotes(patientId!), enabled: !!patientId })
  const { data: checklistItems } = useQuery({ queryKey: ['checklist', patientId], queryFn: () => getChecklist(patientId!), enabled: !!patientId })
  const { data: actionPlans } = useQuery({ queryKey: ['action-plans', patientId], queryFn: () => getActionPlans(patientId!), enabled: !!patientId })
  // What needs attention: the same list the patient list shows, worked out on the server.
  const { data: attention = [] } = useQuery({
    queryKey: ['attention', patientId],
    queryFn: () => getPatientAttention(patientId!),
    enabled: !!patientId,
  })
  const { data: messages } = useQuery({ queryKey: ['messages', patientId], queryFn: () => getMessages(patientId!), enabled: !!patientId, refetchInterval: 5000, refetchIntervalInBackground: true, refetchOnWindowFocus: true })
  const { data: parents = [] } = useQuery({ queryKey: ['parents', patientId], queryFn: () => listParents(patientId!), enabled: !!patientId })
  // Opening a different patient goes back to the child's thread: a parent id from the last patient
  // is not a parent of this one (the server refuses it, but the panel should not ask).
  useEffect(() => { setMsgThread('teen') }, [patientId])
  const parentThreadId = msgThread === 'teen' ? null : msgThread
  const { data: parentMessages } = useQuery({
    queryKey: ['parent-messages', patientId, parentThreadId],
    queryFn: () => getOneParentsMessages(patientId!, parentThreadId!),
    enabled: !!patientId && !!parentThreadId,
    refetchInterval: 5000, refetchIntervalInBackground: true, refetchOnWindowFocus: true,
  })
  // The child's thread and each parent's thread share this panel; the list on the left switches.
  const activeMessages = parentThreadId ? (parentMessages ?? []) : (messages ?? [])
  const messagesScrollRef = useRef<HTMLDivElement>(null)
  // Keep the newest message in view when one arrives (poll), the thread switches,
  // or when the tab opens.
  useEffect(() => {
    const el = messagesScrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages?.length, parentMessages?.length, msgThread])
  const { data: patientExperiments } = useQuery({ queryKey: ['experiments', patientId], queryFn: () => getPatientExperiments(patientId!), enabled: !!patientId })

  // Fetch DA status for every trigger situation (incl. the placeholder, so the parent DA is captured)
  const triggerIds = (rawTriggers ?? []).map(t => t.id)
  const { data: daStatuses } = useQuery({
    queryKey: ['da-statuses', patientId, triggerIds.join(',')],
    queryFn: async () => {
      const results = await Promise.all(triggerIds.map(async (id) => {
        const da = await getSituationDownwardArrow(id)
        return [id, da] as const
      }))
      return Object.fromEntries(results) as Record<string, DownwardArrow | null>
    },
    enabled: triggerIds.length > 0
  })

  useEffect(() => { if (triggers?.length && !selectedTriggerId) setSelectedTriggerId(triggers[0].id) }, [triggers])
  const selectedTrigger = triggers?.find(t => t.id === selectedTriggerId)

  const activitySummary = (() => {
    if (monitoringForm?.status === 'in_progress') return `Monitoring in progress`
    if (monitoringForm?.status === 'submitted') return `Monitoring submitted`
    if (plan?.status === 'active') return 'Active treatment'
    if (plan?.status === 'setup') return `Setup \u00B7 ${triggers?.length ?? 0} situation${(triggers?.length ?? 0) === 1 ? '' : 's'}`
    return 'New patient'
  })()

  // Mutations
  const createPlanMut = useMutation({ mutationFn: () => createTreatmentPlan(patientId!, { clinical_track: 'exposure', parent_visibility_level: 'summary' }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plan', patientId] }) })
  const nicknameMut = useMutation({
    mutationFn: () => updatePlanNickname(patientId!, plan!.id, nicknameVal.trim()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['plan', patientId] }); setEditingNickname(false) }
  })
  // Situation library suggestions (select-from-list; typing a new name still creates one)
  const { data: sitSuggestions } = useQuery({
    queryKey: ['situation-library', newTriggerName.trim()],
    queryFn: () => searchSituationLibrary(newTriggerName.trim()),
    enabled: showTriggerAdd && showSitSuggest && newTriggerName.trim().length >= 2,
  })
  const addTriggerMut = useMutation({
    mutationFn: () => createTrigger(plan!.id, { name: newTriggerName, distress_thermometer_rating: clampDt(newTriggerDT), distress_thermometer_max: clampDt(newTriggerDTMax), situation_library_id: newTriggerLibraryId ?? undefined }),
    onSuccess: (t) => { queryClient.invalidateQueries({ queryKey: ['triggers', plan?.id] }); setNewTriggerName(''); setNewTriggerLibraryId(null); setShowSitSuggest(false); setNewTriggerDT(''); setNewTriggerDTMax(''); setShowTriggerAdd(false); setSelectedTriggerId(t.id) }
  })
  const updateTriggerNameMut = useMutation({
    mutationFn: () => updateTrigger(plan!.id, editingTriggerId!, { name: editTriggerName.trim() }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['triggers', plan?.id] }); setEditingTriggerId(null) }
  })
  const deleteTriggerMut = useMutation({
    mutationFn: (id: string) => deleteTrigger(plan!.id, id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['triggers', plan?.id] })
      setDeletingTriggerId(null)
      setDeleteTriggerError(null)
      if (selectedTriggerId === id) setSelectedTriggerId(null)
    },
    onError: () => setDeleteTriggerError('Could not delete that situation. Try again.')
  })

  const sendFormMutation = useMutation({
    mutationFn: (params: { parent_email?: string; parent_name?: string; parent_phone?: string } = {}) =>
      sendMonitoringForm(patientId!, params),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['monitoring-form', patientId] })
      if (data.full_link) {
        try { navigator.clipboard.writeText(data.full_link) } catch { const el = document.createElement('textarea'); el.value = data.full_link; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el) }
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
      if (data.email_sent && parentEmail) setEmailSentTo(parentEmail)
      if (data.sms_sent && parentPhone) setSmsSentTo(parentPhone)
      setShowSendForm(false)
      setParentEmail('')
      setParentName('')
      setParentPhone('')
    }
  })

  const handleCopyLink = async () => {
    if (monitoringForm?.access_token) {
      const url = `${window.location.origin}/monitor/${monitoringForm.access_token}`
      try { await navigator.clipboard.writeText(url) } catch { const el = document.createElement('textarea'); el.value = url; document.body.appendChild(el); el.select(); document.execCommand('copy'); document.body.removeChild(el) }
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleSendAll = () => {
    sendFormMutation.mutate({
      parent_email: parentEmail || undefined,
      parent_name: parentName || undefined,
      parent_phone: parentPhone || undefined
    })
  }

  const handleSendLinkOnly = () => {
    sendFormMutation.mutate({})
  }


  // Preliminary Report (Step 2) — AI clinical summary, persisted on the formulation
  const [reportLoading, setReportLoading] = useState(false)
  const [reportError, setReportError] = useState<string | null>(null)
  const [generatedReport, setGeneratedReport] = useState<PreliminaryReport | null>(null)
  const preliminaryReport = generatedReport ?? formulation?.preliminary_report ?? null

  const handleGenerateReport = async () => {
    setReportLoading(true)
    setReportError(null)
    try {
      const data = await generatePreliminaryReport(patientId!)
      setGeneratedReport(data)
      // The endpoint creates the formulation row if none existed. Sync the id ref + cache
      // so the draft auto-save updates that row rather than creating a duplicate.
      const f = await fetchFormulation(patientId!)
      if (f) {
        formulationIdRef.current = f.id
        queryClient.setQueryData(['formulation', patientId], f)
      }
    } catch (err: any) {
      setReportError(err?.response?.data?.detail || 'Report generation failed. Please try again.')
    } finally {
      setReportLoading(false)
    }
  }


  const daysSinceSent = monitoringForm?.sent_at
    ? Math.floor((Date.now() - new Date(monitoringForm.sent_at).getTime()) / (1000 * 60 * 60 * 24))
    : null

  const sendMsgMut = useMutation({
    mutationFn: () => parentThreadId
      ? sendParentMessage(patientId!, parentThreadId, msgContent, 'general')
      : sendMessage(patientId!, patient!.user_id, msgContent, 'general'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: parentThreadId ? ['parent-messages', patientId, parentThreadId] : ['messages', patientId] })
      setMsgContent('')
    }
  })

  const updatePatientMut = useMutation({
    mutationFn: () => updatePatient(patientId!, {
      name: profileName.trim(),
      age: profileAge.trim() === '' ? null : Number(profileAge),
      gender: profileGender.trim() === '' ? null : profileGender.trim(),
      anxiety_presentations: profilePresentations.length > 0 ? profilePresentations : null,
      phone_number: profilePhone.trim() === '' ? null : profilePhone.trim(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patient', patientId] })
      setEditingProfile(false)
    }
  })

  const openProfileEdit = () => {
    setProfileName(patient?.name || '')
    setProfileAge(patient?.age != null ? String(patient.age) : '')
    setProfileGender(patient?.gender || '')
    setProfilePresentations(patient?.anxiety_presentations ?? [])
    setProfilePhone(patient?.phone_number || '')
    setEditingProfile(true)
  }

  const toggleProfilePresentation = (value: string) => {
    setProfilePresentations(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    )
  }

  // Session notes
  const resetNoteForm = () => { setShowNoteForm(false); setEditingNote(null); setNoteParticipants([]); setNoteTags([]); setNoteTagInput(''); setNoteDate(new Date().toISOString().split('T')[0]); setNoteContent('') }
  const createNoteMut = useMutation({ mutationFn: () => createSessionNote(patientId!, { participants: noteParticipants, tags: noteTags, session_date: noteDate, content: noteContent }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['session-notes', patientId] }); resetNoteForm() } })
  // Peter, 2026-09-15: editing a draft and pressing Update is the same as approving it — reading
  // it through and changing it IS the check. docs/plans/session-recording.md
  const updateNoteMut = useMutation({
    mutationFn: () => updateSessionNote(editingNote!.id, {
      participants: noteParticipants, tags: noteTags, session_date: noteDate, content: noteContent,
      ...(editingNote!.is_draft ? { is_draft: false as const } : {}),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['session-notes', patientId] }); resetNoteForm() },
  })
  const deleteNoteMut = useMutation({ mutationFn: (id: string) => deleteSessionNote(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session-notes', patientId] }) })

  // Action plans
  const getEditorContent = useCallback(() => editor?.getHTML() || '', [editor])
  const resetPlanEditor = useCallback(() => { if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current); setShowPlanEditor(false); setEditingPlan(null); editor?.commands.setContent('') }, [editor])
  const createPlanActionMut = useMutation({ mutationFn: () => createActionPlan(patientId!, { session_date: planDate, nickname: planNickname || undefined, content: getEditorContent(), next_appointment: planNextAppt || undefined }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['action-plans', patientId] }) })
  const updatePlanActionMut = useMutation({ mutationFn: () => updateActionPlan(editingPlan!.id, { session_date: planDate, nickname: planNickname || undefined, content: getEditorContent(), next_appointment: planNextAppt || undefined }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['action-plans', patientId] }) })
  const publishPlanMut = useMutation({ mutationFn: (id: string) => publishActionPlan(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ['action-plans', patientId] }) })
  const deletePlanMut = useMutation({ mutationFn: (id: string) => deleteActionPlan(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['action-plans', patientId] }); setDeletingPlanId(null) } })

  const handleSavePlan = () => {
    console.log('[ActionPlan] Save draft clicked', { editingPlanId: editingPlan?.id, hasContent: !!getEditorContent() })
    if (editingPlan) {
      updatePlanActionMut.mutate(undefined, { onSuccess: () => resetPlanEditor() })
    } else {
      createPlanActionMut.mutate(undefined, { onSuccess: () => resetPlanEditor() })
    }
  }

  const handlePublishPlan = () => {
    console.log('[ActionPlan] Publish clicked', { editingPlanId: editingPlan?.id })
    if (editingPlan) {
      updatePlanActionMut.mutate(undefined, { onSuccess: () => { publishPlanMut.mutate(editingPlan.id, { onSuccess: () => resetPlanEditor() }) } })
    } else {
      createPlanActionMut.mutate(undefined, { onSuccess: (d: ActionPlan) => { publishPlanMut.mutate(d.id, { onSuccess: () => resetPlanEditor() }) } })
    }
  }

  const openEditPlan = (ap: ActionPlan) => {
    setEditingPlan(ap)
    setPlanDate(ap.session_date)
    setPlanNickname(ap.nickname || '')
    setPlanNextAppt(ap.next_appointment || '')
    editor?.commands.setContent(ap.content || '')
    setShowPlanEditor(true)
  }

  useEffect(() => {
    if (showPlanEditor && editingPlan && editor) {
      autoSaveTimerRef.current = setInterval(() => updatePlanActionMut.mutate(), 30000)
      return () => { if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current) }
    }
  }, [showPlanEditor, editingPlan, editor])


  const legendNote = { fontSize: '11px', color: 'var(--float-text-hint)', margin: '0 0 10px' }
  const cardStyle = { background: 'var(--float-surface)', borderRadius: 'var(--float-radius-card)', border: '1px solid var(--float-border-strong)', boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', padding: '20px', width: '100%', boxSizing: 'border-box' as const }

  // Tab badge counts
  const unreadMessageCount = (messages ?? []).filter(m => !m.read_at).length
  const draftPlanCount = (actionPlans ?? []).filter(ap => !ap.visible_to_patient).length

  // Process-panel checklist progress (setup groups: parent + patient consults)
  const processChecklistKeys = PROCESS_CHECKLIST.map(i => i.key)
  const processChecklistDone = processChecklistKeys.filter(k => !!(checklistItems ?? {})[k]).length
  const processChecklistTotal = processChecklistKeys.length

  // Experiments tab — overdue helper + tab badge count
  const todayISO = new Date().toISOString().split('T')[0]
  const isOverdue = (e: { scheduled_date: string | null; status: string }) =>
    !!e.scheduled_date && e.scheduled_date.split('T')[0] < todayISO && e.status !== 'completed' && e.status !== 'skipped' && e.status !== 'too_hard'

  // Current focus — most recent experiment activity (by completed_date | scheduled_date | created_at)
  const recentExperiment = [...(patientExperiments ?? [])]
    .filter(e => e.avoidance_behavior_id || e.behavior_name)
    .sort((a, b) => {
      const ad = a.completed_date || a.scheduled_date || a.created_at
      const bd = b.completed_date || b.scheduled_date || b.created_at
      return new Date(bd).getTime() - new Date(ad).getTime()
    })[0]
  const focusBehaviorId = recentExperiment?.avoidance_behavior_id ?? null
  const focusBehaviorName = recentExperiment?.behavior_name ?? null
  const focusExperiments = recentExperiment
    ? (patientExperiments ?? []).filter(e =>
        focusBehaviorId
          ? e.avoidance_behavior_id === focusBehaviorId
          : !!focusBehaviorName && e.behavior_name === focusBehaviorName
      )
    : []
  const focusCompletedAsc = focusExperiments
    .filter(e => e.status === 'completed' && e.completed_date)
    .sort((a, b) => new Date(a.completed_date!).getTime() - new Date(b.completed_date!).getTime())
  const focusBipSequence: number[] = [
    ...focusCompletedAsc.map(e => e.bip_before).filter((v): v is number => v != null).map(v => Math.round(Number(v))),
  ]
  const lastFocusBipAfter = focusCompletedAsc[focusCompletedAsc.length - 1]?.bip_after
  if (lastFocusBipAfter != null) focusBipSequence.push(Math.round(Number(lastFocusBipAfter)))
  const focusDtSequence: number[] = focusCompletedAsc
    .map(e => e.distress_thermometer_actual)
    .filter((v): v is number => v != null)
    .map(v => Number(v))
  const focusNextUpcoming = focusExperiments
    .filter(e => e.status === 'committed' && e.scheduled_date && e.scheduled_date.split('T')[0] >= todayISO)
    .sort((a, b) => (a.scheduled_date ?? '').localeCompare(b.scheduled_date ?? ''))[0]

  const attentionProblems = attention.some(r => r.tone === 'problem')

  // Timeline — group completed + committed by Mon-Sun week, newest first
  const timelineItems = (patientExperiments ?? [])
    .filter(e => (e.status === 'completed' || e.status === 'committed'))
    .map(e => ({
      e,
      displayDate: e.completed_date || e.scheduled_date,
    }))
    .filter((x): x is { e: typeof x.e; displayDate: string } => !!x.displayDate)
  const weekBuckets = new Map<string, { monday: Date; items: typeof timelineItems }>()
  for (const item of timelineItems) {
    const monday = getMondayOfWeek(new Date(item.displayDate))
    const key = monday.toISOString().split('T')[0]
    if (!weekBuckets.has(key)) weekBuckets.set(key, { monday, items: [] })
    weekBuckets.get(key)!.items.push(item)
  }
  const sortedWeeks = [...weekBuckets.values()]
    .map(b => ({
      ...b,
      items: [...b.items].sort((a, b) => new Date(b.displayDate).getTime() - new Date(a.displayDate).getTime()),
    }))
    .sort((a, b) => b.monday.getTime() - a.monday.getTime())
  const currentWeekMonday = getMondayOfWeek(new Date())
  const lastWeekMonday = new Date(currentWeekMonday); lastWeekMonday.setDate(currentWeekMonday.getDate() - 7)
  const recentWeeks = sortedWeeks.filter(w =>
    w.monday.getTime() === currentWeekMonday.getTime() ||
    w.monday.getTime() === lastWeekMonday.getTime()
  )
  const earlierWeeks = sortedWeeks.filter(w =>
    w.monday.getTime() !== currentWeekMonday.getTime() &&
    w.monday.getTime() !== lastWeekMonday.getTime()
  )

  // Progress charts query (Experiments tab — Progress section)
  const { data: progress } = useQuery({
    queryKey: ['progress', patientId],
    queryFn: () => getPatientProgress(patientId!),
    enabled: !!patientId && activeTab === 'experiments'
  })
  const progressChartData = progress?.recent_experiments
    .filter(e => e.completed_date)
    .map((e) => ({
      date: e.completed_date ? new Date(e.completed_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
      bip_before: e.bip_before,
      bip_after: e.bip_after,
      // Both lines, the same as Belief in Prediction. What they expected against what happened is
      // the disconfirmation — the chart showing only the actual was hiding half the point, and the
      // backend has been sending the expected value all along.
      dt_expected: e.distress_thermometer_expected,
      dt_actual: e.distress_thermometer_actual,
    })) ?? []

  // Expanded "what learned" entries
  const [expandedLearningIds, setExpandedLearningIds] = useState<Set<string>>(new Set())
  const [showEarlier, setShowEarlier] = useState(false)
  const toggleLearning = (id: string) => {
    setExpandedLearningIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const notesList = sessionNotes ?? []
  const hasPatientDA = !!daStatuses && Object.values(daStatuses).some(da => da?.facilitated_by === 'practitioner')
  // Setup-mode completion (4 steps). "Build Treatment Plan" moved to the
  // Treatment workspace, so setup is just the assessment steps now.
  const stepComplete: boolean[] = [
    !!monitoringForm && !!monitoringForm.sent_at,
    (triggers?.length ?? 0) >= 1,
    notesList.some(n => (n.participants ?? []).includes('parent')) || STAGE1_PARENT_KEYS.every(k => !!(checklistItems ?? {})[k]),
    notesList.some(n => (n.participants ?? []).includes('patient')) && hasPatientDA,
  ]
  const firstIncompleteStep = stepComplete.findIndex(c => !c)

  // Treatment mode unlocks once the assessment steps are done.
  const treatmentUnlocked = firstIncompleteStep === -1

  // Default landing tab once core data has loaded: the Plan once assessment is
  // done, otherwise Monitoring (the start of the workflow). Tabs are freely
  // navigable — this only sets the initial view.
  const coreLoaded = !!patient
    && monitoringForm !== undefined
    && sessionNotes !== undefined
    && patientExperiments !== undefined
    && actionPlans !== undefined
    && plan !== undefined
    && (!plan?.id || triggers !== undefined)
  useEffect(() => {
    if (stepInitializedRef.current) return
    if (!coreLoaded) return
    setActiveTab(treatmentUnlocked ? 'plan' : 'monitoring')
    stepInitializedRef.current = true
  }, [coreLoaded, treatmentUnlocked])


  // ── Unified session-notes list (participant + flexible tags) ──
  const noteFieldCap: CSSProperties = { fontSize: '11px', fontWeight: 700, color: 'var(--float-text-hint)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }
  // One chip style for the whole app (components/ui/buttons.ts). These were two different chips
  // eight lines apart: one filled solid teal when on, the other pale teal.
  const notePill = (on: boolean): CSSProperties => chip(on, 'md')
  const noteFilterGroupCap: CSSProperties = { fontSize: '11px', fontWeight: 700, color: 'var(--float-text-hint)', textTransform: 'uppercase', letterSpacing: '0.05em' }
  const noteTagFilterChip = (on: boolean): CSSProperties => chip(on, 'sm')

  // A joint session records both, so it shows under either filter.
  const noteParticipantFilter = notesWhoFilter
  const allNoteTags = Array.from(new Set(notesList.flatMap(n => n.tags ?? []))).sort()
  const filteredNotes = notesList.filter(n =>
    (noteParticipantFilter === null || (n.participants ?? []).includes(noteParticipantFilter)) &&
    (sessionTagFilter === null || (n.tags ?? []).includes(sessionTagFilter))
  )
  const toggleNoteParticipant = (p: SessionParticipant) => setNoteParticipants(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])
  const toggleNoteTag = (t: string) => setNoteTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  const addCustomNoteTag = () => {
    const t = noteTagInput.trim()
    if (t && !noteTags.includes(t)) setNoteTags(prev => [...prev, t])
    setNoteTagInput('')
  }
  const startNewNote = () => { setEditingNote(null); setNoteParticipants(noteParticipantFilter ? [noteParticipantFilter] : []); setNoteTags([]); setNoteTagInput(''); setNoteDate(new Date().toISOString().split('T')[0]); setNoteContent(''); setShowNoteForm(true) }
  const beginEditNote = (n: SessionNote) => { setEditingNote(n); setNoteParticipants(n.participants ?? []); setNoteTags(n.tags ?? []); setNoteTagInput(''); setNoteDate(n.session_date); setNoteContent(n.content); setShowNoteForm(true) }

  // Who a participant is, for the avatar chip: the patient's or the parent's own first name when we
  // have it, so a note reads "Leo" / "Rachel" rather than the abstract "Patient" / "Parent".
  const participantName = (pt: SessionParticipant) => {
    const full = pt === 'patient' ? patient?.name : patient?.parent_name
    const first = full?.trim().split(/\s+/)[0]
    return first || (pt === 'patient' ? 'Patient' : 'Parent')
  }
  const participantChipColors = (pt: SessionParticipant) => pt === 'parent'
    ? { bg: 'var(--float-primary-light)', text: 'var(--float-primary-dark)', avatar: 'var(--float-primary)' }
    : { bg: 'var(--float-accent-purple-bg)', text: 'var(--float-accent-purple-text)', avatar: 'var(--float-accent-purple)' }

  const sessionNotesList = (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="text-sm font-semibold text-slate-700">Session notes</span>
          {filteredNotes.length > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{filteredNotes.length}</span>}
        </div>
        {!showNoteForm && (
          <div style={buttonRow}>
            {/* On the clinician's phone: record the session, and a draft note is written from it.
                docs/plans/session-recording.md */}
            <button onClick={() => navigate(`/patients/${patientId}/record`)} style={btn('secondary', 'sm')}>
              <span aria-hidden="true" style={liveDot} />
              Record session
            </button>
            <button onClick={startNewNote} style={btn('primary', 'sm')}>+ Add note</button>
          </div>
        )}
      </div>
      <RecordingsInProgress patientId={patientId!} />

      {/* Two filters, two dimensions — who was in the room, and how the note is tagged. They sit
          in one row but are labelled and divided so they don't read as one list of choices. Hidden
          until there are enough notes to be worth filtering — with a handful, they just take space. */}
      {notesList.length > 3 && !showNoteForm && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <span style={noteFilterGroupCap}>Who</span>
          <button onClick={() => setNotesWhoFilter(null)} style={noteTagFilterChip(notesWhoFilter === null)}>Anyone</button>
          {(['parent', 'patient'] as SessionParticipant[]).map(pt => (
            <button key={pt} onClick={() => setNotesWhoFilter(notesWhoFilter === pt ? null : pt)} style={noteTagFilterChip(notesWhoFilter === pt)}>{pt === 'parent' ? 'Parent' : 'Patient'}</button>
          ))}
          <span style={{ width: '1px', alignSelf: 'stretch', minHeight: '20px', background: 'var(--float-border-strong)', margin: '0 6px' }} />
          <span style={noteFilterGroupCap}>Tag</span>
          <button onClick={() => setSessionTagFilter(null)} style={noteTagFilterChip(sessionTagFilter === null)}>Any</button>
          {allNoteTags.map(t => <button key={t} onClick={() => setSessionTagFilter(sessionTagFilter === t ? null : t)} style={noteTagFilterChip(sessionTagFilter === t)}>{t}</button>)}
        </div>
      )}

      {showNoteForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
          <div>
            <div style={noteFieldCap}>Who was the session with?</div>
            <p style={{ fontSize: '11px', color: 'var(--float-text-hint)', margin: '-4px 0 8px' }}>Pick both if they were in the room together.</p>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['parent', 'patient'] as SessionParticipant[]).map(p => (
                <button key={p} type="button" onClick={() => toggleNoteParticipant(p)} style={notePill(noteParticipants.includes(p))}>{p === 'parent' ? 'Parent' : 'Patient'}</button>
              ))}
            </div>
          </div>
          <div>
            <div style={noteFieldCap}>Tags</div>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {Array.from(new Set([...SESSION_NOTE_TAGS, ...noteTags])).map(t => (
                <button key={t} type="button" onClick={() => toggleNoteTag(t)} style={notePill(noteTags.includes(t))}>{t}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input value={noteTagInput} onChange={e => setNoteTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomNoteTag() } }} placeholder="Add custom tag…" className="text-xs border border-slate-200 rounded" style={{ flex: 1, padding: '6px 8px', boxSizing: 'border-box' }} />
              <button type="button" onClick={addCustomNoteTag} disabled={!noteTagInput.trim()} className="text-xs text-teal-600 font-medium bg-transparent border-none cursor-pointer disabled:opacity-40">+ Add</button>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--float-text-secondary)' }}>Date:</label>
            <input type="date" value={noteDate} onChange={e => setNoteDate(e.target.value)} className="text-xs border border-slate-200 rounded" style={{ padding: '4px 8px' }} />
          </div>
          {/* Tall enough to read a whole note written from a recording, which runs to several
              hundred words; a four-line box meant scrolling to edit a sentence. */}
          <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} rows={editingNote ? 18 : 6} placeholder="Session notes..." className="text-xs border border-slate-200 rounded" style={{ width: '100%', padding: '10px', minHeight: editingNote ? '380px' : '110px', lineHeight: 1.55, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          <div style={buttonRow}>
            <button onClick={() => editingNote ? updateNoteMut.mutate() : createNoteMut.mutate()} disabled={!noteContent.trim() || noteParticipants.length === 0} className="disabled:opacity-40" style={btn('primary')}>{editingNote ? (editingNote.is_draft ? 'Update and approve' : 'Update') : 'Save'}</button>
            <button onClick={resetNoteForm} style={btn('quiet')}>Cancel</button>
          </div>
        </div>
      )}

      {showNoteForm ? null : filteredNotes.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredNotes.map(n => {
            const d = new Date(n.session_date + 'T00:00:00')
            const expanded = expandedNoteId === n.id
            return (
              <div
                key={n.id}
                onClick={() => setExpandedNoteId(expanded ? null : n.id)}
                onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--float-border-strong)' }}
                onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--float-border)' }}
                style={{ display: 'grid', gridTemplateColumns: '48px 1fr auto', gap: '14px', alignItems: 'start', background: 'var(--float-surface)', border: '0.5px solid var(--float-border)', borderRadius: 'var(--float-radius-card)', padding: '12px 12px 12px 14px', cursor: 'pointer' }}
              >
                {/* Date column: the timeline reads straight down, newest first. */}
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--float-text-strong)', lineHeight: 1.1 }}>{d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                  <div style={{ fontSize: '11px', color: 'var(--float-text-hint)', marginTop: '2px' }}>{d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                </div>

                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    {/* Who was there, as an avatar chip — visually distinct from the grey tags. */}
                    {(n.participants ?? []).length === 0 && <span className="px-1 py-0.5 rounded font-medium" style={{ fontSize: '11px', background: 'var(--float-surface-sunken)', color: 'var(--float-text-hint)' }}>&mdash;</span>}
                    {(n.participants ?? []).map(pt => {
                      const c = participantChipColors(pt)
                      return (
                        <span key={pt} style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', background: c.bg, color: c.text, fontSize: '11px', fontWeight: 500, padding: '2px 8px 2px 3px', borderRadius: 'var(--float-radius-pill)' }}>
                          <span style={{ width: '16px', height: '16px', borderRadius: '50%', background: c.avatar, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px' }}>{participantName(pt).charAt(0).toUpperCase()}</span>
                          {participantName(pt)}
                        </span>
                      )
                    })}
                    {n.is_draft && <span className="px-1 py-0.5 rounded" style={{ fontSize: '11px', background: 'var(--float-warning-bg)', color: 'var(--float-warning)', fontWeight: 700 }}>Draft · from a recording</span>}
                    {(n.tags ?? []).map(t => <span key={t} style={{ fontSize: '11px', color: 'var(--float-text-secondary)', background: 'var(--float-surface-sunken)', border: '0.5px solid var(--float-border)', padding: '2px 8px', borderRadius: 'var(--float-radius-control)' }}>{t}</span>)}
                  </div>
                  {/* Two lines when collapsed, cut on a line rather than mid-word; full text when opened. */}
                  <p style={expanded
                    ? { whiteSpace: 'pre-wrap', margin: 0, fontSize: '12px', color: 'var(--float-text-secondary)', lineHeight: 1.5 }
                    : { margin: 0, fontSize: '12px', color: 'var(--float-text-secondary)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {n.content}
                  </p>
                  <div onClick={e => e.stopPropagation()}>
                    <RecordedNoteDetails note={n} patientId={patientId!} />
                  </div>
                </div>

                {/* Edit and Delete live behind a menu, so Delete is not a red button on every row. */}
                <div style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  <button aria-label="More actions" onClick={() => setOpenNoteMenuId(openNoteMenuId === n.id ? null : n.id)} style={{ border: 'none', background: 'transparent', color: 'var(--float-text-hint)', fontSize: '18px', lineHeight: 1, padding: '2px 6px', cursor: 'pointer' }}>&hellip;</button>
                  {openNoteMenuId === n.id && (
                    <>
                      <div onClick={() => setOpenNoteMenuId(null)} style={{ position: 'fixed', inset: 0, zIndex: 10 }} />
                      <div style={{ position: 'absolute', right: 0, top: '26px', zIndex: 11, background: 'var(--float-surface)', border: '0.5px solid var(--float-border-strong)', borderRadius: 'var(--float-radius-control)', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', width: '132px', overflow: 'hidden' }}>
                        <button onClick={() => { setOpenNoteMenuId(null); beginEditNote(n) }} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: '9px 12px', fontSize: '12px', color: 'var(--float-text)', cursor: 'pointer' }}>Edit</button>
                        <button onClick={() => { setOpenNoteMenuId(null); if (confirm('Delete this note?')) deleteNoteMut.mutate(n.id) }} style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', borderTop: '0.5px solid var(--float-surface-sunken)', background: 'transparent', padding: '9px 12px', fontSize: '12px', color: 'var(--float-danger)', cursor: 'pointer' }}>Delete</button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ) : !showNoteForm && (
        <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', lineHeight: '1.5', margin: 0 }}>
          No session notes{noteParticipantFilter || sessionTagFilter ? ' match this filter' : ' yet'}. Add one to capture clinical observations.
        </p>
      )}
    </div>
  )

  const situationsExist = (triggers?.length ?? 0) > 0
  const hasNewMonitoring = plan?.has_new_monitoring_entries ?? true

  const monitoringExtractContent = (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text)', margin: 0 }}>Analyze Monitoring Data</h2>
        {(monitoringForm?.entries_count ?? 0) >= 3 && (
          <Button
            kind="primary"
            size="sm"
            onClick={handleGenerateReport}
            disabled={reportLoading}
            style={{ whiteSpace: 'nowrap', flexShrink: 0 }}
          >
            {reportLoading ? 'Analyzing…' : (preliminaryReport ? 'Re-analyze with AI' : 'Analyze with AI')}
          </Button>
        )}
      </div>
      {situationsExist && (
        hasNewMonitoring ? (
          <p style={{ fontSize: '12px', color: 'var(--float-text-hint)', lineHeight: '1.5', margin: '0 0 12px' }}>
            New observations have been added since last analysis.
          </p>
        ) : (
          <p style={{ fontSize: '12px', color: 'var(--float-text-hint)', lineHeight: '1.5', margin: '0 0 12px' }}>
            Last analyzed {plan?.last_extracted_at ? new Date(plan.last_extracted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}. Add new monitoring observations to re-analyze.
          </p>
        )
      )}
      {!monitoringForm ? (
        <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', margin: 0 }}>Send a parent monitoring form first (Step 1).</p>
      ) : (monitoringForm.entries_count ?? 0) === 0 ? (
        <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', margin: 0 }}>No monitoring entries yet. Once the parent logs observations they'll appear here for extraction.</p>
      ) : (
        <div>
          <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', lineHeight: '1.5', margin: '0 0 12px' }}>
            Reads the whole monitoring log and writes the report below. Nothing is added to the
            treatment plan — you add situations yourself in the ladder builder.
          </p>
          {(monitoringForm.entries_count ?? 0) < 3 && (
            <p style={{ fontSize: '12px', color: 'var(--float-text-hint)', margin: 0 }}>Add more entries first.</p>
          )}
        </div>
      )}
    </div>
  )

  const preliminaryReportContent = (reportLoading || reportError || preliminaryReport) ? (
    <div style={cardStyle}>
      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text)', marginBottom: '4px' }}>Preliminary Report &amp; Treatment Targets</div>
      <p style={{ fontSize: '12px', color: 'var(--float-text-hint)', margin: '0 0 16px' }}>AI clinical summary synthesized from the parent monitoring data.</p>
      {reportLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
          <div className="animate-spin" style={{ width: '20px', height: '20px', border: '3px solid var(--float-border)', borderTopColor: 'var(--float-primary)', borderRadius: '50%' }} />
          <span style={{ fontSize: '13px', color: 'var(--float-text-secondary)' }}>Analyzing monitoring data…</span>
        </div>
      )}
      {reportError && <p style={{ fontSize: '13px', color: 'var(--float-danger)', margin: '0 0 4px' }}>{reportError}</p>}
      {!reportLoading && preliminaryReport && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <div style={reportSectionHeaderStyle}>Situations</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[...preliminaryReport.situations].sort((a, b) => a.fear_thermometer - b.fear_thermometer).map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--float-text-hint)', width: '18px', textAlign: 'right', flexShrink: 0, lineHeight: 1.6 }}>{i + 1}.</span>
                  <span style={{ flex: 1, fontSize: '13px', color: 'var(--float-text)', lineHeight: 1.5 }}>{s.name}</span>
                  <span style={{ flexShrink: 0, marginTop: '1px' }}><DTBadge value={s.fear_thermometer} /></span>
                </div>
              ))}
            </div>
          </div>
          <ReportSection label="Parental responses" items={preliminaryReport.parental_responses} />
          <ReportSection label={preliminaryReport.safety_section_label || 'Safety & avoidance behaviors'} items={preliminaryReport.safety_behaviors} />
          <ReportSection label="Treatment targets" items={preliminaryReport.treatment_targets} />
          {preliminaryReport.generated_at && (
            <p style={{ fontSize: '11px', color: 'var(--float-border-strong)', margin: 0 }}>
              Generated {new Date(preliminaryReport.generated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>
      )}
    </div>
  ) : null


  // Checklist item navigation links (Step 4 patient checklist)
  const handleChecklistNav = (action: 'treatmentPlan' | 'openArrow') => {
    if (action === 'treatmentPlan') {
      setActiveTab('plan')
    } else if (action === 'openArrow') {
      // The arrow used to be a section on the Plan tab. It became its own mode on 2026-08-24,
      // so the checklist step now opens that rather than scrolling to a form.
      navigate(`/patients/${patientId}/arrow`)
    }
  }

  const monitoringCard = (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', margin: '0 0 12px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--float-text)', margin: 0 }}>Parent monitoring form</h2>

      </div>

      {!monitoringForm ? (
        <div>
          <p style={{ fontSize: '13px', color: 'var(--float-text-secondary)', lineHeight: '1.5', margin: '0 0 12px' }}>
            Send a monitoring form to the parent. They'll observe their child's anxiety for about a week before your first appointment.
          </p>

          {(emailSentTo || smsSentTo) && (
            <div style={{ marginBottom: '12px' }}>
              {emailSentTo && (
                <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg" style={{ marginBottom: '4px' }}>
                  <span>&#10003;</span> Email sent to {emailSentTo}
                </div>
              )}
              {smsSentTo && (
                <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                  <span>&#10003;</span> SMS sent to {smsSentTo}
                </div>
              )}
            </div>
          )}

          {!showSendForm ? (
            <button
              onClick={() => { setShowSendForm(true); if (patient?.parent_email) setParentEmail(patient.parent_email); if (patient?.parent_name) setParentName(patient.parent_name); if (patient?.parent_phone) setParentPhone(patient.parent_phone) }}
              style={btn('primary', 'md')}
            >
              Send monitoring form
            </button>
          ) : (
            <div style={{ background: 'var(--float-surface-muted)', borderRadius: 'var(--float-radius-control)', padding: '14px' }}>
              <div style={{ marginBottom: '10px' }}>
                <label className="block text-xs font-medium text-slate-500 mb-1">Parent email (optional)</label>
                <input type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} placeholder="parent@email.com"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div style={{ marginBottom: '10px' }}>
                <label className="block text-xs font-medium text-slate-500 mb-1">Parent name (optional)</label>
                <input type="text" value={parentName} onChange={e => setParentName(e.target.value)} placeholder="e.g. Sarah"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label className="block text-xs font-medium text-slate-500 mb-1">Parent phone for SMS (optional)</label>
                <input type="tel" value={parentPhone} onChange={e => setParentPhone(e.target.value)} placeholder="+1 (555) 123-4567"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
              </div>
              <div className="flex flex-wrap gap-2">
                {(parentEmail || parentPhone) && (
                  <button onClick={handleSendAll} disabled={sendFormMutation.isPending}
                    style={btn('primary', 'md')}>
                    {sendFormMutation.isPending ? 'Sending...' :
                      parentEmail && parentPhone ? 'Send both + copy link' :
                      parentEmail ? 'Send email + copy link' : 'Send SMS + copy link'}
                  </button>
                )}
                <button onClick={handleSendLinkOnly} disabled={sendFormMutation.isPending}
                  style={btn((parentEmail || parentPhone) ? 'secondary' : 'primary', 'md')}>
                  {sendFormMutation.isPending ? 'Creating...' : 'Just copy link'}
                </button>
                <button onClick={() => setShowSendForm(false)} style={btn('quiet', 'md')}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div>
          {/* Status row */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                monitoringForm.status === 'submitted' ? 'bg-green-100 text-green-700' :
                monitoringForm.status === 'in_progress' ? 'bg-teal-100 text-teal-700' :
                'bg-amber-100 text-amber-700'
              }`}>
                {monitoringForm.status === 'in_progress' ? 'in progress' : monitoringForm.status}
              </span>
              {monitoringForm.entries_count != null && (
                <span className="text-sm text-slate-500">{monitoringForm.entries_count} {monitoringForm.entries_count === 1 ? 'entry' : 'entries'}</span>
              )}
              {daysSinceSent != null && (
                <span className="text-sm text-slate-400">{daysSinceSent === 0 ? 'Sent today' : `Sent ${daysSinceSent}d ago`}</span>
              )}
            </div>
            <button onClick={handleCopyLink} className="text-xs text-teal-600 font-medium hover:underline bg-transparent border-none cursor-pointer">
              {copied ? 'Copied!' : 'Copy link'}
            </button>
          </div>

          {/* Entries list */}
          {(monitoringForm.entries_count ?? 0) > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <button onClick={() => setShowEntries(!showEntries)} className="text-sm text-teal-600 font-medium hover:underline bg-transparent border-none cursor-pointer">
                {showEntries ? 'Hide entries' : 'View entries'}
              </button>
              {showEntries && monitoringForm.entries && (
                <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {monitoringForm.entries.map((entry: any) => (
                    <div key={entry.id} style={{ padding: '8px 12px', background: 'var(--float-surface-muted)', borderRadius: 'var(--float-radius-control)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span className="text-xs font-medium text-slate-400">
                          {new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        {entry.fear_thermometer != null && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${entry.fear_thermometer >= 7 ? 'bg-red-100 text-red-700' : entry.fear_thermometer >= 4 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                            Fear Level {entry.fear_thermometer}
                          </span>
                        )}
                      </div>
                      {entry.situation && <p className="text-sm text-slate-700" style={{ margin: 0 }}>{entry.situation}</p>}
                      {entry.child_behavior_observed && <p className="text-xs text-slate-500" style={{ margin: '2px 0 0' }}><span className="font-medium">Observed:</span> {entry.child_behavior_observed}</p>}
                      {entry.parent_response && <p className="text-xs text-slate-500" style={{ margin: '2px 0 0' }}><span className="font-medium">Response:</span> {entry.parent_response}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Report button */}
          {(monitoringForm.entries_count ?? 0) > 0 && (
            <div style={{ marginBottom: '12px' }}>
              <button onClick={() => setShowInlineReport(true)}
                style={btn((monitoringForm.entries_count ?? 0) >= 5 ? 'primary' : 'secondary', 'md')}>
                View monitoring report
              </button>
            </div>
          )}

          {/* Resend form — always available */}
          <div style={{ borderTop: '1px solid var(--float-surface-sunken)', paddingTop: '12px' }}>
            {!showSendForm ? (
              <button onClick={() => { setShowSendForm(true); if (patient?.parent_email) setParentEmail(patient.parent_email); if (patient?.parent_name) setParentName(patient.parent_name); if (patient?.parent_phone) setParentPhone(patient.parent_phone) }}
                className="text-xs text-teal-600 font-medium hover:underline bg-transparent border-none cursor-pointer">
                Resend Monitoring form
              </button>
            ) : (
              <div style={{ background: 'var(--float-surface-muted)', borderRadius: 'var(--float-radius-control)', padding: '14px' }}>
                <div style={{ marginBottom: '10px' }}>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Parent email (optional)</label>
                  <input type="email" value={parentEmail} onChange={e => setParentEmail(e.target.value)} placeholder="parent@email.com"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Parent name (optional)</label>
                  <input type="text" value={parentName} onChange={e => setParentName(e.target.value)} placeholder="e.g. Sarah"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div style={{ marginBottom: '12px' }}>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Parent phone for SMS (optional)</label>
                  <input type="tel" value={parentPhone} onChange={e => setParentPhone(e.target.value)} placeholder="+1 (555) 123-4567"
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {(parentEmail || parentPhone) && (
                    <button onClick={handleSendAll} disabled={sendFormMutation.isPending}
                      style={btn('primary', 'md')}>
                      {sendFormMutation.isPending ? 'Sending...' :
                        parentEmail && parentPhone ? 'Send both + copy link' :
                        parentEmail ? 'Send email + copy link' : 'Send SMS + copy link'}
                    </button>
                  )}
                  <button onClick={handleSendLinkOnly} disabled={sendFormMutation.isPending}
                    style={btn((parentEmail || parentPhone) ? 'secondary' : 'primary', 'md')}>
                    {sendFormMutation.isPending ? 'Creating...' : 'Just copy link'}
                  </button>
                  <button onClick={() => setShowSendForm(false)} style={btn('quiet', 'md')}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )


  const treatmentPlanBuilder = (plan ? (
    <div style={{ ...cardStyle, padding: '0', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--float-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className="text-sm font-semibold text-slate-700">Treatment Plan</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${plan.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{plan.status}</span>
          <span style={{ fontSize: '12px', color: 'var(--float-border-strong)' }}>&middot;</span>
          {editingNickname ? (
            <>
              <input value={nicknameVal} onChange={e => setNicknameVal(e.target.value)} placeholder="Nickname"
                className="text-xs border border-slate-200 rounded" autoFocus
                style={{ padding: '3px 8px', width: '140px' }}
                onKeyDown={e => { if (e.key === 'Enter' && nicknameVal.trim()) nicknameMut.mutate(); if (e.key === 'Escape') setEditingNickname(false) }} />
              {/* Save was 11px teal text; a Save should look like a button. */}
              <button onClick={() => nicknameMut.mutate()} disabled={!nicknameVal.trim() || nicknameMut.isPending} style={btn('primary', 'sm')}>Save</button>
              <button onClick={() => setEditingNickname(false)} style={btn('quiet', 'sm')}>Cancel</button>
            </>
          ) : plan.nickname ? (
            <>
              <span style={{ fontSize: '13px', fontStyle: 'italic', color: 'var(--float-primary)' }}>
                &ldquo;{plan.nickname}&rdquo;
              </span>
              <button onClick={() => { setNicknameVal(plan.nickname || ''); setEditingNickname(true) }}
                className="text-[11px] text-slate-400 hover:text-teal-600 bg-transparent border-none cursor-pointer">edit</button>
            </>
          ) : (
            <button onClick={() => { setNicknameVal(''); setEditingNickname(true) }}
              className="text-[11px] text-teal-600 font-medium bg-transparent border-none cursor-pointer">+ Add nickname</button>
          )}
        </div>
        {/* The two co-located, child-facing interviews. Both launch from here — the downward
            arrow is its own mode, not a detour inside session mode. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          {/* No separate Downward arrow button. It belongs to a situation, and it is reachable
              from the situation inside the conversation — which is where you are when you decide
              you want it. Peter, 2026-09-01: it folds in rather than being a second button. */}
          {/* Nothing here. Full screen belongs to the conversation and lives with it — on the
              ladder it would offer to blow up a screen you are not looking at. */}
        </div>
      </div>

      {/* The interview, inline. The same component the full-screen route renders, so the Full
          screen button is a change of presentation rather than a different screen. It hands back
          to the ladder when it is done. */}
      {planView === 'conversation' ? (
        <div style={{ padding: '4px 20px 16px', borderTop: '1px solid var(--float-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', padding: '4px 0 8px' }}>
            <button
              onClick={() => setPlanView('ladder')}
              className="text-xs font-medium bg-transparent border-none cursor-pointer"
              style={{ color: 'var(--float-text-secondary)' }}
            >
              ← Back to the ladder
            </button>
            {/* Same interview, no clinician chrome — for when the child is looking at the screen. */}
            <Button kind="secondary" size="sm" onClick={() => navigate(`/patients/${patientId}/session${searchParams.get('situation') ? `?situation=${searchParams.get('situation')}` : ''}`)}>
              ⛶ Full screen
            </Button>
          </div>
          <SessionInterview
            patientId={patientId!}
            embedded
            openSituationId={searchParams.get('situation')}
            onExit={() => setPlanView('ladder')}
          />
        </div>
      ) : (
        <FlatLadder
          planId={plan.id}
          patientId={patientId!}
          triggers={triggers ?? []}
          ladderActive={!!plan.ladder_active}
          recommendedRungId={plan.recommended_rung_id ?? null}
          onStartConversation={() => setPlanView('conversation')}
        />
      )}

      {/* HIDDEN 2026-09-01. The two-pane Situations builder. Peter: "let's hide the full builder
          UI completely." Kept rather than deleted — the arrow, tags and per-situation editing live
          here and there is no replacement for some of it yet. `false &&` rather than deleting the
          markup so it is one word to bring back. */}
      <div style={{ display: false ? 'grid' : 'none', gridTemplateColumns: '45% 55%', borderTop: '1px solid var(--float-border)', marginTop: '0', minHeight: '320px' }}>
        {/* Situations list */}
        <div style={{ background: 'var(--float-surface-muted)', borderRight: '1px solid var(--float-border)', display: 'flex', flexDirection: 'column', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--float-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Situations</span>
            {!showTriggerAdd && <button onClick={() => setShowTriggerAdd(true)} style={btn('secondary', 'sm')}>+ Add</button>}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {triggers?.map(t => (
              <div key={t.id} className="group" style={{ width: '100%', textAlign: 'left', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', background: t.id === selectedTriggerId ? 'var(--float-primary-light)' : 'transparent', borderLeft: t.id === selectedTriggerId ? '2px solid var(--float-primary)' : '2px solid transparent', borderRadius: 'var(--float-radius-control)', marginBottom: '8px' }}
                onClick={() => { if (editingTriggerId !== t.id && deletingTriggerId !== t.id) setSelectedTriggerId(t.id) }}>
                {deletingTriggerId === t.id ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }} onClick={e => e.stopPropagation()}>
                    <span style={{ fontSize: '11px', color: 'var(--float-danger)', lineHeight: '1.4' }}>Delete this situation and all its behaviors?</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => deleteTriggerMut.mutate(t.id)} disabled={deleteTriggerMut.isPending} className="text-[11px] text-white font-medium border-none cursor-pointer disabled:opacity-50" style={{ background: 'var(--float-danger)', padding: '3px 8px', borderRadius: 'var(--float-radius-control)' }}>{deleteTriggerMut.isPending ? 'Deleting…' : 'Yes'}</button>
                      <button onClick={() => { setDeletingTriggerId(null); setDeleteTriggerError(null) }} className="text-[11px] text-slate-500 bg-transparent border-none cursor-pointer">Cancel</button>
                    </div>
                    {deleteTriggerError && <span style={{ fontSize: '11px', color: 'var(--float-danger)', lineHeight: '1.4' }}>{deleteTriggerError}</span>}
                  </div>
                ) : editingTriggerId === t.id ? (
                  <input
                    value={editTriggerName}
                    onChange={e => setEditTriggerName(e.target.value)}
                    autoFocus
                    onClick={e => e.stopPropagation()}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        if (editTriggerName.trim() && editTriggerName !== t.name) updateTriggerNameMut.mutate()
                        else setEditingTriggerId(null)
                      }
                      if (e.key === 'Escape') setEditingTriggerId(null)
                    }}
                    onBlur={() => {
                      if (editTriggerName.trim() && editTriggerName !== t.name) updateTriggerNameMut.mutate()
                      else setEditingTriggerId(null)
                    }}
                    className="text-xs border border-slate-200 rounded"
                    style={{ flex: 1, padding: '4px 6px', minWidth: 0 }}
                  />
                ) : (
                  <>
                    <span style={{ fontSize: '5px', color: t.is_active ? 'var(--float-primary)' : 'var(--float-border-strong)' }}>●</span>
                    <span
                      className="text-slate-700"
                      style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: 'var(--float-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >{t.name}</span>
                    <DTBadge value={t.distress_thermometer_rating} max={t.distress_thermometer_max} />
                    <button
                      onClick={e => { e.stopPropagation(); setSelectedTriggerId(t.id); setEditTriggerName(t.name); setEditingTriggerId(t.id) }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer"
                      style={{ padding: '0 2px', display: 'inline-flex', alignItems: 'center' }}
                      title="Edit situation name"
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setDeletingTriggerId(t.id) }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer"
                      style={{ fontSize: '12px', padding: '0 2px' }}
                      title="Delete situation"
                    >×</button>
                  </>
                )}
              </div>
            ))}
            {showTriggerAdd && (
              <div style={{ background: 'var(--float-surface-muted)', borderRadius: 'var(--float-radius-control)', padding: '12px', marginBottom: '8px' }}>
                <div style={{ position: 'relative', marginBottom: '10px' }}>
                  <input
                    value={newTriggerName}
                    onChange={e => { setNewTriggerName(e.target.value); setNewTriggerLibraryId(null); setShowSitSuggest(true) }}
                    placeholder="Situation name — type to search or add new"
                    className="text-sm border border-slate-200 rounded"
                    style={{ width: '100%', height: '36px', padding: '6px 10px', boxSizing: 'border-box' }}
                    autoFocus
                    onKeyDown={e => e.key === 'Enter' && newTriggerName.trim() && addTriggerMut.mutate()}
                  />
                  {showSitSuggest && (sitSuggestions?.length ?? 0) > 0 && (
                    <div style={{ position: 'absolute', top: '38px', left: 0, right: 0, zIndex: 30, background: 'var(--float-surface)', border: '1px solid var(--float-border-strong)', borderRadius: 'var(--float-radius-control)', boxShadow: '0 6px 16px rgba(0,0,0,0.12)', maxHeight: '180px', overflowY: 'auto' }}>
                      {sitSuggestions!.map(s => (
                        <button key={s.id} type="button" onClick={() => { setNewTriggerName(s.name); setNewTriggerLibraryId(s.id); setShowSitSuggest(false) }}
                          className="cursor-pointer" style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--float-surface-sunken)', padding: '8px 10px', fontSize: '13px', color: 'var(--float-text)' }}>
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', color: 'var(--float-text-secondary)', display: 'block', marginBottom: '4px' }}>Fear Level — one value, or a range with an optional max:</label>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <button type="button" onClick={() => setNewTriggerDT(String(Math.max(1, (Number(newTriggerDT) || 1) - 1)))} style={iconBtn('sm')}>−</button>
                    <input value={newTriggerDT} onChange={e => setNewTriggerDT(clampDtInput(e.target.value))} type="number" min="1" max="10" placeholder="min" className="text-sm border border-slate-200 rounded" style={{ width: '70px', padding: '6px 8px', textAlign: 'center', height: '32px', boxSizing: 'border-box' }} />
                    <button type="button" onClick={() => setNewTriggerDT(String(Math.min(10, (Number(newTriggerDT) || 0) + 1)))} style={iconBtn('sm')}>+</button>
                    <span style={{ color: 'var(--float-text-hint)', padding: '0 2px' }}>–</span>
                    <input value={newTriggerDTMax} onChange={e => setNewTriggerDTMax(clampDtInput(e.target.value))} type="number" min="1" max="10" placeholder="max" className="text-sm border border-slate-200 rounded" style={{ width: '70px', padding: '6px 8px', textAlign: 'center', height: '32px', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
                  <button onClick={() => addTriggerMut.mutate()} disabled={!newTriggerName.trim()} style={btn('primary', 'sm')}>Add situation</button>
                  <button onClick={() => { setShowTriggerAdd(false); setNewTriggerName(''); setNewTriggerLibraryId(null); setShowSitSuggest(false); setNewTriggerDT(''); setNewTriggerDTMax('') }} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                </div>
              </div>
            )}
            {(!triggers || triggers.length === 0) && !showTriggerAdd && (
              <div>
                <p style={{ fontSize: '11px', color: 'var(--float-text-hint)', lineHeight: '1.4', margin: '0 0 8px' }}>Add trigger situations identified in your sessions.</p>
                <Button kind="primary" onClick={() => setShowTriggerAdd(true)}>+ Add first situation</Button>
              </div>
            )}
          </div>
        </div>
        {/* Right panel — behaviors */}
        <div style={{ overflow: 'hidden' }}>
          {selectedTrigger ? (
            <BehaviorPanel trigger={selectedTrigger} planId={plan.id} patientId={patientId!} planStatus={plan.status} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '13px', color: 'var(--float-text-hint)', padding: '16px' }}>Select a situation</div>
          )}
        </div>
      </div>
    </div>
  ) : (
    <div style={{ ...cardStyle, textAlign: 'center' }}>
      <p className="text-sm text-slate-500" style={{ marginBottom: '4px' }}>No treatment plan yet</p>
      <p className="text-xs text-slate-400" style={{ marginBottom: '12px' }}>Create one to start configuring trigger situations</p>
      <Button kind="primary" onClick={() => createPlanMut.mutate()} disabled={createPlanMut.isPending}>{createPlanMut.isPending ? 'Creating...' : 'Create treatment plan'}</Button>
    </div>
  ))

  const experimentsContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

      {/* Current Focus */}
      <div style={cardStyle}>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider" style={{ marginBottom: '12px' }}>Current focus</div>
        {recentExperiment ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '6px', marginBottom: '14px' }}>
              {recentExperiment.situation_name && (
                <>
                  <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text)' }}>{recentExperiment.situation_name}</span>
                  <span style={{ fontSize: '13px', color: 'var(--float-border-strong)' }}>·</span>
                </>
              )}
              <span style={{ fontSize: '14px', color: 'var(--float-text-secondary)' }}>{recentExperiment.behavior_name || 'Experiment'}</span>
            </div>
            {focusBipSequence.length > 0 || focusDtSequence.length > 0 ? (
              <>
                {focusBipSequence.length > 0 && (() => {
                  const t = trendArrow(focusBipSequence)
                  return (
                    <div style={{ fontSize: '13px', color: 'var(--float-text-secondary)', marginBottom: '6px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--float-text-secondary)', minWidth: '34px' }}>BIP:</span>
                      <span>{focusBipSequence.map(v => `${v}%`).join('  →  ')}</span>
                      {t.symbol && <span style={{ color: t.color, fontWeight: 700, fontSize: '15px' }}>{t.symbol}</span>}
                    </div>
                  )
                })()}
                {focusDtSequence.length > 0 && (() => {
                  const t = trendArrow(focusDtSequence)
                  return (
                    <div style={{ fontSize: '13px', color: 'var(--float-text-secondary)', marginBottom: '14px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ fontWeight: 700, color: 'var(--float-text-secondary)', minWidth: '34px' }}>Fear Level:</span>
                      <span>{focusDtSequence.map(v => `${v}`).join('  →  ')}</span>
                      {t.symbol && <span style={{ color: t.color, fontWeight: 700, fontSize: '15px' }}>{t.symbol}</span>}
                    </div>
                  )
                })()}
              </>
            ) : (
              <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', margin: '0 0 14px' }}>No experiments recorded yet for this behavior</p>
            )}
            {focusNextUpcoming && (() => {
              const conf = confidenceMeta(focusNextUpcoming.confidence_level)
              const dateStr = focusNextUpcoming.scheduled_date
                ? new Date(focusNextUpcoming.scheduled_date.split('T')[0] + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                : ''
              return (
                <div style={{ fontSize: '13px', color: 'var(--float-text-secondary)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <span style={{ fontWeight: 700, color: 'var(--float-text-secondary)' }}>Next experiment:</span>
                  <span>{dateStr}</span>
                  {conf.label && (
                    <>
                      <span style={{ color: 'var(--float-border-strong)' }}>·</span>
                      <span>{conf.emoji} {conf.label} confidence</span>
                    </>
                  )}
                  <span style={{ color: 'var(--float-border-strong)' }}>·</span>
                  <span>{EXPERIMENT_STATUS_LABEL[focusNextUpcoming.status] || focusNextUpcoming.status}</span>
                </div>
              )
            })()}
          </>
        ) : (
          <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', margin: 0 }}>No experiments recorded yet for this behavior</p>
        )}
      </div>

      {/* Needs attention: the same reasons as the patient list, worked out on the server
          (app/services/attention_service.py) so the two cannot disagree. Problems first, then what
          is new to look at. docs/plans/clinician-notifications.md */}
      {attention.length > 0 && (
        <div style={{ background: attentionProblems ? 'var(--float-warning-bg)' : 'var(--float-primary-light)', border: `1px solid ${attentionProblems ? 'var(--float-warning-border)' : 'var(--float-primary-mid)'}`, borderRadius: 'var(--float-radius-card)', padding: '16px 20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: attentionProblems ? 'var(--float-warning)' : 'var(--float-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>
            {attentionProblems ? 'Needs attention' : 'New to look at'}
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {attention.map(r => (
              <li key={r.kind} style={{ fontSize: '13px', color: r.tone === 'new' ? 'var(--float-primary)' : 'var(--float-warning)' }}>
                <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <span style={{ fontWeight: 700 }}>·</span>
                  <span>{r.tone === 'new' && <strong>New: </strong>}{r.text}</span>
                  {r.kind === 'overdue' && (
                    <button onClick={() => setActiveTab('chat')} className="bg-amber-600 text-white rounded text-xs font-medium border-none cursor-pointer" style={{ padding: '4px 10px' }}>Remind teen</button>
                  )}
                </div>
                {r.items.length > 0 && (
                  <ul style={{ margin: '4px 0 0 18px', padding: 0, listStyle: 'none', fontSize: '12.5px' }}>
                    {r.items.map(item => (
                      <li key={item.id}>
                        &ldquo;{item.name}&rdquo;
                        {item.date ? ` · ${new Date(item.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* What the numbers say. Every one of these was already computed by the backend and shown
          nowhere — including how often the feared outcome actually happened, which is the strongest
          number in the app. */}
      {progress?.summary && progress.summary.total_experiments_completed > 0 && (
        <div style={{ ...cardStyle, marginBottom: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '18px' }}>
            {/* total_experiments_planned counts the ones STILL open, not the total — so it is a
                second number, not a denominator. */}
            <Stat
              label="Exposures done"
              value={`${progress.summary.total_experiments_completed}`}
              hint={
                progress.summary.total_experiments_planned > 0
                  ? `${progress.summary.total_experiments_planned} still to do`
                  : 'None outstanding'
              }
            />
            <Stat
              label="Fear drop, on average"
              value={fmtDrop(progress.summary.average_distress_thermometer_reduction)}
              hint="How much lower the fear was than expected"
            />
            <Stat
              label="Belief drop, on average"
              value={fmtDrop(progress.summary.average_bip_reduction)}
              hint="How much less they believed it afterwards"
            />
            <Stat
              label="Feared outcome happened"
              value={`${progress.summary.experiments_where_feared_outcome_occurred} of ${progress.summary.total_experiments_completed}`}
              hint="The number worth showing the child"
            />
          </div>
        </div>
      )}

      {/* Progress charts — side by side (hidden when not enough data) */}
      {progressChartData.length >= 2 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={cardStyle}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text)', margin: '0 0 4px' }}>Belief in Prediction</h2>
            <p style={legendNote}>Dashed: before &middot; Solid: after</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={progressChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(value, name) => [`${value}%`, name === 'bip_before' ? 'Before' : 'After']} contentStyle={{ border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-control)', fontSize: '12px' }} />
                <Legend formatter={(value) => value === 'bip_before' ? 'Before' : 'After'} wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="bip_before" stroke={CHART.primarySoft} strokeWidth={2} dot={{ r: 3, fill: CHART.primarySoft }} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="bip_after" stroke={CHART.primary} strokeWidth={2} dot={{ r: 3, fill: CHART.primary }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={cardStyle}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text)', margin: '0 0 4px' }}>Fear Level</h2>
            <p style={legendNote}>Dashed: expected &middot; Solid: what happened</p>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={progressChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: CHART.axis }} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(value, name) => [value, name === 'dt_expected' ? 'Expected' : 'Actual']}
                  contentStyle={{ border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-control)', fontSize: '12px' }}
                />
                <Line type="monotone" dataKey="dt_expected" stroke={CHART.primarySoft} strokeWidth={2} dot={{ r: 3, fill: CHART.primarySoft }} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="dt_actual" stroke={CHART.primary} strokeWidth={2} dot={{ r: 3, fill: CHART.primary }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Experiment timeline */}
      <div style={cardStyle}>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider" style={{ marginBottom: '12px' }}>Experiment timeline</div>
        {sortedWeeks.length === 0 ? (
          <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', margin: 0 }}>No experiments recorded yet.</p>
        ) : (() => {
          type WeekBucket = typeof sortedWeeks[number]
          type TimelineItem = WeekBucket['items'][number]
          const weekHeaderStyle = { fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--float-text-secondary)', marginTop: '16px', marginBottom: '4px', textTransform: 'uppercase' as const }
          const firstWeekHeaderStyle = { ...weekHeaderStyle, marginTop: 0 }
          const renderRow = ({ e, displayDate }: TimelineItem) => {
            const completed = e.status === 'completed'
            const overdue = e.status === 'committed' && isOverdue(e)
            const upcoming = e.status === 'committed' && !overdue
            const expanded = expandedLearningIds.has(e.id)
            const dateStr = new Date(displayDate.split('T')[0] + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            const bipBefore = e.bip_before != null ? Math.round(Number(e.bip_before)) : null
            const bipAfter = e.bip_after != null ? Math.round(Number(e.bip_after)) : null
            const dtActual = e.distress_thermometer_actual != null ? Number(e.distress_thermometer_actual) : null
            const conf = confidenceMeta(e.confidence_level)
            const canExpand = completed && !!e.what_learned
            const behaviorLabel = e.behavior_name || e.plan_description || 'Experiment'
            return (
              <div key={e.id}>
                <div
                  onClick={() => { if (canExpand) toggleLearning(e.id) }}
                  style={{
                    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px',
                    padding: '6px 0', fontSize: '13px',
                    background: overdue ? 'var(--float-bg)' : 'transparent',
                    cursor: canExpand ? 'pointer' : 'default',
                  }}
                >
                  {completed && (
                    <span style={{ width: '18px', height: '18px', borderRadius: 'var(--float-radius-pill)', background: 'var(--float-success-bg)', color: 'var(--float-success)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>&#10003;</span>
                  )}
                  {overdue && <span style={{ color: 'var(--float-warning)', fontSize: '14px', flexShrink: 0 }}>⚠</span>}
                  {upcoming && <span style={{ color: 'var(--float-text-hint)', fontSize: '14px', flexShrink: 0 }}>📅</span>}
                  <span style={{ fontWeight: 600, color: overdue ? 'var(--float-warning)' : 'var(--float-text)', flexShrink: 0 }}>{dateStr}</span>
                  <span style={{ color: 'var(--float-border-strong)' }}>·</span>
                  <span
                    title={behaviorLabel}
                    style={{
                      fontSize: '13px',
                      color: overdue ? 'var(--float-warning)' : 'var(--float-text-secondary)',
                      minWidth: '200px',
                      maxWidth: '300px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >{behaviorLabel}</span>
                  {completed && bipBefore != null && bipAfter != null && (
                    <>
                      <span style={{ color: 'var(--float-border-strong)' }}>·</span>
                      <span style={{ color: 'var(--float-text-secondary)' }}>BIP {bipBefore}%&rarr;{bipAfter}%</span>
                    </>
                  )}
                  {completed && dtActual != null && (
                    <>
                      <span style={{ color: 'var(--float-border-strong)' }}>·</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--float-text-secondary)' }}>Fear Level <DTBadge value={dtActual} /></span>
                    </>
                  )}
                  {completed && e.feared_outcome_occurred != null && (
                    <>
                      <span style={{ color: 'var(--float-border-strong)' }}>·</span>
                      <span style={{ color: e.feared_outcome_occurred ? 'var(--float-danger)' : 'var(--float-success)', fontWeight: 600 }}>
                        {e.feared_outcome_occurred ? '✗ Yes' : '✓ No'}
                      </span>
                    </>
                  )}
                  {overdue && (
                    <>
                      <span style={{ color: 'var(--float-border-strong)' }}>·</span>
                      <span style={{ color: 'var(--float-warning)', fontWeight: 600 }}>not recorded</span>
                    </>
                  )}
                  {upcoming && conf.label && (
                    <>
                      <span style={{ color: 'var(--float-border-strong)' }}>·</span>
                      <span style={{ color: 'var(--float-text-secondary)' }}>{conf.emoji} {conf.label} confidence</span>
                    </>
                  )}
                </div>
                {canExpand && expanded && (
                  <div style={{ margin: '4px 0 4px 30px', padding: '8px 12px', background: 'var(--float-surface-sunken)', borderRadius: 'var(--float-radius-control)', fontSize: '12px', color: 'var(--float-text-secondary)', lineHeight: '1.5' }}>
                    <span style={{ color: 'var(--float-text-hint)', fontWeight: 600 }}>What they learned: </span>{e.what_learned}
                  </div>
                )}
              </div>
            )
          }
          const renderWeek = (week: WeekBucket, isFirst: boolean) => {
            const isCurrent = week.monday.getTime() === currentWeekMonday.getTime()
            const isLast = week.monday.getTime() === lastWeekMonday.getTime()
            const range = weekRangeLabel(week.monday)
            const label = isCurrent
              ? `THIS WEEK (${range})`
              : isLast
                ? `LAST WEEK (${range})`
                : range.toUpperCase()
            return (
              <div key={week.monday.toISOString()}>
                <div style={isFirst ? firstWeekHeaderStyle : weekHeaderStyle}>{label}</div>
                <div>{week.items.map(renderRow)}</div>
              </div>
            )
          }
          return (
            <>
              {recentWeeks.length === 2 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: earlierWeeks.length > 0 ? '16px' : 0 }}>
                  {recentWeeks.map(w => renderWeek(w, true))}
                </div>
              ) : recentWeeks.length === 1 ? (
                <div style={{ marginBottom: earlierWeeks.length > 0 ? '16px' : 0 }}>
                  {renderWeek(recentWeeks[0], true)}
                </div>
              ) : null}
              {earlierWeeks.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowEarlier(!showEarlier)}
                    className="text-xs text-teal-600 font-medium bg-transparent border-none cursor-pointer"
                    style={{ padding: 0 }}
                  >
                    {showEarlier ? 'Hide earlier experiments ↓' : 'Show earlier experiments →'}
                  </button>
                  {showEarlier && (
                    <div style={{ marginTop: '4px' }}>
                      {earlierWeeks.map((w, i) => renderWeek(w, i === 0 && recentWeeks.length === 0))}
                    </div>
                  )}
                </div>
              )}
            </>
          )
        })()}
      </div>

      {/* The parent's progress: their experiments and weekly check-ins. Peter, 2026-09-13: tracking
          is here, the plan is on the Plan tab. */}
      {plan?.id && <ParentProgressSection planId={plan.id} />}
    </div>
  )

  const parentUnreadCount = (parentMessages ?? []).filter(m => !m.read_at).length
  const lastMsgPreview = (arr?: typeof messages) => { const a = arr ?? []; return a.length ? a[a.length - 1].content : '' }
  // One row for the child, then one per parent. The preview and unread count are only loaded for
  // the thread that is open, so the others show nothing until they are opened.
  const chatThreads = [
    { id: 'teen', name: patient?.name || 'Patient', role: 'Teen · private thread', preview: lastMsgPreview(messages), unread: unreadMessageCount },
    ...parents.map(p => ({
      id: p.parent_user_id,
      name: p.email,
      role: 'Parent · private thread',
      preview: msgThread === p.parent_user_id ? lastMsgPreview(parentMessages) : '',
      unread: msgThread === p.parent_user_id ? parentUnreadCount : 0,
    })),
  ]
  const chatRecipientName = chatThreads.find(t => t.id === msgThread)?.name || (patient?.name || 'Patient')

  const messagesContent = (
    <div id="messages-section" style={{ background: 'var(--float-surface)', border: '1px solid var(--float-border-strong)', borderRadius: 'var(--float-radius-card)', boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', height: '620px', display: 'flex', overflow: 'hidden' }}>
      {/* Thread list */}
      <div style={{ width: '250px', flexShrink: 0, borderRight: '1px solid var(--float-border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {chatThreads.map(t => {
            const on = msgThread === t.id
            return (
              <button
                key={t.id}
                onClick={() => setMsgThread(t.id)}
                className="cursor-pointer"
                style={{ display: 'block', width: '100%', textAlign: 'left', background: on ? 'var(--float-primary-light)' : 'transparent', border: 'none', borderLeft: on ? '3px solid var(--float-primary)' : '3px solid transparent', padding: '12px 14px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--float-text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                  {t.unread > 0 && <span style={{ flexShrink: 0, fontSize: '10px', fontWeight: 700, color: '#fff', background: 'var(--float-primary)', borderRadius: 'var(--float-radius-pill)', padding: '0 6px', lineHeight: '16px' }}>{t.unread}</span>}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--float-text-hint)', marginTop: '1px' }}>{t.role}</div>
                {t.preview && <div style={{ fontSize: '12px', color: 'var(--float-text-secondary)', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.preview}</div>}
              </button>
            )
          })}
        </div>
        <div style={{ borderTop: '1px solid var(--float-surface-sunken)', padding: '10px 14px', fontSize: '11px', color: 'var(--float-text-hint)', lineHeight: 1.4 }}>
          Threads are role-scoped. Teen messages are never visible to the parent.
        </div>
      </div>

      {/* Conversation pane */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid var(--float-border)', flexShrink: 0 }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--float-text)' }}>{chatRecipientName}</span>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', color: 'var(--float-primary)', background: 'var(--float-primary-light)', border: '1px solid var(--float-primary-mid)', borderRadius: 'var(--float-radius-pill)', padding: '2px 8px' }}>{parentThreadId ? 'THIS PARENT ONLY' : 'TEEN ONLY'}</span>
        </div>

        <div ref={messagesScrollRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
          {activeMessages.length === 0 && (
            <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', lineHeight: '1.5', margin: 0 }}>
              {parentThreadId
                ? 'Message this parent between sessions — coaching, encouragement, plan notes. The other parent does not see it.'
                : 'Send check-ins, encouragement, or plan adjustments to the patient between sessions.'}
            </p>
          )}
          {activeMessages.map(m => {
            const ts = formatMsgTime(m.created_at)
            const isFamily = parentThreadId
              ? m.sender_type === 'parent'
              : !!(patient && m.sender_user_id === patient.user_id)
            const special = m.message_type === 'experiment_completed'
              ? { bg: 'var(--float-success-bg)', border: 'var(--float-success-border)', label: '✓ Experiment completed', labelColor: 'var(--float-success)' }
              : m.message_type === 'too_hard'
                ? { bg: 'var(--float-warning-bg)', border: 'var(--float-warning-border)', label: '⚠ Too hard', labelColor: 'var(--float-warning)' }
                : null
            const clinician = !isFamily && !special
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: clinician ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '62%', background: clinician ? 'var(--float-primary)' : special ? special.bg : 'var(--float-surface-sunken)', border: special ? `1px solid ${special.border}` : clinician ? 'none' : '1px solid var(--float-border)', borderRadius: 'var(--float-radius-card)', padding: '10px 13px' }}>
                  {special && <div style={{ fontSize: '11px', fontWeight: 600, color: special.labelColor, marginBottom: '4px' }}>{special.label}</div>}
                  <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.55, color: clinician ? '#fff' : 'var(--float-text)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</p>
                  {ts && <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '4px', textAlign: 'right', color: clinician ? '#fff' : 'var(--float-text-secondary)' }}>{ts}</div>}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid var(--float-border)', padding: '12px 16px', flexShrink: 0 }}>
          <input value={msgContent} onChange={e => setMsgContent(e.target.value)} placeholder="Type a message…" className="border border-slate-200 rounded" style={{ flex: 1, fontSize: '13.5px', padding: '8px 10px', background: 'var(--float-surface)', boxSizing: 'border-box' }} onKeyDown={e => e.key === 'Enter' && msgContent.trim() && sendMsgMut.mutate()} />
          <Button kind="primary" onClick={() => sendMsgMut.mutate()} disabled={!msgContent.trim()}>Send</Button>
        </div>
      </div>
    </div>
  )

  const actionPlansContent = (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="text-sm font-semibold text-slate-700">Action plans</span>
          {actionPlans && actionPlans.length > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{actionPlans.length}</span>}
          {/* Was a badge on the old filter chip. A draft is one the patient cannot see yet. */}
          {draftPlanCount > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--float-primary)', color: '#fff' }}>{draftPlanCount} draft</span>}
        </div>
        {!showPlanEditor && <button onClick={() => { resetPlanEditor(); editor?.commands.setContent(ACTION_PLAN_TEMPLATE); setPlanDate(new Date().toISOString().split('T')[0]); setPlanNickname(plan?.nickname || ''); setPlanNextAppt(''); setShowPlanEditor(true) }} className="text-xs text-teal-600 font-medium bg-transparent border-none cursor-pointer">+ New plan</button>}
      </div>
      {showPlanEditor && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', padding: '12px', background: 'var(--float-surface-muted)', borderRadius: 'var(--float-radius-control)' }}>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
            <input type="date" value={planDate} onChange={e => setPlanDate(e.target.value)} className="text-xs border border-slate-200 rounded" style={{ padding: '4px 8px' }} />
            {plan?.nickname ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', fontSize: '12px' }}>
                <span style={{ fontStyle: 'italic', color: 'var(--float-primary)' }}>&ldquo;{plan.nickname}&rdquo;</span>
                <button
                  onClick={() => { setNicknameVal(plan.nickname || ''); setEditingNickname(true) }}
                  className="text-[11px] text-slate-400 hover:text-teal-600 bg-transparent border-none cursor-pointer"
                >
                  edit in treatment plan →
                </button>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <input value={planNickname} onChange={e => setPlanNickname(e.target.value)} placeholder="Nickname" className="text-xs border border-slate-200 rounded" style={{ padding: '4px 8px' }} />
                <span style={{ fontSize: '11px', color: 'var(--float-text-hint)' }}>Add a nickname in the treatment plan to pre-populate this field.</span>
              </div>
            )}
          </div>
          <div style={{ border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-control)', overflow: 'hidden', background: 'var(--float-surface)' }}>
            <EditorContent editor={editor} />
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={handleSavePlan} disabled={createPlanActionMut.isPending || updatePlanActionMut.isPending} style={btn('primary', 'sm')}>
              {(createPlanActionMut.isPending || updatePlanActionMut.isPending) && !publishPlanMut.isPending ? 'Saving...' : 'Save draft'}
            </button>
            <button onClick={handlePublishPlan} disabled={createPlanActionMut.isPending || updatePlanActionMut.isPending || publishPlanMut.isPending} className="bg-green-600 text-white rounded text-xs font-medium border-none cursor-pointer disabled:opacity-50" style={{ padding: '6px 12px' }}>
              {publishPlanMut.isPending ? 'Publishing...' : (editingPlan?.visible_to_patient ? 'Republish' : 'Publish')}
            </button>
            <button onClick={resetPlanEditor} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
          </div>
        </div>
      )}
      {actionPlans && actionPlans.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {actionPlans.filter(ap => !showPlanEditor || ap.id !== editingPlan?.id).map(ap => (
            <div key={ap.id} style={{ padding: '12px 14px', background: 'var(--float-surface-muted)', borderRadius: 'var(--float-radius-control)', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexWrap: 'wrap' }}>
                  <span className="font-medium text-slate-700">#{ap.session_number}</span>
                  <span className="text-slate-400">{new Date(ap.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  {ap.nickname && <span style={{ fontStyle: 'italic', color: 'var(--float-primary)' }}>"{ap.nickname}"</span>}
                  <span className={`px-1.5 py-0.5 rounded font-medium ${ap.visible_to_patient ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{ap.visible_to_patient ? 'Published' : 'Draft'}</span>
                </div>
              </div>
              {ap.content && (
                <div className="prose prose-sm max-w-none" style={{ fontSize: '12px', color: 'var(--float-text-secondary)', marginBottom: '10px' }} dangerouslySetInnerHTML={{ __html: ap.content }} />
              )}
              {deletingPlanId === ap.id ? (
                <div style={{ background: 'var(--float-danger-bg)', borderRadius: 'var(--float-radius-control)', padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--float-danger)' }}>Delete this plan?</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => deletePlanMut.mutate(ap.id)} disabled={deletePlanMut.isPending} className="text-[11px] text-white font-medium border-none cursor-pointer disabled:opacity-50" style={{ background: 'var(--float-danger)', padding: '4px 10px', borderRadius: 'var(--float-radius-control)' }}>Yes, delete</button>
                    <button onClick={() => setDeletingPlanId(null)} className="text-[11px] text-slate-500 bg-transparent border-none cursor-pointer">Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button onClick={() => openEditPlan(ap)} className="text-teal-600 font-medium bg-transparent border-none cursor-pointer" style={{ fontSize: '11px' }}>Edit</button>
                  <button onClick={() => publishPlanMut.mutate(ap.id)} disabled={publishPlanMut.isPending} className="text-green-700 font-medium bg-transparent border-none cursor-pointer disabled:opacity-50" style={{ fontSize: '11px' }}>{ap.visible_to_patient ? 'Republish' : 'Publish'}</button>
                  <button onClick={() => setDeletingPlanId(ap.id)} className="text-red-500 bg-transparent border-none cursor-pointer" style={{ fontSize: '11px' }}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : !showPlanEditor && (
        <p style={{ fontSize: '13px', color: 'var(--float-text-hint)', lineHeight: '1.5', margin: 0 }}>
          Action plans are session summaries written directly to the patient. After each session, write what they'll work on and publish it to their app.
        </p>
      )}
    </div>
  )

  // The pre-session brief lived here. Removed 2026-09-01 at Peter's request — he may bring
  // it back, so the numbers it read (last action plan, last experiment confidence and
  // result) are all still on the patient record.

  return (
    <div style={{ minHeight: '100vh', background: 'var(--float-surface-sunken)' }}>
      <PractitionerNav activePage="patients" subHeader={{
        backTo: '/dashboard', backLabel: 'Back to patients',
        title: patient?.name ?? 'Loading...',
      }} />

      {/* The page has a width. Without one everything stretched to the browser, so on a wide
          screen a step's name sat at one end of its row and its thermometer score at the other —
          the two things that belong together, as far apart as the screen allows. Left-aligned
          (Peter, 2026-09-05). Content column + the process panel + the gap between them. */}
      <div style={{ padding: '24px', maxWidth: LADDER_MAX_WIDTH + PROCESS_PANEL_WIDTH + 24 + 48 }}>

        {/* Patient header — identity + access + actions */}
        {patient && !editingProfile && (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: 'var(--float-radius-pill)', background: 'var(--float-primary-light)', color: 'var(--float-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', fontWeight: 700, flexShrink: 0 }}>
                {(patient.name || '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--float-text)' }}>{patient.name}</span>
                  {activitySummary && (
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 10px', borderRadius: 'var(--float-radius-pill)', background: plan?.status === 'active' ? 'var(--float-primary-light)' : 'var(--float-surface-sunken)', color: plan?.status === 'active' ? 'var(--float-primary-dark)' : 'var(--float-text-secondary)' }}>{activitySummary}</span>
                  )}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--float-text-secondary)', marginTop: '2px' }}>
                  {[
                    patient.age ? `Age ${patient.age}` : null,
                    patient.gender || null,
                    plan?.nickname ? `Nickname: “${plan.nickname}”` : null,
                  ].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>

            {/* Every control here is the same height, radius and type size, from
                components/ui/buttons. Who can get in comes first, then what you can do to the
                record, then the process panel. */}
            <div style={buttonRow}>
              <button onClick={() => openAccess('teen')} style={statusCard(showTeenAccess && accessFocus === 'teen')}>
                <span style={{ width: '8px', height: '8px', borderRadius: 'var(--float-radius-pill)', background: patient.teen_invited_at ? 'var(--float-success)' : 'var(--float-border-strong)', flexShrink: 0 }} />
                <span>
                  <span style={statusCardTitle}>Teen access</span>
                  <span style={statusCardState}>{patient.teen_invited_at ? 'Set up' : patient.child_connect_consent_at ? 'Ready to invite' : 'Awaiting consent'}</span>
                </span>
              </button>
              <button onClick={() => openAccess('parent')} style={statusCard(showTeenAccess && accessFocus === 'parent')}>
                <span style={{ width: '8px', height: '8px', borderRadius: 'var(--float-radius-pill)', background: patient.parent_email ? 'var(--float-success)' : 'var(--float-border-strong)', flexShrink: 0 }} />
                <span>
                  <span style={statusCardTitle}>Parent access</span>
                  <span style={statusCardState}>{patient.parent_email ? 'Invite / manage' : 'Not set up'}</span>
                </span>
              </button>
              <span aria-hidden="true" style={{ width: '1px', height: '24px', background: 'var(--float-border)' }} />
              <button onClick={openProfileEdit} style={btn('secondary')}>Edit profile</button>
              <button onClick={() => setShowClinicianAccess(v => !v)} style={btn(showClinicianAccess ? 'on' : 'secondary')}>
                Clinician access
              </button>
              {patient.closed_at ? (
                <button onClick={handleReopen} disabled={closing.isPending} style={btn('secondary')}>
                  {closing.isPending ? 'Reopening…' : 'Reopen treatment'}
                </button>
              ) : (
                <button onClick={handleClose} disabled={closing.isPending} style={btn('secondary')}>
                  {closing.isPending ? 'Closing…' : 'Close treatment'}
                </button>
              )}
              <button onClick={() => setProcessPanelOpen(v => !v)} style={btn(processPanelOpen ? 'on' : 'secondary')}>
                Process
                <span style={countPill(processPanelOpen)}>{processChecklistDone}/{processChecklistTotal}</span>
              </button>
            </div>
          </div>
        )}

        {/* Who else at this clinic can open this patient. Access has been enforced since
            2026-08-28 with no way to change it outside the database. */}
        {showClinicianAccess && patient && (
          <ClinicianAccessPanel
            patientId={patientId!}
            patientName={patient.name}
            onClose={() => setShowClinicianAccess(false)}
          />
        )}

        {/* Teen access — persistent, opened from the patient header, shown in any mode */}
        {showTeenAccess && patient && (
          <TeenAccessPanel
            patientId={patientId!}
            focus={accessFocus}
            teenEmail={patient.teen_email}
            teenInvitedAt={patient.teen_invited_at}
            consentAt={patient.child_connect_consent_at}
            progressSharedAt={patient.progress_shared_with_parent_at}
            ratingsSharedAt={patient.accommodation_ratings_shared_at}
            fallbackEmail={patient.email}
            onViewMessages={() => { setShowTeenAccess(false); setActiveTab('chat') }}
            onClose={() => setShowTeenAccess(false)}
          />
        )}

        {/* Profile edit form (inline) */}
        {editingProfile && patient && (
          <div style={{ background: 'var(--float-surface)', border: '1px solid var(--float-border-strong)', borderRadius: 'var(--float-radius-card)', boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', padding: '20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--float-text-secondary)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Edit patient profile</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--float-text-secondary)', display: 'block', marginBottom: '4px' }}>Name</label>
                <input
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  className="text-sm border border-slate-200 rounded"
                  style={{ width: '100%', padding: '6px 10px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--float-text-secondary)', display: 'block', marginBottom: '4px' }}>Age</label>
                <input
                  value={profileAge}
                  onChange={e => setProfileAge(e.target.value)}
                  type="number"
                  min="0"
                  max="120"
                  className="text-sm border border-slate-200 rounded"
                  style={{ width: '100%', padding: '6px 10px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--float-text-secondary)', display: 'block', marginBottom: '4px' }}>Gender</label>
                <input
                  value={profileGender}
                  onChange={e => setProfileGender(e.target.value)}
                  className="text-sm border border-slate-200 rounded"
                  style={{ width: '100%', padding: '6px 10px', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--float-text-secondary)', display: 'block', marginBottom: '4px' }}>Phone number</label>
                <input
                  value={profilePhone}
                  onChange={e => setProfilePhone(e.target.value)}
                  type="tel"
                  className="text-sm border border-slate-200 rounded"
                  style={{ width: '100%', padding: '6px 10px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--float-text-secondary)', display: 'block', marginBottom: '4px' }}>Email (read-only)</label>
                <div style={{ fontSize: '13px', color: 'var(--float-text-secondary)', padding: '6px 10px', background: 'var(--float-surface-sunken)', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-control)' }}>{patient.email}</div>
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--float-text-secondary)', display: 'block', marginBottom: '8px' }}>Anxiety presentation</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {ANXIETY_PRESENTATIONS.map(p => {
                  const selected = profilePresentations.includes(p.value)
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => toggleProfilePresentation(p.value)}
                      style={chip(selected, 'md')}
                    >{p.label}</button>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => updatePatientMut.mutate()}
                disabled={!profileName.trim() || updatePatientMut.isPending}
                style={btn('primary', 'sm')}
              >
                {updatePatientMut.isPending ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setEditingProfile(false)}
                className="text-xs text-slate-500 hover:text-slate-700 bg-transparent border-none cursor-pointer"
              >
                Cancel
              </button>
              {updatePatientMut.isError && (
                <span style={{ fontSize: '12px', color: 'var(--float-danger)' }}>Save failed. Try again.</span>
              )}
            </div>
          </div>
        )}

        {/* Flat tab bar (replaces the phase spine + rail) */}
        <div style={{ display: 'flex', gap: '2px', borderBottom: '1px solid var(--float-border)', marginBottom: '20px' }}>
          {([
            { id: 'monitoring', label: 'Monitoring' },
            { id: 'sessions', label: 'Sessions' },
            { id: 'plan', label: 'Plan' },
            { id: 'experiments', label: 'Experiments' },
            { id: 'chat', label: 'Chat', b: unreadMessageCount },
          ] as const).map(t => {
            const cur = activeTab === t.id
            const b = 'b' in t ? t.b : 0
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={tab(cur)}
              >
                {t.label}
                {b ? <span style={tabCount}>{b}</span> : null}
              </button>
            )
          })}
        </div>

        {/* Body: content + optional process panel */}
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
          {/* Capped, so the column does not stretch when the process panel is closed. One rule
              for how wide a row gets, rather than each component minding its own. */}
          <div style={{ flex: 1, minWidth: 0, maxWidth: LADDER_MAX_WIDTH, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {activeTab === 'monitoring' && (
              showInlineReport ? (
                <InlineMonitoringReport patientId={patientId!} onClose={() => setShowInlineReport(false)} />
              ) : (
                <>
                  {monitoringCard}
                  {monitoringExtractContent}
                  {preliminaryReportContent}
                </>
              )
            )}

            {activeTab === 'sessions' && (
              <>
                {sessionNotesList}
                {SHOW_ACTION_PLANS && actionPlansContent}
              </>
            )}

            {activeTab === 'plan' && (
              <>
                {treatmentPlanBuilder}
                {plan && (
                  <div style={{ marginTop: '16px' }}>
                    <ParentPlanPanel planId={plan.id} patientId={patientId!} triggers={triggers ?? []} />
                  </div>
                )}
              </>
            )}

            {activeTab === 'experiments' && experimentsContent}

            {activeTab === 'chat' && messagesContent}
          </div>

          {/* Process panel — checklist + tips, available on every tab */}
          {processPanelOpen && (
            <div style={{ width: '340px', flexShrink: 0, position: 'sticky', top: '16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {([{ id: 'checklist', label: 'Checklist' }, { id: 'tips', label: 'Tips' }] as const).map(pt => {
                    const on = processTab === pt.id
                    return (
                      <button
                        key={pt.id}
                        onClick={() => setProcessTab(pt.id)}
                        style={chip(on, 'sm')}
                      >{pt.label}</button>
                    )
                  })}
                </div>
                <button onClick={() => setProcessPanelOpen(false)} aria-label="Close process panel" style={iconBtn('sm')}>×</button>
              </div>

              {processTab === 'checklist' && patientId && (
                <>
                  <ConsultationChecklist patientId={patientId} title="Checklist" collapsed={false} onToggleCollapse={() => {}} onNavigate={handleChecklistNav} />
                </>
              )}

              {processTab === 'tips' && (
                <div style={cardStyle}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--float-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Session tips</div>
                  {(Object.keys(SESSION_PREP_CONTENT) as SessionPrepType[]).map(k => (
                    <div key={k} style={{ marginBottom: '14px' }}>
                      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--float-text)', marginBottom: '6px' }}>{SESSION_PREP_CONTENT[k].header}</div>
                      <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {SESSION_PREP_CONTENT[k].steps.map((s, i) => <li key={i} style={{ fontSize: '12px', color: 'var(--float-text-secondary)', lineHeight: 1.4 }}>{s}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* AI extraction modal */}
    </div>
  )
}
