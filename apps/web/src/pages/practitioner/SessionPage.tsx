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
  type TriggerSituation,
} from '../../api/treatment'
import {
  clampDt, dtOf, screenSurface, card, primaryBtn, ghostBtn, bigQ, lead, quietLink,
  Chrome, FearScale, DTBadge, Context, Exchange, Ask, SayIt,
} from './sessionKit'

type Phase = 'intro' | 'list' | 'rate' | 'situation' | 'review'

export default function SessionPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()

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

  const sortedTriggers = [...(triggers ?? [])]
    .filter(t => !t.is_placeholder)
    .sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))

  // Session mode is launched from the Plan tab, so it hands the clinician back to it.
  const exit = () => navigate(`/patients/${patientId}?tab=plan`)

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

  return (
    <Chrome onExit={exit}>
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
type SitStep = 'avoid' | 'name' | 'score'

export function SituationPhase({ trigger, isLast, onSeeAll, onFinished }: {
  trigger: TriggerSituation
  isLast: boolean
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
      <Context text={trigger.name} dt={situationDt} quiet={step === 'score'} />

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
              : <>How hard would it be to be in this situation — <span style={{ color: '#135450' }}>without doing that</span>?</>}
          </Ask>
          {/* Their own words, given the same context treatment as the situation — this is the
              thing being scored, and it has to be unmistakable when an earlier answer is
              reopened. No badge: the scale below already shows the current value. */}
          {scoring.id !== avoidBeh?.id && <Context text={`“${scoring.name}”`} />}
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
      </div>
    </div>
  )
}

// ── Phase: ladder review — the last beat of the conversation ──
// Ordered LOW at the top to HIGH at the bottom (owner, 2026-08-23): you start at the top with the
// easiest thing. The colour-graded rail says the same thing without a sentence about ordering.
// Each rung expands to the behaviours captured under it, so the ladder shows the actual work
// rather than just a list of titles.
export function ReviewPhase({ triggers, onBack, onOpenBuilder }: { triggers: TriggerSituation[]; onBack: () => void; onOpenBuilder: () => void }) {
  const rungs = [...triggers]
    .filter(t => dtOf(t.distress_thermometer_rating) != null)
    .sort((a, b) => Number(a.distress_thermometer_rating) - Number(b.distress_thermometer_rating))
  return (
    <div style={screenSurface}>
      <div style={bigQ}>Here&rsquo;s your ladder</div>
      <p style={lead}>We&rsquo;ll use this for planning and doing your exposures.</p>

      <div style={{ position: 'relative', paddingLeft: 22, marginTop: 18 }}>
        {rungs.length > 0 && (
          <div style={{ position: 'absolute', left: 6, top: 14, bottom: 14, width: 3, borderRadius: 2, background: 'linear-gradient(#4bb98a, #f2a33f 55%, #ef6b53)' }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rungs.map(t => <LadderRung key={t.id} trigger={t} />)}
          {rungs.length === 0 && <div style={{ fontSize: 13, color: '#94a3b8' }}>No fear scores captured yet.</div>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
        <button onClick={onBack} style={ghostBtn}>← Back to situations</button>
        <button onClick={onOpenBuilder} style={primaryBtn}>Open the full builder →</button>
      </div>
    </div>
  )
}

// One rung. Behaviours load only when it's opened — most of the time they're already in the cache
// from the walk, so expanding a situation you just did is instant.
function LadderRung({ trigger }: { trigger: TriggerSituation }) {
  const [open, setOpen] = useState(false)
  const { data: behaviors, isLoading } = useQuery({
    queryKey: ['behaviors', trigger.id],
    queryFn: () => getBehaviors(trigger.id),
    enabled: open,
  })
  const rows = (behaviors ?? [])
    .filter(b => !b.parent_behavior_id)
    .sort((a, b) => (dtOf(a.distress_thermometer_when_refraining) ?? 99) - (dtOf(b.distress_thermometer_when_refraining) ?? 99))

  return (
    <div style={{ ...card, padding: 0, overflow: 'hidden', boxShadow: 'none' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '12px 14px', cursor: 'pointer' }}>
        <span style={{ fontSize: 11, color: '#a9c0bb', width: 10, flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}>▶</span>
        <span style={{ fontSize: 14.5, color: '#1e293b', fontWeight: 700, flex: 1, minWidth: 0 }}>{trigger.name}</span>
        <DTBadge v={dtOf(trigger.distress_thermometer_rating)} size={28} />
      </button>

      {open && (
        <div style={{ padding: '0 14px 12px 35px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {isLoading && <span style={{ fontSize: 12.5, color: '#a9c0bb' }}>Loading…</span>}
          {!isLoading && rows.length === 0 && (
            <span style={{ fontSize: 12.5, color: '#a9c0bb' }}>Nothing captured for this one yet.</span>
          )}
          {rows.map(b => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8fbfa', border: '1px solid #eef2f1', borderRadius: 9, padding: '8px 11px' }}>
              <span style={{ fontSize: 13, color: '#475569', fontWeight: 600, flex: 1, minWidth: 0 }}>{b.name}</span>
              {dtOf(b.distress_thermometer_when_refraining) != null
                ? <DTBadge v={dtOf(b.distress_thermometer_when_refraining)} size={23} />
                : <span style={{ fontSize: 11, fontWeight: 700, color: '#c0ccca' }}>not scored</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
