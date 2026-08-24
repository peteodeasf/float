import { useState, useEffect, useCallback, useRef, useMemo, type CSSProperties } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getPatient, getMessages, sendMessage, getParentMessages, sendParentMessage, getPatientProgress, updatePatient } from '../../api/patients'
import {
  LineChart, Line, XAxis, YAxis,
  Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import {
  getTreatmentPlan, getTriggers, createTreatmentPlan, createTrigger,
  updatePlanNickname, getBehaviors, getLadder, getLadderFlags, reviewLadder,
  createBehavior, updateBehavior, deleteBehavior, updateTrigger, deleteTrigger,
  getSituationDownwardArrow, createSituationDownwardArrow, updateDownwardArrow, listPatientDownwardArrows,
  getPatientExperiments, planExperimentForBehavior,
  getActiveTags, getSituationTags, setSituationTags,
  searchSituationLibrary, searchBehaviorLibrary,
  type TriggerSituation, type AvoidanceBehavior, type DownwardArrow, type ArrowStep
} from '../../api/treatment'
import { getMonitoringForm, sendMonitoringForm, extractMonitoringData, getMonitoringReport, generatePreliminaryReport, type MonitoringExtraction, type PreliminaryReport, type ExtractedBehaviorType, type ExtractedSituation, type ExtractedBehavior } from '../../api/monitoring'
import { getSessionNotes, createSessionNote, updateSessionNote, deleteSessionNote, type SessionNote, type SessionParticipant } from '../../api/session_notes'
import { getChecklist, updateChecklist, type ChecklistItems } from '../../api/checklist'
import { PROCESS_CHECKLIST, type ChecklistItemDef, type ChecklistNav } from '../../lib/checklists'
import { getChecklistItems } from '../../api/checklist'
import { getActionPlans, createActionPlan, updateActionPlan, publishActionPlan, deleteActionPlan, type ActionPlan } from '../../api/action_plans'
import { fetchFormulation, createFormulation, updateFormulation } from '../../api/formulation'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import PractitionerNav from '../../components/ui/PractitionerNav'
import ParentPlanPanel from '../../components/practitioner/ParentPlanPanel'
import TeenAccessPanel from '../../components/practitioner/TeenAccessPanel'

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
export function BehaviorPanel({ trigger, planId, patientId, planStatus }: {
  trigger: TriggerSituation; planId: string; patientId: string; planStatus: string
}) {
  const qc = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('avoidance')
  const [dt, setDt] = useState('')
  const [behaviorLibraryId, setBehaviorLibraryId] = useState<string | null>(null)
  const [showBehSuggest, setShowBehSuggest] = useState(false)
  // Sub-behaviors (#7): a smaller, lower-scored step under a parent behavior.
  const [subParentId, setSubParentId] = useState<string | null>(null)
  const [subName, setSubName] = useState('')
  const [subDt, setSubDt] = useState('')
  const [reviewMsg, setReviewMsg] = useState<string | null>(null)
  const [editingBehaviorId, setEditingBehaviorId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editType, setEditType] = useState('avoidance')
  const [editDT, setEditDT] = useState('')
  const [deletingBehaviorId, setDeletingBehaviorId] = useState<string | null>(null)
  const [delError, setDelError] = useState<string | null>(null)

  // Experiment planning
  const [planningBehaviorId, setPlanningBehaviorId] = useState<string | null>(null)
  const [expConfidence, setExpConfidence] = useState<string>('high')
  const [expPlan, setExpPlan] = useState('')
  const [expDate, setExpDate] = useState(getNextSchoolDayISO())
  const [expWarning, setExpWarning] = useState(false)
  const [expSavedFor, setExpSavedFor] = useState<{ behaviorId: string; date: string } | null>(null)
  // Which rung the single top-of-ladder "Plan an experiment" control targets.
  const [selectedRungId, setSelectedRungId] = useState<string | null>(null)

  const planActive = planStatus === 'active'

  const { data: behaviors } = useQuery({
    queryKey: ['behaviors', trigger.id],
    queryFn: () => getBehaviors(trigger.id),
  })

  const { data: patientExps } = useQuery({
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

  // Content tags: which JIT tips are relevant to this situation.
  const { data: allTags } = useQuery({ queryKey: ['content-tags'], queryFn: getActiveTags })
  // The feared outcome the downward arrow landed on for this situation. Same query key the arrow
  // mode uses, so finishing a chain there refreshes it here.
  const { data: situationArrow } = useQuery({
    queryKey: ['situation-da', trigger.id],
    queryFn: () => getSituationDownwardArrow(trigger.id),
  })
  const { data: situationTagIds } = useQuery({
    queryKey: ['situation-tags', trigger.id],
    queryFn: () => getSituationTags(trigger.id),
  })
  const setTagsMut = useMutation({
    mutationFn: (ids: string[]) => setSituationTags(trigger.id, ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['situation-tags', trigger.id] }),
  })
  const toggleSituationTag = (tagId: string) => {
    const current = situationTagIds ?? []
    const next = current.includes(tagId)
      ? current.filter(x => x !== tagId)
      : [...current, tagId]
    setTagsMut.mutate(next)
  }

  // Behavior library suggestions (select-from-list; typing a new name still creates one)
  const { data: behSuggestions } = useQuery({
    queryKey: ['behavior-library', name.trim()],
    queryFn: () => searchBehaviorLibrary(name.trim()),
    enabled: showAdd && showBehSuggest && name.trim().length >= 2,
  })

  const addMut = useMutation({
    // Avoidance is defined by the situation it avoids, so the name is optional —
    // default it to "Avoids {situation}" when left blank.
    mutationFn: () => createBehavior(trigger.id, { name: name.trim() || `Avoids ${trigger.name}`, behavior_type: type, distress_thermometer_when_refraining: clampDt(dt), behavior_library_id: behaviorLibraryId ?? undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] }); setName(''); setDt(''); setBehaviorLibraryId(null); setShowBehSuggest(false); setShowAdd(false) }
  })

  const resetSub = () => { setSubParentId(null); setSubName(''); setSubDt('') }
  const subMut = useMutation({
    mutationFn: (parent: AvoidanceBehavior) => createBehavior(trigger.id, {
      name: subName.trim(),
      behavior_type: parent.behavior_type,
      distress_thermometer_when_refraining: clampDt(subDt),
      parent_behavior_id: parent.id,
      behavior_library_id: undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] }); resetSub() },
  })

  const editMut = useMutation({
    mutationFn: () => updateBehavior(trigger.id, editingBehaviorId!, { name: editName, behavior_type: editType, distress_thermometer_when_refraining: clampDt(editDT) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] }); setEditingBehaviorId(null) }
  })

  const delMut = useMutation({
    mutationFn: (id: string) => deleteBehavior(trigger.id, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] }); setDeletingBehaviorId(null); setDelError(null) },
    onError: () => setDelError('Could not delete that behavior. Try again.')
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

  // A situation can't be activated until it has at least one behavior — the
  // teen ladder has nothing to show for an empty situation.
  const hasBehaviors = (behaviors?.length ?? 0) > 0
  const canToggleActive = trigger.is_active || hasBehaviors

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

  // Ladder derivations: which rungs have an experiment (scheduled vs any), and the
  // default rung for the top "Plan an experiment" control (lowest rung without one).
  const topRungs = sortedBehaviors.filter(b => !b.parent_behavior_id)
  const scheduledByBehavior = new Map<string, { date: string | null }>()
  const behaviorsWithAnyExp = new Set<string>()
  ;(patientExps ?? []).forEach(e => {
    if (!e.avoidance_behavior_id) return
    behaviorsWithAnyExp.add(e.avoidance_behavior_id)
    if (e.status !== 'completed' && !scheduledByBehavior.has(e.avoidance_behavior_id)) {
      scheduledByBehavior.set(e.avoidance_behavior_id, { date: e.scheduled_date })
    }
  })
  const defaultRungId = (topRungs.find(b => !behaviorsWithAnyExp.has(b.id)) ?? topRungs[0])?.id ?? null
  const effectiveRungId = (selectedRungId && topRungs.some(b => b.id === selectedRungId)) ? selectedRungId : defaultRungId
  const planningBehavior = sortedBehaviors.find(b => b.id === planningBehaviorId) ?? null
  const fmtDate = (iso: string | null | undefined) =>
    iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''

  return (
    <div className="p-4 h-full overflow-y-auto">
      {/* Section label above the situation it belongs to. Everything ABOUT the situation —
          score, active state, tags — sits on the situation's own row, so the eye picks up the
          whole context in one line instead of three stacked blocks. */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Exposure ladder</div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>Avoidance &amp; safety behaviors</div>
        </div>
        {behaviors && behaviors.length > 0 && ladder && (
          <button onClick={() => reviewMut.mutate()} disabled={reviewMut.isPending}
            className="text-[11px] font-medium bg-transparent border-none cursor-pointer disabled:opacity-50"
            style={{ color: '#64748b', flexShrink: 0 }}>
            {reviewMut.isPending ? 'Reviewing...' : 'Run AI review'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap', margin: '10px 0 12px' }}>
        <h3 className="text-sm font-semibold text-slate-800" style={{ margin: 0 }}>{trigger.name}</h3>
        <DTBadge value={trigger.distress_thermometer_rating} max={trigger.distress_thermometer_max} />
        <button
          onClick={() => toggleActive.mutate()}
          disabled={toggleActive.isPending || !canToggleActive}
          title={!canToggleActive ? 'Add at least one behavior before activating this situation' : undefined}
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
            cursor: canToggleActive ? 'pointer' : 'not-allowed',
            opacity: canToggleActive ? 1 : 0.5,
          }}
        >
          <span style={{ fontSize: '8px' }}>{trigger.is_active ? '\u25cf' : '\u25cb'}</span>
          {trigger.is_active ? 'Active' : 'Not active'}
        </button>

        {/* Tags — targets the JIT tips the teen sees on this situation's exposures. No heading:
            on the situation's own row they read as properties of it. */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginLeft: 'auto' }}>
          {(allTags ?? []).map(tag => {
            const on = (situationTagIds ?? []).includes(tag.id)
            return (
              <button
                key={tag.id}
                onClick={() => toggleSituationTag(tag.id)}
                disabled={setTagsMut.isPending}
                title="Tag — targets the tips the teen sees on this situation"
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '4px 11px',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  border: `1px solid ${on ? 'var(--float-primary)' : '#cbd5e1'}`,
                  background: on ? 'var(--float-primary)' : '#fff',
                  color: on ? '#fff' : '#64748b',
                }}
              >
                {tag.label}
              </button>
            )
          })}
        </div>
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

      {/* Exposure ladder — the hero: a grouped, tinted object with rungs on a color-graded rail.
          The plan-an-experiment control lives in the footer below, so the ladder reads as the focus
          and its actions are taken from it. This same block is what the child sees, on its own. */}
      <div style={{ background: '#f7faf9', border: '1px solid #e6eeec', borderRadius: '14px', padding: '14px 14px 12px', marginBottom: '12px' }}>
        <div style={{ position: 'relative', paddingLeft: '30px' }}>
        {topRungs.length > 0 && (
          <div style={{ position: 'absolute', left: '10px', top: '12px', bottom: '12px', width: '2px', background: 'linear-gradient(#4bb98a, #f2a33f 55%, #ef6b53)' }} />
        )}
        {topRungs.map((b, i) => (
          <div key={b.id} style={{ position: 'relative', marginBottom: '5px' }}>
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
                        style={{ fontSize: '11px', fontWeight: 600, padding: '5px 10px', borderRadius: '999px', cursor: 'pointer',
                          background: editType === opt ? 'var(--float-primary)' : '#fff',
                          color: editType === opt ? '#fff' : '#475569',
                          border: editType === opt ? '1px solid var(--float-primary)' : '1px solid #cbd5e1',
                          textTransform: 'capitalize' }}>{opt}</button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: '8px' }}>
                  <label style={{ fontSize: '11px', color: '#475569', display: 'block', marginBottom: '4px' }}>Fear level when refraining (1-10)</label>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <button type="button" onClick={() => setEditDT(String(Math.max(1, (Number(editDT) || 1) - 1)))} style={{ width: '28px', height: '32px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#475569' }}>&minus;</button>
                    <input value={editDT} onChange={e => setEditDT(clampDtInput(e.target.value))} type="number" min="1" max="10" className="text-sm border border-slate-200 rounded" style={{ width: '80px', padding: '6px 8px', textAlign: 'center', height: '32px', boxSizing: 'border-box' }} />
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
              <div style={{ background: '#fef2f2', borderRadius: '8px', padding: '8px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '12px', color: '#991b1b' }}>Delete this behavior{sortedBehaviors.some(c => c.parent_behavior_id === b.id) ? ' and its smaller steps' : ''}?</span>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button onClick={() => delMut.mutate(b.id)} disabled={delMut.isPending} className="text-[11px] text-red-600 font-medium bg-transparent border-none cursor-pointer disabled:opacity-50">{delMut.isPending ? 'Deleting…' : 'Yes, delete'}</button>
                    <button onClick={() => { setDeletingBehaviorId(null); setDelError(null) }} className="text-[11px] text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                  </div>
                </div>
                {delError && <p style={{ fontSize: '11px', color: '#b91c1c', margin: '6px 0 0' }}>{delError}</p>}
              </div>
            ) : (
              <>
                {/* Rung node */}
                <div style={{ position: 'absolute', left: '-30px', top: '12px', width: '22px', height: '22px', borderRadius: '50%', background: planningBehaviorId === b.id ? '#135450' : '#fff', border: `2px solid ${planningBehaviorId === b.id ? '#135450' : '#cbd5e1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800, color: planningBehaviorId === b.id ? '#fff' : '#64748b', zIndex: 2 }}>{i + 1}</div>
                {/* Rung card */}
                <div className="group" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '11px 14px' }}>
                  <span className={`text-[10px] px-1 py-0.5 rounded font-bold uppercase ${b.behavior_type === 'safety' ? 'bg-amber-50 text-amber-600' : b.behavior_type === 'ritual' ? 'bg-purple-50 text-purple-600' : 'bg-slate-100 text-slate-500'}`} style={{ flexShrink: 0 }}>
                    {b.behavior_type.slice(0, 3)}
                  </span>
                  <span className="text-sm text-slate-700 truncate" style={{ flex: 1, minWidth: 0, fontWeight: 600 }}>{b.name}</span>
                  {scheduledByBehavior.has(b.id) && (
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#3f8a78', background: '#eafaf4', border: '1px solid #cdeee2', padding: '3px 8px', borderRadius: '6px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {scheduledByBehavior.get(b.id)?.date ? `Scheduled ${fmtDate(scheduledByBehavior.get(b.id)!.date)}` : 'Planned'}
                    </span>
                  )}
                  <div style={{ width: '38px', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                    <DTBadge value={b.distress_thermometer_when_refraining} />
                  </div>
                  <div style={{ width: '126px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '11px', flexShrink: 0 }}>
                    <button onClick={() => { resetSub(); setSubParentId(b.id) }} className="text-[12px] font-medium bg-transparent border-none cursor-pointer" style={{ color: '#3f8a78', whiteSpace: 'nowrap' }}>&#65291; step</button>
                    <button onClick={() => startEdit(b)} className="text-[12px] text-slate-400 hover:text-teal-600 bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">Edit</button>
                    <button onClick={() => setDeletingBehaviorId(b.id)} className="text-[12px] text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">Del</button>
                  </div>
                </div>

                {/* Sub-steps — same rail + same columns, only a smaller node + lighter card mark them children */}
                {sortedBehaviors.filter(c => c.parent_behavior_id === b.id).map(c => (
                  <div key={c.id} style={{ position: 'relative', marginTop: '5px' }}>
                    <div style={{ position: 'absolute', left: '-25px', top: '13px', width: '12px', height: '12px', borderRadius: '50%', background: '#fff', border: '2px solid #cbd5e1', zIndex: 2 }} />
                    <div className="group" style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#f8fafc', border: '1px dashed #d5dee2', borderRadius: '10px', padding: '9px 14px' }}>
                      <span style={{ color: '#94a3b8', fontSize: '13px', flexShrink: 0 }}>&#8627;</span>
                      <span className="truncate" style={{ flex: 1, minWidth: 0, fontSize: '13.5px', color: '#64748b', fontWeight: 500 }}>{c.name}</span>
                      <div style={{ width: '38px', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
                        <DTBadge value={c.distress_thermometer_when_refraining} />
                      </div>
                      <div style={{ width: '92px', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '11px', flexShrink: 0 }}>
                        <button onClick={() => { if (confirm('Delete this step?')) delMut.mutate(c.id) }} className="text-[12px] text-slate-400 hover:text-red-500 bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity">Del</button>
                      </div>
                    </div>
                  </div>
                ))}

                {/* Sub-step add form */}
                {subParentId === b.id && (
                  <div style={{ position: 'relative', marginTop: '5px' }}>
                    <div style={{ position: 'absolute', left: '-25px', top: '15px', width: '12px', height: '12px', borderRadius: '50%', background: '#fff', border: '2px solid #cbd5e1', zIndex: 2 }} />
                    <div style={{ background: '#f8fafc', borderRadius: '10px', padding: '10px 12px', border: '1px solid #e2e8f0' }}>
                      <div style={{ fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>Smaller step under &ldquo;{b.name}&rdquo;</div>
                      <input value={subName} onChange={e => setSubName(e.target.value)} placeholder="More specific, easier version" className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" style={{ marginBottom: '8px' }} autoFocus
                        onKeyDown={e => e.key === 'Enter' && subName.trim() && subMut.mutate(b)} />
                      <div style={{ marginBottom: '8px' }}>
                        <label style={{ fontSize: '11px', color: '#475569', display: 'block', marginBottom: '4px' }}>Fear level (lower than {b.distress_thermometer_when_refraining != null ? Number(b.distress_thermometer_when_refraining) : '—'})</label>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <button type="button" onClick={() => setSubDt(String(Math.max(1, (Number(subDt) || 1) - 1)))} style={{ width: '28px', height: '32px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#475569' }}>&minus;</button>
                          <input value={subDt} onChange={e => setSubDt(clampDtInput(e.target.value))} type="number" min="1" max="10" className="text-sm border border-slate-200 rounded" style={{ width: '80px', padding: '6px 8px', textAlign: 'center', height: '32px', boxSizing: 'border-box' }} />
                          <button type="button" onClick={() => setSubDt(String(Math.min(10, (Number(subDt) || 0) + 1)))} style={{ width: '28px', height: '32px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#475569' }}>+</button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                        <button onClick={() => subMut.mutate(b)} disabled={!subName.trim() || subMut.isPending} className="bg-teal-600 text-white rounded text-[11px] font-medium disabled:opacity-40 border-none cursor-pointer" style={{ padding: '6px 12px' }}>Add step</button>
                        <button onClick={resetSub} className="text-[11px] text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ))}
          {topRungs.length === 0 && (
            <div style={{ fontSize: '12.5px', color: '#94a3b8', padding: '8px 2px' }}>No behaviors on the ladder yet — use “+ Add behavior” to add the first rung.</div>
          )}

          {/* Plan an experiment — the single action, taken from the ladder */}
          {planActive && topRungs.length > 0 && (
            planningBehaviorId == null ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flexWrap: 'wrap', marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #dbe6e3' }}>
                <button onClick={() => { const rung = topRungs.find(x => x.id === effectiveRungId); if (rung) startPlanning(rung) }}
                  disabled={!effectiveRungId} className="disabled:opacity-40"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '13px', fontWeight: 800, color: '#135450', background: '#fff', border: '1.5px solid #135450', borderRadius: '9px', padding: '8px 13px', cursor: 'pointer' }}>&#9656; Plan an experiment</button>
                {expSavedFor && (
                  <span style={{ fontSize: '12px', color: '#16a34a', marginLeft: 'auto' }}>&#10003; Experiment planned for {fmtDate(expSavedFor.date + 'T00:00:00')}</span>
                )}
              </div>
            ) : planningBehavior && (
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed #dbe6e3' }}>
                <div style={{ background: '#fff', borderRadius: '10px', padding: '12px', border: '1px solid #dbe6e3' }}>
                  <p style={{ fontSize: '11px', fontWeight: 600, color: '#475569', margin: '0 0 9px', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    Plan experiment for
                    <select value={planningBehaviorId ?? ''} onChange={e => { setSelectedRungId(e.target.value); const rung = topRungs.find(x => x.id === e.target.value); if (rung) startPlanning(rung) }}
                      style={{ fontSize: '12.5px', fontWeight: 700, color: '#0d3d3a', border: '1px solid #bfe9dc', background: '#fff', borderRadius: '7px', padding: '4px 6px', maxWidth: '230px', cursor: 'pointer' }}>
                      {topRungs.map(b => (
                        <option key={b.id} value={b.id}>{b.name}{b.distress_thermometer_when_refraining != null ? ` · ${Number(b.distress_thermometer_when_refraining)}` : ''}</option>
                      ))}
                    </select>
                  </p>
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '6px' }}>Confidence level (ask the child):</div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {CONFIDENCE_OPTIONS.map(opt => (
                        <button key={opt.key} type="button" onClick={() => { setExpConfidence(opt.key); setExpWarning(false) }}
                          style={{ fontSize: '12px', fontWeight: 600, padding: '6px 12px', borderRadius: '999px', cursor: 'pointer',
                            background: expConfidence === opt.key ? 'var(--float-primary)' : '#fff',
                            color: expConfidence === opt.key ? '#fff' : '#475569',
                            border: expConfidence === opt.key ? '1px solid var(--float-primary)' : '1px solid #cbd5e1',
                            display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                          <span>{opt.emoji}</span>{opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Specific plan:</div>
                    <textarea value={expPlan} onChange={e => setExpPlan(e.target.value)} rows={2}
                      placeholder="e.g. Sit at the cafeteria table without headphones on Tuesday at lunch"
                      className="text-sm border border-slate-200 rounded"
                      style={{ width: '100%', padding: '8px 10px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
                  </div>
                  <div style={{ marginBottom: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>Scheduled date:</div>
                    <input type="date" value={expDate} onChange={e => setExpDate(e.target.value)} className="text-sm border border-slate-200 rounded" style={{ padding: '6px 8px' }} />
                  </div>
                  {expWarning && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '6px', padding: '10px 12px', marginBottom: '10px' }}>
                      <p style={{ fontSize: '12px', color: '#78350f', margin: '0 0 8px', lineHeight: '1.4' }}>
                        &#9888; Confidence is {expConfidence === 'low' ? 'Low' : 'Medium'} &mdash; consider simplifying this experiment before the teen attempts it.
                      </p>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => planExpMut.mutate({ behaviorId: planningBehavior.id, force: true })} disabled={planExpMut.isPending}
                          className="text-[11px] font-medium border-none cursor-pointer disabled:opacity-50"
                          style={{ background: '#d97706', color: '#fff', padding: '5px 10px', borderRadius: '6px' }}>Save anyway</button>
                        <button onClick={() => { setPlanningBehaviorId(null); setExpWarning(false) }}
                          className="text-[11px] bg-white cursor-pointer" style={{ border: '1px solid #fde68a', color: '#78350f', padding: '5px 10px', borderRadius: '6px' }}>Cancel</button>
                      </div>
                    </div>
                  )}
                  {!expWarning && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => handleSaveExperiment(planningBehavior.id)} disabled={!expPlan.trim() || planExpMut.isPending}
                        className="bg-teal-600 text-white rounded text-xs font-medium disabled:opacity-40 border-none cursor-pointer" style={{ padding: '6px 12px' }}>
                        {planExpMut.isPending ? 'Saving...' : 'Save experiment plan'}</button>
                      <button onClick={() => setPlanningBehaviorId(null)} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                    </div>
                  )}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {/* What the ladder is for: every rung above is an exposure that tests this prediction.
          Captured in the downward arrow, read-only here. */}
      {situationArrow?.feared_outcome && (
        <div style={{ background: '#0d3d3a', borderRadius: '12px', padding: '12px 14px', marginBottom: '12px' }}>
          <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.06em', color: '#7fd8c5', textTransform: 'uppercase', marginBottom: '4px' }}>
            &#9825; Feared outcome
          </div>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#fff', lineHeight: 1.4 }}>
            &ldquo;{situationArrow.feared_outcome}&rdquo;
          </div>
        </div>
      )}

      {/* Below the list it adds to, not up in the section header. */}
      {!showAdd && (
        <button onClick={() => setShowAdd(true)} className="cursor-pointer"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700, color: 'var(--float-primary)', background: '#fff', border: '1px solid var(--float-primary)', borderRadius: '999px', padding: '5px 12px', marginBottom: '12px' }}>+ Add behavior</button>
      )}

      {/* Add behavior inline */}
      {showAdd && (
        <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '10px 12px' }}>
          <div style={{ position: 'relative', marginBottom: type === 'avoidance' ? '4px' : '8px' }}>
            <input value={name} onChange={e => { setName(e.target.value); setBehaviorLibraryId(null); setShowBehSuggest(true) }}
              placeholder={type === 'avoidance' ? `Optional — type to search, or leave blank for “Avoids ${trigger.name}”` : 'Behavior name — type to search or add new'}
              className="w-full px-2 py-1.5 text-sm border border-slate-200 rounded" autoFocus
              onKeyDown={e => e.key === 'Enter' && (name.trim() || type === 'avoidance') && addMut.mutate()} />
            {showBehSuggest && (behSuggestions?.length ?? 0) > 0 && (
              <div style={{ position: 'absolute', top: '34px', left: 0, right: 0, zIndex: 30, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 6px 16px rgba(0,0,0,0.12)', maxHeight: '160px', overflowY: 'auto' }}>
                {behSuggestions!.map(s => (
                  <button key={s.id} type="button" onClick={() => { setName(s.name); if (s.behavior_type) setType(s.behavior_type); setBehaviorLibraryId(s.id); setShowBehSuggest(false) }}
                    className="cursor-pointer" style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid #f1f5f9', padding: '7px 10px', fontSize: '13px', color: '#334155' }}>
                    {s.name}{s.behavior_type ? <span style={{ color: '#94a3b8', fontSize: '11px' }}> · {s.behavior_type}</span> : null}
                  </button>
                ))}
              </div>
            )}
          </div>
          {type === 'avoidance' && (
            <p style={{ fontSize: '11px', color: '#94a3b8', margin: '0 0 8px' }}>Leave blank to name it “Avoids {trigger.name}”.</p>
          )}
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
              <input value={dt} onChange={e => setDt(clampDtInput(e.target.value))} type="number" min="1" max="10" className="text-sm border border-slate-200 rounded" style={{ width: '80px', padding: '6px 8px', textAlign: 'center', height: '32px', boxSizing: 'border-box' }} />
              <button type="button" onClick={() => setDt(String(Math.min(10, (Number(dt) || 0) + 1)))} style={{ width: '28px', height: '32px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#475569' }}>+</button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <button onClick={() => addMut.mutate()} disabled={!name.trim() && type !== 'avoidance'} className="bg-teal-600 text-white rounded text-xs font-medium disabled:opacity-40 border-none cursor-pointer" style={{ padding: '6px 12px' }}>Add</button>
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

    </div>
  )
}

// ── Case Conceptualization (living draft) ──
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
        const dt = clampDt(newSituationDT)
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
                    <input value={newSituationDT} onChange={e => setNewSituationDT(clampDtInput(e.target.value))} type="number" min={1} max={10} placeholder="DT"
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
        {items.map(item => {
          const isChecked = !!checkedItems[item.key]
          return (
            <div key={item.key} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => toggleMut.mutate({ key: item.key, value: !isChecked })}
                style={{ accentColor: '#135450', width: '15px', height: '15px', marginTop: '2px', flexShrink: 0, cursor: 'pointer' }}
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
  )
}

// Preset session-note tags (multi-select); custom tags can also be typed.
const SESSION_NOTE_TAGS = ['Initial', 'Consult', 'Weekly', 'Review']

// ── Main Page ──
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
  const [msgThread, setMsgThread] = useState<'teen' | 'parent'>('teen')

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
  // Behaviors that couldn't be committed to the plan (escape/unclear — see PLAN_COMMIT_TYPE)
  const [extractUnresolved, setExtractUnresolved] = useState<string[]>([])

  // --- Editable preliminary extraction ---------------------------------------
  // The extraction is preliminary content: the clinician edits, reclassifies,
  // removes, or overwrites it (re-run) before committing into the plan.
  const BEHAVIOR_TYPE_META: Record<ExtractedBehaviorType, { bg: string; color: string }> = {
    avoidance: { bg: '#fee2e2', color: '#b91c1c' },
    safety:    { bg: '#fef3c7', color: '#b45309' },
    escape:    { bg: '#e0e7ff', color: '#4338ca' },
    unclear:   { bg: '#f1f5f9', color: '#475569' },
  }

  const updateExtraction = (mut: (draft: MonitoringExtraction) => void) => {
    setExtraction(prev => {
      if (!prev) return prev
      const next: MonitoringExtraction = JSON.parse(JSON.stringify(prev))
      mut(next)
      return next
    })
  }
  const editSituation = (si: number, patch: Partial<ExtractedSituation>) =>
    updateExtraction(d => { d.situations[si] = { ...d.situations[si], ...patch } })
  const removeSituation = (si: number) =>
    updateExtraction(d => { d.situations.splice(si, 1) })
  const addSituation = () =>
    updateExtraction(d => { d.situations.push({ name: '', fear_rating: null, behaviors: [], accommodations: [] }) })
  const editBehavior = (si: number, bi: number, patch: Partial<ExtractedBehavior>) =>
    updateExtraction(d => { d.situations[si].behaviors[bi] = { ...d.situations[si].behaviors[bi], ...patch } })
  const removeBehavior = (si: number, bi: number) =>
    updateExtraction(d => { d.situations[si].behaviors.splice(bi, 1) })
  const addBehavior = (si: number) =>
    updateExtraction(d => { d.situations[si].behaviors.push({ type: 'avoidance', description: '' }) })
  const editAccommodation = (si: number, ai: number, description: string) =>
    updateExtraction(d => { d.situations[si].accommodations[ai] = { description } })
  const removeAccommodation = (si: number, ai: number) =>
    updateExtraction(d => { d.situations[si].accommodations.splice(ai, 1) })
  const addAccommodation = (si: number) =>
    updateExtraction(d => { d.situations[si].accommodations.push({ description: '' }) })

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
  const [noteParticipant, setNoteParticipant] = useState<SessionParticipant | ''>('')
  const [noteTags, setNoteTags] = useState<string[]>([])
  const [noteTagInput, setNoteTagInput] = useState('')
  const [noteDate, setNoteDate] = useState(new Date().toISOString().split('T')[0])
  const [noteContent, setNoteContent] = useState('')
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null)

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
  const [sessionsFilter, setSessionsFilter] = useState<'all' | 'parent' | 'patient' | 'action_plans'>('all')
  const [sessionTagFilter, setSessionTagFilter] = useState<string | null>(null)
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
  const { data: plan } = useQuery({ queryKey: ['plan', patientId], queryFn: () => getTreatmentPlan(patientId!), enabled: !!patientId })
  const { data: rawTriggers } = useQuery({ queryKey: ['triggers', plan?.id], queryFn: () => getTriggers(plan!.id), enabled: !!plan?.id })
  // Placeholder situations (e.g. the parent-DA anchor) are filtered out of every situation list/count
  const triggers = useMemo(() => rawTriggers?.filter(t => !t.is_placeholder), [rawTriggers])
  const { data: monitoringForm } = useQuery({ queryKey: ['monitoring-form', patientId], queryFn: () => getMonitoringForm(patientId!), enabled: !!patientId })
  const { data: sessionNotes } = useQuery({ queryKey: ['session-notes', patientId], queryFn: () => getSessionNotes(patientId!), enabled: !!patientId })
  const { data: checklistItems } = useQuery({ queryKey: ['checklist', patientId], queryFn: () => getChecklist(patientId!), enabled: !!patientId })
  const { data: actionPlans } = useQuery({ queryKey: ['action-plans', patientId], queryFn: () => getActionPlans(patientId!), enabled: !!patientId })
  const { data: messages } = useQuery({ queryKey: ['messages', patientId], queryFn: () => getMessages(patientId!), enabled: !!patientId, refetchInterval: 5000, refetchIntervalInBackground: true, refetchOnWindowFocus: true })
  const { data: parentMessages } = useQuery({ queryKey: ['parent-messages', patientId], queryFn: () => getParentMessages(patientId!), enabled: !!patientId, refetchInterval: 5000, refetchIntervalInBackground: true, refetchOnWindowFocus: true })
  // The child thread and the parent thread share this panel; a toggle switches.
  const activeMessages = msgThread === 'parent' ? (parentMessages ?? []) : (messages ?? [])
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

  const handleExtract = async () => {
    setExtractOpen(true)
    setExtractLoading(true)
    setExtractError(null)
    setExtraction(null)
    setExtractFailed([])
    setExtractUnresolved([])
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
    setExtractUnresolved([])
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
    setExtractUnresolved([])
    const failed: string[] = []
    const unresolved: string[] = []
    // SEAM — how each extracted behavior type maps when committing into the plan.
    // null = not committed; the behavior stays in the preliminary draft for the
    // clinician to reclassify. escape is null PENDING Dr. Walker's ruling (escape as
    // its own plan type vs map to avoidance) — change this one line when she decides.
    const PLAN_COMMIT_TYPE: Record<ExtractedBehaviorType, string | null> = {
      avoidance: 'avoidance', safety: 'safety', escape: null, unclear: null,
    }

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
          // Situation DT comes from the per-situation fear rating (high end of a range if given)
          const situationDT = sit.fear_rating_max ?? sit.fear_rating ?? undefined
          setExtractProgress(`Creating situations... ${sit.name}`)
          trigger = await createTrigger(planId!, {
            name: sit.name,
            distress_thermometer_rating: clampDt(situationDT),
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
          const planType = PLAN_COMMIT_TYPE[beh.type]
          if (planType == null) {
            // escape/unclear are not committed — clinician must reclassify them first
            unresolved.push(`${sit.name}: "${beh.description}" (${beh.type})`)
            continue
          }
          // Match an existing behavior by fuzzy similarity
          if (behaviorNames.some(n => isSimilar(n, beh.description))) {
            anySkipped = true
            continue
          }
          setExtractProgress(`Creating behaviors... ${beh.description}`)
          try {
            await createBehavior(trigger.id, {
              name: beh.description,
              behavior_type: planType,
              distress_thermometer_when_refraining: clampDt(sit.fear_rating),
            })
            behaviorNames.push(beh.description)
            anyCreated = true
          } catch {
            failed.push(`Behavior: ${beh.description}`)
          }
        }
      } catch {
        failed.push(`Situation: ${sit.name}`)
      }
    }

    await queryClient.invalidateQueries({ queryKey: ['plan', patientId] })
    await queryClient.invalidateQueries({ queryKey: ['triggers', planId] })

    // Seed the living case conceptualization draft from the (edited) extraction
    setExtractUnresolved(unresolved)
    setConceptualizationDraft(prev => ({
      ...prev,
      situations: extraction.situations.map(s => s.name),
      behaviors: extraction.situations.flatMap(s => s.behaviors.map(b => `${b.description} — ${b.type}`)),
      accommodationPatterns: extraction.situations.flatMap(s => s.accommodations.map(a => a.description)),
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
    mutationFn: () => msgThread === 'parent'
      ? sendParentMessage(patientId!, msgContent, 'general')
      : sendMessage(patientId!, patient!.user_id, msgContent, 'general'),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: [msgThread === 'parent' ? 'parent-messages' : 'messages', patientId] }); setMsgContent('') }
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
  const resetNoteForm = () => { setShowNoteForm(false); setEditingNote(null); setNoteParticipant(''); setNoteTags([]); setNoteTagInput(''); setNoteDate(new Date().toISOString().split('T')[0]); setNoteContent('') }
  const createNoteMut = useMutation({ mutationFn: () => createSessionNote(patientId!, { participant: noteParticipant || null, tags: noteTags, session_date: noteDate, content: noteContent }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['session-notes', patientId] }); resetNoteForm() } })
  const updateNoteMut = useMutation({ mutationFn: () => updateSessionNote(editingNote!.id, { participant: noteParticipant || null, tags: noteTags, session_date: noteDate, content: noteContent }), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['session-notes', patientId] }); resetNoteForm() } })
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


  const cardStyle = { background: '#ffffff', borderRadius: '12px', border: '1px solid #cbd5e1', boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', padding: '20px', width: '100%', boxSizing: 'border-box' as const }

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
    enabled: !!patientId && activeTab === 'experiments'
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

  // Conceptualization draft — feared outcome contributions from the DA sub-steps
  const addPatientFearedOutcome = (fo: string) => setConceptualizationDraft(prev =>
    prev.patientFearedOutcomes.includes(fo) ? prev
      : { ...prev, patientFearedOutcomes: [...prev.patientFearedOutcomes, fo], lastUpdatedStep: Math.max(prev.lastUpdatedStep, 4) })

  const notesList = sessionNotes ?? []
  const hasPatientDA = !!daStatuses && Object.values(daStatuses).some(da => da?.facilitated_by === 'practitioner')
  // Setup-mode completion (4 steps). "Build Treatment Plan" moved to the
  // Treatment workspace, so setup is just the assessment steps now.
  const stepComplete: boolean[] = [
    !!monitoringForm && !!monitoringForm.sent_at,
    (triggers?.length ?? 0) >= 1,
    notesList.some(n => n.participant === 'parent') || STAGE1_PARENT_KEYS.every(k => !!(checklistItems ?? {})[k]),
    notesList.some(n => n.participant === 'patient') && hasPatientDA,
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
  const noteFieldCap: CSSProperties = { fontSize: '11px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }
  const notePill = (on: boolean): CSSProperties => ({ fontSize: '13px', fontWeight: 600, padding: '8px 14px', borderRadius: '999px', cursor: 'pointer', background: on ? 'var(--float-primary)' : '#fff', color: on ? '#fff' : '#475569', border: on ? '1px solid var(--float-primary)' : '1px solid #cbd5e1' })
  const noteTagFilterChip = (on: boolean): CSSProperties => ({ fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px', cursor: 'pointer', background: on ? '#eafaf6' : '#fff', color: on ? '#0d3d3a' : '#64748b', border: on ? '1px solid var(--float-primary)' : '1px solid #e2e8f0' })

  const noteParticipantFilter: SessionParticipant | null =
    sessionsFilter === 'parent' ? 'parent' : sessionsFilter === 'patient' ? 'patient' : null
  const allNoteTags = Array.from(new Set(notesList.flatMap(n => n.tags ?? []))).sort()
  const filteredNotes = notesList.filter(n =>
    (noteParticipantFilter === null || n.participant === noteParticipantFilter) &&
    (sessionTagFilter === null || (n.tags ?? []).includes(sessionTagFilter))
  )
  const toggleNoteTag = (t: string) => setNoteTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])
  const addCustomNoteTag = () => {
    const t = noteTagInput.trim()
    if (t && !noteTags.includes(t)) setNoteTags(prev => [...prev, t])
    setNoteTagInput('')
  }
  const startNewNote = () => { setEditingNote(null); setNoteParticipant(noteParticipantFilter ?? ''); setNoteTags([]); setNoteTagInput(''); setNoteDate(new Date().toISOString().split('T')[0]); setNoteContent(''); setShowNoteForm(true) }

  const sessionNotesList = (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="text-sm font-semibold text-slate-700">Session notes</span>
          {filteredNotes.length > 0 && <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{filteredNotes.length}</span>}
        </div>
        {!showNoteForm && <button onClick={startNewNote} className="text-xs text-teal-600 font-medium bg-transparent border-none cursor-pointer">+ Add note</button>}
      </div>

      {allNoteTags.length > 0 && !showNoteForm && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <button onClick={() => setSessionTagFilter(null)} style={noteTagFilterChip(sessionTagFilter === null)}>All tags</button>
          {allNoteTags.map(t => <button key={t} onClick={() => setSessionTagFilter(sessionTagFilter === t ? null : t)} style={noteTagFilterChip(sessionTagFilter === t)}>{t}</button>)}
        </div>
      )}

      {showNoteForm && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '12px' }}>
          <div>
            <div style={noteFieldCap}>Who was the session with?</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              {(['parent', 'patient'] as SessionParticipant[]).map(p => (
                <button key={p} type="button" onClick={() => setNoteParticipant(p)} style={notePill(noteParticipant === p)}>{p === 'parent' ? 'Parent' : 'Patient'}</button>
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
            <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>Date:</label>
            <input type="date" value={noteDate} onChange={e => setNoteDate(e.target.value)} className="text-xs border border-slate-200 rounded" style={{ padding: '4px 8px' }} />
          </div>
          <textarea value={noteContent} onChange={e => setNoteContent(e.target.value)} rows={4} placeholder="Session notes..." className="text-xs border border-slate-200 rounded" style={{ width: '100%', padding: '8px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => editingNote ? updateNoteMut.mutate() : createNoteMut.mutate()} disabled={!noteContent.trim() || !noteParticipant} className="bg-teal-600 text-white rounded text-xs font-medium disabled:opacity-40 border-none cursor-pointer" style={{ padding: '6px 12px' }}>{editingNote ? 'Update' : 'Save'}</button>
            <button onClick={resetNoteForm} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
          </div>
        </div>
      )}

      {filteredNotes.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filteredNotes.map(n => (
            <div key={n.id} style={{ padding: '8px 10px', background: '#f8fafc', borderRadius: '6px', fontSize: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span className="px-1 py-0.5 rounded font-medium" style={{ background: n.participant === 'parent' ? '#eafaf6' : '#ede9fe', color: n.participant === 'parent' ? '#0d3d3a' : '#5b21b6' }}>{n.participant === 'parent' ? 'Parent' : n.participant === 'patient' ? 'Patient' : '—'}</span>
                  {(n.tags ?? []).map(t => <span key={t} className="px-1 py-0.5 rounded" style={{ background: '#f1f5f9', color: '#475569', fontWeight: 500 }}>{t}</span>)}
                  <span className="text-slate-400">{new Date(n.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  <button onClick={() => { setEditingNote(n); setNoteParticipant(n.participant ?? ''); setNoteTags(n.tags ?? []); setNoteTagInput(''); setNoteDate(n.session_date); setNoteContent(n.content); setShowNoteForm(true) }} className="text-teal-600 bg-transparent border-none cursor-pointer" style={{ fontSize: '11px' }}>Edit</button>
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
      setActiveTab('plan')
    } else if (action === 'scrollDA') {
      setActiveTab('plan')
      setTimeout(() => document.getElementById('patient-da-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100)
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
        {/* The two co-located, child-facing interviews. Both launch from here — the downward
            arrow is its own mode, not a detour inside session mode. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <button onClick={() => navigate(`/patients/${patientId}/arrow`)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: 'var(--float-primary)', background: '#fff', border: '1px solid var(--float-primary)', borderRadius: '999px', padding: '7px 14px', cursor: 'pointer' }}>
            ↓ Downward arrow
          </button>
          <button onClick={() => navigate(`/patients/${patientId}/session`)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#fff', background: 'var(--float-primary)', border: 'none', borderRadius: '999px', padding: '7px 14px', cursor: 'pointer' }}>
            ▸ Start session
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '45% 55%', borderTop: '1px solid var(--float-border)', marginTop: '0', minHeight: '320px' }}>
        {/* Situations list */}
        <div style={{ background: '#f8fafc', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Situations</span>
            {!showTriggerAdd && <button onClick={() => setShowTriggerAdd(true)} className="cursor-pointer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700, color: 'var(--float-primary)', background: '#fff', border: '1px solid var(--float-primary)', borderRadius: '999px', padding: '5px 12px' }}>+ Add</button>}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {triggers?.map(t => (
              <div key={t.id} className="group" style={{ width: '100%', textAlign: 'left', padding: '10px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', background: t.id === selectedTriggerId ? '#eafaf6' : 'transparent', borderLeft: t.id === selectedTriggerId ? '2px solid var(--float-primary)' : '2px solid transparent', borderRadius: '6px', marginBottom: '8px' }}
                onClick={() => { if (editingTriggerId !== t.id && deletingTriggerId !== t.id) setSelectedTriggerId(t.id) }}>
                {deletingTriggerId === t.id ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }} onClick={e => e.stopPropagation()}>
                    <span style={{ fontSize: '11px', color: '#991b1b', lineHeight: '1.4' }}>Delete this situation and all its behaviors?</span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => deleteTriggerMut.mutate(t.id)} disabled={deleteTriggerMut.isPending} className="text-[11px] text-white font-medium border-none cursor-pointer disabled:opacity-50" style={{ background: '#dc2626', padding: '3px 8px', borderRadius: '4px' }}>{deleteTriggerMut.isPending ? 'Deleting…' : 'Yes'}</button>
                      <button onClick={() => { setDeletingTriggerId(null); setDeleteTriggerError(null) }} className="text-[11px] text-slate-500 bg-transparent border-none cursor-pointer">Cancel</button>
                    </div>
                    {deleteTriggerError && <span style={{ fontSize: '11px', color: '#b91c1c', lineHeight: '1.4' }}>{deleteTriggerError}</span>}
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
              <div style={{ background: '#f8fafc', borderRadius: '8px', padding: '12px', marginBottom: '8px' }}>
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
                    <div style={{ position: 'absolute', top: '38px', left: 0, right: 0, zIndex: 30, background: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', boxShadow: '0 6px 16px rgba(0,0,0,0.12)', maxHeight: '180px', overflowY: 'auto' }}>
                      {sitSuggestions!.map(s => (
                        <button key={s.id} type="button" onClick={() => { setNewTriggerName(s.name); setNewTriggerLibraryId(s.id); setShowSitSuggest(false) }}
                          className="cursor-pointer" style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid #f1f5f9', padding: '8px 10px', fontSize: '13px', color: '#334155' }}>
                          {s.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', color: '#475569', display: 'block', marginBottom: '4px' }}>Fear level (DT) — single value, or a range with an optional max:</label>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <button type="button" onClick={() => setNewTriggerDT(String(Math.max(1, (Number(newTriggerDT) || 1) - 1)))} style={{ width: '28px', height: '32px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#475569' }}>−</button>
                    <input value={newTriggerDT} onChange={e => setNewTriggerDT(clampDtInput(e.target.value))} type="number" min="1" max="10" placeholder="min" className="text-sm border border-slate-200 rounded" style={{ width: '70px', padding: '6px 8px', textAlign: 'center', height: '32px', boxSizing: 'border-box' }} />
                    <button type="button" onClick={() => setNewTriggerDT(String(Math.min(10, (Number(newTriggerDT) || 0) + 1)))} style={{ width: '28px', height: '32px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: '6px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#475569' }}>+</button>
                    <span style={{ color: '#94a3b8', padding: '0 2px' }}>–</span>
                    <input value={newTriggerDTMax} onChange={e => setNewTriggerDTMax(clampDtInput(e.target.value))} type="number" min="1" max="10" placeholder="max" className="text-sm border border-slate-200 rounded" style={{ width: '70px', padding: '6px 8px', textAlign: 'center', height: '32px', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
                  <button onClick={() => addTriggerMut.mutate()} disabled={!newTriggerName.trim()} className="bg-teal-600 text-white rounded text-xs font-medium disabled:opacity-40 border-none cursor-pointer" style={{ padding: '7px 14px' }}>Add situation</button>
                  <button onClick={() => { setShowTriggerAdd(false); setNewTriggerName(''); setNewTriggerLibraryId(null); setShowSitSuggest(false); setNewTriggerDT(''); setNewTriggerDTMax('') }} className="text-xs text-slate-400 bg-transparent border-none cursor-pointer">Cancel</button>
                </div>
              </div>
            )}
            {(!triggers || triggers.length === 0) && !showTriggerAdd && (
              <div>
                <p style={{ fontSize: '11px', color: '#94a3b8', lineHeight: '1.4', margin: '0 0 8px' }}>Add trigger situations identified in your sessions.</p>
                <button onClick={() => setShowTriggerAdd(true)} className="cursor-pointer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 700, color: '#fff', background: 'var(--float-primary)', border: 'none', borderRadius: '8px', padding: '9px 16px' }}>+ Add first situation</button>
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
                  <button onClick={() => setActiveTab('chat')} className="bg-amber-600 text-white rounded text-xs font-medium border-none cursor-pointer" style={{ padding: '4px 10px' }}>Remind teen</button>
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
                <Line type="monotone" dataKey="bip_before" stroke="#3f817b" strokeWidth={2} dot={{ r: 3, fill: '#3f817b' }} strokeDasharray="4 4" />
                <Line type="monotone" dataKey="bip_after" stroke="#135450" strokeWidth={2} dot={{ r: 3, fill: '#135450' }} />
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
                <Line type="monotone" dataKey="dt_actual" stroke="#135450" strokeWidth={2} dot={{ r: 3, fill: '#135450' }} />
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

  const parentUnreadCount = (parentMessages ?? []).filter(m => !m.read_at).length
  const lastMsgPreview = (arr?: typeof messages) => { const a = arr ?? []; return a.length ? a[a.length - 1].content : '' }
  const chatThreads = [
    { id: 'teen' as const, name: patient?.name || 'Patient', role: 'Teen · private thread', preview: lastMsgPreview(messages), unread: unreadMessageCount },
    { id: 'parent' as const, name: patient?.parent_name || 'Parent', role: 'Parent · private thread', preview: lastMsgPreview(parentMessages), unread: parentUnreadCount },
  ]
  const chatRecipientName = msgThread === 'teen' ? (patient?.name || 'Patient') : (patient?.parent_name || 'Parent')

  const messagesContent = (
    <div id="messages-section" style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '12px', boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', height: '620px', display: 'flex', overflow: 'hidden' }}>
      {/* Thread list */}
      <div style={{ width: '250px', flexShrink: 0, borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {chatThreads.map(t => {
            const on = msgThread === t.id
            return (
              <button
                key={t.id}
                onClick={() => setMsgThread(t.id)}
                className="cursor-pointer"
                style={{ display: 'block', width: '100%', textAlign: 'left', background: on ? '#eafaf6' : 'transparent', border: 'none', borderLeft: on ? '3px solid #135450' : '3px solid transparent', padding: '12px 14px', cursor: 'pointer' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                  {t.unread > 0 && <span style={{ flexShrink: 0, fontSize: '10px', fontWeight: 700, color: '#fff', background: '#135450', borderRadius: '9999px', padding: '0 6px', lineHeight: '16px' }}>{t.unread}</span>}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '1px' }}>{t.role}</div>
                {t.preview && <div style={{ fontSize: '12px', color: '#64748b', marginTop: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.preview}</div>}
              </button>
            )
          })}
        </div>
        <div style={{ borderTop: '1px solid #f1f5f9', padding: '10px 14px', fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>
          Threads are role-scoped. Teen messages are never visible to the parent.
        </div>
      </div>

      {/* Conversation pane */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 16px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          <span style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>{chatRecipientName}</span>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', color: '#135450', background: '#eafaf6', border: '1px solid #9af6e4', borderRadius: '999px', padding: '2px 8px' }}>{msgThread === 'teen' ? 'TEEN ONLY' : 'PARENT ONLY'}</span>
        </div>

        <div ref={messagesScrollRef} style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px' }}>
          {activeMessages.length === 0 && (
            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.5', margin: 0 }}>
              {msgThread === 'parent'
                ? 'Message the parent between sessions — coaching, encouragement, plan notes.'
                : 'Send check-ins, encouragement, or plan adjustments to the patient between sessions.'}
            </p>
          )}
          {activeMessages.map(m => {
            const ts = formatMsgTime(m.created_at)
            const isFamily = msgThread === 'parent'
              ? m.sender_type === 'parent'
              : !!(patient && m.sender_user_id === patient.user_id)
            const special = m.message_type === 'experiment_completed'
              ? { bg: '#f0fdf4', border: '#bbf7d0', label: '✓ Experiment completed', labelColor: '#15803d' }
              : m.message_type === 'too_hard'
                ? { bg: '#fffbeb', border: '#fde68a', label: '⚠ Too hard', labelColor: '#b45309' }
                : null
            const clinician = !isFamily && !special
            return (
              <div key={m.id} style={{ display: 'flex', justifyContent: clinician ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '62%', background: clinician ? '#135450' : special ? special.bg : '#f1f5f9', border: special ? `1px solid ${special.border}` : clinician ? 'none' : '1px solid #e2e8f0', borderRadius: '10px', padding: '10px 13px' }}>
                  {special && <div style={{ fontSize: '11px', fontWeight: 600, color: special.labelColor, marginBottom: '4px' }}>{special.label}</div>}
                  <p style={{ margin: 0, fontSize: '13.5px', lineHeight: 1.55, color: clinician ? '#fff' : '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</p>
                  {ts && <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '4px', textAlign: 'right', color: clinician ? '#fff' : '#64748b' }}>{ts}</div>}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', gap: '8px', borderTop: '1px solid #e2e8f0', padding: '12px 16px', flexShrink: 0 }}>
          <input value={msgContent} onChange={e => setMsgContent(e.target.value)} placeholder="Type a message…" className="border border-slate-200 rounded" style={{ flex: 1, fontSize: '13.5px', padding: '8px 10px', background: '#fff', boxSizing: 'border-box' }} onKeyDown={e => e.key === 'Enter' && msgContent.trim() && sendMsgMut.mutate()} />
          <button onClick={() => sendMsgMut.mutate()} disabled={!msgContent.trim()} className="font-medium cursor-pointer disabled:opacity-40" style={{ background: '#135450', color: '#fff', border: 'none', borderRadius: '8px', padding: '8px 20px', fontSize: '13.5px' }}>Send</button>
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
          <div style={{ background: '#eafaf6', border: '1px solid #9af6e4', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: '#0d3d3a' }}>
              Working with: <span style={{ fontWeight: 600, fontStyle: 'italic' }}>&ldquo;{plan.nickname}&rdquo;</span> &#x1F41B;
            </span>
          </div>
        )}
        {unreadExperimentCount > 0 && (
          <div style={{ marginBottom: '12px' }}>
            <a
              href="#messages-section"
              onClick={(e) => { e.preventDefault(); setActiveTab('chat'); setTimeout(() => document.getElementById('messages-section')?.scrollIntoView({ behavior: 'smooth' }), 100) }}
              style={{ fontSize: '13px', color: '#0d3d3a', fontWeight: 600, textDecoration: 'none', cursor: 'pointer' }}
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
      }} />

      <div style={{ padding: '24px' }}>

        {/* Patient header — identity + access + actions */}
        {patient && !editingProfile && (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap', marginBottom: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '9999px', background: '#eafaf6', color: 'var(--float-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '17px', fontWeight: 700, flexShrink: 0 }}>
                {(patient.name || '?').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: '#1e293b' }}>{patient.name}</span>
                  {activitySummary && (
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 10px', borderRadius: '999px', background: plan?.status === 'active' ? '#eafaf6' : '#f1f5f9', color: plan?.status === 'active' ? '#0d3d3a' : '#64748b' }}>{activitySummary}</span>
                  )}
                </div>
                <div style={{ fontSize: '13px', color: '#64748b', marginTop: '2px' }}>
                  {[
                    patient.age ? `Age ${patient.age}` : null,
                    patient.gender || null,
                    plan?.nickname ? `Nickname: “${plan.nickname}”` : null,
                  ].filter(Boolean).join(' · ')}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              {/* Teen access card */}
              <button onClick={() => openAccess('teen')} className="cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: showTeenAccess && accessFocus === 'teen' ? '#eafaf6' : '#fff', border: showTeenAccess && accessFocus === 'teen' ? '1px solid var(--float-primary)' : '1px solid #cbd5e1', borderRadius: '10px', padding: '8px 12px', textAlign: 'left' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '9999px', background: patient.teen_invited_at ? '#22c55e' : '#cbd5e1', flexShrink: 0 }} />
                <span>
                  <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155' }}>Teen access</span>
                  <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8' }}>{patient.teen_invited_at ? 'Set up' : patient.child_connect_consent_at ? 'Ready to invite' : 'Awaiting consent'}</span>
                </span>
              </button>
              {/* Parent access card */}
              <button onClick={() => openAccess('parent')} className="cursor-pointer" style={{ display: 'flex', alignItems: 'center', gap: '8px', background: showTeenAccess && accessFocus === 'parent' ? '#eafaf6' : '#fff', border: showTeenAccess && accessFocus === 'parent' ? '1px solid var(--float-primary)' : '1px solid #cbd5e1', borderRadius: '10px', padding: '8px 12px', textAlign: 'left' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '9999px', background: patient.parent_email ? '#22c55e' : '#cbd5e1', flexShrink: 0 }} />
                <span>
                  <span style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155' }}>Parent access</span>
                  <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8' }}>{patient.parent_email ? 'Invite / manage' : 'Not set up'}</span>
                </span>
              </button>
              <button onClick={openProfileEdit} className="text-xs font-medium bg-transparent cursor-pointer" style={{ color: 'var(--float-primary)', border: '1px solid #cbd5e1', borderRadius: '999px', padding: '8px 14px' }}>
                Edit profile
              </button>
              <button
                onClick={() => setProcessPanelOpen(v => !v)}
                className="text-xs font-medium cursor-pointer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: processPanelOpen ? '#fff' : 'var(--float-primary)', background: processPanelOpen ? 'var(--float-primary)' : 'transparent', border: '1px solid var(--float-primary)', borderRadius: '999px', padding: '8px 14px' }}
              >
                Process
                <span style={{ fontSize: '10px', fontWeight: 700, color: processPanelOpen ? 'var(--float-primary)' : '#fff', background: processPanelOpen ? '#fff' : 'var(--float-primary)', borderRadius: '9999px', padding: '0 6px', lineHeight: '15px' }}>{processChecklistDone}/{processChecklistTotal}</span>
              </button>
            </div>
          </div>
        )}

        {/* Teen access — persistent, opened from the patient header, shown in any mode */}
        {showTeenAccess && patient && (
          <TeenAccessPanel
            patientId={patientId!}
            focus={accessFocus}
            teenEmail={patient.teen_email}
            teenInvitedAt={patient.teen_invited_at}
            consentAt={patient.child_connect_consent_at}
            fallbackEmail={patient.email}
            onViewMessages={() => { setShowTeenAccess(false); setActiveTab('chat') }}
            onClose={() => setShowTeenAccess(false)}
          />
        )}

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

        {/* Flat tab bar (replaces the phase spine + rail) */}
        <div style={{ display: 'flex', gap: '2px', borderBottom: '1px solid #e2e8f0', marginBottom: '20px' }}>
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
                className="bg-transparent border-none cursor-pointer"
                style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 18px', fontSize: '14px', fontWeight: cur ? 700 : 500, color: cur ? '#1e293b' : '#94a3b8', borderBottom: cur ? '3px solid #135450' : '3px solid transparent', marginBottom: '-1px' }}
              >
                {t.label}
                {b ? <span style={{ fontSize: '10px', fontWeight: 700, color: '#fff', background: '#135450', borderRadius: '9999px', padding: '0 6px', lineHeight: '16px' }}>{b}</span> : null}
              </button>
            )
          })}
        </div>

        {/* Body: content + optional process panel */}
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {([
                    { id: 'all', label: 'All' },
                    { id: 'parent', label: 'Parent' },
                    { id: 'patient', label: 'Patient' },
                    { id: 'action_plans', label: 'Action plans', b: draftPlanCount },
                  ] as const).map(f => {
                    const on = sessionsFilter === f.id
                    const b = 'b' in f ? f.b : 0
                    return (
                      <button
                        key={f.id}
                        onClick={() => { setSessionsFilter(f.id); if (f.id === 'action_plans') resetNoteForm() }}
                        className="cursor-pointer"
                        style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', borderRadius: '999px', fontSize: '13px', fontWeight: 600, border: on ? '1px solid var(--float-primary)' : '1px solid #cbd5e1', background: on ? 'var(--float-primary)' : '#fff', color: on ? '#fff' : '#475569' }}
                      >
                        {f.label}
                        {b ? <span style={{ fontSize: '10px', fontWeight: 700, color: on ? 'var(--float-primary)' : '#fff', background: on ? '#fff' : '#135450', borderRadius: '9999px', padding: '0 6px', lineHeight: '16px' }}>{b}</span> : null}
                      </button>
                    )
                  })}
                </div>
                {sessionsFilter === 'action_plans' ? (
                  actionPlansContent
                ) : (
                  <>
                    {preSessionBriefContent}
                    {sessionNotesList}
                  </>
                )}
              </>
            )}

            {activeTab === 'plan' && (
              <>
                {treatmentPlanBuilder}
                {plan && (
                  <div style={{ marginTop: '8px' }}>
                    <ParentPlanPanel planId={plan.id} triggers={triggers ?? []} />
                  </div>
                )}
                <div id="patient-da-section">{patientDAContent}</div>
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
                        className="bg-transparent border-none cursor-pointer"
                        style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: on ? 'var(--float-primary)' : '#94a3b8', background: on ? '#eafaf6' : 'transparent' }}
                      >{pt.label}</button>
                    )
                  })}
                </div>
                <button onClick={() => setProcessPanelOpen(false)} aria-label="Close process panel" className="bg-transparent border-none cursor-pointer" style={{ fontSize: '18px', color: '#94a3b8', lineHeight: 1 }}>×</button>
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
                      <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>{SESSION_PREP_CONTENT[k].header}</div>
                      <ul style={{ margin: 0, paddingLeft: '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {SESSION_PREP_CONTENT[k].steps.map((s, i) => <li key={i} style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>{s}</li>)}
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
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#135450', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Extraction Results</div>
                <p style={{ fontSize: '12px', color: '#94a3b8', margin: '2px 0 18px' }}>Based on {monitoringForm?.entries_count ?? 0} monitoring entries</p>

                <div style={{ marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preliminary situations — editable</div>
                    {extraction.review_flag && (
                      <span style={{ fontSize: '11px', fontWeight: 600, color: '#b91c1c', background: '#fee2e2', borderRadius: '6px', padding: '2px 8px' }}>⚠ Review flag</span>
                    )}
                  </div>
                  <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
                    Preliminary AI output — edit, reclassify, or remove anything before adding to the plan.
                    <strong> unclear</strong> and <strong>escape</strong> behaviors are not added to the plan until you reclassify them.
                  </p>

                  {extraction.situations.map((sit, si) => (
                    <div key={si} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px' }}>
                      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' }}>
                        <input value={sit.name} onChange={e => editSituation(si, { name: e.target.value })} placeholder="Situation name" className="text-sm border border-slate-200 rounded" style={{ flex: 1, padding: '6px 8px', fontWeight: 500, minWidth: 0, boxSizing: 'border-box' }} />
                        <input type="number" min={1} max={10} value={sit.fear_rating ?? ''} onChange={e => editSituation(si, { fear_rating: e.target.value === '' ? null : (clampDt(e.target.value) ?? null) })} title="Fear rating (1–10)" placeholder="DT" className="text-sm border border-slate-200 rounded" style={{ width: '54px', padding: '6px 6px', textAlign: 'center', flexShrink: 0 }} />
                        <button onClick={() => removeSituation(si)} title="Remove situation" className="bg-transparent border-none cursor-pointer text-slate-400 hover:text-red-500" style={{ fontSize: '16px', padding: '0 4px', flexShrink: 0 }}>×</button>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {sit.behaviors.map((b, bi) => (
                          <div key={bi} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <select value={b.type} onChange={e => editBehavior(si, bi, { type: e.target.value as ExtractedBehaviorType })} className="text-xs border border-slate-200 rounded" style={{ padding: '5px 4px', flexShrink: 0, background: BEHAVIOR_TYPE_META[b.type].bg, color: BEHAVIOR_TYPE_META[b.type].color, fontWeight: 600 }}>
                              {(['avoidance', 'safety', 'escape', 'unclear'] as ExtractedBehaviorType[]).map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                            <input value={b.description} onChange={e => editBehavior(si, bi, { description: e.target.value })} placeholder="Behavior description" className="text-sm border border-slate-200 rounded" style={{ flex: 1, padding: '5px 8px', minWidth: 0, boxSizing: 'border-box' }} />
                            <button onClick={() => removeBehavior(si, bi)} title="Remove behavior" className="bg-transparent border-none cursor-pointer text-slate-400 hover:text-red-500" style={{ fontSize: '14px', padding: '0 2px', flexShrink: 0 }}>×</button>
                          </div>
                        ))}
                        <button onClick={() => addBehavior(si)} className="text-xs text-teal-600 font-medium bg-transparent border-none cursor-pointer" style={{ padding: '2px 0', textAlign: 'left' }}>+ Add behavior</button>
                      </div>

                      <div style={{ marginTop: '10px', borderTop: '1px dashed #e2e8f0', paddingTop: '8px' }}>
                        <div style={{ fontSize: '10px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Accommodations</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          {sit.accommodations.map((a, ai) => (
                            <div key={ai} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                              <input value={a.description} onChange={e => editAccommodation(si, ai, e.target.value)} placeholder="Accommodation" className="text-sm border border-slate-200 rounded" style={{ flex: 1, padding: '5px 8px', minWidth: 0, boxSizing: 'border-box' }} />
                              <button onClick={() => removeAccommodation(si, ai)} title="Remove accommodation" className="bg-transparent border-none cursor-pointer text-slate-400 hover:text-red-500" style={{ fontSize: '14px', padding: '0 2px', flexShrink: 0 }}>×</button>
                            </div>
                          ))}
                          <button onClick={() => addAccommodation(si)} className="text-xs text-teal-600 font-medium bg-transparent border-none cursor-pointer" style={{ padding: '2px 0', textAlign: 'left' }}>+ Add accommodation</button>
                        </div>
                      </div>
                    </div>
                  ))}

                  <button onClick={addSituation} className="text-xs text-teal-600 font-semibold bg-transparent border-none cursor-pointer" style={{ padding: '4px 0', textAlign: 'left' }}>+ Add situation</button>
                </div>

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

                {extractUnresolved.length > 0 && (
                  <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '10px 12px', marginBottom: '12px' }}>
                    <p style={{ fontSize: '12px', fontWeight: 600, color: '#92400e', margin: '0 0 6px' }}>Not added to the plan — reclassify these (escape/unclear), then re-add:</p>
                    <ul style={{ margin: 0, padding: '0 0 0 16px' }}>
                      {extractUnresolved.map((u, i) => <li key={i} style={{ fontSize: '12px', color: '#b45309' }}>{u}</li>)}
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
