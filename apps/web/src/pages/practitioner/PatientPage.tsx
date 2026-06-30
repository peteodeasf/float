import { useState, useEffect, useCallback, useRef, useMemo, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPatient, getMessages, sendMessage, inviteTeen, getPatientProgress, updatePatient } from '../../api/patients'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'
import {
  getTreatmentPlan, getTriggers, createTreatmentPlan, createTrigger,
  updatePlanStatus, updatePlanNickname, getBehaviors, getLadder, getLadderFlags, reviewLadder,
  createBehavior, updateBehavior, deleteBehavior, updateTrigger, deleteTrigger,
  getSituationDownwardArrow, createSituationDownwardArrow, updateDownwardArrow, listPatientDownwardArrows,
  getPatientExperiments, planExperimentForBehavior,
  type TriggerSituation, type AvoidanceBehavior, type DownwardArrow, type ArrowStep
} from '../../api/treatment'
import { getMonitoringForm, sendMonitoringForm, extractMonitoringData, getMonitoringReport, generatePreliminaryReport, type MonitoringExtraction, type PreliminaryReport } from '../../api/monitoring'
import { getSessionNotes, createSessionNote, updateSessionNote, deleteSessionNote, type SessionNote } from '../../api/session_notes'
import { getChecklist, updateChecklist, type ChecklistItems } from '../../api/checklist'
import { PARENT_CHECKLIST, PATIENT_CHECKLIST, type ChecklistGroup, type ChecklistNav } from '../../lib/checklists'
import { getActionPlans, createActionPlan, updateActionPlan, publishActionPlan, deleteActionPlan, type ActionPlan } from '../../api/action_plans'
import { fetchFormulation, createFormulation, updateFormulation } from '../../api/formulation'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import PractitionerNav from '../../components/ui/PractitionerNav'

const ACTION_PLAN_TEMPLATE = `<h2>Exposures</h2><ul><li></li></ul><h2>Behaviors to resist</h2><ul><li></li></ul><h2>Parent instructions</h2><ul><li></li></ul><h2>Coping tools</h2><ul><li></li></ul><h2>Notes</h2><p></p>`

function DTBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return null
  const v = Number(value)
  const color = v >= 7 ? 'bg-red-100 text-red-700' : v >= 4 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
  return <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${color}`}>{v}</span>
}

// Shared teal section header for the Step-2 Preliminary Report
const reportSectionHeaderStyle = { fontSize: '12px', fontWeight: 700, color: 'var(--float-primary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em', marginBottom: '10px' }

// A labelled bulleted section in the Step-2 Preliminary Report (with a divider above)
function ReportSection({ label, items }: { label: string; items: string[] }) {
  if (!items || items.length === 0) return null
  return (
    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
      <div style={reportSectionHeaderStyle}>{label}</div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {items.map((it, i) => (
          <li key={i} style={{ display: 'flex', gap: '8px', fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>
            <span style={{ color: 'var(--float-primary)', flexShrink: 0 }}>·</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

type PersistentTabId = 'experiments' | 'messages' | 'plans'

type StepStatus = 'complete' | 'active' | 'incomplete'

const STEP_LABELS: string[] = [
  'Parent Monitoring Form',
  'Analyze Monitoring Data',
  'Session 1 — Parent Consultation',
  'Session 2 — Patient Consultation',
  'Build Treatment Plan',
  'Activate Treatment Plan',
  'Begin Exposures',
  'Weekly Sessions',
  'Parent Accommodation Check-ins',
]

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

const presentationLabel = (value: string): string =>
  ANXIETY_PRESENTATIONS.find(p => p.value === value)?.label ?? value

function isSimilar(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const na = normalize(a)
  const nb = normalize(b)
  // Exact match after normalization
  if (na === nb) return true
  // One contains the other
  if (na.includes(nb) || nb.includes(na)) return true
  // First 15 characters match (same stem)
  if (na.slice(0, 15) === nb.slice(0, 15)) return true
  return false
}

function StepStatusIcon({ status }: { status: StepStatus }) {
  if (status === 'complete') {
    return (
      <span style={{ width: '20px', height: '20px', borderRadius: '999px', background: '#0d9488', color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>&#10003;</span>
    )
  }
  if (status === 'active') {
    return (
      <span style={{ width: '20px', height: '20px', borderRadius: '999px', background: '#0d9488', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <span style={{ width: '7px', height: '7px', borderRadius: '999px', background: '#fff' }} />
      </span>
    )
  }
  return (
    <span style={{ width: '20px', height: '20px', borderRadius: '999px', background: '#fff', border: '1px solid #cbd5e1', flexShrink: 0, boxSizing: 'border-box' }} />
  )
}

function MiniTabButton({ id, label, active, onClick, badge }: {
  id: PersistentTabId
  label: string
  active: boolean
  onClick: (id: PersistentTabId) => void
  badge?: number
}) {
  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      style={{
        padding: '8px 16px',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '3px solid var(--float-primary)' : '3px solid transparent',
        color: active ? 'var(--float-primary)' : '#475569',
        fontWeight: active ? 600 : 500,
        fontSize: '13px',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '-1px',
      }}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span style={{ background: 'var(--float-primary)', color: '#fff', fontSize: '11px', fontWeight: 700, minWidth: '18px', height: '18px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', lineHeight: 1 }}>{badge}</span>
      )}
    </button>
  )
}

// Next school day (Mon-Fri) after today
function getNextSchoolDayISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

const CONFIDENCE_OPTIONS: { key: string; label: string; emoji: string }[] = [
  { key: 'low', label: 'Low', emoji: '\u{1F630}' },
  { key: 'medium', label: 'Medium', emoji: '\u{1F610}' },
  { key: 'high', label: 'High', emoji: '\u{1F4AA}' },
]

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

function SessionPrepCard({ sessionType, patientId }: { sessionType: SessionPrepType; patientId: string }) {
  const storageKey = `float_prep_dismissed_${patientId}_${sessionType}`
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(storageKey) === '1' } catch { return false }
  })

  const handleDismiss = () => {
    try { localStorage.setItem(storageKey, '1') } catch {}
    setDismissed(true)
  }
  const handleShow = () => {
    try { localStorage.removeItem(storageKey) } catch {}
    setDismissed(false)
  }

  if (dismissed) {
    return (
      <div style={{ marginBottom: '12px' }}>
        <button
          onClick={handleShow}
          style={{
            fontSize: '12px',
            color: '#0d9488',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontWeight: 500,
          }}
        >
          Show step guide →
        </button>
      </div>
    )
  }

  const { header, steps } = SESSION_PREP_CONTENT[sessionType]

  return (
    <div
      style={{
        position: 'relative',
        background: '#f0fdfa',
        borderLeft: '3px solid #0d9488',
        borderRadius: '8px',
        padding: '14px 36px 14px 16px',
        marginBottom: '12px',
      }}
    >
      <button
        onClick={handleDismiss}
        aria-label="Dismiss step guide"
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          width: '24px',
          height: '24px',
          background: 'transparent',
          border: 'none',
          color: '#94a3b8',
          fontSize: '18px',
          lineHeight: 1,
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
        }}
      >
        ×
      </button>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#0d9488',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '10px',
        }}
      >
        {header}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {steps.map((s) => (
          <li
            key={s}
            style={{
              fontSize: '13px',
              color: '#475569',
              display: 'flex',
              gap: '8px',
              lineHeight: 1.5,
            }}
          >
            <span style={{ color: '#0d9488', flexShrink: 0 }}>·</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const STEP_GUIDE_CONTENT: Record<number, { header: string; steps: string[] }> = {
  1: {
    header: 'STEP GUIDE — PARENT MONITORING FORM',
    steps: [
      'Send the monitoring form to the parent before the first session',
      "Ask the parent to observe and record their child's anxiety over 1-2 weeks",
      "They should note: the situation, what the child did, how they responded, and their estimate of the child's distress (1-10)",
      'Aim for at least 3-5 observations before the first session',
      'The more specific the observations, the more useful the data',
    ],
  },
  2: {
    header: 'STEP GUIDE — ANALYZE MONITORING DATA',
    steps: [
      'Run the AI analysis once you have at least 3 monitoring entries',
      'Review the suggested trigger situations and behaviors carefully — they are suggestions, not clinical judgments',
      "Edit, add, or remove anything that doesn't fit what you know about this patient",
      'The analyzed data creates a draft case conceptualization that will develop through subsequent steps',
      'You can re-analyze if new monitoring entries are added',
    ],
  },
  5: {
    header: 'STEP GUIDE — BUILD TREATMENT PLAN',
    steps: [
      'Build the exposure ladder from the trigger list',
      'For each situation, add the avoidance and safety behaviors with DT ratings',
      'Order behaviors from lowest DT to highest — the teen starts with the easiest',
      'Make sure each behavior is specific enough that the teen knows exactly what to do',
      'The treatment plan is built with the child — their DT ratings and input matter',
      'Add the anxiety nickname before activating',
    ],
  },
  6: {
    header: 'STEP GUIDE — ACTIVATE TREATMENT PLAN',
    steps: [
      'Review the plan is complete — situations, behaviors, DT ratings, and nickname all set',
      'Invite the teen to Float before or at activation so they can see their plan',
      'Once activated, the teen can see their exposure ladder and start planning experiments',
      'You can still edit the plan after activation — add situations, adjust DT ratings, update behaviors',
    ],
  },
  7: {
    header: 'STEP GUIDE — BEGIN EXPOSURES',
    steps: [
      'The teen plans and commits to experiments from their Float app',
      'Each experiment tests a specific feared outcome — the prediction is set before, the result recorded after',
      "Check the experiments tab regularly between sessions — don't wait until the session to review progress",
      'If experiments are overdue or confidence is low, reach out via messages before the next session',
      "BIP and DT should trend downward over time — if they don't, revisit the treatment plan",
    ],
  },
  8: {
    header: 'STEP GUIDE — WEEKLY SESSION',
    steps: [
      'Check in on nickname use — how often has the child noticed their anxiety?',
      'Review all experiments since last session — BIP and DT trends, what they learned',
      "Note any overdue or incomplete experiments and explore what got in the way",
      'Set new experiments for the coming week — confirm High confidence before finalizing',
      'Write and publish the action plan before the child leaves the session',
      'Bring the parent in for the last 5-10 minutes to review the plan together',
    ],
  },
  9: {
    header: 'STEP GUIDE — PARENT ACCOMMODATION CHECK-INS',
    steps: [
      'Review accommodation reduction progress at the end of each weekly session',
      'Ask the parent to describe situations where they were tempted to accommodate — what did they do?',
      'Reinforce non-accommodating responses — specific praise for specific actions',
      "If accommodation is increasing, explore what's driving it — anxiety in the parent, not just the child",
      'Accommodation reduction and exposure work must progress together for treatment to be effective',
    ],
  },
}

function StepGuideCard({ stepNumber, patientId }: { stepNumber: number; patientId: string }) {
  const storageKey = `float_guide_dismissed_${patientId}_step${stepNumber}`
  const [dismissed, setDismissed] = useState<boolean>(() => {
    try { return localStorage.getItem(storageKey) === '1' } catch { return false }
  })

  const handleDismiss = () => {
    try { localStorage.setItem(storageKey, '1') } catch {}
    setDismissed(true)
  }
  const handleShow = () => {
    try { localStorage.removeItem(storageKey) } catch {}
    setDismissed(false)
  }

  if (dismissed) {
    return (
      <div style={{ marginBottom: '12px' }}>
        <button
          onClick={handleShow}
          style={{
            fontSize: '12px',
            color: '#0d9488',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            fontWeight: 500,
          }}
        >
          Show step guide →
        </button>
      </div>
    )
  }

  const { header, steps } = STEP_GUIDE_CONTENT[stepNumber]

  return (
    <div
      style={{
        position: 'relative',
        background: '#f0fdfa',
        borderLeft: '3px solid #0d9488',
        borderRadius: '8px',
        padding: '14px 36px 14px 16px',
        marginBottom: '12px',
      }}
    >
      <button
        onClick={handleDismiss}
        aria-label="Dismiss step guide"
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          width: '24px',
          height: '24px',
          background: 'transparent',
          border: 'none',
          color: '#94a3b8',
          fontSize: '18px',
          lineHeight: 1,
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
        }}
      >
        ×
      </button>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#0d9488',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          marginBottom: '10px',
        }}
      >
        {header}
      </div>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {steps.map((s) => (
          <li
            key={s}
            style={{
              fontSize: '13px',
              color: '#475569',
              display: 'flex',
              gap: '8px',
              lineHeight: 1.5,
            }}
          >
            <span style={{ color: '#0d9488', flexShrink: 0 }}>·</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  )
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
            <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
              <th className="text-left py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider" style={{ whiteSpace: 'nowrap' }}>Date</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Situation</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">What I observed about my child</th>
              <th className="text-left py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">How I responded</th>
              <th className="text-center py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider" style={{ whiteSpace: 'nowrap' }}>Fear thermometer</th>
            </tr>
          </thead>
          <tbody>
            {report.entries.map((entry) => (
              <tr key={entry.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td className="py-3 px-3 text-slate-500" style={{ whiteSpace: 'nowrap' }}>
                  {new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </td>
                <td className="py-3 px-3 text-slate-700">
                  {entry.situation || '--'}
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

function AutoSaveSessionNote({ patientId, sessionType, placeholder }: { patientId: string; sessionType: string; placeholder: string }) {
  const queryClient = useQueryClient()
  const { data: sessionNotes } = useQuery({
    queryKey: ['session-notes', patientId],
    queryFn: () => getSessionNotes(patientId),
    enabled: !!patientId,
  })

  const [content, setContent] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const noteIdRef = useRef<string | null>(null)
  const initializedRef = useRef(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  // Hydrate once from the existing note for this session type
  useEffect(() => {
    if (initializedRef.current) return
    if (sessionNotes === undefined) return
    const existing = sessionNotes.find(n => n.session_type === sessionType) ?? null
    if (existing) {
      noteIdRef.current = existing.id
      setContent(existing.content)
    }
    initializedRef.current = true
  }, [sessionNotes, sessionType])

  // Auto-expand the textarea as content grows
  useEffect(() => {
    const el = taRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.max(160, el.scrollHeight) + 'px'
  }, [content])

  // Clean up timers on unmount
  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
  }, [])

  const save = async (value: string) => {
    if (!noteIdRef.current && !value.trim()) { setStatus('idle'); return }
    setStatus('saving')
    try {
      if (noteIdRef.current) {
        await updateSessionNote(noteIdRef.current, { content: value })
      } else {
        const created = await createSessionNote(patientId, { session_type: sessionType, content: value })
        noteIdRef.current = created.id
      }
      queryClient.invalidateQueries({ queryKey: ['session-notes', patientId] })
      setStatus('saved')
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current)
      savedTimerRef.current = setTimeout(() => setStatus('idle'), 2000)
    } catch {
      setStatus('idle')
    }
  }

  const handleChange = (value: string) => {
    setContent(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => save(value), 1500)
  }

  return (
    <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', padding: '20px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <span className="text-sm font-semibold text-slate-700">Session notes</span>
        {status === 'saving' && <span className="text-xs text-slate-400">Saving...</span>}
        {status === 'saved' && <span className="text-xs text-slate-400">Saved</span>}
      </div>
      <textarea
        ref={taRef}
        value={content}
        onChange={e => handleChange(e.target.value)}
        placeholder={placeholder}
        className="text-sm border border-slate-200 rounded"
        style={{ width: '100%', minHeight: '160px', padding: '10px', resize: 'none', boxSizing: 'border-box', fontFamily: 'inherit', overflow: 'hidden' }}
      />
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
  if (last < first) return { symbol: '↓', color: '#16a34a' }
  if (last > first) return { symbol: '↑', color: '#dc2626' }
  return { symbol: '→', color: '#94a3b8' }
}

// ── Behavior Panel (right side of treatment plan) ──
function BehaviorPanel({ trigger, planId, patientId, planStatus }: {
  trigger: TriggerSituation; planId: string; patientId: string; planStatus: string
}) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('avoidance')
  const [dt, setDt] = useState('')
  const [reviewMsg, setReviewMsg] = useState<string | null>(null)
  const [editingBehaviorId, setEditingBehaviorId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState('avoidance')
  const [editDT, setEditDT] = useState('')
  const [deletingBehaviorId, setDeletingBehaviorId] = useState<string | null>(null)

  // Experiment planning
  const [planningBehaviorId, setPlanningBehaviorId] = useState<string | null>(null)
  const [expConfidence, setExpConfidence] = useState<string>('high')
  const [expPlan, setExpPlan] = useState('')
  const [expDate, setExpDate] = useState(getNextSchoolDayISO())
  const [expWarning, setExpWarning] = useState(false)
  const [expSavedFor, setExpSavedFor] = useState<{ behaviorId: string; date: string } | null>(null)

  const planActive = planStatus === 'active'

  const { data: behaviors } = useQuery({
    queryKey: ['behaviors', trigger.id],
    queryFn: () => getBehaviors(trigger.id),
  })

  const { data: experiments } = useQuery({
    queryKey: ['experiments', patientId],
    queryFn: () => getPatientExperiments(patientId),
    enabled: !!patientId,
  })

  const planExpMut = useMutation({
    mutationFn: (vars: { behaviorId: string; force: boolean }) =>
      planExperimentForBehavior(vars.behaviorId, {
        confidence_level: expConfidence,
        plan_description: expPlan.trim(),
        scheduled_date: expDate ? new Date(expDate + 'T12:00:00').toISOString() : undefined,
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['experiments', patientId] })
      setExpSavedFor({ behaviorId: vars.behaviorId, date: expDate })
      setPlanningBehaviorId(null)
      setExpPlan('')
      setExpConfidence('high')
      setExpDate(getNextSchoolDayISO())
      setExpWarning(false)
      setTimeout(() => setExpSavedFor(null), 4000)
    },
  })

  const startPlanning = (b: AvoidanceBehavior) => {
    setPlanningBehaviorId(b.id)
    setExpPlan('')
    setExpConfidence('high')
    setExpDate(getNextSchoolDayISO())
    setExpWarning(false)
  }

  const handleSaveExperiment = (behaviorId: string) => {
    if (!expPlan.trim()) return
    if ((expConfidence === 'low' || expConfidence === 'medium') && !expWarning) {
      setExpWarning(true)
      return
    }
    planExpMut.mutate({ behaviorId, force: expWarning })
  }

  const { data: ladder } = useQuery({
    queryKey: ['ladder', trigger.id],
    queryFn: () => getLadder(trigger.id),
    enabled: !!trigger.id
  })

  const { data: ladderFlags } = useQuery({
    queryKey: ['ladder-flags', ladder?.id],
    queryFn: async () => {
      if (!ladder?.id) return []
      const flags = await getLadderFlags(ladder.id)
      return flags.filter((f: any) => f.status === 'open')
    },
    enabled: !!ladder?.id
  })

  const addMut = useMutation({
    mutationFn: () => createBehavior(trigger.id, { name, behavior_type: type, distress_thermometer_when_refraining: dt ? Number(dt) : undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] }); setName(''); setDt(''); setShowAdd(false) }
  })

  const editMut = useMutation({
    mutationFn: () => updateBehavior(trigger.id, editingBehaviorId!, { name: editName, behavior_type: editType, distress_thermometer_when_refraining: editDT ? Number(editDT) : undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] }); setEditingBehaviorId(null) }
  })

  const delMut = useMutation({
    mutationFn: (id: string) => deleteBehavior(trigger.id, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] }); setDeletingBehaviorId(null) }
  })

  const startEdit = (b: AvoidanceBehavior) => {
    setEditingBehaviorId(b.id)
    setEditName(b.name)
    setEditType(b.behavior_type)
    setEditDT(b.distress_thermometer_when_refraining != null ? String(b.distress_thermometer_when_refraining) : '')
  }

  const reviewMut = useMutation({
    mutationFn: () => reviewLadder(ladder!.id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['ladder-flags', ladder?.id] })
      const flagCount = Array.isArray(data) ? data.filter((f: any) => f.status === 'open').length : 0
      setReviewMsg(`Review complete — ${flagCount} flag${flagCount === 1 ? '' : 's'} found`)
      setTimeout(() => setReviewMsg(null), 3000)
    }
  })

  const toggleActive = useMutation({
    mutationFn: () => updateTrigger(planId, trigger.id, { is_active: !trigger.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['triggers'] })
  })

  // Sort behaviors by DT ascending (lowest first), nulls at end
  const sortedBehaviors = behaviors ? [...behaviors].sort((a, b) => {
    const aDT = a.distress_thermometer_when_refraining
    const bDT = b.distress_thermometer_when_refraining
    if (aDT == null && bDT == null) return 0
    if (aDT == null) return 1
    if (bDT == null) return -1
    return Number(aDT) - Number(bDT)
  }) : []

  const openFlags = ladderFlags ?? []

  return (
    <div className="p-4 h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{trigger.name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <DTBadge value={trigger.distress_thermometer_rating} />
            <button
              onClick={() => toggleActive.mutate()}
              disabled={toggleActive.isPending}
              className="cursor-pointer"
              style={{
                fontSize: '11px',
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: '999px',
                border: trigger.is_active ? '1px solid var(--float-primary)' : '1px solid #cbd5e1',
                background: trigger.is_active ? 'var(--float-primary)' : '#fff',
                color: trigger.is_active ? '#fff' : '#64748b',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span style={{ fontSize: '8px' }}>{trigger.is_active ? '●' : '○'}</span>
              {trigger.is_active ? 'Active' : 'Not active'}
            </button>
          </div>
        </div>
      </div>

      {/* Section header with AI review */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Avoidance &amp; safety behaviors</span>
          {!showAdd && (
            <button onClick={() => setShowAdd(true)} className="text-[10px] text-teal-600 font-medium bg-transparent border-none cursor-pointer">+ Add</button>
          )}
        </div>
        {behaviors && behaviors.length > 0 && ladder && (
          <button onClick={() => reviewMut.mutate()} disabled={reviewMut.isPending}
            className="text-[10px] font-medium bg-transparent border-none cursor-pointer disabled:opacity-50"
            style={{ color: 'var(--float-primary)' }}>
            {reviewMut.isPending ? 'Reviewing...' : 'Run AI review'}
          </button>
        )}
      </div>

      {/* Review confirmation */}
      {reviewMsg && (
        <p style={{ fontSize: '11px', color: 'var(--float-primary)', margin: '0 0 8px' }}>{reviewMsg}</p>
      )}

      {/* Flags */}
      {openFlags.length > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px' }}>
          <p style={{ fontSize: '11px', fontWeight: '600', color: '#92400e', margin: '0 0 6px' }}>
            &#9888; {openFlags.length} item{openFlags.length === 1 ? '' : 's'} need{openFlags.length === 1 ? 's' : ''} attention
          </p>
          {openFlags.map((f: any) => (
            <p key={f.id} style={{ fontSize: '12px', color: '#78350f', lineHeight: '1.4', margin: '0 0 4px' }}>
              {f.description || f.flag_type.replace(/_/g, ' ')}
            </p>
          ))}
        </div>
      )}

      {/* Behaviors — sorted by DT ascending */}
      <div className="space-y-1.5 mb-3">
        {sortedBehaviors.map(b => (
          <div key={b.id}>
            {editingBehaviorId === b.id ? (
              /* Edit mode */
              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 12px' }}>
                <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" style={{ marginBottom: '8px' }}
                  onKeyDown={e => e.key === 'Enter' && editName.trim() && editMut.mutate()} />
                <div style={{ marginBottom: '8px' }}>
                  <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Type</div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {['avoidance', 'safety', 'ritual'].map(opt => (
                      <button key={opt} onClick={() => setEditType(opt)} type="button"
                        style={{
                          fontSize: '11px', fontWeight: 600, padding: '5px 10px', borderRadius: '999px', cursor: 'pointer',
                          background: editType === opt ? 'var(--float-primary)' : '#fff',
                          color: editType === opt ? '#fff' : '#475569',
                          border: editType === opt ? '1px solid var(--float-primary)' : '1px solid #cbd5e1',
                          textTransform: 'capitalize'
                        }}>{opt}</button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <label style={{ fontSize: '11px', color: '#475569', display: 'block', marginBottom: '4px' }}>Fear level when refraining (1-10)</label>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <button type="button" onClick={() => setEditDT(String(Math.max(1, (Number(editDT) || 1) - 1)))} style={{ width: '28px', height: '32px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#475569' }}>−</button>
                    <input value={editDT} onChange={e => setEditDT(e.target.value)} type="number" min="1" max="10" className="text-sm border border-slate-200 rounded" style={{ width: '80px', padding: '6px 8px', textAlign: 'center', height: '32px', boxSizing: 'border-box' }} />
                    <button type="button" onClick={() => setEditDT(String(Math.min(10, (Number(editDT) || 0) + 1)))} style={{ width: '28px', height: '32px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#475569' }}>+</button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button onClick={() => editMut.mutate()} disabled={!editName.trim() || editMut.isPending} className="bg-teal-600 text-white rounded text-[11px] font-medium disabled:opacity-40 border-none cursor-pointer" style={{ padding: '6px 12px' }}>Save</button>
                  <button onClick={() => setEditingBehaviorId(null)} className="text-[11px] text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                </div>
              </div>
            ) : deletingBehaviorId === b.id ? (
              /* Delete confirmation */
              <div style={{ background: '#fef2f2', borderRadius: '8px', padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '12px', color: '#991b1b' }}>Delete this behavior?</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => delMut.mutate(b.id)} disabled={delMut.isPending} className="text-[11px] text-red-600 font-medium bg-transparent border-none cursor-pointer disabled:opacity-50">Yes, delete</button>
                  <button onClick={() => setDeletingBehaviorId(null)} className="text-[11px] text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                </div>
              </div>
            ) : (
              /* Normal row */
              <>
                <div className="flex items-center justify-between group" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', marginBottom: '6px' }}>
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className={`text-[10px] px-1 py-0.5 rounded font-bold uppercase ${b.behavior_type === 'safety' ? 'bg-amber-50 text-amber-600' : b.behavior_type === 'ritual' ? 'bg-purple-50 text-purple-600' : 'bg-slate-100 text-slate-500'}`}>
                      {b.behavior_type.slice(0, 3)}
                    </span>
                    <span className="text-sm text-slate-700 truncate">{b.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <DTBadge value={b.distress_thermometer_when_refraining} />
                    <button onClick={() => startEdit(b)} className="text-[10px] text-slate-400 hover:text-teal-600 bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">Edit</button>
                    <button onClick={() => setDeletingBehaviorId(b.id)} className="text-[10px] text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">Del</button>
                  </div>
                </div>
                {planActive && planningBehaviorId !== b.id && (
                  <div style={{ marginTop: '4px', marginLeft: '4px' }}>
                    <button
                      onClick={() => startPlanning(b)}
                      className="text-[11px] font-medium bg-transparent border-none cursor-pointer"
                      style={{ color: 'var(--float-primary)', padding: '2px 0' }}
                    >+ Plan experiment</button>
                    {expSavedFor?.behaviorId === b.id && (
                      <span style={{ fontSize: '11px', color: '#16a34a', marginLeft: '8px' }}>
                        &#10003; Experiment planned for {new Date(expSavedFor.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                )}
                {planningBehaviorId === b.id && (
                  <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', marginTop: '6px', border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: '11px', fontWeight: 600, color: '#475569', margin: '0 0 8px' }}>
                      Plan experiment for: <span style={{ color: '#1e293b' }}>{b.name}</span>
                    </p>
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>
                        Confidence level (ask the child):
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {CONFIDENCE_OPTIONS.map(opt => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => { setExpConfidence(opt.key); setExpWarning(false) }}
                            style={{
                              fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: '999px', cursor: 'pointer',
                              background: expConfidence === opt.key ? 'var(--float-primary)' : '#fff',
                              color: expConfidence === opt.key ? '#fff' : '#475569',
                              border: expConfidence === opt.key ? '1px solid var(--float-primary)' : '1px solid #cbd5e1',
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                            }}
                          >
                            <span>{opt.emoji}</span>{opt.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                        Specific plan:
                      </div>
                      <textarea
                        value={expPlan}
                        onChange={e => setExpPlan(e.target.value)}
                        rows={2}
                        placeholder="e.g. Sit at the cafeteria table without headphones on Tuesday at lunch"
                        className="text-sm border border-slate-200 rounded"
                        style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}
                      />
                    </div>
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
                        Scheduled date:
                      </div>
                      <input
                        type="date"
                        value={expDate}
                        onChange={e => setExpDate(e.target.value)}
                        className="text-sm border border-slate-200 rounded"
                        style={{ padding: '6px 8px' }}
                      />
                    </div>
                    {expWarning && (
                      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '10px 12px', marginBottom: '10px' }}>
                        <p style={{ fontSize: '12px', color: '#78350f', margin: '0 0 8px', lineHeight: '1.4' }}>
                          &#9888; Confidence is {expConfidence === 'low' ? 'Low' : 'Medium'} &mdash; consider simplifying this experiment before the teen attempts it.
                        </p>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => planExpMut.mutate({ behaviorId: b.id, force: true })}
                            disabled={planExpMut.isPending}
                            className="text-[11px] font-medium border-none cursor-pointer disabled:opacity-50"
                            style={{ background: '#d97706', color: '#fff', padding: '5px 10px', borderRadius: '6px' }}
                          >Save anyway</button>
                          <button
                            onClick={() => { setPlanningBehaviorId(null); setExpWarning(false) }}
                            className="text-[11px] bg-white cursor-pointer"
                            style={{ border: '1px solid #fde68a', color: '#78350f', padding: '5px 10px', borderRadius: '6px' }}
                          >Cancel</button>
                        </div>
                      </div>
                    )}
                    {!expWarning && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => handleSaveExperiment(b.id)}
                          disabled={!expPlan.trim() || planExpMut.isPending}
                          className="bg-teal-600 text-white rounded text-xs font-medium disabled:opacity-40 border-none cursor-pointer"
                          style={{ padding: '6px 12px' }}
                        >{planExpMut.isPending ? 'Saving...' : 'Save experiment plan'}</button>
                        <button
                          onClick={() => setPlanningBehaviorId(null)}
                          className="text-xs text-slate-400 bg-transparent border-none cursor-pointer"
                        >Cancel</button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add behavior inline */}
      {showAdd && (
        <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 12px' }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Behavior name"
            className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" autoFocus
            style={{ marginBottom: '8px' }}
            onKeyDown={e => e.key === 'Enter' && name.trim() && addMut.mutate()} />
          <div style={{ marginBottom: '8px' }}>
            <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Type</div>
            <div style={{ display: 'flex', gap: '4px' }}>
              {['avoidance', 'safety', 'ritual'].map(opt => (
                <button key={opt} onClick={() => setType(opt)} type="button"
                  style={{
                    fontSize: '11px', fontWeight: 600, padding: '5px 10px', borderRadius: '999px', cursor: 'pointer',
                    background: type === opt ? 'var(--float-primary)' : '#fff',
                    color: type === opt ? '#fff' : '#475569',
                    border: type === opt ? '1px solid var(--float-primary)' : '1px solid #cbd5e1',
                    textTransform: 'capitalize'
                  }}>{opt}</button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: '8px' }}>
            <label style={{ fontSize: '11px', color: '#475569', display: 'block', marginBottom: '4px' }}>Fear level when refraining (1-10)</label>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <button type="button" onClick={() => setDt(String(Math.max(1, (Number(dt) || 1) - 1)))} style={{ width: '28px', height: '32px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#475569' }}>−</button>
              <input value={dt} onChange={e => setDt(e.target.value)} type="number" min="1" max="10" className="text-sm border border-slate-200 rounded" style={{ width: '80px', padding: '6px 8px', textAlign: 'center', height: '32px', boxSizing: 'border-box' }} />
              <button type="button" onClick={() => setDt(String(Math.min(10, (Number(dt) || 0) + 1)))} style={{ width: '28px', height: '32px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#475569' }}>+</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button onClick={() => addMut.mutate()} disabled={!name.trim()} className="bg-teal-600 text-white rounded text-xs font-medium disabled:opacity-40 border-none cursor-pointer" style={{ padding: '6px 12px' }}>Add</button>
            <button onClick={() => setShowAdd(false)} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {(!behaviors || behaviors.length === 0) && !showAdd && (
        <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.4', margin: '4px 0 0' }}>
          Add avoidance and safety behaviors for this situation. Rate each with the DT for refraining.
        </p>
      )}

      {/* Recent experiments for this situation */}
      {(() => {
        const situationExperiments = (experiments ?? []).filter(e => e.trigger_situation_id === trigger.id)
        if (situationExperiments.length === 0) return null
        return (
          <div style={{ marginTop: '16px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              Recent experiments
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {situationExperiments.slice(0, 6).map(exp => {
                const conf = confidenceMeta(exp.confidence_level)
                const isCompleted = exp.status === 'completed'
                const dateStr = exp.scheduled_date
                  ? new Date(exp.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                  : new Date(exp.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                const icon = isCompleted ? '✓' : exp.status === 'too_hard' ? '⚠' : exp.status === 'skipped' ? '—' : '\u{1F4C5}'
                const bipBefore = exp.bip_before != null ? Math.round(Number(exp.bip_before)) : null
                const bipAfter = exp.bip_after != null ? Math.round(Number(exp.bip_after)) : null
                const statusLabel = EXPERIMENT_STATUS_LABEL[exp.status] || exp.status
                return (
                  <div key={exp.id} style={{ fontSize: '12px', color: '#475569', padding: '6px 8px', background: '#f8fafc', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ flexShrink: 0 }}>{icon}</span>
                    <span style={{ fontWeight: 500, color: '#1e293b' }}>{exp.behavior_name || exp.plan_description || 'Experiment'}</span>
                    <span style={{ color: '#94a3b8' }}>&middot;</span>
                    <span>{dateStr}</span>
                    {conf.label && (
                      <>
                        <span style={{ color: '#94a3b8' }}>&middot;</span>
                        <span>{conf.emoji} {conf.label} confidence</span>
                      </>
                    )}
                    <span style={{ color: '#94a3b8' }}>&middot;</span>
                    <span style={{ color: isCompleted ? '#16a34a' : '#64748b' }}>{statusLabel}</span>
                    {isCompleted && bipBefore != null && bipAfter != null && (
                      <>
                        <span style={{ color: '#94a3b8' }}>&middot;</span>
                        <span style={{ fontWeight: 600 }}>BIP {bipBefore}%&rarr;{bipAfter}%</span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ── Case Conceptualization (living draft) ──
function CaseConceptualization({ draft, defaultExpanded = false, saveStatus = 'idle' }: { draft: ConceptualizationDraft; defaultExpanded?: boolean; saveStatus?: 'idle' | 'saving' | 'saved' }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const sections: { label: string; from: string; items: string[] }[] = [
    { label: 'TRIGGER SITUATIONS', from: 'from Step 2', items: draft.situations },
    { label: 'AVOIDANCE & SAFETY BEHAVIORS', from: 'from Step 2', items: draft.behaviors },
    { label: 'ACCOMMODATION PATTERNS', from: 'from Step 2, updated Step 3', items: draft.accommodationPatterns },
    { label: 'PARENT — FEARED OUTCOMES', from: 'from Step 3', items: draft.parentFearedOutcomes },
    { label: 'PATIENT — FEARED OUTCOMES', from: 'from Step 4', items: draft.patientFearedOutcomes },
  ].filter(s => s.items.length > 0)

  return (
    <div style={{ background: '#ffffff', borderRadius: '12px', border: '1px solid #cbd5e1', borderLeft: '4px solid #F59E0B', boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', padding: '16px 20px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#92400e' }}>Case Conceptualization — Draft</span>
          {saveStatus === 'saving' && <span style={{ fontSize: '11px', color: '#b45309' }}>Saving...</span>}
          {saveStatus === 'saved' && <span style={{ fontSize: '11px', color: '#b45309' }}>Saved</span>}
        </div>
        <button onClick={() => setExpanded(e => !e)} className="bg-transparent border-none cursor-pointer" style={{ fontSize: '12px', fontWeight: 600, color: '#b45309', whiteSpace: 'nowrap', padding: 0 }}>
          {expanded ? 'Hide draft ↑' : 'View draft conceptualization →'}
        </button>
      </div>
      {expanded && (
        <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {sections.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0, lineHeight: '1.5' }}>
              Nothing captured yet. Run extraction in Step 2 to begin the draft.
            </p>
          ) : sections.map(s => (
            <div key={s.label}>
              <div style={{ marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.05em', color: '#475569' }}>{s.label}</span>
                <span style={{ fontSize: '11px', fontWeight: 500, color: '#94a3b8', marginLeft: '8px' }}>({s.from})</span>
              </div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {s.items.map((it, i) => (
                  <li key={i} style={{ fontSize: '13px', color: '#334155', display: 'flex', gap: '8px', lineHeight: '1.45' }}>
                    <span style={{ color: '#F59E0B' }}>·</span><span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Session Downward Arrow (used in Session 1 / Session 2 steps) ──
function SessionDownwardArrow({ trigger, facilitatedBy, onApproved, showSituation, childName }: {
  trigger: TriggerSituation
  facilitatedBy: 'parent' | 'practitioner'
  onApproved: (fearedOutcome: string) => void
  showSituation: boolean
  childName?: string
}) {
  const qc = useQueryClient()
  const [firstAnswer, setFirstAnswer] = useState('')
  const [nextAnswer, setNextAnswer] = useState('')

  const { data: arrow } = useQuery({
    queryKey: ['downward-arrow', trigger.id],
    queryFn: () => getSituationDownwardArrow(trigger.id),
    enabled: !!trigger.id
  })

  const createMut = useMutation({
    mutationFn: () => createSituationDownwardArrow(trigger.id, firstAnswer, facilitatedBy),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['downward-arrow', trigger.id] }); qc.invalidateQueries({ queryKey: ['da-statuses'] }); setFirstAnswer('') }
  })

  const addStepMut = useMutation({
    mutationFn: (newSteps: ArrowStep[]) => updateDownwardArrow(arrow!.id, { arrow_steps: newSteps }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['downward-arrow', trigger.id] }); setNextAnswer('') }
  })

  const setFearedOutcomeMut = useMutation({
    mutationFn: (fo: string) => updateDownwardArrow(arrow!.id, { feared_outcome: fo }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['downward-arrow', trigger.id] }); qc.invalidateQueries({ queryKey: ['da-statuses'] }); setNextAnswer('') }
  })

  const approveMut = useMutation({
    mutationFn: () => updateDownwardArrow(arrow!.id, { is_approved: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['downward-arrow', trigger.id] })
      qc.invalidateQueries({ queryKey: ['da-statuses'] })
      if (arrow?.feared_outcome) onApproved(arrow.feared_outcome)
    }
  })

  const isParent = facilitatedBy === 'parent'
  const openingQuestion = isParent
    ? `What does ${childName?.trim() || 'your child'} worry will happen when they feel anxious?`
    : 'What will happen in this situation?'
  const steps: ArrowStep[] = arrow?.arrow_steps ?? []
  const lastAnswer = steps.length > 0 ? steps[steps.length - 1].response : ''
  const nextQuestion = lastAnswer ? `What will happen if... ${lastAnswer}?` : openingQuestion
  const hasFearedOutcome = !!arrow?.feared_outcome
  const isApproved = !!arrow?.feared_outcome_approved

  const handleAddStep = () => {
    if (!nextAnswer.trim()) return
    const newSteps = [...steps, { question: nextQuestion, response: nextAnswer.trim() }]
    addStepMut.mutate(newSteps)
  }

  const handleMarkFearedOutcome = () => {
    const fo = nextAnswer.trim() || lastAnswer
    if (!fo) return
    setFearedOutcomeMut.mutate(fo)
  }

  return (
    <div>
      {/* Header */}
      {showSituation && (
        <div style={{ marginBottom: '12px' }}>
          <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>Situation: {trigger.name}</p>
        </div>
      )}

      {/* No DA yet */}
      {!arrow && (
        <div>
          {!isParent && (
            <p style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.5', marginBottom: '12px' }}>
              The Downward Arrow helps identify the child's core feared outcome for this situation.
            </p>
          )}
          <p style={{ fontSize: '13px', fontWeight: '600', color: '#1e293b', marginBottom: '6px' }}>
            Start with: "{openingQuestion}"
          </p>
          <textarea value={firstAnswer} onChange={e => setFirstAnswer(e.target.value)} rows={2}
            placeholder={isParent ? "The parent's response..." : "The child's answer..."}
            className="text-sm border border-slate-200 rounded"
            style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginBottom: '8px' }} />
          <button onClick={() => createMut.mutate()} disabled={!firstAnswer.trim() || createMut.isPending}
            className="bg-teal-600 text-white rounded text-xs font-medium border-none cursor-pointer disabled:opacity-40"
            style={{ padding: '7px 14px' }}>
            {createMut.isPending ? 'Starting...' : 'Start \u2192'}
          </button>
        </div>
      )}

      {/* DA exists — show chain */}
      {arrow && (
        <div>
          {/* Show all existing steps */}
          {steps.map((step, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', marginBottom: '14px' }}>
              <span style={{ fontSize: '18px', color: 'var(--float-primary)', lineHeight: '1.2', flexShrink: 0 }}>↓</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '12px', fontWeight: '600', color: '#334155', margin: '0 0 4px' }}>{step.question}</p>
                <p style={{ fontSize: '13px', color: '#64748b', fontStyle: 'italic', margin: 0 }}>&ldquo;{step.response}&rdquo;</p>
              </div>
            </div>
          ))}

          {/* If no feared outcome yet — show next question input */}
          {!hasFearedOutcome && (
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <span style={{ fontSize: '18px', color: 'var(--float-primary)', lineHeight: '1.2', flexShrink: 0 }}>↓</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '12px', fontWeight: '600', color: '#334155', margin: '0 0 4px' }}>{nextQuestion}</p>
                <textarea value={nextAnswer} onChange={e => setNextAnswer(e.target.value)} rows={2}
                  placeholder={isParent ? "The parent's response..." : "The child's answer..."}
                  className="text-sm border border-slate-200 rounded"
                  style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', marginBottom: '8px' }} />
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <button onClick={handleAddStep} disabled={!nextAnswer.trim() || addStepMut.isPending}
                    className="bg-teal-600 text-white rounded text-xs font-medium border-none cursor-pointer disabled:opacity-40"
                    style={{ padding: '6px 12px' }}>
                    Next ↓
                  </button>
                  <button onClick={handleMarkFearedOutcome} disabled={(steps.length === 0 && !nextAnswer.trim()) || setFearedOutcomeMut.isPending}
                    className="text-xs font-medium border cursor-pointer disabled:opacity-40 bg-white"
                    style={{ padding: '6px 12px', borderRadius: '6px', borderColor: 'var(--float-primary)', color: 'var(--float-primary)' }}>
                    This is the feared outcome
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Feared outcome + approval */}
          {hasFearedOutcome && (
            <div style={{ marginTop: '8px', padding: '12px 14px', background: '#f0fdfa', borderLeft: '3px solid var(--float-primary)', borderRadius: '6px' }}>
              <p style={{ fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--float-primary)', margin: '0 0 6px' }}>
                Feared outcome
              </p>
              <p style={{ fontSize: '14px', fontStyle: 'italic', color: '#134e4a', margin: '0 0 10px' }}>
                &ldquo;{arrow.feared_outcome}&rdquo;
              </p>
              {isApproved ? (
                <p style={{ fontSize: '12px', color: '#16a34a', fontWeight: '600', margin: '0 0 8px' }}>
                  &#10003; Added to case conceptualization.
                </p>
              ) : (
                <button onClick={() => approveMut.mutate()} disabled={approveMut.isPending}
                  className="bg-teal-600 text-white rounded text-xs font-medium border-none cursor-pointer disabled:opacity-40"
                  style={{ padding: '6px 12px', marginBottom: '8px' }}>
                  {approveMut.isPending ? 'Approving...' : 'Approve this feared outcome'}
                </button>
              )}
              <p style={{ fontSize: '11px', color: '#64748b', margin: 0, lineHeight: '1.4' }}>
                This feared outcome will be used as the prediction in experiments for this situation.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Patient Downward Arrows (Step 4) — post-session entry: list + entry form ──
function PatientDownwardArrows({ patientId, planId, triggers, onFearedOutcome }: {
  patientId: string
  planId: string | undefined
  triggers: TriggerSituation[]
  onFearedOutcome: (fearedOutcome: string) => void
}) {
  const qc = useQueryClient()
  const cardStyle = { background: '#ffffff', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', padding: '20px', width: '100%', boxSizing: 'border-box' as const }

  const [formOpen, setFormOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [situationId, setSituationId] = useState<string>('')   // '' | '__new__' | <trigger id>
  const [newSituationName, setNewSituationName] = useState('')
  const [newSituationDT, setNewSituationDT] = useState('')
  const [steps, setSteps] = useState<string[]>([''])
  const [fearedOutcome, setFearedOutcome] = useState('')
  const [bip, setBip] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: das } = useQuery({
    queryKey: ['patient-das', patientId],
    queryFn: () => listPatientDownwardArrows(patientId, 'practitioner'),
    enabled: !!patientId,
  })

  const resetForm = () => {
    setEditingId(null); setSituationId(''); setNewSituationName(''); setNewSituationDT('')
    setSteps(['']); setFearedOutcome(''); setBip(''); setError(null)
  }
  const openAdd = () => { resetForm(); setFormOpen(true) }
  const openEdit = (da: DownwardArrow) => {
    setEditingId(da.id)
    setSituationId(da.trigger_situation_id ?? '')
    setNewSituationName(''); setNewSituationDT('')
    setSteps(da.arrow_steps.length > 0 ? da.arrow_steps.map(s => s.response) : [''])
    setFearedOutcome(da.feared_outcome ?? '')
    setBip(da.bip_derived != null ? String(da.bip_derived) : '')
    setError(null)
    setFormOpen(true)
  }
  const closeForm = () => { setFormOpen(false); resetForm() }

  const updateStep = (i: number, val: string) => setSteps(prev => prev.map((s, j) => j === i ? val : s))
  const addStep = () => setSteps(prev => [...prev, ''])
  const removeStep = (i: number) => setSteps(prev => prev.length > 1 ? prev.filter((_, j) => j !== i) : prev)

  const situationChosen = situationId === '__new__' ? newSituationName.trim().length > 0 : !!situationId
  const canSave = situationChosen && fearedOutcome.trim().length > 0 && !saving

  const handleSave = async () => {
    setError(null)
    setSaving(true)
    try {
      let sitId = situationId
      if (!editingId && situationId === '__new__') {
        let pid = planId
        if (!pid) {
          const newPlan = await createTreatmentPlan(patientId, { clinical_track: 'exposure', parent_visibility_level: 'summary' })
          pid = newPlan.id
        }
        const dt = newSituationDT.trim() ? Number(newSituationDT) : undefined
        const trig = await createTrigger(pid, { name: newSituationName.trim(), distress_thermometer_rating: dt })
        sitId = trig.id
      }

      const arrowSteps: ArrowStep[] = steps
        .map(s => s.trim())
        .filter(Boolean)
        .map((text, i) => ({ question: `Step ${i + 1}`, response: text }))
      const bipVal = bip.trim() ? Number(bip) : undefined

      let arrowId = editingId
      if (!arrowId) {
        const arrow = await createSituationDownwardArrow(sitId, undefined, 'practitioner')
        arrowId = arrow.id
      }
      await updateDownwardArrow(arrowId, {
        arrow_steps: arrowSteps,
        feared_outcome: fearedOutcome.trim(),
        bip_derived: bipVal,
        is_approved: true,
      })

      await qc.invalidateQueries({ queryKey: ['patient-das', patientId] })
      await qc.invalidateQueries({ queryKey: ['da-statuses'] })
      await qc.invalidateQueries({ queryKey: ['triggers'] })
      await qc.invalidateQueries({ queryKey: ['plan', patientId] })
      onFearedOutcome(fearedOutcome.trim())
      setFormOpen(false)
      resetForm()
    } catch {
      setError('Could not save the Downward Arrow. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const labelStyle = { fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' as const, letterSpacing: '0.05em', display: 'block', marginBottom: '6px' }
  const inputStyle = { width: '100%', padding: '8px 10px', boxSizing: 'border-box' as const, background: '#fff' }

  return (
    <div style={cardStyle}>
      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text)', marginBottom: '4px' }}>Patient Downward Arrows</div>
      <p style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.5', margin: '0 0 16px' }}>
        Complete a Downward Arrow for each situation you worked through with the child. Enter the chain from your session notes.
      </p>

      {/* List view */}
      {das && das.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
          {das.map(da => {
            const sitName = triggers.find(t => t.id === da.trigger_situation_id)?.name ?? 'Situation'
            return (
              <div key={da.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>{sitName}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                    {da.feared_outcome_approved && (
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#16a34a' }}>&#10003; Complete</span>
                    )}
                    <button onClick={() => openEdit(da)} className="text-xs font-medium bg-transparent border-none cursor-pointer" style={{ color: 'var(--float-primary)', padding: 0 }}>Edit</button>
                  </div>
                </div>
                {da.feared_outcome && (
                  <p style={{ fontSize: '12px', color: '#64748b', margin: '4px 0 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {da.feared_outcome}
                  </p>
                )}
                {da.bip_derived != null && (
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0 0' }}>BIP {da.bip_derived}%</p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Add button (hidden while form open) */}
      {!formOpen && (
        <button onClick={openAdd}
          className="text-sm font-medium border cursor-pointer bg-white"
          style={{ padding: '8px 14px', borderRadius: '6px', borderColor: 'var(--float-primary)', color: 'var(--float-primary)' }}>
          + Add Downward Arrow
        </button>
      )}

      {/* Entry form */}
      {formOpen && (
        <div style={{ borderTop: das && das.length > 0 ? '1px solid #e2e8f0' : 'none', paddingTop: das && das.length > 0 ? '14px' : 0 }}>
          {/* Situation */}
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Situation</label>
            {editingId ? (
              <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>{triggers.find(t => t.id === situationId)?.name ?? 'Situation'}</p>
            ) : (
              <>
                <select value={situationId} onChange={e => setSituationId(e.target.value)}
                  className="text-sm border border-slate-200 rounded" style={inputStyle}>
                  <option value="">Select a situation…</option>
                  {triggers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  <option value="__new__">+ Create new situation</option>
                </select>
                {situationId === '__new__' && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                    <input value={newSituationName} onChange={e => setNewSituationName(e.target.value)} placeholder="Situation name"
                      className="text-sm border border-slate-200 rounded" style={{ flex: 1, padding: '8px 10px', boxSizing: 'border-box' }} />
                    <input value={newSituationDT} onChange={e => setNewSituationDT(e.target.value)} type="number" min={1} max={10} placeholder="DT"
                      className="text-sm border border-slate-200 rounded" style={{ width: '70px', padding: '8px 10px', boxSizing: 'border-box' }} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Chain steps */}
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>The chain — enter the steps from your session</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {steps.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', width: '18px', textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
                  <input value={s} onChange={e => updateStep(i, e.target.value)} placeholder="What they fear will happen…"
                    className="text-sm border border-slate-200 rounded" style={{ flex: 1, padding: '8px 10px', boxSizing: 'border-box' }} />
                  {steps.length > 1 && (
                    <button onClick={() => removeStep(i)} aria-label="Remove step"
                      className="bg-transparent border-none cursor-pointer" style={{ color: '#94a3b8', fontSize: '16px', lineHeight: 1, padding: '0 4px', flexShrink: 0 }}>×</button>
                  )}
                </div>
              ))}
            </div>
            <button onClick={addStep} className="text-xs font-medium bg-transparent border-none cursor-pointer" style={{ color: 'var(--float-primary)', padding: '8px 0 0' }}>+ Add step</button>
          </div>

          {/* Core feared outcome */}
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Core feared outcome</label>
            <textarea value={fearedOutcome} onChange={e => setFearedOutcome(e.target.value)} rows={2} placeholder="The child's core feared outcome…"
              className="text-sm border border-slate-200 rounded" style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          {/* BIP */}
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>BIP — child's belief this will happen</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input value={bip} onChange={e => setBip(e.target.value)} type="number" min={0} max={100}
                className="text-sm border border-slate-200 rounded" style={{ width: '90px', padding: '8px 10px', boxSizing: 'border-box' }} />
              <span style={{ fontSize: '13px', color: '#64748b' }}>%</span>
            </div>
          </div>

          {error && <p style={{ fontSize: '12px', color: '#dc2626', margin: '0 0 10px' }}>{error}</p>}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button onClick={handleSave} disabled={!canSave}
              className="bg-teal-600 text-white rounded text-sm font-medium border-none cursor-pointer disabled:opacity-40" style={{ padding: '9px 18px' }}>
              {saving ? 'Saving…' : 'Save Downward Arrow'}
            </button>
            <button onClick={closeForm} disabled={saving}
              className="text-sm text-slate-500 bg-transparent border-none cursor-pointer disabled:opacity-40" style={{ padding: '9px 12px' }}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

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

function ConsultationChecklist({ patientId, title, groups, collapsed, onToggleCollapse, onNavigate }: {
  patientId: string
  title: string
  groups: ChecklistGroup[]
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
  const allKeys = groups.flatMap(g => g.items.map(i => i.key))
  const total = allKeys.length
  const checkedCount = allKeys.filter(k => !!checkedItems[k]).length
  const progress = `${checkedCount}/${total}`

  const panelStyle = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', width: '100%', boxSizing: 'border-box' as const }

  // Collapsed: slim vertical bar
  if (collapsed) {
    return (
      <div
        onClick={onToggleCollapse}
        title={title}
        style={{ ...panelStyle, padding: '12px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', cursor: 'pointer' }}
      >
        <span style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1 }}>›</span>
        <span style={{ writingMode: 'vertical-rl', fontSize: '11px', fontWeight: 700, color: 'var(--float-primary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>CHECKLIST</span>
        <span style={{ fontSize: '12px', color: '#64748b' }}>{progress}</span>
      </div>
    )
  }

  return (
    <div style={panelStyle}>
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }} title={title}>
        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--float-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Checklist</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>{progress}</span>
          <button onClick={onToggleCollapse} aria-label="Collapse checklist"
            className="bg-transparent border-none cursor-pointer"
            style={{ fontSize: '14px', color: '#94a3b8', padding: 0, lineHeight: 1 }}>›</button>
        </div>
      </div>

      {groups.map((group, gi) => (
        <div key={group.header || `group-${gi}`}>
          {group.header && (
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--float-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: gi === 0 ? '4px 0 8px' : '16px 0 8px' }}>
              {group.header}
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            {group.items.map(item => {
              const isChecked = !!checkedItems[item.key]
              return (
                <div key={item.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleMut.mutate({ key: item.key, value: !isChecked })}
                    style={{ accentColor: '#0d9488', width: '15px', height: '15px', marginTop: '2px', flexShrink: 0, cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: '12.5px', lineHeight: 1.4, color: isChecked ? '#94a3b8' : '#334155' }}>{item.text}</span>
                    {item.link && (
                      <div style={{ position: 'relative', marginTop: '3px' }}>
                        <button
                          onClick={() => setPopoverKey(popoverKey === item.key ? null : item.key)}
                          className="bg-transparent border-none cursor-pointer"
                          style={{ fontSize: '11.5px', color: '#94a3b8', padding: 0, whiteSpace: 'nowrap' }}
                        >
                          {item.link.icon} {item.link.label}
                        </button>
                        {popoverKey === item.key && (
                          <div style={{ position: 'absolute', left: 0, top: '22px', background: '#1e293b', color: '#fff', fontSize: '11px', padding: '6px 10px', borderRadius: '6px', whiteSpace: 'nowrap', zIndex: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}>
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
      ))}
    </div>
  )
}

// Two-column wrapper for Steps 3 & 4: main content + collapsible sticky checklist panel.
function StepWithChecklist({ patientId, stepNumber, title, groups, children, onNavigate }: {
  patientId: string
  stepNumber: number
  title: string
  groups: ChecklistGroup[]
  children: ReactNode
  onNavigate: (action: ChecklistNav['action']) => void
}) {
  const storageKey = `float_checklist_collapsed_${patientId}_step${stepNumber}`
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(storageKey) === 'true' } catch { return false }
  })
  const toggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(storageKey, String(next)) } catch { /* ignore */ }
      return next
    })
  }

  const containerRef = useRef<HTMLDivElement>(null)
  const [isNarrow, setIsNarrow] = useState(false)
  useEffect(() => {
    const el = containerRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) setIsNarrow(entry.contentRect.width < 900)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const sideBySide = !isNarrow

  // First unchecked item across the step's checklist — surfaced in the "Next" banner.
  const { data: checked } = useQuery({
    queryKey: ['checklist', patientId],
    queryFn: () => getChecklist(patientId),
    enabled: !!patientId,
  })
  const checkedItems = checked ?? {}
  const firstUnchecked = groups.flatMap(g => g.items).find(i => !checkedItems[i.key])

  const handleBannerClick = () => {
    if (collapsed) {
      setCollapsed(false)
      try { localStorage.setItem(storageKey, 'false') } catch { /* ignore */ }
    }
  }

  return (
    <div>
      {firstUnchecked ? (
        <div onClick={handleBannerClick}
          style={{ background: '#f0fdfa', borderLeft: '3px solid #0d9488', borderRadius: '8px', padding: '8px 14px', marginBottom: '16px', cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--float-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0 }}>Next →</span>
          <span style={{ fontSize: '13px', color: '#1e293b' }}>{firstUnchecked.text}</span>
        </div>
      ) : (
        <div onClick={handleBannerClick}
          style={{ background: '#f0fdf4', borderLeft: '3px solid #16a34a', borderRadius: '8px', padding: '8px 14px', marginBottom: '16px', cursor: 'pointer' }}>
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#16a34a' }}>✓ All checklist items complete</span>
        </div>
      )}
      <div ref={containerRef} style={{ display: 'flex', flexDirection: sideBySide ? 'row' : 'column', gap: '20px', alignItems: 'stretch' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {children}
        </div>
        <div style={{
          width: sideBySide ? (collapsed ? '44px' : '300px') : '100%',
          flexShrink: 0,
          position: sideBySide ? 'sticky' : 'static',
          top: sideBySide ? '16px' : undefined,
          alignSelf: 'flex-start',
        }}>
          <ConsultationChecklist
            patientId={patientId}
            title={title}
            groups={groups}
            collapsed={sideBySide && collapsed}
            onToggleCollapse={toggleCollapse}
            onNavigate={onNavigate}
          />
        </div>
      </div>
    </div>
  )
}

// ── Main Page ──
export default function PatientPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [selectedTriggerId, setSelectedTriggerId] = useState<string | null>(null)
  const [showTriggerAdd, setShowTriggerAdd] = useState(false)
  const [newTriggerName, setNewTriggerName] = useState('')
  const [newTriggerDT, setNewTriggerDT] = useState('')
  const [editingTriggerId, setEditingTriggerId] = useState<string | null>(null)
  const [editTriggerName, setEditTriggerName] = useState('')
  const [deletingTriggerId, setDeletingTriggerId] = useState<string | null>(null)
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
  const [showMsgForm, setShowMsgForm] = useState(false)

  // Inline monitoring report (Step 1)
  const [showInlineReport, setShowInlineReport] = useState(false)

  // AI monitoring extraction
  const [extractOpen, setExtractOpen] = useState(false)
  const [extractLoading, setExtractLoading] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [extraction, setExtraction] = useState<MonitoringExtraction | null>(null)
  const [extractApplying, setExtractApplying] = useState(false)
  const [extractProgress, setExtractProgress] = useState<string | null>(null)
  const [extractFailed, setExtractFailed] = useState<string[]>([])
  const [extractSuccess, setExtractSuccess] = useState(false)
  const [extractSuccessMessage, setExtractSuccessMessage] = useState('Treatment plan populated from monitoring data')
  const [extractPreview, setExtractPreview] = useState<{ name: string; isNew: boolean }[] | null>(null)

  // Teen invitation
  const [showTeenInviteForm, setShowTeenInviteForm] = useState(false)
  const [teenEmailInput, setTeenEmailInput] = useState('')
  const [teenInviteConfirmation, setTeenInviteConfirmation] = useState<string | null>(null)

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
  const [noteType, setNoteType] = useState('weekly_session')
  const [noteDate, setNoteDate] = useState(new Date().toISOString().split('T')[0])
  const [noteContent, setNoteContent] = useState('')
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)

  // Activation warning
  const [showActivationWarning, setShowActivationWarning] = useState(false)
  const [planActivatedConfirm, setPlanActivatedConfirm] = useState(false)

  // Treatment Journey navigation
  const [activeStep, setActiveStep] = useState<number>(0)
  const [activePersistentTab, setActivePersistentTab] = useState<PersistentTabId | null>(null)
  const [accommodationCheckinComplete, setAccommodationCheckinComplete] = useState(false)
  const stepInitializedRef = useRef(false)

  // Case conceptualization — living draft, persisted to the backend formulation record
  const [conceptualizationDraft, setConceptualizationDraft] = useState<ConceptualizationDraft>(EMPTY_CONCEPTUALIZATION)
  const [formulationSaveStatus, setFormulationSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle')
  const formulationIdRef = useRef<string | null>(null)
  const formulationHydratedRef = useRef(false)
  const skipNextFormulationSaveRef = useRef(false)
  const formulationSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const formulationSavedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      setFormulationSaveStatus('saving')
      try {
        if (formulationIdRef.current) {
          await updateFormulation(patientId, payload)
        } else {
          const created = await createFormulation(patientId, payload)
          formulationIdRef.current = created.id
        }
        setFormulationSaveStatus('saved')
        if (formulationSavedTimerRef.current) clearTimeout(formulationSavedTimerRef.current)
        formulationSavedTimerRef.current = setTimeout(() => setFormulationSaveStatus('idle'), 2000)
      } catch {
        setFormulationSaveStatus('idle')
      }
    }, 1500)
    return () => { if (formulationSaveTimerRef.current) clearTimeout(formulationSaveTimerRef.current) }
  }, [conceptualizationDraft, patientId])

  // Clean up formulation save timers on unmount
  useEffect(() => () => {
    if (formulationSaveTimerRef.current) clearTimeout(formulationSaveTimerRef.current)
    if (formulationSavedTimerRef.current) clearTimeout(formulationSavedTimerRef.current)
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
  const { data: plan } = useQuery({ queryKey: ['plan', patientId], queryFn: () => getTreatmentPlan(patientId!), enabled: !!patientId })
  const { data: rawTriggers } = useQuery({ queryKey: ['triggers', plan?.id], queryFn: () => getTriggers(plan!.id), enabled: !!plan?.id })
  // Placeholder situations (e.g. the parent-DA anchor) are filtered out of every situation list/count
  const triggers = useMemo(() => rawTriggers?.filter(t => !t.is_placeholder), [rawTriggers])
  const { data: monitoringForm } = useQuery({ queryKey: ['monitoring-form', patientId], queryFn: () => getMonitoringForm(patientId!), enabled: !!patientId })
  const { data: sessionNotes } = useQuery({ queryKey: ['session-notes', patientId], queryFn: () => getSessionNotes(patientId!), enabled: !!patientId })
  const { data: checklistItems } = useQuery({ queryKey: ['checklist', patientId], queryFn: () => getChecklist(patientId!), enabled: !!patientId })
  const { data: actionPlans } = useQuery({ queryKey: ['action-plans', patientId], queryFn: () => getActionPlans(patientId!), enabled: !!patientId })
  const { data: messages } = useQuery({ queryKey: ['messages', patientId], queryFn: () => getMessages(patientId!), enabled: !!patientId })
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
  const activatePlanMut = useMutation({
    mutationFn: () => updatePlanStatus(patientId!, plan!.id, 'active'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plan', patientId] })
      setShowActivationWarning(false)
      setPlanActivatedConfirm(true)
      setTimeout(() => setPlanActivatedConfirm(false), 3000)
    }
  })
  const nicknameMut = useMutation({
    mutationFn: () => updatePlanNickname(patientId!, plan!.id, nicknameVal.trim()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['plan', patientId] }); setEditingNickname(false) }
  })
  const addTriggerMut = useMutation({
    mutationFn: () => createTrigger(plan!.id, { name: newTriggerName, distress_thermometer_rating: newTriggerDT ? Number(newTriggerDT) : undefined }),
    onSuccess: (t) => { queryClient.invalidateQueries({ queryKey: ['triggers', plan?.id] }); setNewTriggerName(''); setNewTriggerDT(''); setShowTriggerAdd(false); setSelectedTriggerId(t.id) }
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
      if (selectedTriggerId === id) setSelectedTriggerId(null)
    }
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

  const handleExtract = async () => {
    setExtractOpen(true)
    setExtractLoading(true)
    setExtractError(null)
    setExtraction(null)
    setExtractFailed([])
    setExtractSuccess(false)
    setExtractPreview(null)
    try {
      const data = await extractMonitoringData(patientId!)
      setExtraction(data)
    } catch (err: any) {
      setExtractError(err?.response?.data?.detail || 'Extraction failed. Please try again.')
    } finally {
      setExtractLoading(false)
    }
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

  const closeExtract = () => {
    setExtractOpen(false)
    setExtraction(null)
    setExtractError(null)
    setExtractProgress(null)
    setExtractFailed([])
    setExtractApplying(false)
    setExtractPreview(null)
  }

  const handleShowPreview = async () => {
    if (!extraction) return
    setExtractError(null)
    setExtractFailed([])
    let existingTriggers: TriggerSituation[] = []
    try {
      existingTriggers = plan?.id ? await getTriggers(plan.id) : []
    } catch {
      existingTriggers = []
    }
    const preview = extraction.situations.map(sit => ({
      name: sit.name,
      isNew: !existingTriggers.some(t => isSimilar(t.name, sit.name)),
    }))
    setExtractPreview(preview)
  }

  const handleAddToPlan = async () => {
    if (!extraction) return
    setExtractApplying(true)
    setExtractError(null)
    setExtractFailed([])
    const failed: string[] = []

    let planId = plan?.id
    if (!planId) {
      setExtractProgress('Creating treatment plan...')
      try {
        const newPlan = await createTreatmentPlan(patientId!, { clinical_track: 'exposure', parent_visibility_level: 'summary' })
        planId = newPlan.id
      } catch {
        setExtractProgress(null)
        setExtractApplying(false)
        setExtractError('Could not create a treatment plan. Please try again.')
        return
      }
    }

    // Fetch existing situations so we can skip duplicates (fuzzy match)
    let existingTriggers: TriggerSituation[] = []
    try {
      existingTriggers = await getTriggers(planId!)
    } catch {
      existingTriggers = []
    }
    // Cache of existing behavior names per trigger id (for fuzzy duplicate checks)
    const behaviorNamesByTrigger: Record<string, string[]> = {}

    let anyCreated = false
    let anySkipped = false

    for (const sit of extraction.situations) {
      try {
        // Match an existing situation by fuzzy similarity
        let trigger: TriggerSituation | null =
          existingTriggers.find(t => isSimilar(t.name, sit.name)) ?? null

        if (trigger) {
          anySkipped = true
        } else {
          // Situation DT = highest behavior DT in this situation
          const behaviorDTs = sit.behaviors.map(b => b.dt).filter((d): d is number => d != null)
          const situationDT = behaviorDTs.length > 0 ? Math.max(...behaviorDTs) : undefined
          setExtractProgress(`Creating situations... ${sit.name}`)
          trigger = await createTrigger(planId!, {
            name: sit.name,
            distress_thermometer_rating: situationDT,
          })
          existingTriggers.push(trigger)
          anyCreated = true
        }

        // Load existing behavior names for this situation
        if (!behaviorNamesByTrigger[trigger.id]) {
          let existingBehaviors: AvoidanceBehavior[] = []
          try {
            existingBehaviors = await getBehaviors(trigger.id)
          } catch {
            existingBehaviors = []
          }
          behaviorNamesByTrigger[trigger.id] = existingBehaviors.map(b => b.name)
        }
        const behaviorNames = behaviorNamesByTrigger[trigger.id]

        for (const beh of sit.behaviors) {
          // Match an existing behavior by fuzzy similarity
          if (behaviorNames.some(n => isSimilar(n, beh.name))) {
            anySkipped = true
            continue
          }
          setExtractProgress(`Creating behaviors... ${beh.name}`)
          try {
            await createBehavior(trigger.id, {
              name: beh.name,
              behavior_type: beh.type || 'avoidance',
              distress_thermometer_when_refraining: beh.dt ?? undefined,
            })
            behaviorNames.push(beh.name)
            anyCreated = true
          } catch {
            failed.push(`Behavior: ${beh.name}`)
          }
        }
      } catch {
        failed.push(`Situation: ${sit.name}`)
      }
    }

    await queryClient.invalidateQueries({ queryKey: ['plan', patientId] })
    await queryClient.invalidateQueries({ queryKey: ['triggers', planId] })

    // Seed the living case conceptualization draft from the extraction results
    setConceptualizationDraft(prev => ({
      ...prev,
      situations: extraction.situations.map(s => s.name),
      behaviors: extraction.situations.flatMap(s => s.behaviors.map(b => `${b.name} — ${b.type}`)),
      accommodationPatterns: extraction.accommodation_patterns ?? [],
      lastUpdatedStep: 2,
    }))

    setExtractProgress(null)
    setExtractApplying(false)

    if (failed.length > 0) {
      setExtractFailed(failed)
    } else {
      const message = !anyCreated
        ? 'No new items to add — all situations and behaviors already exist.'
        : anySkipped
          ? 'Added new situations and behaviors. Duplicates were skipped.'
          : 'Treatment plan populated from monitoring data'
      setExtractSuccessMessage(message)
      closeExtract()
      setExtractSuccess(true)
      setTimeout(() => setExtractSuccess(false), 4000)
    }
  }

  const daysSinceSent = monitoringForm?.sent_at
    ? Math.floor((Date.now() - new Date(monitoringForm.sent_at).getTime()) / (1000 * 60 * 60 * 24))
    : null

  // AI extraction is offered once there's enough monitoring data and the plan has no situations yet
  const canExtract = (monitoringForm?.entries_count ?? 0) >= 3 && (triggers?.length ?? 0) === 0
  const sendMsgMut = useMutation({
    mutationFn: () => sendMessage(patientId!, patient!.user_id, msgContent, 'general'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['messages', patientId] }); setMsgContent(''); setShowMsgForm(false) }
  })

  const inviteTeenMut = useMutation({
    mutationFn: (email: string) => inviteTeen(patientId!, email),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['patient', patientId] })
      setTeenInviteConfirmation(data.email)
      setShowTeenInviteForm(false)
      setTeenEmailInput('')
      setTimeout(() => setTeenInviteConfirmation(null), 4000)
    }
  })

  const openTeenInviteForm = () => {
    setTeenEmailInput(patient?.teen_email || patient?.email || '')
    setShowTeenInviteForm(true)
  }

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
  const resetNoteForm = () => { setShowNoteForm(false); setEditingNote(null); setNoteType('weekly_session'); setNoteDate(new Date().toISOString().split('T')[0]); setNoteContent('') }
  const createNoteMut = useMutation({ mutationFn: () => createSessionNote(patientId!, { session_type: noteType, session_date: noteDate, content: noteContent }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['session-notes', patientId] }); resetNoteForm() } })
  const updateNoteMut = useMutation({ mutationFn: () => updateSessionNote(editingNote!.id, { session_type: noteType, session_date: noteDate, content: noteContent }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['session-notes', patientId] }); resetNoteForm() } })
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

  // Fetch behaviors for every trigger (for activation validation)
  const { data: allBehaviors } = useQuery({
    queryKey: ['all-behaviors', patientId, triggerIds.join(',')],
    queryFn: async () => {
      const results = await Promise.all(triggerIds.map(async (id) => {
        const bs = await getBehaviors(id)
        return [id, bs] as const
      }))
      return Object.fromEntries(results) as Record<string, AvoidanceBehavior[]>
    },
    enabled: triggerIds.length > 0
  })

  // Activation validation — only check active situations for missing DT
  const activeTriggersMissingDT: TriggerSituation[] = []
  if (triggers && allBehaviors) {
    for (const t of triggers) {
      if (!t.is_active) continue
      const bs = allBehaviors[t.id] || []
      if (bs.some(b => b.distress_thermometer_when_refraining == null)) {
        activeTriggersMissingDT.push(t)
      }
    }
  }
  const noActiveTriggers = !!triggers && triggers.length > 0 && !triggers.some(t => t.is_active)
  const activationWarnings: string[] = [
    ...(noActiveTriggers ? ['No situations are marked as active'] : []),
    ...activeTriggersMissingDT.map(t => `"${t.name}" has behaviors missing DT scores`)
  ]
  const lastMsg = messages?.[0]
  const sessionTypeLabels: Record<string, string> = { consultation_1: 'Consult 1', consultation_2: 'Consult 2', consultation_3: 'Consult 3', weekly_session: 'Session', other: 'Other' }
  const badgeColors: Record<string, string> = { consultation_1: 'bg-purple-100 text-purple-700', consultation_2: 'bg-purple-100 text-purple-700', consultation_3: 'bg-purple-100 text-purple-700', weekly_session: 'bg-teal-100 text-teal-700', other: 'bg-slate-100 text-slate-600' }

  const cardStyle = { background: '#ffffff', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', padding: '20px', width: '100%', boxSizing: 'border-box' as const }

  // Tab badge counts
  const unreadMessageCount = (messages ?? []).filter(m => !m.read_at).length
  const draftPlanCount = (actionPlans ?? []).filter(ap => !ap.visible_to_patient).length

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

  // Needs attention items
  const overdueItems = (patientExperiments ?? []).filter(isOverdue)
  const lowConfidenceCount = (patientExperiments ?? []).filter(e =>
    e.status === 'committed' &&
    (e.confidence_level === 'low' || e.confidence_level === 'medium') &&
    e.scheduled_date != null && e.scheduled_date.split('T')[0] >= todayISO
  ).length
  const sevenDaysAgoISO = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const hasRecentActivity = (patientExperiments ?? []).some(e => {
    if (e.status !== 'completed' && e.status !== 'committed') return false
    const d = e.completed_date || e.scheduled_date
    if (!d) return false
    return d.split('T')[0] >= sevenDaysAgoISO
  })
  const noActivityThisWeek = !hasRecentActivity && plan?.status === 'active'
  const needsAttention = overdueItems.length > 0 || lowConfidenceCount > 0 || noActivityThisWeek

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
    enabled: !!patientId && (activePersistentTab === 'experiments' || activeStep === 6)
  })
  const progressChartData = progress?.recent_experiments
    .filter(e => e.completed_date)
    .map((e) => ({
      date: e.completed_date ? new Date(e.completed_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '',
      bip_before: e.bip_before,
      bip_after: e.bip_after,
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

  // ----- Treatment Journey: step status -----
  const accomStorageKey = patientId ? `float_accom_${patientId}` : null
  useEffect(() => {
    if (!accomStorageKey) return
    setAccommodationCheckinComplete(localStorage.getItem(accomStorageKey) === 'true')
  }, [accomStorageKey])
  const markAccommodationComplete = () => {
    if (accomStorageKey) localStorage.setItem(accomStorageKey, 'true')
    setAccommodationCheckinComplete(true)
  }

  // Conceptualization draft — feared outcome contributions from the DA sub-steps
  const addPatientFearedOutcome = (fo: string) => setConceptualizationDraft(prev =>
    prev.patientFearedOutcomes.includes(fo) ? prev
      : { ...prev, patientFearedOutcomes: [...prev.patientFearedOutcomes, fo], lastUpdatedStep: Math.max(prev.lastUpdatedStep, 4) })

  const notesList = sessionNotes ?? []
  const hasPatientDA = !!daStatuses && Object.values(daStatuses).some(da => da?.facilitated_by === 'practitioner')
  const hasActiveSituationWithBehaviors = !!triggers && !!allBehaviors && triggers.some(t => t.is_active && (allBehaviors[t.id]?.length ?? 0) > 0)
  const completedExperimentCount = (patientExperiments ?? []).filter(e => e.status === 'completed').length

  const stepComplete: boolean[] = [
    !!monitoringForm && !!monitoringForm.sent_at,
    (triggers?.length ?? 0) >= 1,
    notesList.some(n => n.session_type === 'consultation_1') || STAGE1_PARENT_KEYS.every(k => !!(checklistItems ?? {})[k]),
    notesList.some(n => n.session_type === 'consultation_2') && hasPatientDA,
    hasActiveSituationWithBehaviors,
    plan?.status === 'active' && !!patient?.teen_invited_at,
    completedExperimentCount >= 1,
    notesList.some(n => n.session_type === 'weekly_session'),
    accommodationCheckinComplete,
  ]
  const firstIncompleteStep = stepComplete.findIndex(c => !c)
  const currentActiveStep = firstIncompleteStep === -1 ? STEP_LABELS.length - 1 : firstIncompleteStep
  const stepStatus: StepStatus[] = stepComplete.map((c, i) =>
    c ? 'complete' : (i === currentActiveStep ? 'active' : 'incomplete')
  )

  // Default selected step to current active step once core data has loaded
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
    setActiveStep(currentActiveStep)
    stepInitializedRef.current = true
  }, [coreLoaded, currentActiveStep])

  // Accept/reject an AI-suggested anxiety presentation by toggling it on the patient profile
  const acceptPresentationMut = useMutation({
    mutationFn: (presentations: string[]) => updatePatient(patientId!, { anxiety_presentations: presentations.length > 0 ? presentations : null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['patient', patientId] }),
  })
  const toggleSuggestedPresentation = (value: string) => {
    const current = patient?.anxiety_presentations ?? []
    const next = current.includes(value) ? current.filter(v => v !== value) : [...current, value]
    acceptPresentationMut.mutate(next)
  }


  const renderPrep = (t: SessionPrepType) =>
    patientId ? <SessionPrepCard key={`${patientId}-${t}`} sessionType={t} patientId={patientId} /> : null

  const renderGuide = (stepNumber: number) =>
    patientId ? <StepGuideCard key={`${patientId}-guide-${stepNumber}`} stepNumber={stepNumber} patientId={patientId} /> : null

  const renderNotesSection = (filterType: string, addLabel: string) => {
    const filtered = notesList.filter(n => n.session_type === filterType)
    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="text-sm font-semibold text-slate-700">Session notes</span>
            {filtered.length > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{filtered.length}</span>}
          </div>
          {!showNoteForm && <button onClick={() => { setEditingNote(null); setNoteType(filterType); setNoteDate(new Date().toISOString().split('T')[0]); setNoteContent(''); setShowNoteForm(true) }} className="text-xs text-teal-600 font-medium bg-transparent border-none cursor-pointer">{addLabel}</button>}
        </div>
        {showNoteForm && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                Session type
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {[
                  { key: 'consultation_1', label: 'Session 1' },
                  { key: 'consultation_2', label: 'Session 2' },
                  { key: 'weekly_session', label: 'Weekly' },
                  { key: 'other', label: 'Other' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setNoteType(opt.key)}
                    style={{
                      fontSize: '14px',
                      fontWeight: 600,
                      padding: '10px 18px',
                      borderRadius: '999px',
                      cursor: 'pointer',
                      background: noteType === opt.key ? 'var(--float-primary)' : '#fff',
                      color: noteType === opt.key ? '#fff' : '#475569',
                      border: noteType === opt.key ? '1px solid var(--float-primary)' : '1px solid #cbd5e1',
                    }}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Date:</label>
              <input type="date" value={noteDate} onChange={e => setNoteDate(e.target.value)} className="text-xs border border-slate-200 rounded" style={{ padding: '4px 8px' }} />
            </div>
            <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} rows={4} placeholder="Session notes..." className="text-xs border border-slate-200 rounded" style={{ width: '100%', padding: '8px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => editingNote ? updateNoteMut.mutate() : createNoteMut.mutate()} disabled={!noteContent.trim()} className="bg-teal-600 text-white rounded text-xs font-medium disabled:opacity-40 border-none cursor-pointer" style={{ padding: '6px 12px' }}>{editingNote ? 'Update' : 'Save'}</button>
              <button onClick={resetNoteForm} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
            </div>
          </div>
        )}
        {filtered.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {filtered.map(n => (
              <div key={n.id} style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: '6px', fontSize: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <span className={`px-1 py-0.5 rounded font-medium ${badgeColors[n.session_type] || 'bg-slate-100 text-slate-600'}`}>{sessionTypeLabels[n.session_type] || n.session_type}</span>
                    <span className="text-slate-400">{new Date(n.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button onClick={() => { setEditingNote(n); setNoteType(n.session_type); setNoteDate(n.session_date); setNoteContent(n.content); setShowNoteForm(true) }} className="text-teal-600 bg-transparent border-none cursor-pointer" style={{ fontSize: '11px' }}>Edit</button>
                    <button onClick={() => { if (confirm('Delete?')) deleteNoteMut.mutate(n.id) }} className="text-red-400 bg-transparent border-none cursor-pointer" style={{ fontSize: '11px' }}>Del</button>
                  </div>
                </div>
                <p className="text-slate-600" style={{ whiteSpace: 'pre-wrap', cursor: 'pointer', margin: 0 }} onClick={() => setExpandedNoteId(expandedNoteId === n.id ? null : n.id)}>
                  {expandedNoteId === n.id ? n.content : n.content.length > 100 ? n.content.slice(0, 100) + '...' : n.content}
                </p>
              </div>
            ))}
          </div>
        ) : !showNoteForm && (
          <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5', margin: 0 }}>
            No notes yet for this session type. Add one to capture clinical observations.
          </p>
        )}
      </div>
    )
  }

  const situationsExist = (triggers?.length ?? 0) > 0
  const hasNewMonitoring = plan?.has_new_monitoring_entries ?? true
  const noNewToAnalyze = situationsExist && !hasNewMonitoring

  const monitoringExtractContent = (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text)', margin: 0 }}>Analyze Monitoring Data</h2>
        {(monitoringForm?.entries_count ?? 0) >= 3 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexShrink: 0 }}>
            <button
              onClick={handleExtract}
              disabled={extractLoading}
              className="bg-transparent border-none disabled:opacity-50"
              style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', whiteSpace: 'nowrap', padding: 0, cursor: 'pointer' }}
            >
              {extractLoading ? 'Building…' : 'Build trigger list from data →'}
            </button>
            <button
              onClick={handleGenerateReport}
              disabled={reportLoading}
              className="bg-transparent border-none disabled:opacity-50"
              style={{ fontSize: '12px', fontWeight: 600, color: 'var(--float-primary)', whiteSpace: 'nowrap', padding: 0, cursor: 'pointer' }}
            >
              {reportLoading ? 'Analyzing…' : (preliminaryReport ? 'Re-analyze with AI →' : 'Analyze with AI →')}
            </button>
          </div>
        )}
      </div>
      {situationsExist && (
        hasNewMonitoring ? (
          <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5', margin: '0 0 12px' }}>
            New observations have been added since last analysis.
          </p>
        ) : (
          <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.5', margin: '0 0 12px' }}>
            Last analyzed {plan?.last_extracted_at ? new Date(plan.last_extracted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}. Add new monitoring observations to re-analyze.
          </p>
        )
      )}
      {!monitoringForm ? (
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>Send a parent monitoring form first (Step 1).</p>
      ) : (monitoringForm.entries_count ?? 0) === 0 ? (
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>No monitoring entries yet. Once the parent logs observations they'll appear here for extraction.</p>
      ) : (
        <div>
          <p style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.5', margin: '0 0 12px' }}>
            AI extracts trigger situations, avoidance and safety behaviors, and accommodation patterns from the monitoring data. This creates a draft case conceptualization that develops through subsequent steps.
          </p>
          {(triggers?.length ?? 0) > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#16a34a', background: '#f0fdf4', borderRadius: '8px', padding: '8px 12px' }}>
              <span>&#10003;</span> {triggers?.length} situation{(triggers?.length ?? 0) === 1 ? '' : 's'} added to the treatment plan from monitoring data.
            </div>
          ) : (
            !canExtract && <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0 }}>Add more entries before extracting.</p>
          )}
        </div>
      )}
    </div>
  )

  const preliminaryReportContent = (reportLoading || reportError || preliminaryReport) ? (
    <div style={cardStyle}>
      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text)', marginBottom: '4px' }}>Preliminary Report &amp; Treatment Targets</div>
      <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 16px' }}>AI clinical summary synthesized from the parent monitoring data.</p>
      {reportLoading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
          <div className="animate-spin" style={{ width: '20px', height: '20px', border: '3px solid #e2e8f0', borderTopColor: 'var(--float-primary)', borderRadius: '50%' }} />
          <span style={{ fontSize: '13px', color: '#475569' }}>Analyzing monitoring data…</span>
        </div>
      )}
      {reportError && <p style={{ fontSize: '13px', color: '#dc2626', margin: '0 0 4px' }}>{reportError}</p>}
      {!reportLoading && preliminaryReport && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <div style={reportSectionHeaderStyle}>Situations</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[...preliminaryReport.situations].sort((a, b) => a.fear_thermometer - b.fear_thermometer).map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', width: '18px', textAlign: 'right', flexShrink: 0, lineHeight: 1.6 }}>{i + 1}.</span>
                  <span style={{ flex: 1, fontSize: '13px', color: '#334155', lineHeight: 1.5 }}>{s.name}</span>
                  <span style={{ flexShrink: 0, marginTop: '1px' }}><DTBadge value={s.fear_thermometer} /></span>
                </div>
              ))}
            </div>
          </div>
          <ReportSection label="Parental responses" items={preliminaryReport.parental_responses} />
          <ReportSection label={preliminaryReport.safety_section_label || 'Safety & avoidance behaviors'} items={preliminaryReport.safety_behaviors} />
          <ReportSection label="Treatment targets" items={preliminaryReport.treatment_targets} />
          {preliminaryReport.generated_at && (
            <p style={{ fontSize: '11px', color: '#cbd5e1', margin: 0 }}>
              Generated {new Date(preliminaryReport.generated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </div>
      )}
    </div>
  ) : null

  const accommodationContent = (
    <div style={cardStyle}>
      <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text)', marginBottom: '8px' }}>Parent Accommodation Check-ins</div>
      <p style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.5', margin: '0 0 16px' }}>
        Track accommodation reduction progress with the parent at the end of each weekly session.
      </p>
      {extraction?.accommodation_patterns && extraction.accommodation_patterns.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Accommodation patterns</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {extraction.accommodation_patterns.map((p, i) => (
              <li key={i} style={{ display: 'flex', gap: '8px', fontSize: '13px', color: '#475569' }}>
                <span style={{ color: '#0d9488' }}>&#9633;</span><span>{p}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {accommodationCheckinComplete ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#16a34a', background: '#f0fdf4', borderRadius: '8px', padding: '10px 14px' }}>
          <span>&#10003;</span> Check-in marked complete.
        </div>
      ) : (
        <button onClick={markAccommodationComplete} className="bg-teal-600 text-white rounded text-sm font-medium border-none cursor-pointer" style={{ padding: '8px 16px' }}>Mark check-in complete</button>
      )}
    </div>
  )

  const patientDAContent = patientId ? (
    <PatientDownwardArrows
      patientId={patientId}
      planId={plan?.id}
      triggers={triggers ?? []}
      onFearedOutcome={addPatientFearedOutcome}
    />
  ) : null

  // Checklist item navigation links (Step 4 patient checklist)
  const handleChecklistNav = (action: 'treatmentPlan' | 'scrollDA') => {
    if (action === 'treatmentPlan') {
      setActivePersistentTab(null)
      setActiveStep(4)
    } else if (action === 'scrollDA') {
      document.getElementById('patient-da-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const monitoringCard = (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', margin: '0 0 12px' }}>
        <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'var(--float-text)', margin: 0 }}>Parent monitoring form</h2>
        {canExtract && (
          <button
            onClick={handleExtract}
            disabled={extractLoading}
            className="bg-transparent border-none cursor-pointer disabled:opacity-50"
            style={{ fontSize: '12px', fontWeight: 600, color: 'var(--float-primary)', flexShrink: 0, whiteSpace: 'nowrap', padding: 0 }}
          >
            {extractLoading ? 'Analyzing…' : 'Extract with AI →'}
          </button>
        )}
      </div>
      {extractSuccess && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#16a34a', background: '#f0fdf4', borderRadius: '8px', padding: '8px 12px', marginBottom: '12px' }}>
          <span>&#10003;</span> {extractSuccessMessage}
        </div>
      )}

      {!monitoringForm ? (
        <div>
          <p style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.5', margin: '0 0 12px' }}>
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
              className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors border-none cursor-pointer"
            >
              Send monitoring form
            </button>
          ) : (
            <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '14px' }}>
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
                    className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 border-none cursor-pointer">
                    {sendFormMutation.isPending ? 'Sending...' :
                      parentEmail && parentPhone ? 'Send both + copy link' :
                      parentEmail ? 'Send email + copy link' : 'Send SMS + copy link'}
                  </button>
                )}
                <button onClick={handleSendLinkOnly} disabled={sendFormMutation.isPending}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer ${
                    (parentEmail || parentPhone) ? 'text-slate-600 hover:bg-slate-100 bg-white' : 'bg-teal-600 text-white hover:bg-teal-700'
                  }`} style={(parentEmail || parentPhone) ? { border: '1px solid #e2e8f0' } : { border: 'none' }}>
                  {sendFormMutation.isPending ? 'Creating...' : 'Just copy link'}
                </button>
                <button onClick={() => setShowSendForm(false)} className="px-3 py-2 text-sm text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer">Cancel</button>
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
                    <div key={entry.id} style={{ padding: '8px 12px', background: '#f8fafc', borderRadius: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                        <span className="text-xs font-medium text-slate-400">
                          {new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                        </span>
                        {entry.fear_thermometer != null && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${entry.fear_thermometer >= 7 ? 'bg-red-100 text-red-700' : entry.fear_thermometer >= 4 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'}`}>
                            FT {entry.fear_thermometer}
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
                className={`text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer ${
                  (monitoringForm.entries_count ?? 0) >= 5
                    ? 'bg-teal-600 text-white hover:bg-teal-700 border-none'
                    : 'text-slate-600 hover:bg-slate-50 bg-white'
                }`} style={(monitoringForm.entries_count ?? 0) < 5 ? { border: '1px solid #e2e8f0' } : undefined}>
                View monitoring report
              </button>
            </div>
          )}

          {/* Resend form — always available */}
          <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
            {!showSendForm ? (
              <button onClick={() => { setShowSendForm(true); if (patient?.parent_email) setParentEmail(patient.parent_email); if (patient?.parent_name) setParentName(patient.parent_name); if (patient?.parent_phone) setParentPhone(patient.parent_phone) }}
                className="text-xs text-teal-600 font-medium hover:underline bg-transparent border-none cursor-pointer">
                Resend Monitoring form
              </button>
            ) : (
              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '14px' }}>
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
                      className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-teal-700 transition-colors disabled:opacity-50 border-none cursor-pointer">
                      {sendFormMutation.isPending ? 'Sending...' :
                        parentEmail && parentPhone ? 'Send both + copy link' :
                        parentEmail ? 'Send email + copy link' : 'Send SMS + copy link'}
                    </button>
                  )}
                  <button onClick={handleSendLinkOnly} disabled={sendFormMutation.isPending}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer ${
                      (parentEmail || parentPhone) ? 'text-slate-600 hover:bg-slate-100 bg-white' : 'bg-teal-600 text-white hover:bg-teal-700'
                    }`} style={(parentEmail || parentPhone) ? { border: '1px solid #e2e8f0' } : { border: 'none' }}>
                    {sendFormMutation.isPending ? 'Creating...' : 'Just copy link'}
                  </button>
                  <button onClick={() => setShowSendForm(false)} className="px-3 py-2 text-sm text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer">Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )

  const teenAccessCard = (
    <div style={cardStyle}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Teen access</div>
      {patient && (patient.teen_invited_at ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
          <span className="text-xs text-slate-600">invited {new Date(patient.teen_invited_at).toLocaleDateString()}</span>
          {patient.teen_email && <span className="text-xs text-slate-500">{patient.teen_email}</span>}
          <button
            onClick={openTeenInviteForm}
            className="text-xs text-teal-600 font-medium hover:underline bg-transparent border-none cursor-pointer"
          >
            Resend invite
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
          <span className="text-xs text-slate-500">not set up</span>
          <button
            onClick={openTeenInviteForm}
            className="text-xs text-teal-600 font-medium hover:underline bg-transparent border-none cursor-pointer"
          >
            + Invite teen
          </button>
        </div>
      ))}
      {teenInviteConfirmation && (
        <div className="text-xs text-green-600" style={{ marginTop: '8px' }}>&#10003; Invitation sent to {teenInviteConfirmation}</div>
      )}
      {showTeenInviteForm && (
        <div style={{ marginTop: '10px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label className="text-xs font-medium text-slate-500">Teen's email:</label>
          <input
            type="email"
            value={teenEmailInput}
            onChange={e => setTeenEmailInput(e.target.value)}
            placeholder="teen@email.com"
            autoFocus
            className="text-xs border border-slate-200 rounded"
            style={{ padding: '6px 8px' }}
            onKeyDown={e => {
              if (e.key === 'Enter' && teenEmailInput.trim()) inviteTeenMut.mutate(teenEmailInput.trim())
              if (e.key === 'Escape') setShowTeenInviteForm(false)
            }}
          />
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              onClick={() => teenEmailInput.trim() && inviteTeenMut.mutate(teenEmailInput.trim())}
              disabled={!teenEmailInput.trim() || inviteTeenMut.isPending}
              className="bg-teal-600 text-white rounded text-xs font-medium border-none cursor-pointer disabled:opacity-40"
              style={{ padding: '6px 10px' }}
            >
              {inviteTeenMut.isPending ? 'Sending...' : 'Send invite'}
            </button>
            <button
              onClick={() => { setShowTeenInviteForm(false); setTeenEmailInput('') }}
              className="text-xs text-slate-400 hover:text-slate-600 bg-transparent border-none cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )

  const activateStepContent = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '720px' }}>
      {teenAccessCard}
      <div style={cardStyle}>
        <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '12px' }}>Activate treatment plan</div>
        {!plan ? (
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>Create and build the treatment plan first (Step 4).</p>
        ) : plan.status === 'active' ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#16a34a', background: '#f0fdf4', borderRadius: '8px', padding: '10px 14px' }}>
            <span>&#10003;</span> Treatment plan is active.
          </div>
        ) : (
          <>
            <p style={{ fontSize: '13px', color: '#64748b', lineHeight: '1.5', margin: '0 0 12px' }}>Activate the plan to make exposures available to the teen.</p>
            {showActivationWarning && activationWarnings.length > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
                <p style={{ fontSize: '12px', fontWeight: 600, color: '#78350f', margin: '0 0 6px' }}>&#9888; Before activating:</p>
                <ul style={{ margin: '0 0 0 18px', padding: 0, fontSize: '12px', color: '#78350f', lineHeight: '1.5' }}>
                  {activationWarnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}
            <button
              onClick={() => { if (activationWarnings.length > 0 && !showActivationWarning) { setShowActivationWarning(true) } else { activatePlanMut.mutate() } }}
              disabled={activatePlanMut.isPending}
              className="bg-teal-600 text-white rounded text-sm font-medium border-none cursor-pointer disabled:opacity-50"
              style={{ padding: '8px 16px' }}
            >
              {activatePlanMut.isPending ? 'Activating...' : (showActivationWarning && activationWarnings.length > 0 ? 'Activate anyway' : 'Activate plan')}
            </button>
          </>
        )}
        {planActivatedConfirm && (
          <div style={{ marginTop: '10px', fontSize: '12px', fontWeight: 600, color: 'var(--float-primary)' }}>&#10003; Plan activated.</div>
        )}
      </div>
    </div>
  )

  const treatmentPlanBuilder = (plan ? (
    <div style={{ ...cardStyle, padding: '0', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid var(--float-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <span className="text-sm font-semibold text-slate-700">Treatment plan</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${plan.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{plan.status}</span>
          <span style={{ fontSize: '12px', color: '#cbd5e1' }}>&middot;</span>
          {editingNickname ? (
            <>
              <input value={nicknameVal} onChange={e => setNicknameVal(e.target.value)} placeholder="Nickname"
                className="text-xs border border-slate-200 rounded" autoFocus
                style={{ padding: '3px 8px', width: '140px' }}
                onKeyDown={e => { if (e.key === 'Enter' && nicknameVal.trim()) nicknameMut.mutate(); if (e.key === 'Escape') setEditingNickname(false) }} />
              <button onClick={() => nicknameMut.mutate()} disabled={!nicknameVal.trim() || nicknameMut.isPending} className="text-[11px] text-teal-600 font-medium bg-transparent border-none cursor-pointer disabled:opacity-40">Save</button>
              <button onClick={() => setEditingNickname(false)} className="text-[11px] text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
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
        {plan.status === 'setup' && triggers && triggers.length > 0 && (
          <button
            onClick={() => {
              if (activationWarnings.length > 0) {
                setShowActivationWarning(true)
              } else {
                activatePlanMut.mutate()
              }
            }}
            disabled={activatePlanMut.isPending}
            className="text-xs px-2.5 py-1 bg-teal-600 text-white rounded-full disabled:opacity-50 border-none cursor-pointer"
          >
            {activatePlanMut.isPending ? '...' : 'Activate plan'}
          </button>
        )}
      </div>

      {/* Activation warning — only shown when Activate is clicked */}
      {plan.status === 'setup' && showActivationWarning && (
        <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '12px 20px' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: '#78350f', margin: '0 0 6px' }}>
            &#9888; Before activating:
          </p>
          <ul style={{ margin: '0 0 10px', padding: '0 0 0 18px', fontSize: '12px', color: '#78350f', lineHeight: '1.5' }}>
            {activationWarnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => activatePlanMut.mutate()}
              disabled={activatePlanMut.isPending}
              className="text-[11px] px-2.5 py-1 bg-amber-600 text-white rounded-full border-none cursor-pointer font-medium disabled:opacity-50"
            >
              {activatePlanMut.isPending ? 'Activating...' : 'Activate anyway'}
            </button>
            <button
              onClick={() => setShowActivationWarning(false)}
              className="text-[11px] px-2.5 py-1 bg-white text-amber-900 rounded-full cursor-pointer font-medium"
              style={{ border: '1px solid #fde68a' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Plan activated confirmation */}
      {planActivatedConfirm && (
        <div style={{ background: '#f0fdfa', borderBottom: '1px solid #99f6e4', padding: '8px 20px' }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: 'var(--float-primary)', margin: 0 }}>
            &#10003; Plan activated.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '45% 55%', borderTop: '1px solid var(--float-border)', marginTop: '0', minHeight: '320px' }}>
        {/* Situations list */}
        <div style={{ background: '#f8fafc', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Situations</span>
            {!showTriggerAdd && <button onClick={() => setShowTriggerAdd(true)} className="text-[10px] text-teal-600 font-bold bg-transparent border-none cursor-pointer">+</button>}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {triggers?.map(t => (
              <div key={t.id} className="group" style={{ width: '100%', textAlign: 'left', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', background: t.id === selectedTriggerId ? '#f0fdfa' : 'transparent', borderLeft: t.id === selectedTriggerId ? '2px solid var(--float-primary)' : '2px solid transparent', borderRadius: '6px', marginBottom: '8px' }}
                onClick={() => { if (editingTriggerId !== t.id && deletingTriggerId !== t.id) setSelectedTriggerId(t.id) }}>
                {deletingTriggerId === t.id ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }} onClick={e => e.stopPropagation()}>
                    <span style={{ fontSize: '11px', color: '#991b1b', lineHeight: '1.4' }}>Delete this situation and all its behaviors?</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => deleteTriggerMut.mutate(t.id)} disabled={deleteTriggerMut.isPending} className="text-[11px] text-white font-medium border-none cursor-pointer disabled:opacity-50" style={{ background: '#dc2626', padding: '3px 8px', borderRadius: '4px' }}>Yes</button>
                      <button onClick={() => setDeletingTriggerId(null)} className="text-[11px] text-slate-500 bg-transparent border-none cursor-pointer">Cancel</button>
                    </div>
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
                    <span style={{ fontSize: '5px', color: t.is_active ? 'var(--float-primary)' : '#cbd5e1' }}>●</span>
                    <span
                      className="text-slate-700"
                      style={{ flex: 1, fontSize: '13px', fontWeight: 500, color: '#1e293b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >{t.name}</span>
                    <DTBadge value={t.distress_thermometer_rating} />
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
              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', marginBottom: '8px' }}>
                <input
                  value={newTriggerName}
                  onChange={e => setNewTriggerName(e.target.value)}
                  placeholder="Situation name"
                  className="text-sm border border-slate-200 rounded"
                  style={{ width: '100%', height: '36px', padding: '6px 10px', marginBottom: '10px', boxSizing: 'border-box' }}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && newTriggerName.trim() && addTriggerMut.mutate()}
                />
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', color: '#475569', display: 'block', marginBottom: '4px' }}>Fear level (DT):</label>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <button type="button" onClick={() => setNewTriggerDT(String(Math.max(1, (Number(newTriggerDT) || 1) - 1)))} style={{ width: '28px', height: '32px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#475569' }}>−</button>
                    <input value={newTriggerDT} onChange={e => setNewTriggerDT(e.target.value)} type="number" min="1" max="10" className="text-sm border border-slate-200 rounded" style={{ width: '80px', padding: '6px 8px', textAlign: 'center', height: '32px', boxSizing: 'border-box' }} />
                    <button type="button" onClick={() => setNewTriggerDT(String(Math.min(10, (Number(newTriggerDT) || 0) + 1)))} style={{ width: '28px', height: '32px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#475569' }}>+</button>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
                  <button onClick={() => addTriggerMut.mutate()} disabled={!newTriggerName.trim()} className="bg-teal-600 text-white rounded text-xs font-medium disabled:opacity-40 border-none cursor-pointer" style={{ padding: '7px 14px' }}>Add situation</button>
                  <button onClick={() => { setShowTriggerAdd(false); setNewTriggerName(''); setNewTriggerDT('') }} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                </div>
              </div>
            )}
            {(!triggers || triggers.length === 0) && !showTriggerAdd && (
              <div>
                <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: '1.4', margin: '0 0 8px' }}>Add trigger situations identified in your sessions.</p>
                <button onClick={() => setShowTriggerAdd(true)} className="text-xs text-teal-600 font-medium bg-transparent border-none cursor-pointer">+ Add first situation</button>
              </div>
            )}
          </div>
        </div>
        {/* Right panel — behaviors */}
        <div style={{ overflow: 'hidden' }}>
          {selectedTrigger ? (
            <BehaviorPanel trigger={selectedTrigger} planId={plan.id} patientId={patientId!} planStatus={plan.status} />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontSize: '13px', color: '#94a3b8', padding: '16px' }}>Select a situation</div>
          )}
        </div>
      </div>
    </div>
  ) : (
    <div style={{ ...cardStyle, textAlign: 'center' }}>
      <p className="text-sm text-slate-500" style={{ marginBottom: '4px' }}>No treatment plan yet</p>
      <p className="text-xs text-slate-400" style={{ marginBottom: '12px' }}>Create one to start configuring trigger situations</p>
      <button onClick={() => createPlanMut.mutate()} disabled={createPlanMut.isPending} className="text-white text-sm font-medium disabled:opacity-50 border-none cursor-pointer" style={{ background: 'var(--float-primary)', padding: '8px 16px', borderRadius: '8px' }}>{createPlanMut.isPending ? 'Creating...' : 'Create treatment plan'}</button>
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
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#1e293b' }}>{recentExperiment.situation_name}</span>
                  <span style={{ fontSize: '13px', color: '#cbd5e1' }}>·</span>
                </>
              )}
              <span style={{ fontSize: '14px', color: '#475569' }}>{recentExperiment.behavior_name || 'Experiment'}</span>
            </div>
            {focusBipSequence.length > 0 || focusDtSequence.length > 0 ? (
              <>
                {focusBipSequence.length > 0 && (() => {
                  const t = trendArrow(focusBipSequence)
                  return (
                    <div style={{ fontSize: '13px', color: '#475569', marginBottom: '6px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#64748b', minWidth: '34px' }}>BIP:</span>
                      <span>{focusBipSequence.map(v => `${v}%`).join('  →  ')}</span>
                      {t.symbol && <span style={{ color: t.color, fontWeight: 700, fontSize: '15px' }}>{t.symbol}</span>}
                    </div>
                  )
                })()}
                {focusDtSequence.length > 0 && (() => {
                  const t = trendArrow(focusDtSequence)
                  return (
                    <div style={{ fontSize: '13px', color: '#475569', marginBottom: '14px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <span style={{ fontWeight: 700, color: '#64748b', minWidth: '34px' }}>DT:</span>
                      <span>{focusDtSequence.map(v => `${v}`).join('  →  ')}</span>
                      {t.symbol && <span style={{ color: t.color, fontWeight: 700, fontSize: '15px' }}>{t.symbol}</span>}
                    </div>
                  )
                })()}
              </>
            ) : (
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 14px' }}>No experiments recorded yet for this behavior</p>
            )}
            {focusNextUpcoming && (() => {
              const conf = confidenceMeta(focusNextUpcoming.confidence_level)
              const dateStr = focusNextUpcoming.scheduled_date
                ? new Date(focusNextUpcoming.scheduled_date.split('T')[0] + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
                : ''
              return (
                <div style={{ fontSize: '13px', color: '#475569', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <span style={{ fontWeight: 700, color: '#64748b' }}>Next experiment:</span>
                  <span>{dateStr}</span>
                  {conf.label && (
                    <>
                      <span style={{ color: '#cbd5e1' }}>·</span>
                      <span>{conf.emoji} {conf.label} confidence</span>
                    </>
                  )}
                  <span style={{ color: '#cbd5e1' }}>·</span>
                  <span>{EXPERIMENT_STATUS_LABEL[focusNextUpcoming.status] || focusNextUpcoming.status}</span>
                </div>
              )
            })()}
          </>
        ) : (
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>No experiments recorded yet for this behavior</p>
        )}
      </div>

      {/* Needs Attention */}
      {needsAttention && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
            <span style={{ fontSize: '14px' }}>⚠</span>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#78350f', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Needs attention</span>
          </div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {overdueItems.map(e => {
              const dateStr = e.scheduled_date
                ? new Date(e.scheduled_date.split('T')[0] + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
                : ''
              return (
                <li key={`overdue-${e.id}`} style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '13px', color: '#78350f' }}>
                  <span style={{ fontWeight: 700 }}>·</span>
                  <span><strong>Overdue:</strong> &ldquo;{e.behavior_name || e.plan_description || 'Experiment'}&rdquo; was scheduled {dateStr} — not yet recorded</span>
                  <button onClick={() => { setActivePersistentTab('messages'); setShowMsgForm(true) }} className="bg-amber-600 text-white rounded text-xs font-medium border-none cursor-pointer" style={{ padding: '4px 10px' }}>Remind teen</button>
                </li>
              )
            })}
            {lowConfidenceCount > 0 && (
              <li style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '13px', color: '#78350f' }}>
                <span style={{ fontWeight: 700 }}>·</span>
                <span><strong>Low confidence:</strong> {lowConfidenceCount} upcoming experiment{lowConfidenceCount === 1 ? '' : 's'} rated Medium or Low confidence</span>
              </li>
            )}
            {noActivityThisWeek && (
              <li style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '13px', color: '#78350f' }}>
                <span style={{ fontWeight: 700 }}>·</span>
                <span><strong>No experiments this week</strong></span>
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Progress charts — side by side (hidden when not enough data) */}
      {progressChartData.length >= 2 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <div style={cardStyle}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text)', margin: '0 0 12px' }}>Belief in Prediction</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={progressChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(value, name) => [`${value}%`, name === 'bip_before' ? 'Before' : 'After']} contentStyle={{ border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }} />
                <Legend formatter={(value) => value === 'bip_before' ? 'Before' : 'After'} wrapperStyle={{ fontSize: '12px' }} />
                <Line type="monotone" dataKey="bip_before" stroke="#5eead4" strokeWidth={2} dot={{ r: 3, fill: '#5eead4' }} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="bip_after" stroke="#0d9488" strokeWidth={2} dot={{ r: 3, fill: '#0d9488' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div style={cardStyle}>
            <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text)', margin: '0 0 12px' }}>Fear Level</h2>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={progressChartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 10]} tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value) => [value, 'DT']} contentStyle={{ border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: '12px' }} />
                <Line type="monotone" dataKey="dt_actual" stroke="#0d9488" strokeWidth={2} dot={{ r: 3, fill: '#0d9488' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Experiment timeline */}
      <div style={cardStyle}>
        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider" style={{ marginBottom: '12px' }}>Experiment timeline</div>
        {sortedWeeks.length === 0 ? (
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: 0 }}>No experiments recorded yet.</p>
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
                    <span style={{ width: '18px', height: '18px', borderRadius: '999px', background: '#dcfce7', color: '#16a34a', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 }}>&#10003;</span>
                  )}
                  {overdue && <span style={{ color: '#d97706', fontSize: '14px', flexShrink: 0 }}>⚠</span>}
                  {upcoming && <span style={{ color: '#94a3b8', fontSize: '14px', flexShrink: 0 }}>📅</span>}
                  <span style={{ fontWeight: 600, color: overdue ? '#92400e' : '#1e293b', flexShrink: 0 }}>{dateStr}</span>
                  <span style={{ color: '#cbd5e1' }}>·</span>
                  <span
                    title={behaviorLabel}
                    style={{
                      fontSize: '13px',
                      color: overdue ? '#92400e' : '#475569',
                      minWidth: '200px',
                      maxWidth: '300px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >{behaviorLabel}</span>
                  {completed && bipBefore != null && bipAfter != null && (
                    <>
                      <span style={{ color: '#cbd5e1' }}>·</span>
                      <span style={{ color: '#475569' }}>BIP {bipBefore}%&rarr;{bipAfter}%</span>
                    </>
                  )}
                  {completed && dtActual != null && (
                    <>
                      <span style={{ color: '#cbd5e1' }}>·</span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#475569' }}>DT <DTBadge value={dtActual} /></span>
                    </>
                  )}
                  {completed && e.feared_outcome_occurred != null && (
                    <>
                      <span style={{ color: '#cbd5e1' }}>·</span>
                      <span style={{ color: e.feared_outcome_occurred ? '#b91c1c' : '#16a34a', fontWeight: 600 }}>
                        {e.feared_outcome_occurred ? '✗ Yes' : '✓ No'}
                      </span>
                    </>
                  )}
                  {overdue && (
                    <>
                      <span style={{ color: '#cbd5e1' }}>·</span>
                      <span style={{ color: '#92400e', fontWeight: 600 }}>not recorded</span>
                    </>
                  )}
                  {upcoming && conf.label && (
                    <>
                      <span style={{ color: '#cbd5e1' }}>·</span>
                      <span style={{ color: '#475569' }}>{conf.emoji} {conf.label} confidence</span>
                    </>
                  )}
                </div>
                {canExpand && expanded && (
                  <div style={{ margin: '4px 0 4px 30px', padding: '8px 12px', background: '#f1f5f9', borderRadius: '6px', fontSize: '12px', color: '#475569', lineHeight: '1.5' }}>
                    <span style={{ color: '#94a3b8', fontWeight: 600 }}>What they learned: </span>{e.what_learned}
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
    </div>
  )

  const messagesContent = (
    <div id="messages-section" style={cardStyle}>
      <div style={{ marginBottom: '12px' }}>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Messages</span>
      </div>
      <div style={{ maxHeight: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', marginBottom: '0' }}>
        {(!messages || messages.length === 0) && (
          <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5', margin: 0 }}>
            Send check-ins, encouragement, or plan adjustments to the patient between sessions.
          </p>
        )}
        {messages && messages.map((m, i) => {
          const prev = i > 0 ? messages[i - 1] : null
          const sameSender = prev && prev.sender_user_id === m.sender_user_id
          const marginTop = i === 0 ? 0 : (sameSender ? 4 : 8)
          const ts = formatMsgTime(m.created_at)

          if (m.message_type === 'experiment_completed') {
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop }}>
                <div style={{ maxWidth: '70%', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#15803d', marginBottom: '4px' }}>✓ Experiment completed</div>
                  <p className="text-xs text-slate-700" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</p>
                </div>
                {ts && <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{ts}</span>}
              </div>
            )
          }
          if (m.message_type === 'too_hard') {
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop }}>
                <div style={{ maxWidth: '70%', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#b45309', marginBottom: '4px' }}>⚠ Too hard</div>
                  <p className="text-xs text-slate-700" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</p>
                </div>
                {ts && <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{ts}</span>}
              </div>
            )
          }
          if (patient && m.sender_user_id === patient.user_id) {
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginTop }}>
                <div style={{ maxWidth: '70%', background: '#f0fdfa', border: '1px solid #ccfbf1', borderRadius: '12px 12px 4px 12px', padding: '10px 14px' }}>
                  <p className="text-xs text-slate-700" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</p>
                </div>
                {ts && <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{ts}</span>}
              </div>
            )
          }
          const showTypePill = m.message_type && m.message_type !== 'general'
          return (
            <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop }}>
              {showTypePill && (
                <span style={{ display: 'inline-block', fontSize: '11px', color: '#0d9488', border: '1px solid #5eead4', background: 'transparent', padding: '2px 8px', borderRadius: '999px', marginBottom: '4px', textTransform: 'capitalize' }}>
                  {m.message_type.replace(/_/g, ' ')}
                </span>
              )}
              <div style={{ maxWidth: '70%', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '12px 12px 12px 4px', padding: '10px 14px' }}>
                <p className="text-xs text-slate-700" style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</p>
              </div>
              {ts && <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{ts}</span>}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', padding: '12px 16px', margin: '12px -20px -20px' }}>
        <input value={msgContent} onChange={e => setMsgContent(e.target.value)} placeholder="Reply..." className="text-xs border border-slate-200 rounded" style={{ flex: 1, padding: '6px 8px', background: '#fff' }} onKeyDown={e => e.key === 'Enter' && msgContent.trim() && sendMsgMut.mutate()} />
        <button onClick={() => sendMsgMut.mutate()} disabled={!msgContent.trim()} className="bg-teal-600 text-white rounded text-xs font-medium border-none cursor-pointer disabled:opacity-40" style={{ padding: '6px 12px' }}>Send</button>
      </div>
    </div>
  )

  const actionPlansContent = (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="text-sm font-semibold text-slate-700">Action plans</span>
          {actionPlans && actionPlans.length > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{actionPlans.length}</span>}
        </div>
        {!showPlanEditor && <button onClick={() => { resetPlanEditor(); editor?.commands.setContent(ACTION_PLAN_TEMPLATE); setPlanDate(new Date().toISOString().split('T')[0]); setPlanNickname(plan?.nickname || ''); setPlanNextAppt(''); setShowPlanEditor(true) }} className="text-xs text-teal-600 font-medium bg-transparent border-none cursor-pointer">+ New plan</button>}
      </div>
      {showPlanEditor && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
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
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Add a nickname in the treatment plan to pre-populate this field.</span>
              </div>
            )}
          </div>
          <div style={{ border: '1px solid var(--float-border)', borderRadius: '6px', overflow: 'hidden', background: '#fff' }}>
            <EditorContent editor={editor} />
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={handleSavePlan} disabled={createPlanActionMut.isPending || updatePlanActionMut.isPending} className="bg-teal-600 text-white rounded text-xs font-medium border-none cursor-pointer disabled:opacity-50" style={{ padding: '6px 12px' }}>
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
            <div key={ap.id} style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flexWrap: 'wrap' }}>
                  <span className="font-medium text-slate-700">#{ap.session_number}</span>
                  <span className="text-slate-400">{new Date(ap.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  {ap.nickname && <span style={{ fontStyle: 'italic', color: 'var(--float-primary)' }}>"{ap.nickname}"</span>}
                  <span className={`px-1.5 py-0.5 rounded font-medium ${ap.visible_to_patient ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{ap.visible_to_patient ? 'Published' : 'Draft'}</span>
                </div>
              </div>
              {ap.content && (
                <div className="prose prose-sm max-w-none" style={{ fontSize: '12px', color: '#475569', marginBottom: '10px' }} dangerouslySetInnerHTML={{ __html: ap.content }} />
              )}
              {deletingPlanId === ap.id ? (
                <div style={{ background: '#fef2f2', borderRadius: '6px', padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: '#991b1b' }}>Delete this plan?</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => deletePlanMut.mutate(ap.id)} disabled={deletePlanMut.isPending} className="text-[11px] text-white font-medium border-none cursor-pointer disabled:opacity-50" style={{ background: '#dc2626', padding: '4px 10px', borderRadius: '4px' }}>Yes, delete</button>
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
        <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5', margin: 0 }}>
          Action plans are session summaries written directly to the patient. After each session, write what they'll work on and publish it to their app.
        </p>
      )}
    </div>
  )

  const preSessionBriefContent = (() => {
    const sortedExps = [...(patientExperiments ?? [])]
    const lastPlanned = sortedExps
      .filter(e => e.confidence_level)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
    const lastCompleted = sortedExps
      .filter(e => e.status === 'completed')
      .sort((a, b) => {
        const ad = a.completed_date ? new Date(a.completed_date).getTime() : 0
        const bd = b.completed_date ? new Date(b.completed_date).getTime() : 0
        return bd - ad
      })[0]
    const publishedPlans = (actionPlans ?? []).filter(ap => ap.visible_to_patient)
    const lastPublishedPlan = publishedPlans.length > 0
      ? [...publishedPlans].sort((a, b) => new Date(b.session_date).getTime() - new Date(a.session_date).getTime())[0]
      : null
    const lastConf = confidenceMeta(lastPlanned?.confidence_level)
    const unreadExperimentCount = (messages ?? []).filter(m => m.message_type === 'experiment_completed' && !m.read_at).length
    const bipBefore = lastCompleted?.bip_before != null ? Math.round(Number(lastCompleted.bip_before)) : null
    const bipAfter = lastCompleted?.bip_after != null ? Math.round(Number(lastCompleted.bip_after)) : null
    const dtActual = lastCompleted?.distress_thermometer_actual != null
      ? Number(lastCompleted.distress_thermometer_actual)
      : null
    const fearedOccurred = lastCompleted?.feared_outcome_occurred

    return (
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Pre-session brief</span>
        </div>
        {plan?.nickname && (
          <div style={{ background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: '#0f766e' }}>
              Working with: <span style={{ fontWeight: 600, fontStyle: 'italic' }}>&ldquo;{plan.nickname}&rdquo;</span> &#x1F41B;
            </span>
          </div>
        )}
        {unreadExperimentCount > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <a
              href="#messages-section"
              onClick={(e) => { e.preventDefault(); setActivePersistentTab('messages'); setTimeout(() => document.getElementById('messages-section')?.scrollIntoView({ behavior: 'smooth' }), 100) }}
              style={{ fontSize: '13px', color: '#0f766e', fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}
            >
              ✓ {unreadExperimentCount} experiment{unreadExperimentCount === 1 ? '' : 's'} recorded since last session
            </a>
          </div>
        )}

        {/* Last action plan */}
        <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Last action plan:</span>
          {lastPublishedPlan ? (
            <>
              <span style={{ fontSize: '12px', color: '#1e293b' }}>
                #{lastPublishedPlan.session_number}
                {lastPublishedPlan.nickname ? ` · “${lastPublishedPlan.nickname}”` : ''}
                {' · '}
                {new Date(lastPublishedPlan.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <button
                onClick={() => openEditPlan(lastPublishedPlan)}
                className="text-xs font-medium bg-transparent border-none cursor-pointer"
                style={{ color: 'var(--float-primary)' }}
              >View</button>
            </>
          ) : (
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>No action plan from last session.</span>
          )}
        </div>

        {/* Last experiment confidence */}
        <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Last experiment confidence:</span>
          {lastPlanned ? (
            <span style={{ fontSize: '12px', color: '#1e293b' }}>
              {lastConf.emoji} {lastConf.label}
              <span style={{ color: '#94a3b8' }}>
                {' · set '}
                {new Date(lastPlanned.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </span>
          ) : (
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>No planned experiments yet.</span>
          )}
        </div>

        {/* Last experiment results */}
        {lastCompleted && (
          <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>
              Last experiment: <span style={{ color: '#1e293b' }}>{lastCompleted.behavior_name || lastCompleted.plan_description || 'Experiment'}</span>
            </div>
            <div style={{ fontSize: '12px', color: '#475569', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {bipBefore != null && bipAfter != null && (
                <span><strong>BIP before:</strong> {bipBefore}% &rarr; <strong>after:</strong> {bipAfter}%</span>
              )}
              {dtActual != null && (
                <>
                  <span style={{ color: '#94a3b8' }}>&middot;</span>
                  <span><strong>DT:</strong> {dtActual}/10</span>
                </>
              )}
              {fearedOccurred != null && (
                <>
                  <span style={{ color: '#94a3b8' }}>&middot;</span>
                  <span><strong>Feared outcome:</strong> {fearedOccurred ? 'Yes' : 'No'}</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    )
  })()

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9' }}>
      <PractitionerNav activePage="patients" subHeader={{
        backTo: '/dashboard', backLabel: 'Back to patients',
        title: patient?.name ?? 'Loading...',
        subtitle: [
          patient?.age ? `Age ${patient.age}` : null,
          patient?.gender || null,
          patient?.phone_number || null,
          activitySummary
        ].filter(Boolean).join(' \u00B7 '),
        subtitleExtra: (patient?.anxiety_presentations && patient.anxiety_presentations.length > 0) ? (
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }}>
            {patient.anxiety_presentations.map(p => (
              <span key={p} style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '999px', background: '#ccfbf1', color: '#0f766e' }}>
                {presentationLabel(p)}
              </span>
            ))}
          </span>
        ) : undefined,
        rightAction: patient && !editingProfile ? (
          <button
            onClick={openProfileEdit}
            className="text-xs font-medium bg-transparent border-none cursor-pointer hover:underline"
            style={{ color: 'var(--float-primary)' }}
          >
            Edit profile
          </button>
        ) : undefined
      }} />

      <div style={{ padding: '24px' }}>

        {/* Profile edit form (inline) */}
        {editingProfile && patient && (
          <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', padding: '20px', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Edit patient profile</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Name</label>
                <input
                  value={profileName}
                  onChange={e => setProfileName(e.target.value)}
                  className="text-sm border border-slate-200 rounded"
                  style={{ width: '100%', padding: '6px 10px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Age</label>
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
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Gender</label>
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
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Phone number</label>
                <input
                  value={profilePhone}
                  onChange={e => setProfilePhone(e.target.value)}
                  type="tel"
                  className="text-sm border border-slate-200 rounded"
                  style={{ width: '100%', padding: '6px 10px', boxSizing: 'border-box' }}
                />
              </div>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '4px' }}>Email (read-only)</label>
                <div style={{ fontSize: '13px', color: '#475569', padding: '6px 10px', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '6px' }}>{patient.email}</div>
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: '8px' }}>Anxiety presentation</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {ANXIETY_PRESENTATIONS.map(p => {
                  const selected = profilePresentations.includes(p.value)
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => toggleProfilePresentation(p.value)}
                      style={{
                        fontSize: '13px',
                        fontWeight: 500,
                        padding: '7px 14px',
                        borderRadius: '999px',
                        cursor: 'pointer',
                        background: selected ? 'var(--float-primary)' : '#fff',
                        color: selected ? '#fff' : '#475569',
                        border: selected ? '1px solid var(--float-primary)' : '1px solid #cbd5e1',
                      }}
                    >{p.label}</button>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={() => updatePatientMut.mutate()}
                disabled={!profileName.trim() || updatePatientMut.isPending}
                className="bg-teal-600 text-white rounded text-xs font-medium border-none cursor-pointer disabled:opacity-40"
                style={{ padding: '7px 14px' }}
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
                <span style={{ fontSize: '12px', color: '#b91c1c' }}>Save failed. Try again.</span>
              )}
            </div>
          </div>
        )}

        {/* Treatment Journey layout */}
        <div style={{ display: 'flex', minHeight: 'calc(100vh - 120px)' }}>
          {/* Sidebar */}
          <div style={{ width: '220px', flexShrink: 0, background: '#ffffff', borderRight: '1px solid #e2e8f0', padding: '16px 0' }}>
            <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--float-primary)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '0 16px', marginBottom: '8px' }}>Treatment Journey</div>
            {STEP_LABELS.map((label, i) => {
              const selected = activePersistentTab === null && activeStep === i
              const status = stepStatus[i]
              return (
                <div
                  key={i}
                  onClick={() => { setActiveStep(i); setActivePersistentTab(null) }}
                  style={{
                    padding: '8px 16px',
                    borderLeft: selected ? '3px solid #0d9488' : '3px solid transparent',
                    background: selected ? '#f0fdfa' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <StepStatusIcon status={status} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '10px', color: '#94a3b8' }}>Step {i + 1}</div>
                      <div style={{ fontSize: '13px', fontWeight: status === 'incomplete' ? 400 : 500, color: status === 'incomplete' ? '#94a3b8' : '#1e293b' }}>{label}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Right content */}
          <div style={{ flex: 1, minWidth: 0, paddingLeft: '24px' }}>
            {/* Persistent mini-tab bar */}
            <div style={{ display: 'inline-flex', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '4px 8px', marginBottom: '16px' }}>
              <MiniTabButton id="experiments" label="Experiments" active={activePersistentTab === 'experiments'} onClick={setActivePersistentTab} />
              <MiniTabButton id="messages" label="Messages" active={activePersistentTab === 'messages'} onClick={setActivePersistentTab} badge={unreadMessageCount} />
              <MiniTabButton id="plans" label="Action Plans" active={activePersistentTab === 'plans'} onClick={setActivePersistentTab} badge={draftPlanCount} />
            </div>

            {/* Persistent tab content overrides step content */}
            {activePersistentTab === 'experiments' && experimentsContent}
            {activePersistentTab === 'messages' && messagesContent}
            {activePersistentTab === 'plans' && actionPlansContent}

            {/* Step content */}
            {activePersistentTab === null && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {activeStep === 0 && (
                  showInlineReport ? (
                    <InlineMonitoringReport patientId={patientId!} onClose={() => setShowInlineReport(false)} />
                  ) : (
                    <>
                      {renderGuide(1)}
                      {monitoringCard}
                    </>
                  )
                )}
                {activeStep === 1 && (
                  <>
                    {renderGuide(2)}
                    {monitoringExtractContent}
                    {preliminaryReportContent}
                  </>
                )}
                {activeStep === 2 && patientId && (
                  <StepWithChecklist patientId={patientId} stepNumber={3} title="PARENT CONSULTATION CHECKLIST" groups={PARENT_CHECKLIST} onNavigate={handleChecklistNav}>
                    {renderPrep('session_1')}
                    <AutoSaveSessionNote patientId={patientId} sessionType="consultation_1" placeholder="Capture your observations from this session..." />
                  </StepWithChecklist>
                )}
                {activeStep === 3 && patientId && (
                  <StepWithChecklist patientId={patientId} stepNumber={4} title="PATIENT CONSULTATION CHECKLIST" groups={PATIENT_CHECKLIST} onNavigate={handleChecklistNav}>
                    {renderPrep('session_2')}
                    <AutoSaveSessionNote patientId={patientId} sessionType="consultation_2" placeholder="Capture your observations from this session..." />
                    <div id="patient-da-section">{patientDAContent}</div>
                    <CaseConceptualization draft={conceptualizationDraft} saveStatus={formulationSaveStatus} />
                  </StepWithChecklist>
                )}
                {activeStep === 4 && (
                  <>
                    {renderGuide(5)}
                    {treatmentPlanBuilder}
                  </>
                )}
                {activeStep === 5 && (
                  <>
                    {renderGuide(6)}
                    {activateStepContent}
                  </>
                )}
                {activeStep === 6 && (
                  <>
                    {renderGuide(7)}
                    {renderPrep('session_3')}
                    {experimentsContent}
                  </>
                )}
                {activeStep === 7 && (
                  <>
                    {renderGuide(8)}
                    {preSessionBriefContent}
                    {renderPrep('weekly')}
                    {renderNotesSection('weekly_session', '+ Add weekly note')}
                    {actionPlansContent}
                  </>
                )}
                {activeStep === 8 && (
                  <>
                    {renderGuide(9)}
                    {accommodationContent}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* AI extraction modal */}
      {extractOpen && (
        <div
          onClick={extractApplying ? undefined : closeExtract}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '12px', width: '100%', maxWidth: '560px', maxHeight: '85vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.3)' }}
          >
            {extractLoading && (
              <div style={{ padding: '48px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
                <div className="animate-spin" style={{ width: '28px', height: '28px', border: '3px solid #e2e8f0', borderTopColor: 'var(--float-primary)', borderRadius: '50%' }} />
                <p style={{ fontSize: '14px', color: '#475569', margin: 0 }}>Analyzing monitoring data...</p>
              </div>
            )}

            {!extractLoading && extractError && !extraction && (
              <div style={{ padding: '24px' }}>
                <p style={{ fontSize: '14px', color: '#dc2626', margin: '0 0 16px' }}>{extractError}</p>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={handleExtract} className="bg-teal-600 text-white rounded text-sm font-medium border-none cursor-pointer" style={{ padding: '8px 16px' }}>Retry</button>
                  <button onClick={closeExtract} className="text-sm text-slate-500 bg-transparent border-none cursor-pointer" style={{ padding: '8px 12px' }}>Close</button>
                </div>
              </div>
            )}

            {!extractLoading && extraction && (
              <div style={{ padding: '24px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#0d9488', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Extraction Results</div>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 18px' }}>Based on {monitoringForm?.entries_count ?? 0} monitoring entries</p>

                <div style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '10px' }}>Suggested trigger situations</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                    <thead>
                      <tr style={{ background: '#f1f5f9' }}>
                        <th style={{ width: '38%', textAlign: 'left', padding: '8px 10px', fontSize: '10px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Situation</th>
                        <th style={{ textAlign: 'left', padding: '8px 10px', fontSize: '10px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avoidance and safety behaviors</th>
                        <th style={{ width: '44px', textAlign: 'right', padding: '8px 10px', fontSize: '10px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.05em' }}>DT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extraction.situations.map((sit, i) => (
                        sit.behaviors.length > 0 ? sit.behaviors.map((b, j) => {
                          const pill = b.type === 'avoidance'
                            ? { bg: '#fee2e2', color: '#b91c1c' }
                            : b.type === 'safety'
                              ? { bg: '#fef3c7', color: '#b45309' }
                              : { bg: '#f1f5f9', color: '#475569' }
                          return (
                            <tr key={`${i}-${j}`} style={{ borderTop: j === 0 ? '1px solid #e2e8f0' : 'none' }}>
                              {j === 0 && (
                                <td rowSpan={sit.behaviors.length} style={{ verticalAlign: 'top', padding: '8px 10px', fontSize: '12px', fontWeight: 500, color: '#1e293b', borderRight: '1px solid #e2e8f0', wordBreak: 'break-word' }}>
                                  {sit.name}
                                </td>
                              )}
                              <td style={{ padding: '6px 10px', fontSize: '12px', color: '#475569', wordBreak: 'break-word' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                  <span>{b.name}</span>
                                  <span style={{ display: 'inline-block', fontSize: '10px', fontWeight: 600, padding: '1px 7px', borderRadius: '9999px', background: pill.bg, color: pill.color }}>{b.type}</span>
                                </span>
                              </td>
                              <td style={{ padding: '6px 10px', fontSize: '12px', fontWeight: 600, color: '#334155', textAlign: 'right' }}>
                                {b.dt != null ? b.dt : '—'}
                              </td>
                            </tr>
                          )
                        }) : (
                          <tr key={i} style={{ borderTop: '1px solid #e2e8f0' }}>
                            <td style={{ verticalAlign: 'top', padding: '8px 10px', fontSize: '12px', fontWeight: 500, color: '#1e293b', borderRight: '1px solid #e2e8f0', wordBreak: 'break-word' }}>{sit.name}</td>
                            <td style={{ padding: '6px 10px', fontSize: '12px', color: '#94a3b8' }}>No behaviors</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right' }} />
                          </tr>
                        )
                      ))}
                    </tbody>
                  </table>
                </div>

                {extraction.accommodation_patterns?.length > 0 && (
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>Accommodation patterns observed</div>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {extraction.accommodation_patterns.map((p, i) => (
                        <li key={i} style={{ fontSize: '12px', color: '#475569', display: 'flex', gap: '6px' }}>
                          <span style={{ color: '#0d9488' }}>·</span><span>{p}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {extractApplying && extractProgress && (
                  <p style={{ fontSize: '12px', color: 'var(--float-primary)', margin: '0 0 12px' }}>{extractProgress}</p>
                )}

                {extractError && (
                  <p style={{ fontSize: '12px', color: '#dc2626', margin: '0 0 12px' }}>{extractError}</p>
                )}

                {extractFailed.length > 0 && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 600, color: '#991b1b', margin: '0 0 6px' }}>Some items could not be created:</p>
                    <ul style={{ margin: 0, padding: '0 0 0 16px' }}>
                      {extractFailed.map((f, i) => <li key={i} style={{ fontSize: '12px', color: '#b91c1c' }}>{f}</li>)}
                    </ul>
                  </div>
                )}

                {extractPreview ? (
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#1e293b', marginBottom: '8px' }}>Ready to add:</div>
                    <ul style={{ listStyle: 'none', margin: '0 0 14px', padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {extractPreview.map((p, i) => (
                        <li key={i} style={{ fontSize: '13px', color: p.isNew ? '#16a34a' : '#94a3b8', display: 'flex', gap: '6px' }}>
                          <span>{p.isNew ? '✓' : '✗'}</span>
                          <span>{p.name} {p.isNew ? '(new)' : '(already exists — skipping)'}</span>
                        </li>
                      ))}
                    </ul>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      <button onClick={handleAddToPlan} disabled={extractApplying}
                        className="bg-teal-600 text-white rounded text-sm font-medium border-none cursor-pointer disabled:opacity-50" style={{ padding: '9px 18px' }}>
                        {extractApplying ? 'Adding…' : 'Confirm'}
                      </button>
                      <button onClick={() => setExtractPreview(null)} disabled={extractApplying}
                        className="text-sm text-slate-500 bg-transparent border-none cursor-pointer disabled:opacity-50" style={{ padding: '9px 12px' }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <button onClick={handleShowPreview} disabled={extractApplying}
                      className="bg-teal-600 text-white rounded text-sm font-medium border-none cursor-pointer disabled:opacity-50" style={{ padding: '9px 18px' }}>
                      {extractApplying ? 'Adding…' : extractFailed.length > 0 ? 'Retry' : 'Add situations to treatment plan'}
                    </button>
                    <button onClick={closeExtract} disabled={extractApplying}
                      className="text-sm text-slate-500 bg-transparent border-none cursor-pointer disabled:opacity-50" style={{ padding: '9px 12px' }}>Dismiss</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
