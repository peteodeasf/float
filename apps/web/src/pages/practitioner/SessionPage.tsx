/**
 * Session mode — the warm, co-located (clinician + child) interactive capture flow.
 *
 * Design + decisions: docs/plans/interactive-capture-session-mode.md
 * Flow (this file):   docs/plans/session-situation-screen-focus.md
 *
 * This is a full-screen route (`/patients/:patientId/session`) launched from the Plan tab.
 * It writes into the SAME situations/behaviors/downward-arrow data the clinician builder reads,
 * via the existing `api/treatment.ts` functions — no new ladder endpoints.
 *
 * The flow mirrors the interview Dr. Walker actually runs, one question per screen:
 *
 *   intro
 *     → list      "What do you have trouble with?"      (starter list + add your own)
 *     → rate      "How big does this one feel?"          (one situation at a time)
 *     → situation per situation, in turn:
 *                   "Do you stay away from this if you can?"   → yes ⇒ an avoidance behaviour
 *                                                                 scored AT the situation's own DT
 *                   "When you're in it, what do you do?"        → name one
 *                   "How hard would it be … without that?"      → score that one
 *                   "What else do you do?"                      → loop
 *     → review    the assembled ladder
 *
 *   arrow (the downward arrow) hangs off a situation and is reachable at any point.
 *
 * Naming and scoring ALTERNATE per behaviour — you finish talking about one thing before
 * starting the next. Batching all the naming then all the scoring reads as a form, not a
 * conversation, and was the thing that made the previous version feel like a wall.
 */
import { useState, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
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
  searchSituationLibrary,
  getSituationDownwardArrow,
  createSituationDownwardArrow,
  updateDownwardArrow,
  getNextProbe,
  type TriggerSituation,
  type ArrowStep,
} from '../../api/treatment'

type Phase = 'intro' | 'list' | 'rate' | 'situation' | 'arrow' | 'review'

// Fear scores are a fixed 1–10 scale (see docs/solutions — enforced backend + here).
const clampDt = (n: number) => Math.min(10, Math.max(1, Math.round(n)))
const dtColor = (v: number | null | undefined) =>
  v == null ? '#cbd5e1' : v >= 7 ? '#ef6b53' : v >= 4 ? '#f2a33f' : '#4bb98a'
const dtOf = (v: number | string | null | undefined) => (v != null ? Number(v) : null)
const article = (n: number) => (n === 8 ? 'an' : 'a')

// ── styles ──────────────────────────────────────────────────────
const screenSurface: CSSProperties = { background: 'linear-gradient(180deg,#f2fbf8,#ffffff 55%)', border: '1px solid #d7ebe5', borderRadius: 16, padding: '22px 24px' }
const card: CSSProperties = { background: '#fff', border: '1px solid #dde8e6', borderRadius: 18, padding: 22, boxShadow: '0 8px 24px rgba(13,61,58,.06)' }
const primaryBtn: CSSProperties = { marginTop: 14, background: '#135450', color: '#fff', fontWeight: 800, fontSize: 14, border: 'none', borderRadius: 12, padding: '11px 22px', cursor: 'pointer' }
const ghostBtn: CSSProperties = { ...primaryBtn, background: '#fff', color: '#135450', border: '1.5px solid #135450' }
const bigQ: CSSProperties = { fontSize: 20, fontWeight: 800, color: '#0d3d3a', lineHeight: 1.3 }
const lead: CSSProperties = { fontSize: 14, color: '#4b5a59', lineHeight: 1.5, marginTop: 6 }
const eyebrow: CSSProperties = { fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: '.04em', marginBottom: 4 }
const quietLink: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }

// Module scope, deliberately: defined inside the page it would get a new identity every render,
// and React would remount the whole tree — losing step state and input focus mid-session.
function Chrome({ onExit, children }: { onExit: () => void; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--teen-canvas, #eef4f3)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 20px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={onExit}
            style={{ fontSize: 13, fontWeight: 700, color: '#6b7a79', background: '#fff', border: '1px solid #dbe8e5', borderRadius: 999, padding: '7px 14px', cursor: 'pointer' }}>
            ← Exit session
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// Shared 1–10 fear scale — tappable, colour-graded. The one scoring object in the flow.
function FearScale({ value, onPick, height = 44 }: { value: number | null; onPick: (n: number) => void; height?: number }) {
  return (
    <div>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginTop: 5 }}>
        <span style={{ color: '#2f9e6f' }}>1 · no big deal</span><span style={{ color: '#ef6b53' }}>10 · the worst</span>
      </div>
    </div>
  )
}

const DTBadge = ({ v }: { v: number | null }) => (
  v == null ? null : (
    <span style={{ minWidth: 26, height: 26, padding: '0 8px', borderRadius: 999, color: '#fff', fontWeight: 800, fontSize: 13, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: dtColor(v), flexShrink: 0 }}>{v}</span>
  )
)

export default function SessionPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<Phase>('intro')
  const [currentTriggerId, setCurrentTriggerId] = useState<string | null>(null)
  const [rateIdx, setRateIdx] = useState(0)

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

  // Session mode is launched from the Plan tab, so it hands the clinician back to it.
  const exit = () => navigate(`/patients/${patientId}?tab=plan`)

  // Walking the situations in order is the spine of the interview — finishing one moves to the
  // next rather than dropping back to a menu, which is what makes it feel like a conversation.
  const openSituation = (id: string) => { setCurrentTriggerId(id); setPhase('situation') }
  const nextSituation = () => {
    const i = sortedTriggers.findIndex(t => t.id === currentTriggerId)
    const next = sortedTriggers[i + 1]
    if (next) openSituation(next.id)
    else setPhase('review')
  }

  if (planLoading) {
    return <Chrome onExit={exit}><div style={{ color: '#6b7a79', fontSize: 14, padding: 40, textAlign: 'center' }}>Loading…</div></Chrome>
  }
  if (!plan) {
    return (
      <Chrome onExit={exit}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0d3d3a' }}>No treatment plan yet</div>
          <p style={{ fontSize: 13.5, color: '#6b7a79', marginTop: 8 }}>Create the plan from the patient page first, then start a session.</p>
          <button onClick={exit} style={primaryBtn}>Back to patient</button>
        </div>
      </Chrome>
    )
  }

  const currentTrigger = sortedTriggers.find(t => t.id === currentTriggerId) ?? null
  const sitIndex = sortedTriggers.findIndex(t => t.id === currentTriggerId)

  return (
    <Chrome onExit={exit}>
      {phase === 'intro' && <IntroPhase onStart={() => setPhase('list')} />}

      {phase === 'list' && (
        <ListPhase
          triggers={sortedTriggers}
          planId={plan.id}
          onDone={() => { setRateIdx(0); setPhase('rate') }}
          onOpen={openSituation}
        />
      )}

      {phase === 'rate' && (
        <RatePhase
          planId={plan.id}
          triggers={sortedTriggers}
          index={rateIdx}
          onIndex={setRateIdx}
          onBack={() => setPhase('list')}
          onDone={() => {
            const first = sortedTriggers[0]
            if (first) openSituation(first.id)
            else setPhase('list')
          }}
        />
      )}

      {phase === 'situation' && currentTrigger && (
        <SituationPhase
          key={currentTrigger.id}
          trigger={currentTrigger}
          isLast={sitIndex === sortedTriggers.length - 1}
          onOpenArrow={() => setPhase('arrow')}
          onSeeAll={() => setPhase('list')}
          onFinished={nextSituation}
        />
      )}

      {phase === 'arrow' && currentTrigger && (
        <ArrowPhase
          trigger={currentTrigger}
          onDone={() => setPhase('situation')}
          onBack={() => setPhase('situation')}
        />
      )}

      {phase === 'review' && (
        <ReviewPhase triggers={sortedTriggers} onBack={() => setPhase('list')} onOpenBuilder={exit} />
      )}
    </Chrome>
  )
}

// ── Phase: intro ───────────────────────────────────────────────
export function IntroPhase({ onStart }: { onStart: () => void }) {
  return (
    <div style={screenSurface}>
      <div style={bigQ}>Let&rsquo;s map out together the situations that feel hard.</div>
      <p style={lead}>
        One thing at a time: what&rsquo;s hard, how big it feels, and what you do about it.
        Nothing here is set in stone — we can change any of it as we go.
      </p>
      <button onClick={onStart} style={primaryBtn}>Let&rsquo;s start →</button>
    </div>
  )
}

// ── Phase: list — "What do you have trouble with?" ─────────────
// Recognition beats recall for an anxious child, so the shared library is offered as a starter
// list to react to rather than a blank field. Doubles as the map back into any situation.
export function ListPhase({ triggers, planId, onDone, onOpen }: {
  triggers: TriggerSituation[]
  planId: string
  onDone: () => void
  onOpen: (id: string) => void
}) {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')

  const { data: starters } = useQuery({
    queryKey: ['situation-library', ''],
    queryFn: () => searchSituationLibrary(''),
  })

  const addMut = useMutation({
    mutationFn: (name: string) => createTrigger(planId, { name }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['triggers', planId] }); setNewName('') },
  })

  const taken = new Set(triggers.map(t => t.name.trim().toLowerCase()))
  const suggestions = (starters ?? []).filter(s => !taken.has(s.name.trim().toLowerCase())).slice(0, 8)

  return (
    <div style={screenSurface}>
      <div style={bigQ}>What do you have trouble with?</div>
      <p style={lead}>Tap anything that sounds like you — and add your own.</p>

      {triggers.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12.5, color: '#9aa9a8', marginBottom: 7 }}>Yours so far — tap one to talk about it</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {triggers.map(t => (
              <button key={t.id} onClick={() => onOpen(t.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 11, padding: '11px 13px', cursor: 'pointer' }}>
                <span style={{ fontSize: 13.5, fontWeight: 600, color: '#1e293b', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                <DTBadge v={dtOf(t.distress_thermometer_rating)} />
              </button>
            ))}
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12.5, color: '#9aa9a8', marginBottom: 7 }}>Other kids often say these — tap any that fit</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
            {suggestions.map(s => (
              <button key={s.id} onClick={() => addMut.mutate(s.name)} disabled={addMut.isPending}
                style={{ fontSize: 13, fontWeight: 600, color: '#135450', background: '#fff', border: '1px solid #cfe0db', borderRadius: 999, padding: '8px 14px', cursor: 'pointer' }}>
                + {s.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <input value={newName} onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) addMut.mutate(newName.trim()) }}
          placeholder="Something else that’s hard…"
          style={{ flex: 1, border: '1.5px solid #cfe0db', borderRadius: 11, padding: '11px 13px', fontSize: 14, minWidth: 0 }} />
        <button onClick={() => addMut.mutate(newName.trim())} disabled={!newName.trim() || addMut.isPending}
          style={{ ...primaryBtn, marginTop: 0, opacity: !newName.trim() ? 0.4 : 1 }}>Add</button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18 }}>
        <button onClick={onDone} disabled={triggers.length === 0}
          style={{ ...primaryBtn, marginTop: 0, opacity: triggers.length === 0 ? 0.4 : 1 }}>
          That&rsquo;s my list →
        </button>
        {triggers.length === 0 && <span style={{ fontSize: 12.5, color: '#94a3b8' }}>Add at least one to keep going.</span>}
      </div>
    </div>
  )
}

// ── Phase: rate — the DT pass over the list, one situation per screen ──
// Situations often arrive already rated (monitoring extraction, or the builder). Those show their
// existing score pre-selected: this is a confirm-or-change pass, not a re-interrogation.
export function RatePhase({ planId, triggers, index, onIndex, onBack, onDone }: {
  planId: string
  triggers: TriggerSituation[]
  index: number
  onIndex: (i: number) => void
  onBack: () => void
  onDone: () => void
}) {
  const qc = useQueryClient()
  const dtMut = useMutation({
    mutationFn: (v: { id: string; dt: number }) => updateTrigger(planId, v.id, { distress_thermometer_rating: v.dt }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['triggers', planId] }),
  })

  const i = Math.min(index, Math.max(0, triggers.length - 1))
  const t = triggers[i]
  if (!t) return null
  const advance = () => { if (i + 1 >= triggers.length) onDone(); else onIndex(i + 1) }

  const left = triggers.length - i - 1
  return (
    <div style={screenSurface}>
      {i === 0 && <p style={{ ...lead, marginTop: 0, marginBottom: 14 }}>Now let&rsquo;s see how big each one feels.</p>}
      <div style={{ ...bigQ, marginBottom: 4 }}>{t.name}</div>
      <p style={{ fontSize: 14, color: '#4b5a59', marginTop: 0, marginBottom: 14 }}>How big does this one feel?</p>
      <FearScale value={dtOf(t.distress_thermometer_rating)} onPick={n => { dtMut.mutate({ id: t.id, dt: clampDt(n) }); advance() }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 18 }}>
        {i > 0
          ? <button onClick={() => onIndex(i - 1)} style={quietLink}>← Back</button>
          : <button onClick={onBack} style={quietLink}>← Back to the list</button>}
        <button onClick={advance} style={quietLink}>Skip this one</button>
        <span style={{ fontSize: 12, color: '#b6c3c1', marginLeft: 'auto' }}>
          {left === 0 ? 'last one' : `${left} more after this`}
        </span>
      </div>
    </div>
  )
}

// ── The transcript: what's already been said, quiet and above the live question ──
// This is the difference between a conversation and a form. Answers accumulate as spoken lines
// rather than as rows in a table, and tapping one reopens it — so there are no edit affordances
// (× buttons, "score it" links) cluttering the child-facing surface.
function Exchange({ q, a, onReopen }: { q: string; a: string; onReopen?: () => void }) {
  // One line per exchange, question and answer together — a spoken record, not stacked form rows.
  // Compactness matters: five behaviours is ten exchanges, and the live question has to stay
  // on screen underneath them.
  return (
    <button onClick={onReopen} disabled={!onReopen}
      style={{ display: 'flex', alignItems: 'baseline', gap: 8, width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '5px 0', cursor: onReopen ? 'pointer' : 'default', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, color: '#a8b6b4', flexShrink: 0 }}>{q}</span>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: '#3d5451' }}>{a}</span>
    </button>
  )
}

// The live question. One per screen, and the only loud thing on it.
function Ask({ children }: { children: ReactNode }) {
  return <div style={{ ...bigQ, marginTop: 4, marginBottom: 12 }}>{children}</div>
}

// A text answer: Enter sends it. The submit control is a quiet arrow, not an "Add" button —
// a labelled button beside a field reads as data entry.
function SayIt({ value, onChange, onSend, placeholder, pending }: {
  value: string; onChange: (v: string) => void; onSend: () => void; placeholder: string; pending?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input autoFocus value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && value.trim()) onSend() }}
        placeholder={placeholder}
        style={{ flex: 1, border: '1.5px solid #cfe0db', borderRadius: 12, padding: '12px 14px', fontSize: 14.5, minWidth: 0, background: '#fff' }} />
      <button onClick={onSend} disabled={!value.trim() || pending} aria-label="Send"
        style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, border: 'none', background: '#135450', color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer', opacity: !value.trim() ? 0.35 : 1 }}>→</button>
    </div>
  )
}

// ── Phase: one situation — the interview, one question at a time ──
// Order is Dr. Walker's: do you avoid it → what do you do → how hard without that → what else.
// Naming and scoring ALTERNATE, so a thing is finished before the next one starts, and each
// question is phrased off the back of the last answer rather than read from a script.
type SitStep = 'avoid' | 'name' | 'score'

export function SituationPhase({ trigger, isLast, onOpenArrow, onSeeAll, onFinished }: {
  trigger: TriggerSituation
  isLast: boolean
  onOpenArrow: () => void
  onSeeAll: () => void
  onFinished: () => void
}) {
  const qc = useQueryClient()
  const [step, setStep] = useState<SitStep>('avoid')
  const [scoringId, setScoringId] = useState<string | null>(null)
  const [newBeh, setNewBeh] = useState('')
  const [avoidAnswer, setAvoidAnswer] = useState<'yes' | 'no' | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const initRef = useRef(false)

  const { data: behaviors } = useQuery({
    queryKey: ['behaviors', trigger.id],
    queryFn: () => getBehaviors(trigger.id),
  })
  const { data: situationDA } = useQuery({
    queryKey: ['situation-da', trigger.id],
    queryFn: () => getSituationDownwardArrow(trigger.id),
  })

  const captured = (behaviors ?? []).filter(b => !b.parent_behavior_id)
  const situationDt = dtOf(trigger.distress_thermometer_rating)
  const avoidName = `Avoids ${trigger.name}`
  const avoidBeh = captured.find(b => b.name === avoidName) ?? null
  const others = captured.filter(b => b.id !== avoidBeh?.id)

  // Asked once. Nothing persists a "no", so on re-entry the signal is whether anything was
  // captured — a started situation resumes at "what else", it doesn't start the interview again.
  useEffect(() => {
    if (initRef.current || !behaviors) return
    initRef.current = true
    if (captured.length === 0) { setStep('avoid') }
    else { setAvoidAnswer(avoidBeh ? 'yes' : null); setStep('name') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [behaviors])

  const invalidate = () => qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] })

  // "I stay away from it" IS the avoidance behaviour. Dr. Walker's rule: its score is the
  // situation's own DT — being in the situation without avoiding it just is the situation. A
  // clinical rule, sourced from her (see the plan). With no situation DT there is nothing to
  // infer from, so it falls through to the normal question instead of guessing.
  //
  // The inference is NOT explained on screen. The record reads "8 out of 10", not
  // "8 out of 10 — same as the situation": how the number was arrived at is our internal logic,
  // and narrating it to a child is the app talking about itself.
  const avoidYesMut = useMutation({
    mutationFn: () => createBehavior(trigger.id, {
      name: avoidName,
      behavior_type: 'avoidance',
      ...(situationDt != null ? { distress_thermometer_when_refraining: situationDt } : {}),
    }),
    onSuccess: (created) => {
      invalidate()
      setAvoidAnswer('yes')
      if (situationDt != null) setStep('name')
      else { setScoringId(created.id); setStep('score') }
    },
  })

  const addMut = useMutation({
    mutationFn: (name: string) => createBehavior(trigger.id, { name, behavior_type: 'safety' }),
    onSuccess: (created) => { invalidate(); setNewBeh(''); setScoringId(created.id); setStep('score') },
  })

  const scoreMut = useMutation({
    mutationFn: (v: { id: string; dt: number }) => updateBehavior(trigger.id, v.id, { distress_thermometer_when_refraining: v.dt }),
    onSuccess: () => invalidate(),
  })

  const scoring = captured.find(b => b.id === scoringId) ?? null
  const answerCount = (avoidAnswer ? 1 : 0) + others.length

  // The conversation so far, in the order it happened.
  const transcript = (
    <>
      {avoidAnswer && (
        <Exchange
          q="Do you stay away from this if you can?"
          a={avoidAnswer === 'yes' ? 'Yes — I skip it when I can' : 'No — I get through it'}
        />
      )}
      {avoidAnswer === 'yes' && avoidBeh && dtOf(avoidBeh.distress_thermometer_when_refraining) != null && (
        <Exchange
          q="So how hard is it to be in it at all?"
          a={`${dtOf(avoidBeh.distress_thermometer_when_refraining)} out of 10`}
          onReopen={() => { setScoringId(avoidBeh.id); setStep('score') }}
        />
      )}
      {others.map((b, i) => {
        const sc = dtOf(b.distress_thermometer_when_refraining)
        const beingAsked = step === 'score' && b.id === scoringId
        return (
          <div key={b.id}>
            <Exchange q={i === 0 ? 'When you’re in it, what do you do?' : 'What else do you do?'} a={b.name} />
            {beingAsked ? null : sc != null
              ? <Exchange q="And how hard without doing that?" a={`${sc} out of 10`} onReopen={() => { setScoringId(b.id); setStep('score') }} />
              : <Exchange q="And how hard without doing that?" a="— we skipped this one" onReopen={() => { setScoringId(b.id); setStep('score') }} />}
          </div>
        )
      })}
    </>
  )

  // Each question is phrased off the last answer — "when you can't skip it" only makes sense
  // after a yes, and that adaptivity is most of what makes this read as a conversation.
  const nameQuestion = others.length > 0
    ? 'What else do you do?'
    : avoidAnswer === 'yes'
      ? 'And when you can’t skip it — what do you do?'
      : 'When you’re in it, what do you do?'

  return (
    <div style={screenSurface}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 14, borderBottom: '1px solid #e6f0ed', marginBottom: 16 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0d3d3a', flex: 1, minWidth: 0 }}>{trigger.name}</div>
        {situationDt != null && <span style={{ fontSize: 12, fontWeight: 700, color: '#8a9998' }}>feels like {article(situationDt)} {situationDt}</span>}
      </div>

      {showTranscript && answerCount > 0 && (
        <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: '1px dashed #dbe8e5' }}>{transcript}</div>
      )}

      {step === 'avoid' && (
        <div>
          <Ask>Do you stay away from this if you can?</Ask>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => avoidYesMut.mutate()} disabled={avoidYesMut.isPending} style={{ ...primaryBtn, marginTop: 0 }}>Yes — I skip it</button>
            <button onClick={() => { setAvoidAnswer('no'); setStep('name') }} style={{ ...ghostBtn, marginTop: 0 }}>No — I get through it</button>
          </div>
        </div>
      )}

      {step === 'name' && (
        <div>
          <Ask>{nameQuestion}</Ask>
          {others.length === 0 && <p style={{ ...lead, marginTop: -6, marginBottom: 12 }}>Anything that makes it easier to get through.</p>}
          <SayIt value={newBeh} onChange={setNewBeh} onSend={() => addMut.mutate(newBeh.trim())}
            placeholder="e.g. ask a friend to answer for me" pending={addMut.isPending} />
          <div style={{ marginTop: 16 }}>
            <button onClick={onFinished} style={{ ...ghostBtn, marginTop: 0 }}>
              {others.length === 0 && !avoidAnswer ? 'Nothing comes to mind' : isLast ? 'That’s everything — see the ladder →' : 'That’s everything →'}
            </button>
          </div>
        </div>
      )}

      {step === 'score' && scoring && (
        <div>
          <Ask>
            {scoring.id === avoidBeh?.id
              ? 'How hard would it be to be in it at all?'
              : <>How hard would it be to be in it — <span style={{ color: '#135450' }}>without doing that</span>?</>}
          </Ask>
          {/* Their own words, quoted back — says which one we mean without a form label, and
              keeps it unambiguous when an earlier answer is reopened. */}
          {scoring.id !== avoidBeh?.id && (
            <p style={{ fontSize: 14, color: '#3d5451', fontWeight: 600, margin: '-6px 0 14px' }}>&ldquo;{scoring.name}&rdquo;</p>
          )}
          <FearScale value={dtOf(scoring.distress_thermometer_when_refraining)}
            onPick={n => { scoreMut.mutate({ id: scoring.id, dt: clampDt(n) }); setScoringId(null); setStep('name') }} />
          <div style={{ marginTop: 16 }}>
            <button onClick={() => { setScoringId(null); setStep('name') }} style={quietLink}>Skip this one</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 20, paddingTop: 14, borderTop: '1px solid #eef2f1' }}>
        {answerCount > 0 && (
          <button onClick={() => setShowTranscript(v => !v)} style={quietLink}>
            {showTranscript ? 'Hide what we said' : `${answerCount} answer${answerCount === 1 ? '' : 's'} so far ›`}
          </button>
        )}
        <button onClick={onSeeAll} style={{ ...quietLink, marginLeft: 'auto' }}>← All situations</button>
        <button onClick={onOpenArrow} style={{ ...quietLink, color: '#3f8a78', fontWeight: 700 }}>
          {situationDA?.feared_outcome ? 'The worry underneath ›' : 'Downward arrow ›'}
        </button>
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
