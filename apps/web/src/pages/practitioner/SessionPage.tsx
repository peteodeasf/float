/**
 * Session mode — the warm, co-located (clinician + child) interactive capture flow.
 *
 * Design + decisions: docs/plans/interactive-capture-session-mode.md
 * Implementation plan:  docs/plans/interactive-capture-implementation.md
 *
 * This is a full-screen route (`/patients/:patientId/session`) launched from the Plan tab.
 * It writes into the SAME situations/behaviors/downward-arrow data the clinician builder reads,
 * via the existing `api/treatment.ts` functions — no new ladder endpoints.
 *
 * Phase machine (like the teen pages' Phase/Step pattern):
 *   intro → arrow → hub ⇄ situation → review → done
 *
 * STATUS: foundation. intro + hub + situation are wired to real endpoints (deterministic, no AI).
 * arrow + review are stubs pending the backend `core_belief` column + next-probe endpoint and a
 * couple of owner answers (see the implementation plan's "Open questions").
 */
import { useState, useEffect, type CSSProperties, type ReactNode } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTreatmentPlan,
  getTriggers,
  getBehaviors,
  createTrigger,
  updateTrigger,
  createBehavior,
  updateBehavior,
  deleteBehavior,
  getSituationDownwardArrow,
  createSituationDownwardArrow,
  updateDownwardArrow,
  getNextProbe,
  type TriggerSituation,
  type ArrowStep,
} from '../../api/treatment'

type Phase = 'intro' | 'arrow' | 'hub' | 'situation' | 'review' | 'done'

// Fear scores are a fixed 1–10 scale (see docs/solutions — enforced backend + here).
const clampDt = (n: number) => Math.min(10, Math.max(1, Math.round(n)))
const dtColor = (v: number | null | undefined) =>
  v == null ? '#cbd5e1' : v >= 7 ? '#ef6b53' : v >= 4 ? '#f2a33f' : '#4bb98a'

const BEHAVIOR_TYPES = [
  { key: 'avoidance', label: 'Avoidance' },
  { key: 'safety', label: 'Safety' },
  { key: 'ritual', label: 'Ritual' },
] as const

export default function SessionPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('intro')
  const [currentTriggerId, setCurrentTriggerId] = useState<string | null>(null)

  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['plan', patientId],
    queryFn: () => getTreatmentPlan(patientId!),
    enabled: !!patientId,
  })
  const planId = plan?.id ?? null

  const { data: triggers } = useQuery({
    queryKey: ['triggers', planId],
    queryFn: () => getTriggers(planId!),
    enabled: !!planId,
  })

  const sortedTriggers = [...(triggers ?? [])].sort(
    (a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)
  )

  const exit = () => navigate(`/patients/${patientId}`)

  // ── shared chrome ─────────────────────────────────────────────
  const Chrome = ({ children }: { children: ReactNode }) => (
    <div style={{ minHeight: '100vh', background: 'var(--teen-canvas, #eef4f3)', padding: '0' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 20px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={exit}
            style={{ fontSize: 13, fontWeight: 700, color: '#6b7a79', background: '#fff', border: '1px solid #dbe8e5', borderRadius: 999, padding: '7px 14px', cursor: 'pointer' }}>
            ← Exit session
          </button>
        </div>
        {children}
      </div>
    </div>
  )

  if (planLoading) {
    return <Chrome><div style={{ color: '#6b7a79', fontSize: 14, padding: 40, textAlign: 'center' }}>Loading…</div></Chrome>
  }
  if (!plan) {
    return (
      <Chrome>
        <div style={{ background: '#fff', border: '1px solid #dde8e6', borderRadius: 16, padding: 28, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0d3d3a' }}>No treatment plan yet</div>
          <p style={{ fontSize: 13.5, color: '#6b7a79', marginTop: 8 }}>Create the plan from the patient page first, then start a session.</p>
          <button onClick={exit} style={primaryBtn}>Back to patient</button>
        </div>
      </Chrome>
    )
  }

  return (
    <Chrome>
      {phase === 'intro' && <IntroPhase onStart={() => setPhase('hub')} />}
      {phase === 'arrow' && currentTriggerId && (
        <ArrowPhase
          trigger={sortedTriggers.find(t => t.id === currentTriggerId) ?? null}
          onDone={() => setPhase('situation')}
          onBack={() => setPhase('situation')}
        />
      )}
      {phase === 'hub' && (
        <HubPhase
          triggers={sortedTriggers}
          planId={plan.id}
          onOpen={(id) => { setCurrentTriggerId(id); setPhase('situation') }}
          onReview={() => setPhase('review')}
          onCreated={(id) => { setCurrentTriggerId(id); setPhase('situation') }}
        />
      )}
      {phase === 'situation' && currentTriggerId && (
        <SituationPhase
          planId={plan.id}
          trigger={sortedTriggers.find(t => t.id === currentTriggerId) ?? null}
          onOpenArrow={() => setPhase('arrow')}
          onBack={() => setPhase('hub')}
        />
      )}
      {phase === 'review' && <ReviewPhase triggers={sortedTriggers} onBack={() => setPhase('hub')} onOpenBuilder={exit} />}
    </Chrome>
  )
}

// ── styles ──────────────────────────────────────────────────────
const card: CSSProperties = { background: '#fff', border: '1px solid #dde8e6', borderRadius: 18, padding: 22, boxShadow: '0 8px 24px rgba(13,61,58,.06)' }
const screenSurface: CSSProperties = { background: 'linear-gradient(180deg,#f2fbf8,#ffffff 55%)', border: '1px solid #d7ebe5', borderRadius: 16, padding: '22px 24px' }
const primaryBtn: CSSProperties = { marginTop: 14, background: '#135450', color: '#fff', fontWeight: 800, fontSize: 14, border: 'none', borderRadius: 12, padding: '11px 22px', cursor: 'pointer' }
const bigQ: CSSProperties = { fontSize: 20, fontWeight: 800, color: '#0d3d3a', lineHeight: 1.3 }
const lead: CSSProperties = { fontSize: 14, color: '#4b5a59', lineHeight: 1.5, marginTop: 6 }

// Shared 1–10 fear scale — tappable, colour-graded. Used for the situation and per behaviour.
function FearScale({ value, onPick, height = 40 }: { value: number | null; onPick: (n: number) => void; height?: number }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
        const active = value === n
        return (
          <button key={n} onClick={() => onPick(n)}
            style={{ flex: 1, height, borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: height >= 38 ? 13.5 : 12,
              border: active ? '2px solid #0d3d3a' : '1px solid #e2e8f0',
              background: active ? dtColor(n) : '#fff',
              color: active ? '#fff' : '#94a3b8' }}>
            {n}
          </button>
        )
      })}
    </div>
  )
}

// ── Phase: intro ───────────────────────────────────────────────
function IntroPhase({ onStart }: { onStart: () => void }) {
  return (
    <div style={screenSurface}>
      <div style={bigQ}>Let’s map out what feels hard — together.</div>
      <p style={lead}>
        We’ll go through the situations that feel hard — for each one, what you do about it, how hard
        it’d be without that, and the worry underneath. No rush — we can change anything as we go.
      </p>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button onClick={onStart} style={primaryBtn}>Let’s start →</button>
      </div>
    </div>
  )
}

// ── Phase: downward arrow — descending chain with AI-phrased probes (confirm-first) ──
// Tied to a SITUATION: persists into that situation's `downward_arrows` row, matching the existing
// PatientDownwardArrows editor (arrow_steps = {question, response}[], starting thought = step 0),
// with the confirmed bottom stored as `feared_outcome` (is_approved) — the feared outcome *for this
// situation*. The chain stays visible; the clinician (not the AI) decides when it's reached bottom.
const FALLBACK_PROBE = 'If that were true, what would that say about you?'

function ArrowPhase({ trigger, onDone, onBack }: { trigger: TriggerSituation | null; onDone: () => void; onBack: () => void }) {
  const qc = useQueryClient()
  const [arrowId, setArrowId] = useState<string | null>(null)
  const [stage, setStage] = useState<'start' | 'probe' | 'bottom'>('start')
  const [startingThought, setStartingThought] = useState('')
  const [probeSteps, setProbeSteps] = useState<ArrowStep[]>([])
  const [currentProbe, setCurrentProbe] = useState('')
  const [answer, setAnswer] = useState('')
  const [fearedDraft, setFearedDraft] = useState('')
  const [busy, setBusy] = useState(false)   // network in flight (create / probe / save)
  const [err, setErr] = useState<string | null>(null)

  const persistChain = async (thought: string, steps: ArrowStep[]) => {
    if (!arrowId) return
    const arrow_steps: ArrowStep[] = [{ question: 'Starting thought', response: thought }, ...steps]
    await updateDownwardArrow(arrowId, { arrow_steps })
    qc.invalidateQueries({ queryKey: ['situation-da', trigger?.id] })
  }

  const requestProbe = async (thought: string, steps: ArrowStep[]) => {
    setBusy(true); setErr(null)
    try {
      setCurrentProbe(await getNextProbe(thought, steps))
    } catch {
      setCurrentProbe(FALLBACK_PROBE)  // confirm-first: clinician can reword anyway
    } finally { setBusy(false) }
  }

  const beginChain = async () => {
    const t = startingThought.trim()
    if (!t) return
    setBusy(true)
    try { await persistChain(t, []); setStage('probe'); await requestProbe(t, []) }
    catch { setErr('Could not save. Try again.') } finally { setBusy(false) }
  }

  const nextStep = async () => {
    const q = currentProbe.trim(); const a = answer.trim()
    if (!a) return
    const steps = [...probeSteps, { question: q, response: a }]
    setProbeSteps(steps); setAnswer('')
    try { await persistChain(startingThought, steps); await requestProbe(startingThought, steps) }
    catch { setErr('Could not save that step. Try again.') }
  }

  const reachedBottom = async () => {
    let steps = probeSteps
    const a = answer.trim()
    if (a) { steps = [...probeSteps, { question: currentProbe.trim(), response: a }]; setProbeSteps(steps); setAnswer(''); try { await persistChain(startingThought, steps) } catch { /* keep draft */ } }
    setFearedDraft(steps.length ? steps[steps.length - 1].response : startingThought)
    setStage('bottom')
  }

  const confirmBottom = async () => {
    if (!arrowId || !fearedDraft.trim()) return
    setBusy(true)
    try {
      await updateDownwardArrow(arrowId, { feared_outcome: fearedDraft.trim(), is_approved: true })
      qc.invalidateQueries({ queryKey: ['situation-da', trigger?.id] })
      onDone()
    } catch { setErr('Could not save. Try again.') } finally { setBusy(false) }
  }

  // Get-or-create this situation's arrow on entry; preload any existing chain so we never
  // silently overwrite a prior arrow. (Q2: we start fresh, but never destroy existing data.)
  useEffect(() => {
    if (!trigger) return
    let cancelled = false
    ;(async () => {
      try {
        const arrow = await createSituationDownwardArrow(trigger.id, undefined, 'practitioner')
        if (cancelled) return
        setArrowId(arrow.id)
        if (arrow.arrow_steps.length > 0) {
          const thought = arrow.arrow_steps[0].response
          const steps = arrow.arrow_steps.slice(1)
          setStartingThought(thought)
          setProbeSteps(steps)
          setFearedDraft(arrow.feared_outcome ?? '')
          if (arrow.feared_outcome) { setStage('bottom') }
          else { setStage('probe'); void requestProbe(thought, steps) }
        }
      } catch { if (!cancelled) setErr('Could not start the downward arrow. Try again.') }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger?.id])

  if (!trigger) return null

  // ── render ──
  const chain = (
    <div style={{ marginTop: 14, borderLeft: '3px solid', borderImage: 'linear-gradient(#9af6e4,#0d3d3a) 1', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {startingThought && <div style={{ background: '#fff', border: '1px solid #dbeae5', borderRadius: 10, padding: '10px 13px', fontSize: 13.5, color: '#1e293b', fontWeight: 600 }}>“{startingThought}”</div>}
      {probeSteps.map((s, i) => (
        <div key={i}>
          <div style={{ fontSize: 12, color: '#8a9998', fontStyle: 'italic', margin: '2px 0 4px' }}>↓ {s.question}</div>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 13px', fontSize: 13.5, color: '#1e293b', fontWeight: 600 }}>“{s.response}”</div>
        </div>
      ))}
    </div>
  )

  return (
    <div style={screenSurface}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: '.04em', marginBottom: 2 }}>WORRY UNDERNEATH · {trigger.name}</div>
      <div style={bigQ}>Let’s follow this worry down to what it’s really about.</div>
      {err && <div style={{ marginTop: 10, background: '#fff4f2', border: '1px solid #f6c8bd', color: '#b3402a', borderRadius: 8, padding: '8px 11px', fontSize: 12.5 }}>{err}</div>}

      {stage === 'start' && (
        <div style={{ marginTop: 14 }}>
          <p style={lead}>What’s a worry we can start with? (In the child’s own words.)</p>
          <textarea value={startingThought} onChange={e => setStartingThought(e.target.value)} rows={2}
            placeholder="e.g. Everyone will laugh if I get a question wrong"
            style={{ width: '100%', marginTop: 8, border: '1.5px solid #cfe0db', borderRadius: 11, padding: '11px 13px', fontSize: 14, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }} />
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <button onClick={onBack} style={{ ...primaryBtn, background: '#fff', color: '#135450', border: '1.5px solid #135450' }}>← Back</button>
            <button onClick={beginChain} disabled={!startingThought.trim() || busy} style={{ ...primaryBtn, opacity: !startingThought.trim() ? 0.4 : 1 }}>Follow it down →</button>
          </div>
        </div>
      )}

      {stage === 'probe' && (
        <div style={{ marginTop: 6 }}>
          {chain}
          <div style={{ marginTop: 14, background: '#fff', border: '1.5px solid #135450', borderRadius: 14, padding: '13px 15px', boxShadow: '0 4px 14px rgba(19,84,80,.08)' }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, color: '#94a3b8', letterSpacing: '.05em', marginBottom: 6 }}>NEXT QUESTION {busy && '· thinking…'} <span style={{ color: '#c7d2d0', fontWeight: 600 }}>· edit before you ask it aloud</span></div>
            <textarea value={currentProbe} onChange={e => setCurrentProbe(e.target.value)} rows={2}
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: 15, fontWeight: 700, color: '#0d3d3a', resize: 'vertical', fontFamily: 'inherit', background: 'none' }} />
            <input value={answer} onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void nextStep() } }}
              placeholder="Type the child’s answer…"
              style={{ width: '100%', marginTop: 8, border: '1px solid #cfe0db', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, boxSizing: 'border-box' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={nextStep} disabled={!answer.trim() || busy} style={{ ...primaryBtn, opacity: !answer.trim() ? 0.4 : 1 }}>Next ↓</button>
            <button onClick={reachedBottom} disabled={busy} style={{ ...primaryBtn, background: '#0d3d3a' }}>This is the bottom ✓</button>
            <button onClick={onBack} style={{ fontSize: 12.5, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', marginTop: 14 }}>Exit arrow</button>
          </div>
        </div>
      )}

      {stage === 'bottom' && (
        <div style={{ marginTop: 6 }}>
          {chain}
          <div style={{ marginTop: 14, background: '#0d3d3a', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: '#7fd8c5', textTransform: 'uppercase', marginBottom: 6 }}>♡ the worry underneath · edit if needed</div>
            <textarea value={fearedDraft} onChange={e => setFearedDraft(e.target.value)} rows={2}
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: 16, fontWeight: 800, color: '#fff', background: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <p style={{ fontSize: 12, color: '#8a9998', marginTop: 10 }}>This is the feared outcome for “{trigger.name}”.</p>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button onClick={() => setStage('probe')} style={{ ...primaryBtn, background: '#fff', color: '#135450', border: '1.5px solid #135450' }}>← Keep going</button>
            <button onClick={confirmBottom} disabled={!fearedDraft.trim() || busy} style={{ ...primaryBtn, opacity: !fearedDraft.trim() ? 0.4 : 1 }}>That’s it — save →</button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Phase: hub — the set of situations ─────────────────────────
function HubPhase({ triggers, planId, onOpen, onReview, onCreated }: {
  triggers: TriggerSituation[]
  planId: string
  onOpen: (id: string) => void
  onReview: () => void
  onCreated: (id: string) => void
}) {
  const qc = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [newName, setNewName] = useState('')

  const addMut = useMutation({
    mutationFn: () => createTrigger(planId, { name: newName.trim() }),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ['triggers', planId] })
      setAdding(false); setNewName('')
      onCreated(created.id)
    },
  })

  const capturedCount = triggers.filter(t => t.distress_thermometer_rating != null).length

  return (
    <div style={screenSurface}>
      <div style={bigQ}>The things that feel hard</div>
      <p style={lead}>Tap one to go through it — or add something we’re missing. We’ll look at the whole ladder at the end.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 16 }}>
        {triggers.map(t => {
          const done = t.distress_thermometer_rating != null
          return (
            <button key={t.id} onClick={() => onOpen(t.id)}
              style={{ width: 'calc(50% - 5px)', display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: done ? '#135450' : '#f1f5f4', color: done ? '#fff' : '#b6c3c1', border: done ? 'none' : '1px solid #dbe8e5' }}>{done ? '✓' : ''}</span>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: '#1e293b', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
              {done && (
                <span style={{ minWidth: 24, height: 24, padding: '0 7px', borderRadius: 999, color: '#fff', fontWeight: 800, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: dtColor(t.distress_thermometer_rating) }}>
                  {Number(t.distress_thermometer_rating)}
                </span>
              )}
            </button>
          )
        })}

        {adding ? (
          <div style={{ width: '100%', display: 'flex', gap: 8, marginTop: 2 }}>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && newName.trim() && addMut.mutate()}
              placeholder="Name a situation that feels hard…"
              style={{ flex: 1, border: '1.5px solid #cfe0db', borderRadius: 11, padding: '11px 13px', fontSize: 14 }} />
            <button onClick={() => addMut.mutate()} disabled={!newName.trim() || addMut.isPending} style={{ ...primaryBtn, marginTop: 0, opacity: !newName.trim() ? 0.4 : 1 }}>Add</button>
            <button onClick={() => { setAdding(false); setNewName('') }} style={{ fontSize: 13, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setAdding(true)}
            style={{ width: 'calc(50% - 5px)', border: '1.5px dashed #cfe0db', borderRadius: 12, padding: '12px 14px', color: '#3f8a78', fontWeight: 700, fontSize: 13, background: 'none', cursor: 'pointer' }}>
            ＋ Add your own
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', marginTop: 16 }}>
        <span style={{ fontSize: 12, color: '#8a9998', fontWeight: 700 }}>
          <b style={{ color: '#135450' }}>{capturedCount} of {triggers.length}</b> have a fear score
        </span>
        <button onClick={onReview} style={{ ...primaryBtn, marginTop: 0, marginLeft: 'auto' }}>See the ladder →</button>
      </div>
    </div>
  )
}

// ── Phase: one situation — fear + behaviors on one screen ──────
function SituationPhase({ planId, trigger, onOpenArrow, onBack }: { planId: string; trigger: TriggerSituation | null; onOpenArrow: () => void; onBack: () => void }) {
  const qc = useQueryClient()
  const [newBeh, setNewBeh] = useState('')
  const [newBehType, setNewBehType] = useState<string>('avoidance')

  const { data: behaviors } = useQuery({
    queryKey: ['behaviors', trigger?.id],
    queryFn: () => getBehaviors(trigger!.id),
    enabled: !!trigger,
  })
  const { data: situationDA } = useQuery({
    queryKey: ['situation-da', trigger?.id],
    queryFn: () => getSituationDownwardArrow(trigger!.id),
    enabled: !!trigger,
  })

  const dtMut = useMutation({
    mutationFn: (dt: number) => updateTrigger(planId, trigger!.id, { distress_thermometer_rating: dt }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['triggers', planId] }),
  })
  const addBehMut = useMutation({
    mutationFn: () => createBehavior(trigger!.id, { name: newBeh.trim(), behavior_type: newBehType }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['behaviors', trigger!.id] }); setNewBeh('') },
  })
  const typeMut = useMutation({
    mutationFn: (v: { id: string; behavior_type: string }) => updateBehavior(trigger!.id, v.id, { behavior_type: v.behavior_type }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['behaviors', trigger!.id] }),
  })
  // Per-behaviour fear score = how hard the situation would be WITHOUT using this behaviour.
  const scoreMut = useMutation({
    mutationFn: (v: { id: string; dt: number }) => updateBehavior(trigger!.id, v.id, { distress_thermometer_when_refraining: v.dt }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['behaviors', trigger!.id] }),
  })
  const delMut = useMutation({
    mutationFn: (id: string) => deleteBehavior(trigger!.id, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['behaviors', trigger!.id] }),
  })

  if (!trigger) return null
  const topBehaviors = (behaviors ?? []).filter(b => !b.parent_behavior_id)
  const currentDt = trigger.distress_thermometer_rating != null ? Number(trigger.distress_thermometer_rating) : null

  return (
    <div style={screenSurface}>
      <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: '.04em', marginBottom: 2 }}>SITUATION</div>
      <div style={bigQ}>{trigger.name}</div>

      {/* the worry underneath this situation — the downward arrow, tied to this situation */}
      <div style={{ marginTop: 14, background: situationDA?.feared_outcome ? '#0d3d3a' : '#fff', border: situationDA?.feared_outcome ? 'none' : '1px solid #e2e8f0', borderRadius: 12, padding: '12px 14px' }}>
        {situationDA?.feared_outcome ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: '#7fd8c5', textTransform: 'uppercase', marginBottom: 3 }}>♡ the worry underneath</div>
              <div style={{ fontSize: 14.5, fontWeight: 800, color: '#fff' }}>“{situationDA.feared_outcome}”</div>
            </div>
            <button onClick={onOpenArrow} style={{ fontSize: 12, fontWeight: 700, color: '#9af6e4', background: 'none', border: 'none', cursor: 'pointer', flexShrink: 0 }}>Revisit ›</button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#0d3d3a' }}>What’s the worry underneath this?</div>
              <div style={{ fontSize: 12, color: '#8a9998', marginTop: 2 }}>Follow it down to the feared outcome for this situation.</div>
            </div>
            <button onClick={onOpenArrow} style={{ ...primaryBtn, marginTop: 0 }}>Downward arrow →</button>
          </div>
        )}
      </div>

      {/* situation-level fear — tappable 1–10 */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0d3d3a', marginBottom: 8 }}>How nervous does this situation make you overall? <span style={{ color: '#4b5a59', fontWeight: 600 }}>— tap a number</span></div>
        <FearScale value={currentDt} onPick={n => dtMut.mutate(clampDt(n))} />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginTop: 5 }}>
          <span style={{ color: '#2f9e6f' }}>1 · no big deal</span><span style={{ color: '#ef6b53' }}>10 · super scary</span>
        </div>
      </div>

      {/* behaviors — each scored: how hard the situation would be WITHOUT this behaviour */}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0d3d3a', marginBottom: 9 }}>What do you do so it feels safer — or so you can skip it? <span style={{ color: '#4b5a59', fontWeight: 600 }}>— add each, then score it</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {topBehaviors.map(b => {
            const bScore = b.distress_thermometer_when_refraining != null ? Number(b.distress_thermometer_when_refraining) : null
            return (
              <div key={b.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 11, padding: '10px 13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, background: '#135450', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: 13.5, color: '#1e293b', fontWeight: 600, flex: 1, minWidth: 0 }}>{b.name}</span>
                  {/* clinician-only: behaviour type tag */}
                  <select value={b.behavior_type} onChange={e => typeMut.mutate({ id: b.id, behavior_type: e.target.value })}
                    title="Clinician: behaviour type"
                    style={{ fontSize: 10.5, fontWeight: 800, border: '1px solid #e4efeb', borderRadius: 6, padding: '3px 6px', color: '#5b6b82', background: '#f8fafc', cursor: 'pointer' }}>
                    {BEHAVIOR_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                  <button onClick={() => delMut.mutate(b.id)} title="Remove" style={{ color: '#c7d2d0', fontWeight: 800, fontSize: 15, background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                </div>
                <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px dashed #eef2f1' }}>
                  <div style={{ fontSize: 11.5, fontWeight: 700, color: '#4b5a59', marginBottom: 6 }}>
                    Without doing this, how hard would the situation be?
                    {bScore == null && <span style={{ color: '#ef6b53', fontWeight: 800 }}> · tap to score</span>}
                  </div>
                  <FearScale value={bScore} onPick={n => scoreMut.mutate({ id: b.id, dt: clampDt(n) })} height={30} />
                </div>
              </div>
            )
          })}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1.5px dashed #cfe0db', borderRadius: 11, padding: '8px 10px' }}>
            <input value={newBeh} onChange={e => setNewBeh(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && newBeh.trim() && addBehMut.mutate()}
              placeholder="Add another thing you do…"
              style={{ flex: 1, border: 'none', outline: 'none', fontSize: 13.5, background: 'none' }} />
            <select value={newBehType} onChange={e => setNewBehType(e.target.value)}
              style={{ fontSize: 10.5, fontWeight: 800, border: '1px solid #e4efeb', borderRadius: 6, padding: '4px 6px', color: '#5b6b82', background: '#fff', cursor: 'pointer' }}>
              {BEHAVIOR_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <button onClick={() => addBehMut.mutate()} disabled={!newBeh.trim() || addBehMut.isPending}
              style={{ fontSize: 12, fontWeight: 800, color: '#fff', background: '#135450', border: 'none', borderRadius: 8, padding: '7px 12px', cursor: 'pointer', opacity: !newBeh.trim() ? 0.4 : 1 }}>Add</button>
          </div>
        </div>
        <div style={{ fontSize: 11, color: '#9aa9a8', marginTop: 10 }}><b style={{ color: '#8a9998' }}>Clinician-only:</b> the type dropdown (avoidance / safety / ritual) is yours — the child just names what they do.</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 18 }}>
        <button onClick={onBack} style={primaryBtn}>Done — back to the list →</button>
      </div>
    </div>
  )
}

// ── Phase: ladder review — read-styled ladder that hands off to the full builder (Q4) ──
function ReviewPhase({ triggers, onBack, onOpenBuilder }: { triggers: TriggerSituation[]; onBack: () => void; onOpenBuilder: () => void }) {
  const rungs = [...triggers]
    .filter(t => t.distress_thermometer_rating != null)
    .sort((a, b) => Number(b.distress_thermometer_rating) - Number(a.distress_thermometer_rating))
  return (
    <div style={screenSurface}>
      <div style={bigQ}>Here’s your whole ladder</div>
      <p style={lead}>Biggest at the top, smallest at the bottom. Open the full builder to reorder, set the focus rung, and fine-tune the steps.</p>
      <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rungs.map(t => (
          <div key={t.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px' }}>
            <span style={{ fontSize: 14, color: '#1e293b', fontWeight: 600, flex: 1 }}>{t.name}</span>
            <span style={{ minWidth: 26, height: 26, padding: '0 7px', borderRadius: 999, color: '#fff', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', background: dtColor(t.distress_thermometer_rating) }}>{Number(t.distress_thermometer_rating)}</span>
          </div>
        ))}
        {rungs.length === 0 && <div style={{ fontSize: 13, color: '#94a3b8' }}>No fear scores captured yet.</div>}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button onClick={onBack} style={{ ...primaryBtn, background: '#fff', color: '#135450', border: '1.5px solid #135450' }}>← Back to situations</button>
        <button onClick={onOpenBuilder} style={primaryBtn}>Open the full builder →</button>
      </div>
    </div>
  )
}
