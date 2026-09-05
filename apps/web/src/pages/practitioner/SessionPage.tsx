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
import { useState, useEffect } from 'react'
import { BEHAVIOR_TYPE_SCENARIO, clampDtInput } from './patient/shared'
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
  deleteTrigger,
  searchSituationLibrary,
  type TriggerSituation,
} from '../../api/treatment'
import {
  clampDt, dtOf, screenSurface, card, primaryBtn, bigQ, lead, quietLink, Chrome,
} from './sessionKit'

/** The full-screen route. A thin wrapper — the editor is the component below, so the Plan tab can
 *  render exactly the same thing without the clinician chrome around it. */
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
 * The ladder editor — ONE screen.
 *
 * Peter, 2026-09-05, after testing the three-screen version: the list of situations, expand one to
 * see its sub-situations underneath, add / edit / delete them with the thermometer score right
 * beside each, and closing the editor puts them on the ladder.
 *
 * What that replaces: an add-situations screen, a per-situation steps screen, and a "here is where
 * they went" beat. Three screens and a walk for something that is one list with things under it.
 *
 * `embedded` drops the full-screen shell so this can live inside the Plan tab. Same component
 * either way, so the Full screen button is a change of presentation rather than a different screen.
 */
export function SessionInterview({ patientId, embedded = false, onExit }: {
  patientId: string
  embedded?: boolean
  onExit: () => void
}) {
  const goToArrow = useNavigate()

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

  // Full screen for when the child is looking; plain for the Plan tab, which brings its own
  // header and nav.
  const Shell = ({ children }: { children: React.ReactNode }) =>
    embedded ? <div style={{ padding: '4px 0 8px' }}>{children}</div> : <Chrome onExit={onExit}>{children}</Chrome>

  if (planLoading) {
    return <Shell><div style={{ color: '#6b7a79', fontSize: 14, padding: 40, textAlign: 'center' }}>Loading…</div></Shell>
  }
  if (!plan) {
    return (
      <Shell>
        <div style={{ ...card, textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0d3d3a' }}>No treatment plan yet</div>
          <p style={{ fontSize: 13.5, color: '#6b7a79', marginTop: 8 }}>Create the plan from the patient page first, then start a session.</p>
          <button onClick={onExit} style={primaryBtn}>Back to patient</button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <LadderEditor
        planId={plan.id}
        triggers={sortedTriggers}
        onDone={onExit}
        onArrow={id => goToArrow(`/patients/${patientId}/arrow?situation=${id}`)}
      />
    </Shell>
  )
}

// ── The editor ────────────────────────────────────────────────────────────────
export function LadderEditor({ planId, triggers, onDone, onArrow }: {
  planId: string
  triggers: TriggerSituation[]
  onDone: () => void
  onArrow: (situationId: string) => void
}) {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  // Collapsed behind a button. Adding situations is the first thing you do and then rarely again,
  // so it should not sit open under the list taking up the room the list needs.
  const [adding, setAdding] = useState(false)

  const { data: starters } = useQuery({
    queryKey: ['situation-library', ''],
    queryFn: () => searchSituationLibrary(''),
  })

  const invalidate = () => qc.invalidateQueries({ queryKey: ['triggers', planId] })
  const addMut = useMutation({
    mutationFn: (name: string) => createTrigger(planId, { name }),
    // A situation you have just named is one you are about to put steps under, so it opens.
    onSuccess: (created: TriggerSituation) => {
      invalidate()
      setNewName('')
      setOpen(prev => new Set(prev).add(created.id))
    },
  })

  const taken = new Set(triggers.map(t => t.name.trim().toLowerCase()))
  const suggestions = (starters ?? []).filter(s => !taken.has(s.name.trim().toLowerCase())).slice(0, 8)

  const toggle = (id: string) =>
    setOpen(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <div style={screenSurface}>
      <div style={bigQ}>What situations do you have trouble with?</div>
      <p style={lead}>
        Give each one a thermometer score. Then open it up and add the smaller versions you could
        actually try — those are the steps on the ladder.
      </p>

      {triggers.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {triggers.map(t => (
            <SituationRow
              key={t.id}
              planId={planId}
              trigger={t}
              expanded={open.has(t.id)}
              onToggle={() => toggle(t.id)}
              onArrow={() => onArrow(t.id)}
            />
          ))}
        </div>
      )}

      {adding ? (
        <div style={{ marginTop: 14, background: '#f8fbfa', border: '1px solid #dbe8e5', borderRadius: 11, padding: '13px' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && newName.trim()) addMut.mutate(newName.trim()) }}
              placeholder="Add a situation you find hard"
              style={{ flex: 1, border: '1.5px solid #cfe0db', borderRadius: 11, padding: '11px 13px', fontSize: 14, minWidth: 0, background: '#fff' }} />
            <button onClick={() => addMut.mutate(newName.trim())} disabled={!newName.trim() || addMut.isPending}
              style={{ ...primaryBtn, marginTop: 0, opacity: !newName.trim() ? 0.4 : 1 }}>Add</button>
          </div>

          {suggestions.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12.5, color: '#9aa9a8', marginBottom: 7 }}>Other kids often say these — tap any that fit</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {suggestions.map(sug => (
                  <button key={sug.id} onClick={() => addMut.mutate(sug.name)} disabled={addMut.isPending}
                    style={{ fontSize: 13, fontWeight: 600, color: '#135450', background: '#fff', border: '1px solid #cfe0db', borderRadius: 999, padding: '8px 14px', cursor: 'pointer' }}>
                    + {sug.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button onClick={() => { setAdding(false); setNewName('') }} style={{ ...quietLink, marginTop: 12 }}>
            Done adding
          </button>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          style={{ marginTop: 14, fontSize: 13, fontWeight: 700, color: '#135450', background: '#fff', border: '1px solid #cfe0db', borderRadius: 999, padding: '9px 16px', cursor: 'pointer' }}>
          + Add situation
        </button>
      )}

      {/* This closes the editor. It used to say "That's my list", which described the list rather
          than what the button does — and what it does is put you back on the ladder. */}
      <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid #eef2f1' }}>
        <button onClick={onDone} style={{ ...primaryBtn, marginTop: 0 }}>Done — see the ladder →</button>
      </div>
    </div>
  )
}

/** One situation: its name, its score, and — opened up — the steps underneath it. */
function SituationRow({ planId, trigger, expanded, onToggle, onArrow }: {
  planId: string
  trigger: TriggerSituation
  expanded: boolean
  onToggle: () => void
  onArrow: () => void
}) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(trigger.name)
  const [confirmRemove, setConfirmRemove] = useState(false)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['triggers', planId] })
  const saveMut = useMutation({
    mutationFn: (data: Parameters<typeof updateTrigger>[2]) => updateTrigger(planId, trigger.id, data),
    onSuccess: () => { invalidate(); setEditing(false) },
  })
  const delMut = useMutation({
    mutationFn: () => deleteTrigger(planId, trigger.id),
    onSuccess: () => {
      invalidate()
      qc.invalidateQueries({ queryKey: ['plan-rungs', planId] })
    },
  })

  const rename = () => {
    const name = draft.trim()
    if (!name || name === trigger.name) { setEditing(false); setDraft(trigger.name); return }
    saveMut.mutate({ name })
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #cfe0db', borderRadius: 11, overflow: 'hidden' }}>
      {/* The header carries the mint ground so a situation reads as the heading over its steps
          rather than another row in the same list. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px',
        background: '#eafaf6',
        borderBottom: expanded ? '1px solid #cfe0db' : undefined,
      }}>
        <button onClick={onToggle} aria-expanded={expanded} title={expanded ? 'Collapse' : 'Show its steps'}
          style={{ fontSize: 11, color: '#4d8478', width: 12, flexShrink: 0, background: 'none', border: 0, cursor: 'pointer', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}>▶</button>

        {editing ? (
          <input
            value={draft}
            autoFocus
            onChange={e => setDraft(e.target.value)}
            onBlur={rename}
            onKeyDown={e => {
              if (e.key === 'Enter') rename()
              if (e.key === 'Escape') { setDraft(trigger.name); setEditing(false) }
            }}
            style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: '#1e293b', padding: '4px 6px', border: '1px solid #cfe3de', borderRadius: 7 }}
          />
        ) : (
          <button onClick={() => { setDraft(trigger.name); setEditing(true) }} title="Change the wording"
            style={{ flex: '0 1 auto', minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'text', fontSize: 14, fontWeight: 800, color: '#0d3d3a' }}>
            {trigger.name}
          </button>
        )}

        <span aria-hidden="true" style={{ flex: 1, minWidth: 12, alignSelf: 'flex-end', marginBottom: 5, borderBottom: '1px dotted #a9cfc4' }} />

        <ScoreBox
          value={dtOf(trigger.distress_thermometer_rating)}
          onSet={n => saveMut.mutate({ distress_thermometer_rating: n })}
        />

        {/* The arrow belongs to the situation, so it sits on the situation's row. To the right of
            the score: nothing comes between a thing and its number. */}
        <button onClick={onArrow} title="Find the feared outcome behind this one"
          style={{ fontSize: 12, fontWeight: 700, color: '#4d8478', background: 'none', border: 0, padding: 0, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
          ↓ arrow
        </button>

        {confirmRemove ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
            <button onClick={() => delMut.mutate()} disabled={delMut.isPending}
              style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#dc2626', border: 0, borderRadius: 6, padding: '4px 9px', cursor: 'pointer' }}>
              Remove
            </button>
            <button onClick={() => setConfirmRemove(false)} style={quietLink}>Keep</button>
          </span>
        ) : (
          <button onClick={() => setConfirmRemove(true)} title="Take this situation out"
            style={{ fontSize: 15, lineHeight: 1, color: '#cbd8d6', background: 'none', border: 0, cursor: 'pointer', flexShrink: 0 }}>×</button>
        )}
      </div>

      {expanded && <StepList planId={planId} trigger={trigger} />}
    </div>
  )
}

/** The steps under one situation. Added, edited, scored and removed in place. */
function StepList({ planId, trigger }: {
  planId: string
  trigger: TriggerSituation
}) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')

  const { data: behaviors, isLoading } = useQuery({
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
  const saveMut = useMutation({
    mutationFn: (v: { id: string; data: Parameters<typeof updateBehavior>[2] }) =>
      updateBehavior(trigger.id, v.id, v.data),
    onSuccess: invalidate,
  })
  const delMut = useMutation({
    mutationFn: (id: string) => deleteBehavior(trigger.id, id),
    onSuccess: invalidate,
  })

  // Only the steps. A rung is a smaller version of the situation; anything else on this row was
  // captured under the old model and is not part of this flow.
  const steps = (behaviors ?? [])
    .filter(b => b.behavior_type === BEHAVIOR_TYPE_SCENARIO && !b.parent_behavior_id)
    .sort((a, b) => (dtOf(a.distress_thermometer_when_refraining) ?? 99) - (dtOf(b.distress_thermometer_when_refraining) ?? 99))

  return (
    <div style={{ background: '#fff', padding: '10px 13px 12px 24px' }}>
      <div style={{ borderLeft: '2px solid #dbeee8', paddingLeft: 14 }}>
      <div style={{ fontSize: 12, color: '#8fa5a1', marginBottom: 8 }}>
        Smaller versions of this — something like it, but easier.
      </div>

      {isLoading && <div style={{ fontSize: 12.5, color: '#a9c0bb' }}>Loading…</div>}

      {steps.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          {steps.map(b => (
            <StepRow
              key={b.id}
              name={b.name}
              score={dtOf(b.distress_thermometer_when_refraining)}
              onRename={name => saveMut.mutate({ id: b.id, data: { name } })}
              onScore={n => saveMut.mutate({ id: b.id, data: { distress_thermometer_when_refraining: n } })}
              onRemove={() => delMut.mutate(b.id)}
            />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <input value={draft} onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) addMut.mutate(draft.trim()) }}
          placeholder="e.g. walk to the classroom door with mum"
          style={{ flex: 1, minWidth: 0, border: '1px solid #dbe8e5', borderRadius: 9, padding: '8px 11px', fontSize: 13, background: '#fff' }} />
        <button onClick={() => addMut.mutate(draft.trim())} disabled={!draft.trim() || addMut.isPending}
          style={{ fontSize: 12.5, fontWeight: 700, color: '#fff', background: '#135450', border: 0, borderRadius: 9, padding: '8px 14px', cursor: 'pointer', opacity: !draft.trim() ? 0.35 : 1, flexShrink: 0 }}>
          Add step
        </button>
      </div>

      </div>
    </div>
  )
}

/** One step: wording, score, remove. */
function StepRow({ name, score, onRename, onScore, onRemove }: {
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
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#fff', border: '1px solid #e6efec', borderRadius: 9, padding: '8px 11px' }}>
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
          style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: '#1e293b', padding: '3px 5px', border: '1px solid #cfe3de', borderRadius: 6 }}
        />
      ) : (
        <button onClick={() => { setDraft(name); setEditing(true) }} title="Change the wording"
          style={{ flex: '0 1 auto', minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'text', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
          {name}
        </button>
      )}
      <span aria-hidden="true" style={{ flex: 1, minWidth: 12, alignSelf: 'flex-end', marginBottom: 5, borderBottom: '1px dotted #dde8e6' }} />
      <ScoreBox value={score} onSet={onScore} />
      <button onClick={onRemove} title="Take this out"
        style={{ fontSize: 14, lineHeight: 1, color: '#cbd8d6', background: 'none', border: 0, cursor: 'pointer', flexShrink: 0 }}>×</button>
    </div>
  )
}

/**
 * The thermometer score, typed right beside the thing it belongs to.
 *
 * Peter, 2026-09-05: "enter the fear rating right beside the sub-situation. It's not a separate
 * screen for the fear rating." So no tap-to-open scale — a box you type into, and it saves as soon
 * as the number is a number.
 */
function ScoreBox({ value, onSet }: { value: number | null; onSet: (n: number) => void }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))

  // Follow the stored value when it changes underneath (another row saved, a refetch landed).
  useEffect(() => { setDraft(value == null ? '' : String(value)) }, [value])

  const commit = (raw: string) => {
    setDraft(raw)
    if (raw === '') return
    const parsed = Number(raw)
    if (Number.isNaN(parsed)) return
    const n = clampDt(parsed)
    if (n !== value) onSet(n)
  }

  return (
    <input
      type="number"
      min={1}
      max={10}
      value={draft}
      onChange={e => commit(clampDtInput(e.target.value))}
      placeholder="–"
      title="Thermometer score, 1–10"
      style={{ width: 46, flexShrink: 0, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#1e293b', padding: '5px 4px', border: '1px solid #dbe8e5', borderRadius: 7, background: '#fff' }}
    />
  )
}
