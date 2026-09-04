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
 * The downward arrow is NOT part of this flow — it is its own mode (`ArrowPage`), launched from
 * the same place as session mode. Two interviews, one register (see `sessionKit.tsx`).
 *
 * Naming and scoring ALTERNATE per behaviour — you finish talking about one thing before
 * starting the next. Batching all the naming then all the scoring reads as a form, not a
 * conversation, and was the thing that made the previous version feel like a wall.
 */
import { useState, useEffect, useRef } from 'react'
import { BEHAVIOR_TYPE_SCENARIO, getNextSchoolDayISO } from './patient/shared'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTreatmentPlan,
  getTriggers,
  getBehaviors,
  getPlanRungs,
  updatePlanRung,
  deletePlanRung,
  planExperimentForBehavior,
  createTrigger,
  updateTrigger,
  createBehavior,
  updateBehavior,
  deleteBehavior,
  searchSituationLibrary,
  type TriggerSituation,
  type AvoidanceBehavior,
} from '../../api/treatment'
import {
  clampDt, dtOf, screenSurface, card, primaryBtn, ghostBtn, bigQ, lead, quietLink,
  Chrome, FearScale, DTBadge, Context, Exchange, Ask, SayIt, SessionProgress,
} from './sessionKit'

type Phase = 'intro' | 'list' | 'rate' | 'situation' | 'review'

/** The full-screen route. A thin wrapper — the interview itself is the component below, so the
 *  Plan tab can render exactly the same thing without the clinician chrome around it. */
export default function SessionPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()
  return (
    <SessionInterview
      patientId={patientId!}
      onExit={() => navigate(`/patients/${patientId}?tab=plan`)}
    />
  )
}

/**
 * The interview.
 *
 * `embedded` drops the full-screen shell so this can be the Plan tab's primary view (Peter,
 * 2026-09-01). Same component, same state either way — the full-screen button is a presentation,
 * not a different screen, so nobody loses their place switching.
 */
export function SessionInterview({ patientId, embedded = false, onExit }: {
  patientId: string
  embedded?: boolean
  onExit: () => void
}) {
  const goToArrow = useNavigate()
  const [phase, setPhase] = useState<Phase>('intro')
  const [currentTriggerId, setCurrentTriggerId] = useState<string | null>(null)
  const [rateIdx, setRateIdx] = useState(0)
  // The situations queued for this pass. Re-entering session mode is almost always "I want to add
  // one more", so the walk covers what's new rather than marching through work already done.
  const [walkIds, setWalkIds] = useState<string[]>([])
  const bootRef = useRef(false)

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

  // Just for the count on the orientation strip — "the ladder so far" is a number the pair can
  // see without leaving the question they are on.
  const { data: planRungs } = useQuery({
    queryKey: ['plan-rungs', planId],
    queryFn: () => getPlanRungs(planId!),
    enabled: !!planId,
  })
  const rungCount = (planRungs ?? []).length

  // Lowest distress first, everywhere a situation list appears (the ladder, the arrow's pick
  // list, and here). Unrated situations sit at the end rather than counting as a zero.
  const sortedTriggers = [...(triggers ?? [])]
    .filter(t => !t.is_placeholder)
    .sort((a, b) => {
      const x = dtOf(a.distress_thermometer_rating)
      const y = dtOf(b.distress_thermometer_rating)
      if (x == null && y == null) return (a.display_order ?? 0) - (b.display_order ?? 0)
      if (x == null) return 1
      if (y == null) return -1
      return x - y
    })

  const exit = onExit

  // "Let's walk through the situations that feel hard" is an opening line, not something to say to
  // someone who already has a list. Coming back in, start at the list.
  useEffect(() => {
    if (bootRef.current || !triggers) return
    bootRef.current = true
    if (sortedTriggers.length > 0) setPhase('list')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggers])

  // Only situations that have never been rated. Re-asking for a score that is already set — and
  // showing it pre-selected — leaves the pair staring at a number with nothing to do.
  const unrated = sortedTriggers.filter(t => dtOf(t.distress_thermometer_rating) == null)

  // Walking in order is the spine of the interview — finishing one moves to the next rather than
  // dropping back to a menu. The order comes from walkIds, so the walk is over this pass's work.
  const openSituation = (id: string) => { setCurrentTriggerId(id); setPhase('situation') }
  const startWalk = (ids: string[]) => {
    setWalkIds(ids)
    if (ids.length > 0) openSituation(ids[0])
    else setPhase('review')
  }
  const nextSituation = () => {
    const i = walkIds.indexOf(currentTriggerId ?? '')
    const next = i >= 0 ? walkIds[i + 1] : undefined
    if (next) openSituation(next)
    else setPhase('review')
  }

  // Leaving the list: rate whatever is unrated, then walk exactly those. With nothing unrated
  // there is no new work, so the ladder is the useful place to land.
  const leaveList = () => {
    if (unrated.length > 0) { setWalkIds(unrated.map(t => t.id)); setRateIdx(0); setPhase('rate') }
    else setPhase('review')
  }

  // Full screen for when the child is looking; plain for the Plan tab, which brings its own
  // header and nav.
  const Shell = ({ children }: { children: React.ReactNode }) =>
    embedded ? <div style={{ padding: '4px 0 8px' }}>{children}</div> : <Chrome onExit={exit}>{children}</Chrome>

  if (planLoading) {
    return <Shell><div style={{ color: '#6b7a79', fontSize: 14, padding: 40, textAlign: 'center' }}>Loading…</div></Shell>
  }
  if (!plan) {
    return (
      <Shell>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0d3d3a' }}>No treatment plan yet</div>
          <p style={{ fontSize: 13.5, color: '#6b7a79', marginTop: 8 }}>Create the plan from the patient page first, then start a session.</p>
          <button onClick={exit} style={primaryBtn}>Back to patient</button>
        </div>
      </Shell>
    )
  }

  const currentTrigger = sortedTriggers.find(t => t.id === currentTriggerId) ?? null

  // Which stage the orientation strip should show. `intro` has nothing to orient in — it is one
  // sentence and a button — so the strip stays off until there is a process to be inside.
  const stage =
    phase === 'rate' ? 'rate' as const
    : phase === 'situation' ? 'build' as const
    : phase === 'review' ? 'ladder' as const
    : 'list' as const

  return (
    <Shell>
      {phase !== 'intro' && (
        <SessionProgress
          stage={stage}
          situationIndex={currentTriggerId ? walkIds.indexOf(currentTriggerId) : undefined}
          situationCount={walkIds.length}
          rungCount={rungCount}
          onSeeLadder={() => setPhase('review')}
        />
      )}

      {phase === 'intro' && <IntroPhase onStart={() => setPhase('list')} />}

      {phase === 'list' && (
        <ListPhase
          triggers={sortedTriggers}
          planId={plan.id}
          onDone={leaveList}
          onOpen={(id) => startWalk([id])}
        />
      )}

      {phase === 'rate' && (
        <RatePhase
          planId={plan.id}
          triggers={sortedTriggers.filter(t => walkIds.includes(t.id))}
          index={rateIdx}
          onIndex={setRateIdx}
          onBack={() => setPhase('list')}
          onDone={() => startWalk(walkIds)}
        />
      )}

      {phase === 'situation' && currentTrigger && (
        <SituationPhase
          key={currentTrigger.id}
          trigger={currentTrigger}
          isLast={walkIds.indexOf(currentTrigger.id) === walkIds.length - 1}
          onSeeAll={() => setPhase('list')}
          onFinished={nextSituation}
          onArrow={() => goToArrow(`/patients/${patientId}/arrow?situation=${currentTrigger.id}`)}
        />
      )}

      {phase === 'review' && (
        <ReviewPhase planId={plan.id} triggers={sortedTriggers} onBack={() => setPhase('list')} onOpenBuilder={exit} />
      )}
    </Shell>
  )
}

// ── Phase: intro ───────────────────────────────────────────────
export function IntroPhase({ onStart }: { onStart: () => void }) {
  return (
    <div style={screenSurface}>
      <div style={bigQ}>Let&rsquo;s walk through the situations that feel hard.</div>
      <p style={lead}>
        We&rsquo;ll look at the situations that feel hard and what happens when you&rsquo;re in them.
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
      <div style={bigQ}>What situations do you have trouble with?</div>
      <p style={lead}>Add your own situations. Or select from common ones.</p>

      {triggers.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12.5, color: '#9aa9a8', marginBottom: 7 }}>Once you add a situation, tap on it to review what happens in that situation.</div>
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
      {/* Same context treatment as the situation screens — this is the thing being rated. No badge:
          the scale below is the answer. */}
      <Context text={t.name} />
      <div style={{ ...bigQ, marginBottom: 14 }}>How big does this one feel?</div>
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

// ── Phase: one situation — the interview, one question at a time ──
// Order is Dr. Walker's: do you avoid it → what do you do → how hard without that → what else.
// Naming and scoring ALTERNATE, so a thing is finished before the next one starts, and each
// question is phrased off the back of the last answer rather than read from a script.
// The interview per situation, in order:
//   avoid    — do you stay away from it? Context, not a ladder step.
//   smaller  — "what's a smaller version of this?" THIS is what makes a rung.
//   score    — how hard would that one be?
//   safety   — what do you do so it feels safer? A list on the situation, to be stopped before
//              the exposures. Not a rung. (Dr. Walker: "All safety behaviours … need to be
//              stopped before doing these exposures".)
type SitStep = 'avoid' | 'smaller' | 'score' | 'safety'

export function SituationPhase({ trigger, isLast, onSeeAll, onFinished, onArrow }: {
  trigger: TriggerSituation
  isLast: boolean
  onSeeAll: () => void
  onFinished: () => void
  onArrow: () => void
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

  const captured = (behaviors ?? []).filter(b => !b.parent_behavior_id)
  const situationDt = dtOf(trigger.distress_thermometer_rating)
  const avoidName = `Avoids ${trigger.name}`
  const avoidBeh = captured.find(b => b.name === avoidName) ?? null
  // The two kinds of answer this interview produces, and they are not the same thing. A rung is a
  // smaller version of the situation and goes on the ladder. A safety behaviour is something to
  // stop before doing the exposures, and belongs to the situation.
  const rungs = captured.filter(b => b.behavior_type === BEHAVIOR_TYPE_SCENARIO)
  // Not a rung, and not an observation either. "Complained of stomach pain" came out of monitoring
  // extraction and is not an answer to "what do you do so it feels safer?" — listing it as one
  // puts words in the child's mouth.
  const safeties = captured.filter(
    b =>
      b.id !== avoidBeh?.id &&
      b.behavior_type !== BEHAVIOR_TYPE_SCENARIO &&
      b.behavior_type !== 'observation'
  )

  // Asked once. Nothing persists a "no", so on re-entry the signal is whether anything was
  // captured — a started situation resumes at "what else", it doesn't start the interview again.
  useEffect(() => {
    if (initRef.current || !behaviors) return
    initRef.current = true
    if (captured.length === 0) { setStep('avoid') }
    else { setAvoidAnswer(avoidBeh ? 'yes' : null); setStep('smaller') }
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
    onSuccess: () => {
      invalidate()
      setAvoidAnswer('yes')
      // Straight to the question that builds the ladder. Avoiding the whole thing is not a rung —
      // it is what the situation IS.
      setStep('smaller')
    },
  })

  /** A smaller version of the situation. This is what a ladder rung is. */
  const addRungMut = useMutation({
    mutationFn: (name: string) =>
      createBehavior(trigger.id, { name, behavior_type: BEHAVIOR_TYPE_SCENARIO }),
    onSuccess: (created) => { invalidate(); setNewBeh(''); setScoringId(created.id); setStep('score') },
  })

  /** Something they do so it feels safer. Belongs to the situation, never to the ladder — it is
   *  what has to STOP before the exposures, not a step to climb. */
  const addSafetyMut = useMutation({
    mutationFn: (name: string) => createBehavior(trigger.id, { name, behavior_type: 'safety' }),
    onSuccess: () => { invalidate(); setNewBeh('') },
  })

  const scoreMut = useMutation({
    mutationFn: (v: { id: string; dt: number }) => updateBehavior(trigger.id, v.id, { distress_thermometer_when_refraining: v.dt }),
    onSuccess: () => invalidate(),
  })

  // A child says something, then says it better. Until 2026-09-01 only the score could be
  // reopened, so the wording stayed wrong unless the clinician left the session.
  const renameMut = useMutation({
    mutationFn: (v: { id: string; name: string }) => updateBehavior(trigger.id, v.id, { name: v.name }),
    onSuccess: () => invalidate(),
  })
  const removeMut = useMutation({
    mutationFn: (id: string) => deleteBehavior(trigger.id, id),
    onSuccess: () => invalidate(),
  })

  const scoring = captured.find(b => b.id === scoringId) ?? null
  const answerCount = (avoidAnswer ? 1 : 0) + rungs.length + safeties.length

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
      {rungs.map((b, i) => {
        const sc = dtOf(b.distress_thermometer_when_refraining)
        const beingAsked = step === 'score' && b.id === scoringId
        return (
          <div key={b.id}>
            <Exchange
              q={i === 0 ? 'What’s a smaller version of this you could do?' : 'What else could you try?'}
              a={b.name}
              onRename={name => renameMut.mutate({ id: b.id, name })}
              onRemove={() => removeMut.mutate(b.id)}
            />
            {beingAsked ? null : sc != null
              ? <Exchange q="How hard would that one be?" a={`${sc} out of 10`} onReopen={() => { setScoringId(b.id); setStep('score') }} />
              : <Exchange q="How hard would that one be?" a="— we skipped this one" onReopen={() => { setScoringId(b.id); setStep('score') }} />}
          </div>
        )
      })}
      {safeties.map((b, i) => (
        <Exchange
          key={b.id}
          q={i === 0 ? 'What do you do so it feels safer?' : 'What else do you do?'}
          a={b.name}
          onRename={name => renameMut.mutate({ id: b.id, name })}
          onRemove={() => removeMut.mutate(b.id)}
        />
      ))}
    </>
  )

  // Each question is phrased off the last answer — that adaptivity is most of what makes this
  // read as a conversation rather than a form.
  const smallerQuestion = rungs.length > 0
    ? 'What else could you try?'
    : avoidAnswer === 'yes'
      ? 'What’s a smaller version of this you could actually do?'
      : 'What’s a smaller version of this you could do?'
  const safetyQuestion = safeties.length > 0
    ? 'What else do you do?'
    : 'What do you do so it feels safer?'

  return (
    <div style={screenSurface}>
      <Context text={trigger.name} dt={situationDt} quiet={step === 'score'} />

      {showTranscript && answerCount > 0 && (
        <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: '1px dashed #dbe8e5' }}>{transcript}</div>
      )}

      {step === 'avoid' && (
        <div>
          <Ask>Do you stay away from this if you can?</Ask>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => avoidYesMut.mutate()} disabled={avoidYesMut.isPending} style={{ ...primaryBtn, marginTop: 0 }}>Yes — I skip it</button>
            <button onClick={() => { setAvoidAnswer('no'); setStep('smaller') }} style={{ ...ghostBtn, marginTop: 0 }}>No — I get through it</button>
          </div>
        </div>
      )}

      {/* The question that builds the ladder. It replaces "what do you do so it feels safer?" as
          the way a rung is made — a rung is a smaller version of the situation, not a thing given
          up. Dr. Walker's own rungs read like this: "watch videos of kids getting dropped off",
          "send the child in a carpool". */}
      {step === 'smaller' && (
        <div>
          <Ask>{smallerQuestion}</Ask>
          {rungs.length === 0 && (
            <p style={{ ...lead, marginTop: -6, marginBottom: 12 }}>
              Something like it, but easier — shorter, closer to home, with someone you trust.
            </p>
          )}
          <SayIt value={newBeh} onChange={setNewBeh} onSend={() => addRungMut.mutate(newBeh.trim())}
            placeholder="e.g. walk to the classroom door with mum" pending={addRungMut.isPending} />
          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setStep('safety')} style={{ ...ghostBtn, marginTop: 0 }}>
              {rungs.length === 0 ? 'Nothing comes to mind' : 'That’s enough for now →'}
            </button>
          </div>
        </div>
      )}

      {/* Not a rung. A list on the situation, and Dr. Walker's rule is that these have to stop
          before the exposures happen. Asked last so it does not get mistaken for the ladder. */}
      {step === 'safety' && (
        <div>
          <Ask>{safetyQuestion}</Ask>
          {safeties.length === 0 && (
            <p style={{ ...lead, marginTop: -6, marginBottom: 12 }}>
              Anything that makes it easier to get through. These are the things to stop doing when
              you start the steps above.
            </p>
          )}
          <SayIt value={newBeh} onChange={setNewBeh} onSend={() => addSafetyMut.mutate(newBeh.trim())}
            placeholder="e.g. ask a friend to answer for me" pending={addSafetyMut.isPending} />
          <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => setStep('smaller')} style={{ ...ghostBtn, marginTop: 0 }}>
              ← Back to steps
            </button>
            <button onClick={onFinished} style={{ ...ghostBtn, marginTop: 0 }}>
              {isLast ? 'That’s everything — see the ladder →' : 'That’s everything →'}
            </button>
          </div>
        </div>
      )}

      {step === 'score' && scoring && (
        <div>
          <Ask>
            {scoring.id === avoidBeh?.id
              ? 'How hard would it be to be in it at all?'
              : 'How hard would that one be?'}
          </Ask>
          {/* Their own words, given the same context treatment as the situation — this is the
              thing being scored, and it has to be unmistakable when an earlier answer is
              reopened. No badge: the scale below already shows the current value. */}
          {scoring.id !== avoidBeh?.id && <Context text={`“${scoring.name}”`} />}
          <FearScale value={dtOf(scoring.distress_thermometer_when_refraining)}
            onPick={n => { scoreMut.mutate({ id: scoring.id, dt: clampDt(n) }); setScoringId(null); setStep('smaller') }} />
          <div style={{ marginTop: 16 }}>
            <button onClick={() => { setScoringId(null); setStep('smaller') }} style={quietLink}>Skip this one</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 20, paddingTop: 14, borderTop: '1px solid #eef2f1' }}>
        {answerCount > 0 && (
          <button onClick={() => setShowTranscript(v => !v)} style={quietLink}>
            {showTranscript ? 'Hide what we said' : `${answerCount} answer${answerCount === 1 ? '' : 's'} so far ›`}
          </button>
        )}
        <button onClick={onArrow} style={quietLink} title="Find the feared outcome behind this one">
          ↓ Downward arrow
        </button>
        <button onClick={onSeeAll} style={{ ...quietLink, marginLeft: 'auto' }}>← All situations</button>
      </div>
    </div>
  )
}

// ── Phase: ladder review — the last beat of the conversation ──
// The ladder is the RUNGS, flat, easiest at the top (owner, 2026-08-23): you start at the top with
// the easiest thing. The colour-graded rail says the same thing without a sentence about ordering.
//
// It used to list the SITUATIONS and expand each to the behaviours under it. That was the old
// model, where a rung was a behaviour given up. A rung is a smaller version of the situation now,
// so the ladder is those, with the situation as a quiet label.
export function ReviewPhase({ planId, triggers, onBack, onOpenBuilder }: { planId: string; triggers: TriggerSituation[]; onBack: () => void; onOpenBuilder: () => void }) {
  const { data: allRungs, isLoading } = useQuery({
    queryKey: ['plan-rungs', planId],
    queryFn: () => getPlanRungs(planId),
  })
  const rungs = [...(allRungs ?? [])].sort(
    (a, b) => (dtOf(a.distress_thermometer_when_refraining) ?? 99) - (dtOf(b.distress_thermometer_when_refraining) ?? 99)
  )

  return (
    <div style={screenSurface}>
      <div style={bigQ}>Here&rsquo;s your ladder</div>
      <p style={lead}>Easiest at the top. We&rsquo;ll use this for planning and doing your exposures.</p>

      <div style={{ position: 'relative', paddingLeft: 22, marginTop: 18 }}>
        {rungs.length > 0 && (
          <div style={{ position: 'absolute', left: 6, top: 14, bottom: 14, width: 3, borderRadius: 2, background: 'linear-gradient(#4bb98a, #f2a33f 55%, #ef6b53)' }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isLoading && <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading…</div>}
          {!isLoading && rungs.map(r => (
            <ReviewRung key={r.id} planId={planId} rung={r} triggers={triggers} />
          ))}
          {!isLoading && rungs.length === 0 && (
            <div style={{ fontSize: 13, color: '#94a3b8' }}>
              Nothing on the ladder yet — a rung is a smaller version of a situation.
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={onBack} style={ghostBtn}>← Back to situations</button>
        <button onClick={onOpenBuilder} style={primaryBtn}>Open the full builder →</button>
      </div>
    </div>
  )
}

// One rung on the review ladder, editable in place.
//
// This is the moment the pair look at what they built, and until now nothing here could be
// changed: only a score could be reopened, so a step the child said one way and then said better
// stayed wrong unless the clinician left the session for the builder. Rename, rescore, regroup and
// remove all happen without leaving the conversation.
function ReviewRung({
  planId,
  rung,
  triggers,
}: {
  planId: string
  rung: AvoidanceBehavior
  triggers: TriggerSituation[]
}) {
  const qc = useQueryClient()
  const [editingName, setEditingName] = useState(false)
  const [draft, setDraft] = useState(rung.name)
  const [scoring, setScoring] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [planDate, setPlanDate] = useState(getNextSchoolDayISO())
  const [planned, setPlanned] = useState(false)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['plan-rungs', planId] })
    qc.invalidateQueries({ queryKey: ['behaviors'] })
  }
  const saveMut = useMutation({
    mutationFn: (data: Parameters<typeof updatePlanRung>[2]) => updatePlanRung(planId, rung.id, data),
    onSuccess: () => { invalidate(); setEditingName(false); setScoring(false) },
  })
  const removeMut = useMutation({
    mutationFn: () => deletePlanRung(planId, rung.id),
    onSuccess: invalidate,
  })

  // Agree the exposure here, with the child in the room. The clinician sets which rung and which
  // day; the child answers their own questions at home — what they think will happen, how anxious
  // they expect to be, how ready they feel — and it becomes committed. See
  // docs/plans/exposure-ladder-sub-situations.md, "started in session, finished at home".
  const planMut = useMutation({
    mutationFn: () => planExperimentForBehavior(rung.id, {
      confidence_level: 'medium',
      plan_description: rung.name,
      scheduled_date: new Date(planDate + 'T12:00:00').toISOString(),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['experiments'] })
      setPlanning(false)
      setPlanned(true)
    },
  })

  const dt = dtOf(rung.distress_thermometer_when_refraining)

  const rename = () => {
    const name = draft.trim()
    if (!name || name === rung.name) { setEditingName(false); setDraft(rung.name); return }
    saveMut.mutate({ name })
  }

  if (planning) {
    return (
      <div style={{ ...card, padding: '12px 14px', boxShadow: 'none' }}>
        <div style={{ fontSize: 13.5, color: '#1e293b', fontWeight: 700 }}>
          When will you do &ldquo;{rung.name}&rdquo;?
        </div>
        <p style={{ fontSize: 12, color: '#6b7a79', margin: '4px 0 10px' }}>
          They&rsquo;ll fill in what they think will happen when they open their app.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <input type="date" value={planDate} onChange={e => setPlanDate(e.target.value)}
            style={{ fontSize: 13.5, padding: '7px 10px', border: '1px solid #cfe3de', borderRadius: 8, background: '#fff' }} />
          <button onClick={() => planMut.mutate()} disabled={planMut.isPending}
            style={{ ...primaryBtn, marginTop: 0, padding: '8px 16px', fontSize: 13.5 }}>
            {planMut.isPending ? 'Saving…' : 'Agree it'}
          </button>
          <button onClick={() => setPlanning(false)} style={quietLink}>Cancel</button>
        </div>
      </div>
    )
  }

  if (scoring) {
    return (
      <div style={{ ...card, padding: '12px 14px', boxShadow: 'none' }}>
        <div style={{ fontSize: 13.5, color: '#1e293b', fontWeight: 700, marginBottom: 10 }}>
          How hard would &ldquo;{rung.name}&rdquo; be?
        </div>
        <FearScale
          value={dt}
          onPick={n => saveMut.mutate({ distress_thermometer_when_refraining: clampDt(n) })}
        />
        <button onClick={() => setScoring(false)} style={{ ...quietLink, marginTop: 12 }}>Cancel</button>
      </div>
    )
  }

  return (
    <div style={{ ...card, padding: '12px 14px', boxShadow: 'none', display: 'flex', alignItems: 'center', gap: 11 }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        {editingName ? (
          <input
            value={draft}
            autoFocus
            onChange={e => setDraft(e.target.value)}
            onBlur={rename}
            onKeyDown={e => {
              if (e.key === 'Enter') rename()
              if (e.key === 'Escape') { setDraft(rung.name); setEditingName(false) }
            }}
            style={{ width: '100%', fontSize: 14.5, fontWeight: 700, color: '#1e293b', padding: '4px 6px', border: '1px solid #cfe3de', borderRadius: 7, background: '#fff' }}
          />
        ) : (
          <button
            onClick={() => { setDraft(rung.name); setEditingName(true) }}
            title="Change the wording"
            style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'text', fontSize: 14.5, color: '#1e293b', fontWeight: 700 }}
          >
            {rung.name}
          </button>
        )}
        {/* Which situation it belongs under. Blank is allowed — a rung can be written before it is
            grouped, and the ladder does not require one. */}
        <select
          value={rung.trigger_situation_id ?? ''}
          onChange={e => saveMut.mutate({ trigger_situation_id: e.target.value || null })}
          title="Which situation this belongs to"
          style={{ marginTop: 3, fontSize: 12, color: '#6b7a79', background: 'none', border: 0, padding: 0, cursor: 'pointer', maxWidth: '100%' }}
        >
          <option value="">Not grouped</option>
          {triggers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </span>

      <button onClick={() => setScoring(true)} title="Change the score" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>
        {dt != null
          ? <DTBadge v={dt} size={28} />
          : <span style={{ fontSize: 11, fontWeight: 700, color: '#c0ccca' }}>not scored</span>}
      </button>

      {/* Agreeing it now is the natural end of a session; the child finishes it at home. */}
      {planned ? (
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#3f8a78', flexShrink: 0, whiteSpace: 'nowrap' }}>
          Planned
        </span>
      ) : (
        <button onClick={() => setPlanning(v => !v)} title="Agree to do this one"
          style={{ fontSize: 11.5, fontWeight: 700, color: '#3f8a78', background: 'none', border: 0, padding: 0, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
          Plan it
        </button>
      )}

      {confirmRemove ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button onClick={() => removeMut.mutate()} disabled={removeMut.isPending}
            style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#dc2626', border: 0, borderRadius: 6, padding: '4px 9px', cursor: 'pointer' }}>
            Remove
          </button>
          <button onClick={() => setConfirmRemove(false)} style={quietLink}>Keep</button>
        </span>
      ) : (
        <button onClick={() => setConfirmRemove(true)} title="Take this off the ladder"
          style={{ fontSize: 16, lineHeight: 1, color: '#c0ccca', background: 'none', border: 0, cursor: 'pointer', flexShrink: 0 }}>
          ×
        </button>
      )}
    </div>
  )
}
