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
import { BEHAVIOR_TYPE_SCENARIO } from './patient/shared'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  getTreatmentPlan,
  getTriggers,
  getBehaviors,
  getPlanRungs,
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
  Chrome, DTBadge, Context, SayIt, SessionProgress, ScorePicker,
} from './sessionKit'

// Two working screens and a beat between them. Peter, 2026-09-01, after testing the
// one-question-per-screen version: "the setup flow should be very simple now… it's conversational
// but it doesn't have one line per screen."
//
//   situations  pick them and give each a thermometer score, all on one screen
//   rungs       one situation at a time: its steps, each scored, all on one screen
//   added       the ladder with the new steps on it, so it is obvious where they went
//
// There is no ladder phase — the ladder is the Plan tab's own view, which this hands back to.
type Phase = 'intro' | 'situations' | 'rungs' | 'added'

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

  // Lowest thermometer score first. Unscored situations sit at the end rather than counting as a
  // zero and jumping the queue.
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

  // The list is the opening screen once there is one. "Let's walk through the situations that feel
  // hard" is something you say to someone who has nothing yet.
  useEffect(() => {
    if (bootRef.current || !triggers) return
    bootRef.current = true
    if (sortedTriggers.length > 0) setPhase('situations')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggers])

  // Working through the situations in order. `walkIds` is this pass's queue, so coming back to add
  // one more covers what is new rather than marching through work already done.
  const openSituation = (id: string) => { setCurrentTriggerId(id); setPhase('rungs') }
  const nextSituation = () => {
    const i = walkIds.indexOf(currentTriggerId ?? '')
    const next = i >= 0 ? walkIds[i + 1] : undefined
    if (next) openSituation(next)
    else onExit()
  }

  // Leaving the situations screen: work through everything on it, in order.
  const startWalk = () => {
    const ids = sortedTriggers.map(t => t.id)
    setWalkIds(ids)
    if (ids.length > 0) openSituation(ids[0])
    else onExit()
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
    phase === 'situations' ? 'list' as const : 'build' as const

  return (
    <Shell>
      {phase !== 'intro' && (
        <SessionProgress
          stage={stage}
          situationIndex={currentTriggerId ? walkIds.indexOf(currentTriggerId) : undefined}
          situationCount={walkIds.length}
          rungCount={rungCount}
          onSeeLadder={onExit}
        />
      )}

      {phase === 'intro' && <IntroPhase onStart={() => setPhase('situations')} />}

      {phase === 'situations' && (
        <SituationsPhase
          planId={plan.id}
          triggers={sortedTriggers}
          onDone={startWalk}
        />
      )}

      {phase === 'rungs' && currentTrigger && (
        <RungsPhase
          key={currentTrigger.id}
          planId={plan.id}
          trigger={currentTrigger}
          onBack={() => setPhase('situations')}
          onDone={() => setPhase('added')}
          onArrow={() => goToArrow(`/patients/${patientId}/arrow?situation=${currentTrigger.id}`)}
        />
      )}

      {phase === 'added' && currentTrigger && (
        <AddedPhase
          planId={plan.id}
          trigger={currentTrigger}
          triggers={sortedTriggers}
          isLast={walkIds.indexOf(currentTrigger.id) === walkIds.length - 1}
          onBack={() => setPhase('rungs')}
          onNext={nextSituation}
        />
      )}
    </Shell>
  )
}

// ── Phase: intro ───────────────────────────────────────────────
export function IntroPhase({ onStart }: { onStart: () => void }) {
  return (
    <div style={screenSurface}>
      <div style={bigQ}>Let&rsquo;s build your ladder.</div>
      <p style={lead}>
        First the situations that feel hard, and a thermometer score for each. Then, for each one,
        the smaller steps you could actually try.
      </p>
      <button onClick={onStart} style={primaryBtn}>Let&rsquo;s start →</button>
    </div>
  )
}

// ── Phase: situations — the list AND the scores, on one screen ──
// Two screens before: add them, then score them one per screen. Peter, 2026-09-01: "you pick the
// situations with Distress Thermometer scores." One thing, so it reads as one thing.
export function SituationsPhase({ planId, triggers, onDone }: {
  planId: string
  triggers: TriggerSituation[]
  onDone: () => void
}) {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')

  const { data: starters } = useQuery({
    queryKey: ['situation-library', ''],
    queryFn: () => searchSituationLibrary(''),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['triggers', planId] })
  const addMut = useMutation({
    mutationFn: (name: string) => createTrigger(planId, { name }),
    onSuccess: () => { invalidate(); setNewName('') },
  })
  const scoreMut = useMutation({
    mutationFn: (v: { id: string; dt: number }) =>
      updateTrigger(planId, v.id, { distress_thermometer_rating: v.dt }),
    onSuccess: invalidate,
  })

  const taken = new Set(triggers.map(t => t.name.trim().toLowerCase()))
  const suggestions = (starters ?? []).filter(s => !taken.has(s.name.trim().toLowerCase())).slice(0, 8)
  const unscored = triggers.filter(t => dtOf(t.distress_thermometer_rating) == null).length

  return (
    <div style={screenSurface}>
      <div style={bigQ}>What situations do you have trouble with?</div>
      <p style={lead}>Add the ones that fit, and give each a thermometer score.</p>

      {triggers.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {triggers.map(t => (
            <div key={t.id}
              style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 11, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 11, padding: '11px 13px' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: '#1e293b', flex: 1, minWidth: 0 }}>{t.name}</span>
              <ScorePicker
                value={dtOf(t.distress_thermometer_rating)}
                onPick={n => scoreMut.mutate({ id: t.id, dt: clampDt(n) })}
                label={`Thermometer score for “${t.name}”`}
              />
            </div>
          ))}
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

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 18, flexWrap: 'wrap' }}>
        <button onClick={onDone} disabled={triggers.length === 0}
          style={{ ...primaryBtn, marginTop: 0, opacity: triggers.length === 0 ? 0.4 : 1 }}>
          Add steps to these →
        </button>
        {triggers.length === 0 && <span style={{ fontSize: 12.5, color: '#94a3b8' }}>Add at least one to keep going.</span>}
        {/* A score is not required to move on — a situation can be scored later, and stopping the
            pair to fill in a number they have not decided is how a conversation becomes a form. */}
        {unscored > 0 && triggers.length > 0 && (
          <span style={{ fontSize: 12.5, color: '#94a3b8' }}>
            {unscored} still without a score — you can come back to {unscored === 1 ? 'it' : 'them'}.
          </span>
        )}
      </div>
    </div>
  )
}

// ── Phase: rungs — one situation, all of its steps, one screen ──
// The steps accumulate in front of the pair as they are said, each with its own thermometer score.
// Peter, 2026-09-01: "all of the sub-situations/rungs are added on the same screen."
export function RungsPhase({ planId, trigger, onBack, onDone, onArrow }: {
  planId: string
  trigger: TriggerSituation
  onBack: () => void
  onDone: () => void
  onArrow: () => void
}) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')

  const { data: behaviors } = useQuery({
    queryKey: ['behaviors', trigger.id],
    queryFn: () => getBehaviors(trigger.id),
  })

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] })
    qc.invalidateQueries({ queryKey: ['plan-rungs', planId] })
  }
  const addMut = useMutation({
    mutationFn: (name: string) =>
      createBehavior(trigger.id, { name, behavior_type: BEHAVIOR_TYPE_SCENARIO }),
    onSuccess: () => { invalidate(); setDraft('') },
  })
  const scoreMut = useMutation({
    mutationFn: (v: { id: string; dt: number }) =>
      updateBehavior(trigger.id, v.id, { distress_thermometer_when_refraining: v.dt }),
    onSuccess: invalidate,
  })
  const renameMut = useMutation({
    mutationFn: (v: { id: string; name: string }) => updateBehavior(trigger.id, v.id, { name: v.name }),
    onSuccess: invalidate,
  })
  const delMut = useMutation({
    mutationFn: (id: string) => deleteBehavior(trigger.id, id),
    onSuccess: invalidate,
  })

  // Only the steps. A rung is a smaller version of the situation; anything else on this row was
  // captured under the old model and is not part of this flow.
  const rungs = (behaviors ?? [])
    .filter(b => b.behavior_type === BEHAVIOR_TYPE_SCENARIO && !b.parent_behavior_id)
    .sort((a, b) => (dtOf(a.distress_thermometer_when_refraining) ?? 99) - (dtOf(b.distress_thermometer_when_refraining) ?? 99))

  return (
    <div style={screenSurface}>
      <Context text={trigger.name} dt={dtOf(trigger.distress_thermometer_rating)} />

      <div style={{ ...bigQ, marginTop: 14 }}>What are smaller versions of this you could do?</div>
      <p style={lead}>
        Something like it, but easier — shorter, closer to home, with someone you trust. Add as many
        as you want, and give each one a thermometer score.
      </p>

      {rungs.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {rungs.map(r => (
            <RungRow
              key={r.id}
              name={r.name}
              score={dtOf(r.distress_thermometer_when_refraining)}
              onRename={name => renameMut.mutate({ id: r.id, name })}
              onScore={n => scoreMut.mutate({ id: r.id, dt: clampDt(n) })}
              onRemove={() => delMut.mutate(r.id)}
            />
          ))}
        </div>
      )}

      <div style={{ marginTop: 14 }}>
        <SayIt
          value={draft}
          onChange={setDraft}
          onSend={() => addMut.mutate(draft.trim())}
          placeholder="e.g. walk to the classroom door with mum"
          pending={addMut.isPending}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 18, flexWrap: 'wrap' }}>
        <button onClick={onDone} disabled={rungs.length === 0}
          style={{ ...primaryBtn, marginTop: 0, opacity: rungs.length === 0 ? 0.4 : 1 }}>
          See {rungs.length === 1 ? 'it' : 'them'} on the ladder →
        </button>
        {rungs.length === 0 && <span style={{ fontSize: 12.5, color: '#94a3b8' }}>Add at least one step.</span>}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 20, paddingTop: 14, borderTop: '1px solid #eef2f1' }}>
        <button onClick={onArrow} style={quietLink} title="Find the feared outcome behind this one">
          ↓ Downward arrow
        </button>
        <button onClick={onBack} style={{ ...quietLink, marginLeft: 'auto' }}>← All situations</button>
      </div>
    </div>
  )
}

/** One step being written: its wording, its score, and a way to take it back out. */
function RungRow({ name, score, onRename, onScore, onRemove }: {
  name: string
  score: number | null
  onRename: (next: string) => void
  onScore: (n: number) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)

  const commit = () => {
    const next = draft.trim()
    setEditing(false)
    if (next && next !== name) onRename(next)
    else setDraft(name)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 11, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 11, padding: '11px 13px' }}>
      {editing ? (
        <input
          value={draft}
          autoFocus
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') { setDraft(name); setEditing(false) }
          }}
          style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: '#1e293b', padding: '4px 6px', border: '1px solid #cfe3de', borderRadius: 7 }}
        />
      ) : (
        <button onClick={() => { setDraft(name); setEditing(true) }} title="Change the wording"
          style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'text', fontSize: 13.5, fontWeight: 600, color: '#1e293b' }}>
          {name}
        </button>
      )}
      <ScorePicker value={score} onPick={onScore} label={`Thermometer score for “${name}”`} />
      <button onClick={onRemove} title="Take this out"
        style={{ fontSize: 15, lineHeight: 1, color: '#cbd8d6', background: 'none', border: 0, cursor: 'pointer', flexShrink: 0 }}>×</button>
    </div>
  )
}

// ── Phase: added — the beat that shows where the steps went ──
// Peter, 2026-09-01: "after you add rungs to a situation, you see those on the ladder — this
// prompts understanding of where the data goes."
export function AddedPhase({ planId, trigger, triggers, isLast, onBack, onNext }: {
  planId: string
  trigger: TriggerSituation
  triggers: TriggerSituation[]
  isLast: boolean
  onBack: () => void
  onNext: () => void
}) {
  const { data: allRungs, isLoading } = useQuery({
    queryKey: ['plan-rungs', planId],
    queryFn: () => getPlanRungs(planId),
  })
  const rungs = [...(allRungs ?? [])].sort(
    (a, b) => (dtOf(a.distress_thermometer_when_refraining) ?? 99) - (dtOf(b.distress_thermometer_when_refraining) ?? 99)
  )
  const justAdded = rungs.filter(r => r.trigger_situation_id === trigger.id).length
  const situationName = (id: string | null) => triggers.find(t => t.id === id)?.name ?? null

  return (
    <div style={screenSurface}>
      <div style={bigQ}>
        {justAdded} step{justAdded === 1 ? '' : 's'} from &ldquo;{trigger.name}&rdquo; {justAdded === 1 ? 'is' : 'are'} on your ladder.
      </div>
      <p style={lead}>Easiest at the top. This is what you&rsquo;ll work through.</p>

      <div style={{ position: 'relative', paddingLeft: 22, marginTop: 18 }}>
        {rungs.length > 0 && (
          <div style={{ position: 'absolute', left: 6, top: 14, bottom: 14, width: 3, borderRadius: 2, background: 'linear-gradient(#4bb98a, #f2a33f 55%, #ef6b53)' }} />
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {isLoading && <div style={{ fontSize: 13, color: '#94a3b8' }}>Loading…</div>}
          {!isLoading && rungs.map(r => {
            const mine = r.trigger_situation_id === trigger.id
            const sit = situationName(r.trigger_situation_id)
            return (
              <div key={r.id}
                style={{ ...card, padding: '12px 14px', boxShadow: 'none', display: 'flex', alignItems: 'center', gap: 11, border: mine ? '1px solid #9af6e4' : undefined, background: mine ? '#f4fdfa' : undefined }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 14.5, color: '#1e293b', fontWeight: 700 }}>{r.name}</span>
                  {sit && <span style={{ display: 'block', fontSize: 12, color: '#6b7a79', marginTop: 2 }}>{sit}</span>}
                </span>
                {dtOf(r.distress_thermometer_when_refraining) != null
                  ? <DTBadge v={dtOf(r.distress_thermometer_when_refraining)} size={28} />
                  : <span style={{ fontSize: 11, fontWeight: 700, color: '#c0ccca' }}>not scored</span>}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
        <button onClick={onNext} style={{ ...primaryBtn, marginTop: 0 }}>
          {isLast ? 'Done →' : 'Next situation →'}
        </button>
        <button onClick={onBack} style={{ ...ghostBtn, marginTop: 0 }}>← Add more steps</button>
      </div>
    </div>
  )
}
