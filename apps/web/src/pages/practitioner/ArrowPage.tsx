/**
 * Downward arrow — the second co-located (clinician + child) interview.
 *
 * Its own full-screen mode at `/patients/:patientId/arrow`, launched from the same place as
 * session mode (the Plan-tab builder header). It used to be a detour hanging off a situation
 * inside session mode; two interviews shouldn't be nested inside one another.
 *
 *   intro → pick a situation → follow the chain down → confirm the bottom → next situation
 *
 * Register comes from `sessionKit.tsx`, shared with session mode.
 *
 * ONE DELIBERATE DIFFERENCE from session mode: the chain stays on screen. Session mode collapses
 * its transcript because holding it there is just proving the data landed — but here, watching the
 * worry descend IS the therapeutic point (design record, round 4). Different rule, same reason:
 * show what the conversation needs, nothing else.
 *
 * The probe phrasing is the one live-AI call in either flow, and it stays confirm-first: the
 * clinician reads the question and can reword it before saying it aloud.
 */
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getTreatmentPlan,
  getTriggers,
  getSituationDownwardArrow,
  createSituationDownwardArrow,
  updateDownwardArrow,
  getNextProbe,
  type TriggerSituation,
  type ArrowStep,
} from '../../api/treatment'
import {
  dtOf, screenSurface, card, primaryBtn, ghostBtn, bigQ, lead, quietLink,
  Chrome, DTBadge, Context, Exchange, SayIt,
} from './sessionKit'

type Phase = 'intro' | 'pick' | 'chain'

// Used only when the probe call fails. Must stay in the consequence family — the old fallback
// ("what would that say about you?") was a meaning probe, the thing this chain is not.
const FALLBACK_PROBE = 'And then what will happen?'

export default function ArrowPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('intro')
  const [currentId, setCurrentId] = useState<string | null>(null)

  const { data: plan, isLoading: planLoading } = useQuery({
    queryKey: ['plan', patientId],
    queryFn: () => getTreatmentPlan(patientId!),
    enabled: !!patientId,
  })
  const { data: triggers } = useQuery({
    queryKey: ['triggers', plan?.id],
    queryFn: () => getTriggers(plan!.id),
    enabled: !!plan?.id,
  })

  const situations = [...(triggers ?? [])]
    .filter(t => !t.is_placeholder)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))

  const exit = () => navigate(`/patients/${patientId}?tab=plan`)
  const current = situations.find(t => t.id === currentId) ?? null

  if (planLoading) {
    return <Chrome onExit={exit}><div style={{ color: '#6b7a79', fontSize: 14, padding: 40, textAlign: 'center' }}>Loading…</div></Chrome>
  }
  if (!plan) {
    return (
      <Chrome onExit={exit}>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0d3d3a' }}>No treatment plan yet</div>
          <p style={{ fontSize: 13.5, color: '#6b7a79', marginTop: 8 }}>Create the plan from the patient page first.</p>
          <button onClick={exit} style={primaryBtn}>Back to patient</button>
        </div>
      </Chrome>
    )
  }

  return (
    <Chrome onExit={exit}>
      {phase === 'intro' && <ArrowIntro onStart={() => setPhase('pick')} />}

      {phase === 'pick' && (
        <PickPhase
          situations={situations}
          onOpen={(id) => { setCurrentId(id); setPhase('chain') }}
        />
      )}

      {phase === 'chain' && current && (
        <ChainPhase
          key={current.id}
          trigger={current}
          onBack={() => setPhase('pick')}
          onDone={() => setPhase('pick')}
        />
      )}
    </Chrome>
  )
}

// ── Opening ───────────────────────────────────────────────────
export function ArrowIntro({ onStart }: { onStart: () => void }) {
  return (
    <div style={screenSurface}>
      <div style={bigQ}>Downward Arrow</div>
      <p style={lead}>
        Let&rsquo;s dig into what you&rsquo;re afraid will happen when you can&rsquo;t avoid a situation.
      </p>
      <button onClick={onStart} style={primaryBtn}>Let&rsquo;s start →</button>
    </div>
  )
}

// ── Which one are we digging into ──────────────────────────────
export function PickPhase({ situations, onOpen }: { situations: TriggerSituation[]; onOpen: (id: string) => void }) {
  // Lowest distress at the top, same as the ladder. Unrated situations sit at the end rather than
  // being treated as a zero.
  const ordered = [...situations].sort((a, b) => {
    const x = dtOf(a.distress_thermometer_rating)
    const y = dtOf(b.distress_thermometer_rating)
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    return x - y
  })
  return (
    <div style={screenSurface}>
      <div style={bigQ}>Which situation should we look at?</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 16 }}>
        {ordered.map(t => <PickRow key={t.id} trigger={t} onOpen={onOpen} />)}
        {situations.length === 0 && (
          <div style={{ fontSize: 13, color: '#94a3b8' }}>No situations yet — add some in session mode first.</div>
        )}
      </div>
    </div>
  )
}

// A situation that already has a confirmed bottom shows it, so the pair can see at a glance
// what's been done without opening each one.
function PickRow({ trigger, onOpen }: { trigger: TriggerSituation; onOpen: (id: string) => void }) {
  const { data: arrow } = useQuery({
    queryKey: ['situation-da', trigger.id],
    queryFn: () => getSituationDownwardArrow(trigger.id),
  })
  return (
    <button onClick={() => onOpen(trigger.id)}
      style={{ display: 'block', textAlign: 'left', width: '100%', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 11, padding: '11px 13px', cursor: 'pointer' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', flex: 1, minWidth: 0 }}>{trigger.name}</span>
        <DTBadge v={dtOf(trigger.distress_thermometer_rating)} size={24} />
      </div>
      {arrow?.feared_outcome && (
        <div style={{ fontSize: 12.5, color: '#3f8a78', fontWeight: 600, marginTop: 5 }}>
          ♡ &ldquo;{arrow.feared_outcome}&rdquo;
        </div>
      )}
    </button>
  )
}

// ── The descent ────────────────────────────────────────────────
export function ChainPhase({ trigger, onBack, onDone }: { trigger: TriggerSituation; onBack: () => void; onDone: () => void }) {
  const qc = useQueryClient()
  const [arrowId, setArrowId] = useState<string | null>(null)
  const [startingThought, setStartingThought] = useState('')
  const [steps, setSteps] = useState<ArrowStep[]>([])
  const [probe, setProbe] = useState('')
  const [answer, setAnswer] = useState('')
  const [atBottom, setAtBottom] = useState(false)
  const [fearedDraft, setFearedDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const persist = async (thought: string, chain: ArrowStep[]) => {
    if (!arrowId) return
    await updateDownwardArrow(arrowId, {
      arrow_steps: [{ question: 'Starting thought', response: thought }, ...chain],
    })
    qc.invalidateQueries({ queryKey: ['situation-da', trigger.id] })
  }

  const askNext = async (thought: string, chain: ArrowStep[]) => {
    setBusy(true); setErr(null)
    try { setProbe(await getNextProbe(thought, chain)) }
    catch { setProbe(FALLBACK_PROBE) }   // confirm-first anyway — the clinician can reword it
    finally { setBusy(false) }
  }

  // Get-or-create this situation's arrow, and preload any chain already recorded so a revisit
  // continues the descent instead of silently starting over on top of it.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const arrow = await createSituationDownwardArrow(trigger.id, undefined, 'practitioner')
        if (cancelled) return
        setArrowId(arrow.id)
        if (arrow.arrow_steps.length > 0) {
          const thought = arrow.arrow_steps[0].response
          const rest = arrow.arrow_steps.slice(1)
          setStartingThought(thought)
          setSteps(rest)
          if (arrow.feared_outcome) { setFearedDraft(arrow.feared_outcome); setAtBottom(true) }
          else void askNext(thought, rest)
        }
      } catch { if (!cancelled) setErr('Could not open this one. Try again.') }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger.id])

  const begin = async (thought: string) => {
    setBusy(true)
    try { await persist(thought, []); setStartingThought(thought); await askNext(thought, []) }
    catch { setErr('Could not save that. Try again.') }
    finally { setBusy(false) }
  }

  const step = async (a: string) => {
    const chain = [...steps, { question: probe.trim(), response: a }]
    setSteps(chain); setAnswer('')
    try { await persist(startingThought, chain); await askNext(startingThought, chain) }
    catch { setErr('Could not save that step. Try again.') }
  }

  const reachedBottom = () => {
    setFearedDraft(steps.length ? steps[steps.length - 1].response : startingThought)
    setAtBottom(true)
  }

  const save = async () => {
    if (!arrowId || !fearedDraft.trim()) return
    setBusy(true)
    try {
      await updateDownwardArrow(arrowId, { feared_outcome: fearedDraft.trim(), is_approved: true })
      qc.invalidateQueries({ queryKey: ['situation-da', trigger.id] })
      onDone()
    } catch { setErr('Could not save. Try again.') }
    finally { setBusy(false) }
  }

  // The chain stays visible — unlike session mode's transcript, watching the descent is the point.
  const chain = (startingThought || steps.length > 0) && (
    <div style={{ position: 'relative', paddingLeft: 16, marginBottom: 18 }}>
      <div style={{ position: 'absolute', left: 3, top: 6, bottom: 6, width: 2, borderRadius: 2, background: 'linear-gradient(#9af6e4,#135450)' }} />
      {startingThought && <Exchange q="The worry" a={`“${startingThought}”`} />}
      {steps.map((s, i) => <Exchange key={i} q={s.question} a={`“${s.response}”`} />)}
    </div>
  )

  return (
    <div style={screenSurface}>
      <Context text={trigger.name} dt={dtOf(trigger.distress_thermometer_rating)} quiet />

      {err && (
        <div style={{ marginBottom: 14, background: '#fff4f2', border: '1px solid #f6c8bd', color: '#b3402a', borderRadius: 8, padding: '8px 11px', fontSize: 12.5 }}>{err}</div>
      )}

      {chain}

      {/* Bedrock — confirmed by the clinician, never by the model. */}
      {atBottom ? (
        <div>
          <div style={{ background: '#0d3d3a', borderRadius: 14, padding: '15px 17px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.06em', color: '#7fd8c5', textTransform: 'uppercase', marginBottom: 7 }}>♡ the worry underneath</div>
            <textarea value={fearedDraft} onChange={e => setFearedDraft(e.target.value)} rows={2}
              style={{ width: '100%', border: 'none', outline: 'none', fontSize: 16.5, fontWeight: 800, color: '#fff', background: 'none', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={() => setAtBottom(false)} style={{ ...ghostBtn, marginTop: 0 }}>← Keep going</button>
            <button onClick={save} disabled={!fearedDraft.trim() || busy} style={{ ...primaryBtn, marginTop: 0, opacity: !fearedDraft.trim() ? 0.4 : 1 }}>That&rsquo;s it — save →</button>
          </div>
        </div>
      ) : !startingThought ? (
        <div>
          <div style={{ ...bigQ, marginBottom: 12 }}>In this situation, what are you worried is going to happen?</div>
          <SayIt value={answer} onChange={setAnswer} onSend={() => { const a = answer.trim(); setAnswer(''); void begin(a) }}
            placeholder="e.g. everyone will laugh if I get it wrong" pending={busy} />
        </div>
      ) : (
        <div>
          {/* The probe is a question, not a field: it reads as the question and is editable in
              place, so the clinician can reword it before saying it aloud without a panel of
              machinery explaining that they can. */}
          <textarea value={probe} onChange={e => setProbe(e.target.value)} rows={2}
            style={{ ...bigQ, width: '100%', border: 'none', outline: 'none', resize: 'none', fontFamily: 'inherit', background: 'none', padding: 0, marginBottom: 10 }} />
          <SayIt value={answer} onChange={setAnswer} onSend={() => void step(answer.trim())}
            placeholder="What they said…" pending={busy} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 16 }}>
            <button onClick={reachedBottom} disabled={busy} style={{ ...ghostBtn, marginTop: 0 }}>That&rsquo;s the bottom ✓</button>
            {busy && <span style={{ fontSize: 12, color: '#b6c3c1' }}>thinking…</span>}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 20, paddingTop: 14, borderTop: '1px solid #eef2f1' }}>
        <button onClick={onBack} style={quietLink}>← All situations</button>
      </div>
    </div>
  )
}
