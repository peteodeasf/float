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
import { useState, type CSSProperties, type ReactNode } from 'react'
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
  type TriggerSituation,
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
  // The core belief that anchors the ladder — produced by the downward arrow (Phase `arrow`).
  // Backed by `treatment_plans.core_belief` once the additive migration lands; optional until then.
  const coreBelief = (plan as { core_belief?: string | null } | undefined)?.core_belief ?? null

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
          {coreBelief && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #dbeae5', borderRadius: 999, padding: '5px 12px', fontSize: 11.5, color: '#5b6b6a' }}>
              <span style={{ color: '#0d3d3a' }}>♡ core worry</span> ·
              <b style={{ color: '#0d3d3a', fontStyle: 'italic', fontWeight: 700 }}>“{coreBelief}”</b>
            </span>
          )}
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
      {phase === 'intro' && <IntroPhase coreBelief={coreBelief} onStartArrow={() => setPhase('arrow')} onSkipToLadder={() => setPhase('hub')} />}
      {phase === 'arrow' && <ArrowStub onDone={() => setPhase('hub')} onBack={() => setPhase('intro')} />}
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
          onBack={() => setPhase('hub')}
        />
      )}
      {phase === 'review' && <ReviewStub triggers={sortedTriggers} onBack={() => setPhase('hub')} onOpenBuilder={exit} />}
    </Chrome>
  )
}

// ── styles ──────────────────────────────────────────────────────
const card: CSSProperties = { background: '#fff', border: '1px solid #dde8e6', borderRadius: 18, padding: 22, boxShadow: '0 8px 24px rgba(13,61,58,.06)' }
const screenSurface: CSSProperties = { background: 'linear-gradient(180deg,#f2fbf8,#ffffff 55%)', border: '1px solid #d7ebe5', borderRadius: 16, padding: '22px 24px' }
const primaryBtn: CSSProperties = { marginTop: 14, background: '#135450', color: '#fff', fontWeight: 800, fontSize: 14, border: 'none', borderRadius: 12, padding: '11px 22px', cursor: 'pointer' }
const bigQ: CSSProperties = { fontSize: 20, fontWeight: 800, color: '#0d3d3a', lineHeight: 1.3 }
const lead: CSSProperties = { fontSize: 14, color: '#4b5a59', lineHeight: 1.5, marginTop: 6 }

// ── Phase: intro ───────────────────────────────────────────────
function IntroPhase({ coreBelief, onStartArrow, onSkipToLadder }: { coreBelief: string | null; onStartArrow: () => void; onSkipToLadder: () => void }) {
  return (
    <div style={screenSurface}>
      <div style={bigQ}>Let’s map out what feels hard — together.</div>
      <p style={lead}>
        We’ll start by following one worry down to what it’s really about, then go through the
        situations and what you do about them. No rush — we can change anything as we go.
      </p>
      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <button onClick={onStartArrow} style={primaryBtn}>Start with the worry underneath →</button>
        <button onClick={onSkipToLadder} style={{ ...primaryBtn, background: '#fff', color: '#135450', border: '1.5px solid #135450' }}>Go straight to situations</button>
      </div>
      {coreBelief && <p style={{ fontSize: 12, color: '#8a9998', marginTop: 12 }}>Core worry already captured: “{coreBelief}”.</p>}
    </div>
  )
}

// ── Phase: downward arrow (STUB — needs core_belief column + next-probe endpoint) ──
function ArrowStub({ onDone, onBack }: { onDone: () => void; onBack: () => void }) {
  return (
    <div style={screenSurface}>
      <div style={bigQ}>Downward arrow</div>
      <p style={lead}>
        Coming next: the guided descending-chain capture with AI-phrased probes (confirm-first). This
        phase needs the backend <code>core_belief</code> column and the next-probe endpoint before it’s wired.
      </p>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        <button onClick={onBack} style={{ ...primaryBtn, background: '#fff', color: '#135450', border: '1.5px solid #135450' }}>← Back</button>
        <button onClick={onDone} style={primaryBtn}>Skip to situations →</button>
      </div>
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
function SituationPhase({ planId, trigger, onBack }: { planId: string; trigger: TriggerSituation | null; onBack: () => void }) {
  const qc = useQueryClient()
  const [newBeh, setNewBeh] = useState('')
  const [newBehType, setNewBehType] = useState<string>('avoidance')

  const { data: behaviors } = useQuery({
    queryKey: ['behaviors', trigger?.id],
    queryFn: () => getBehaviors(trigger!.id),
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

      {/* fear meter — tappable 1–10, colour-graded */}
      <div style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0d3d3a', marginBottom: 8 }}>How nervous does it make you? <span style={{ color: '#4b5a59', fontWeight: 600 }}>— tap a number</span></div>
        <div style={{ display: 'flex', gap: 5 }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
            const active = currentDt === n
            return (
              <button key={n} onClick={() => dtMut.mutate(clampDt(n))}
                style={{ flex: 1, height: 40, borderRadius: 9, cursor: 'pointer', fontWeight: 800, fontSize: 13.5,
                  border: active ? '2px solid #0d3d3a' : '1px solid #e2e8f0',
                  background: active ? dtColor(n) : '#fff',
                  color: active ? '#fff' : '#94a3b8' }}>
                {n}
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginTop: 5 }}>
          <span style={{ color: '#2f9e6f' }}>1 · no big deal</span><span style={{ color: '#ef6b53' }}>10 · super scary</span>
        </div>
      </div>

      {/* behaviors */}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#0d3d3a', marginBottom: 9 }}>What do you do so it feels safer — or so you can skip it? <span style={{ color: '#4b5a59', fontWeight: 600 }}>— add the things you do</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {topBehaviors.map(b => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 11, padding: '10px 13px' }}>
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
          ))}
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

// ── Phase: ladder review (STUB — reuse builder aesthetic; owner Q4) ──
function ReviewStub({ triggers, onBack, onOpenBuilder }: { triggers: TriggerSituation[]; onBack: () => void; onOpenBuilder: () => void }) {
  const rungs = [...triggers]
    .filter(t => t.distress_thermometer_rating != null)
    .sort((a, b) => Number(b.distress_thermometer_rating) - Number(a.distress_thermometer_rating))
  return (
    <div style={screenSurface}>
      <div style={bigQ}>Here’s the ladder so far</div>
      <p style={lead}>Biggest at the top, smallest at the bottom. (Full review — reorder, focus, behaviours — reuses the builder view; wiring pending owner Q4.)</p>
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
