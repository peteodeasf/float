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
import { useState } from 'react'
import {
  BEHAVIOR_TYPE_AVOIDANCE, BEHAVIOR_TYPE_COMBINATION, BEHAVIOR_TYPE_SAFETY, BEHAVIOR_TYPE_SCENARIO, ScoreBox,
} from './patient/shared'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
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
  getSuggestedSteps,
  getLadderReview,
  getPatientInsights,
  addInsightToPlan,
  removeInsight,
  getPlanRungs,
  draftCombination,
  getStepArrows,
  type DownwardArrow,
  type AvoidanceBehavior,
  type PatientInsight,
  type TriggerSituation,
} from '../../api/treatment'
import {
  dtOf, screenSurface, card, primaryBtn, bigQ, quietLink, Chrome,
} from './sessionKit'
import { Button } from '../../components/ui/primitives'
import { errorMessage } from '../../components/ui/form'
import {
  arrowDoneOn, avoidsTheSituation,
} from './ladderEditor'

/** The full-screen route. A thin wrapper — the editor is the component below, so the Plan tab can
 *  render exactly the same thing without the clinician chrome around it. */
export default function SessionPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()
  // Full screen is a way of looking at the editor, so leaving it goes back to the editor in the
  // Plan tab — `edit=1` — rather than dropping you out onto the ladder. Whichever situation was
  // open comes with you.
  const situation = new URLSearchParams(window.location.search).get('situation')
  const editing = `/patients/${patientId}?tab=plan&edit=1${situation ? `&situation=${situation}` : ''}`
  return (
    <SessionInterview
      patientId={patientId!}
      openSituationId={situation}
      // Leaving full screen keeps you editing; Save ladder is finished, so it lands on the ladder.
      onCollapse={() => navigate(editing)}
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
export function SessionInterview({ patientId, embedded = false, openSituationId, onExit, onCollapse }: {
  patientId: string
  embedded?: boolean
  /** Open with this situation already expanded — how the downward arrow comes back to the screen
   *  it was opened from. */
  openSituationId?: string | null
  /** Finished — show the ladder. */
  onExit: () => void
  /** Leave full screen and carry on editing. Given only on the full-screen route; without it the
   *  way out is "Exit session". */
  onCollapse?: () => void
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
  //
  // A function that returns elements, NOT a component declared in the body. Declaring one here
  // makes a new component type on every render, so React unmounts and rebuilds everything inside
  // it — which is what closed the Add situation panel the moment you added anything.
  const shell = (children: React.ReactNode) =>
    embedded
      ? <div style={{ padding: '4px 0 8px' }}>{children}</div>
      : (
        <Chrome
          onExit={onCollapse ?? onExit}
          exitLabel={onCollapse ? '⛶ Exit full screen' : '← Exit session'}
        >{children}</Chrome>
      )

  if (planLoading) {
    return shell(<div style={{ color: '#6b7a79', fontSize: 14, padding: 40, textAlign: 'center' }}>Loading…</div>)
  }
  if (!plan) {
    return shell(
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--float-primary-dark)' }}>No treatment plan yet</div>
        <p style={{ fontSize: 13.5, color: '#6b7a79', marginTop: 8 }}>Create the plan from the patient page first, then start a session.</p>
        <button onClick={onExit} style={primaryBtn}>Back to patient</button>
      </div>
    )
  }

  return shell(
    <LadderEditor
      planId={plan.id}
      patientId={patientId!}
      triggers={sortedTriggers}
      openSituationId={openSituationId}
      onDone={onExit}
      onArrow={(situationId, rungId) => goToArrow(
        `/patients/${patientId}/arrow?situation=${situationId}${rungId ? `&rung=${rungId}` : ''}`,
      )}
    />
  )
}


/** The heading over a group of situations you can tap to add. Both groups use it — the one from
 *  this child's monitoring log, and the common list — so they read as two of the same thing. */
const sectionLabel: React.CSSProperties = {
  fontSize: 12.5,
  fontWeight: 700,
  color: '#4d8478',
  marginBottom: 7,
}

/**
 * The editor's controls, one look each. Peter, 2026-10-16:
 * - Green: only Edit ladder (on the Plan tab) and Save ladder. Green is kept rare.
 * - White: everything else that is a button. Add, Done, Add situation, Add behavior, Add rung.
 * - Text: show/hide links, DA, and Keep beside Remove.
 * A panel's Done is where the button that opened it was. Add behavior and Add rung sit on the
 * right inside a situation; Add situation sits on the left under the list, a level up.
 */
const panelFooter: React.CSSProperties = {
  display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10, flexWrap: 'wrap',
}
const textBox: React.CSSProperties = {
  flex: 1, minWidth: 0, border: '1px solid #cfe0db', borderRadius: 'var(--float-radius-control)',
  padding: '7px 11px', fontSize: 13, background: 'var(--float-surface)',
}
const showHideLink: React.CSSProperties = { ...quietLink, color: '#4d8478', padding: '2px 0' }
const chipList: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 6, marginTop: 8,
}

// ── The editor ────────────────────────────────────────────────────────────────
export function LadderEditor({ planId, patientId, triggers, openSituationId, onDone, onArrow }: {
  planId: string
  patientId: string
  triggers: TriggerSituation[]
  openSituationId?: string | null
  onDone: () => void
  /** Open the downward arrow on one step. Peter, 2026-10-15: the arrow is done per combination. */
  onArrow: (situationId: string, rungId?: string) => void
}) {
  const qc = useQueryClient()
  const [newName, setNewName] = useState('')
  const [open, setOpen] = useState<Set<string>>(() => new Set(openSituationId ? [openSituationId] : []))
  // Closing the editor puts these steps in front of a child, so it is the moment to look at the
  // ladder as a whole rather than one situation at a time.
  const [reviewing, setReviewing] = useState(false)
  // Set by anything that writes. Peter, 2026-09-05: if you opened the editor and changed nothing,
  // Save should just close — there is nothing new to check, and the same findings again are noise.
  const [edited, setEdited] = useState(false)
  const markEdited = () => setEdited(true)
  // Collapsed behind a button. Adding situations is the first thing you do and then rarely again,
  // so it should not sit open under the list taking up the room the list needs.
  const [adding, setAdding] = useState(false)
  const [showSuggestedSituations, setShowSuggestedSituations] = useState(true)

  // What the parent's monitoring log says this child finds hard — the only suggestions we show,
  // because they are about this child. A generic starter library was removed: too generic to help.
  const { data: fromMonitoring } = useQuery({
    queryKey: ['insights', patientId, 'situation'],
    queryFn: () => getPatientInsights(patientId, 'situation'),
  })
  const invalidateInsights = () =>
    qc.invalidateQueries({ queryKey: ['insights', patientId, 'situation'] })

  const takeMut = useMutation({
    mutationFn: (insightId: string) => addInsightToPlan(patientId, insightId),
    onSuccess: () => { invalidate(); invalidateInsights(); markEdited() },
  })
  const dropMut = useMutation({
    mutationFn: (insightId: string) => removeInsight(patientId, insightId),
    onSuccess: invalidateInsights,
  })

  const review = useQuery({
    queryKey: ['ladder-review', planId],
    queryFn: () => getLadderReview(planId),
    enabled: reviewing,
    staleTime: 0,
    retry: false,
  })
  // Peter, 2026-10-16: if the check finds nothing, just save and close. The panel is only for
  // findings, or for a check that could not run.
  const [checking, setChecking] = useState(false)
  const save = async () => {
    if (!edited) return onDone()
    setChecking(true)
    try {
      const result = await qc.fetchQuery({
        queryKey: ['ladder-review', planId],
        queryFn: () => getLadderReview(planId),
        staleTime: 0,
        retry: false,
      })
      if (result.findings.length === 0) return onDone()
    } catch {
      // Shown in the panel as "Could not check it just now", with Finish still offered.
    } finally {
      setChecking(false)
    }
    setReviewing(true)
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: ['triggers', planId] })
  const addMut = useMutation({
    mutationFn: (name: string) => createTrigger(planId, { name }),
    // The panel stays open for the next one. Situations are listed first, then opened one by one.
    onSuccess: () => {
      invalidate()
      markEdited()
      setNewName('')
    },
  })

  // Every rung on the plan, to see which situations have anything on the ladder yet.
  const { data: rungs } = useQuery({
    queryKey: ['plan-rungs', planId],
    queryFn: () => getPlanRungs(planId),
  })
  // Step 2 of the interview: start with the situation with the lowest Fear Level. The list is
  // already sorted that way, so it is the first one with nothing on the ladder. Advice, not a lock.
  const startHereId = rungs
    ? triggers.find(t => !rungs.some(r => r.trigger_situation_id === t.id))?.id ?? null
    : null

  // One thing open at a time. Peter, 2026-10-16: opening a situation closes any other, and the
  // Add situation panel; opening Add situation closes the situations.
  const toggle = (id: string) => {
    setAdding(false)
    setOpen(prev => (prev.has(id) ? new Set() : new Set([id])))
  }

  return (
    <div style={screenSurface}>
      <div style={bigQ}>What are your trigger situations?</div>

      {triggers.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Names the column. Every box ends 40px in from its card's edge. */}
          <div style={{ display: 'flex', marginBottom: -4 }}>
            <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end', paddingRight: 40 }}>
              <span style={{ width: 46, textAlign: 'center', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#4d8478', lineHeight: 1.15 }}>Fear Level</span>
            </div>
          </div>
          {triggers.map(t => (
            <SituationRow
              key={t.id}
              planId={planId}
              patientId={patientId}
              trigger={t}
              startHere={t.id === startHereId}
              expanded={open.has(t.id)}
              onToggle={() => toggle(t.id)}
              onArrow={rungId => onArrow(t.id, rungId)}
              onEdited={markEdited}
            />
          ))}
        </div>
      )}

      {adding ? (
        <div style={{ marginTop: 14, background: '#f8fbfa', border: '1px solid #dbe8e5', borderRadius: 'var(--float-radius-card)', padding: '14px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              <input value={newName} onChange={e => setNewName(e.target.value)} autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && newName.trim() && !addMut.isPending) addMut.mutate(newName.trim()) }}
                placeholder="Add a situation the child finds hard"
                aria-label="A situation"
                style={textBox} />
              <Button kind="secondary" size="sm" onClick={() => addMut.mutate(newName.trim())}
                disabled={!newName.trim() || addMut.isPending} style={{ flexShrink: 0 }}>
                Add
              </Button>
            </div>

            {/* The same show/hide and chips as the suggested behaviours and rungs. Not shown at all
                when there are none. */}
            {(fromMonitoring ?? []).length > 0 && (
              <div style={{ marginTop: 12 }}>
                <button onClick={() => setShowSuggestedSituations(v => !v)} aria-expanded={showSuggestedSituations}
                  style={showHideLink}>
                  {showSuggestedSituations ? '▾ Hide' : '▸ Show'} suggested situations ({(fromMonitoring ?? []).length})
                </button>
                {showSuggestedSituations && (
                  <div style={chipList}>
                    {(fromMonitoring ?? []).map(item => (
                      <SuggestionChip key={item.id} text={item.name} disabled={takeMut.isPending}
                        onAdd={() => takeMut.mutate(item.id)}
                        // Taken off the list for good, or the same one comes back every week.
                        onDismiss={() => dropMut.mutate(item.id)} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* On the left, where Add situation was pressed. */}
          <div style={{ ...panelFooter, justifyContent: 'flex-start' }}>
            <Button kind="secondary" size="sm" onClick={() => { setAdding(false); setNewName('') }}>Done</Button>
          </div>
        </div>
      ) : (
        // On the left, apart from the buttons inside a situation, which are on the right. Peter,
        // 2026-10-16: they are a different level and must not read as one group of four.
        <div style={{ marginTop: 16 }}>
          <Button kind="secondary" size="sm" onClick={() => { setOpen(new Set()); setAdding(true) }}>
            Add situation
          </Button>
        </div>
      )}

      {/* Closing puts these steps in front of a child, so the ladder gets looked at first. */}
      <div style={{ marginTop: 22, paddingTop: 16, borderTop: '1px solid #eef2f1' }}>
        {!reviewing ? (
          <div style={panelFooter}>
            <Button kind="primary" onClick={save} disabled={checking}>
              {checking ? 'Checking the ladder…' : 'Save ladder'}
            </Button>
          </div>
        ) : (
          <div style={{ background: 'var(--float-surface)', border: '1px solid #dbe8e5', borderRadius: 'var(--float-radius-card)', padding: '14px 16px' }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--float-primary-dark)' }}>Before you finish</div>

            {review.isLoading && (
              <p style={{ fontSize: 13, color: '#6b7a79', margin: '8px 0 0' }}>Checking the ladder…</p>
            )}
            {review.isError && (
              <p style={{ fontSize: 13, color: '#991b1b', margin: '8px 0 0' }}>Could not check it just now.</p>
            )}

            {(review.data?.findings ?? []).length > 0 && (
              <ul style={{ margin: '10px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {review.data!.findings.map(f => (
                  <li key={f.code + f.message} style={{ fontSize: 13, color: '#4b5a59', lineHeight: 1.5 }}>
                    {f.message}
                  </li>
                ))}
              </ul>
            )}

            {/* Said plainly. A clean result here means the arithmetic is fine, not that anyone has
                read whether a step keeps a safety behavior or has a way out built into it. */}
            {review.data?.ai_pending && (
              <p style={{ fontSize: 12, color: 'var(--float-text-hint)', margin: '12px 0 0', lineHeight: 1.5 }}>
                This checks the numbers only — how many steps, where it starts, the gaps between
                them. Nothing yet reads whether a step keeps a safety behavior or has a way out
                built into it.
              </p>
            )}

            <div style={{ ...panelFooter, marginTop: 14 }}>
              <button onClick={() => setReviewing(false)} style={quietLink}>Keep editing</button>
              <Button kind="primary" onClick={onDone}>Save ladder</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/** One situation: its name, its score, and — opened up — the steps underneath it. */
function SituationRow({ planId, patientId, trigger, startHere, expanded, onToggle, onArrow, onEdited }: {
  planId: string
  patientId: string
  trigger: TriggerSituation
  /** The suggested place to begin: lowest Fear Level with nothing on the ladder yet. */
  startHere: boolean
  expanded: boolean
  onToggle: () => void
  onArrow: (rungId?: string) => void
  /** Anything that writes calls this, so Save can skip the review when nothing changed. */
  onEdited: () => void
}) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(trigger.name)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [pending, setPending] = useState<PendingSteps>({})

  const invalidate = () => qc.invalidateQueries({ queryKey: ['triggers', planId] })
  const saveMut = useMutation({
    mutationFn: (data: Parameters<typeof updateTrigger>[2]) => updateTrigger(planId, trigger.id, data),
    onSuccess: () => { invalidate(); onEdited(); setEditing(false) },
  })
  const delMut = useMutation({
    mutationFn: () => deleteTrigger(planId, trigger.id),
    onSuccess: () => {
      invalidate()
      onEdited()
      qc.invalidateQueries({ queryKey: ['plan-rungs', planId] })
      // Adding is the only thing that takes a suggestion off the list, so deleting the situation
      // it created is the way back. The database already does this; the list has to be re-read.
      qc.invalidateQueries({ queryKey: ['insights'] })
    },
  })

  const rename = () => {
    const name = draft.trim()
    if (!name || name === trigger.name) { setEditing(false); setDraft(trigger.name); return }
    saveMut.mutate({ name })
  }

  // Only read once the situation is opened.
  const { data: behaviors } = useQuery({
    queryKey: ['behaviors', trigger.id],
    queryFn: () => getBehaviors(trigger.id),
    enabled: expanded,
  })
  const { data: stepArrows } = useQuery({
    queryKey: ['step-arrows', trigger.id],
    queryFn: () => getStepArrows(trigger.id),
    enabled: expanded,
  })

  return (
    <div style={{ background: 'var(--float-surface)', border: '1px solid #cfe0db', borderRadius: 'var(--float-radius-card)', overflow: 'hidden' }}>
      {/* The header carries the mint ground so a situation reads as the heading over its steps
          rather than another row in the same list. */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '11px 13px',
        background: 'var(--float-primary-light)',
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
            style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--float-text)', padding: '4px 6px', border: '1px solid #cfe3de', borderRadius: 'var(--float-radius-control)' }}
          />
        ) : (
          <button onClick={() => { setDraft(trigger.name); setEditing(true) }} title="Change the wording"
            style={{ flex: '0 1 auto', minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'text', fontSize: 14, fontWeight: 800, color: 'var(--float-primary-dark)' }}>
            {trigger.name}
          </button>
        )}

        {startHere && (
          <span style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 800, color: '#fff', background: '#4d8478', borderRadius: 'var(--float-radius-pill)', padding: '2px 8px' }}>
            Start here
          </span>
        )}

        <span aria-hidden="true" style={{ flex: 1, minWidth: 12, alignSelf: 'flex-end', marginBottom: 5, borderBottom: '1px dotted #a9cfc4' }} />

        <ScoreBox
          value={dtOf(trigger.distress_thermometer_rating)}
          onSet={n => saveMut.mutate({ distress_thermometer_rating: n })}
        />

        {confirmRemove ? (
          <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
            <Button kind="danger" size="sm" onClick={() => delMut.mutate()} disabled={delMut.isPending}>
              Remove
            </Button>
            <button onClick={() => setConfirmRemove(false)} style={quietLink}>Keep</button>
          </span>
        ) : (
          <button onClick={() => setConfirmRemove(true)} title="Take this situation out"
            style={{ fontSize: 15, lineHeight: 1, color: '#cbd8d6', background: 'none', border: 0, cursor: 'pointer', flexShrink: 0, width: 16, padding: 0, textAlign: 'center' }}>×</button>
        )}
      </div>

      {expanded && (
        <SituationBody planId={planId} patientId={patientId} trigger={trigger} behaviors={behaviors ?? []}
          arrows={stepArrows} pending={pending} setPending={setPending} onArrow={onArrow} onEdited={onEdited} />
      )}
    </div>
  )
}

type PendingSteps = Record<string, { text?: string; score?: number }>

/**
 * An opened situation. docs/plans/situation-editor-behaviours-first.md
 *
 * Peter, 2026-10-16: hide things until the clinician has to decide on them. So it opens on one
 * question — what does the child do to avoid it or feel safer — with the list at the top, the add
 * box under it, and the suggestions under that. Done closes all of that, and only then
 * do the downward arrow links and Add rung appear.
 *
 * Nothing goes on the ladder until Done. A safety behavior is saved as soon as it is
 * added, but its step (the combination) is only written on Save. Until then the drafted sentence
 * and its score live on this screen. Peter, 2026-10-15: the therapist reading the sentence before
 * it is saved is the check on what the child will read.
 */
function SituationBody({ planId, patientId, trigger, behaviors, arrows, pending, setPending, onArrow, onEdited }: {
  planId: string
  patientId: string
  trigger: TriggerSituation
  behaviors: AvoidanceBehavior[]
  /** Undefined while loading. */
  arrows: DownwardArrow[] | undefined
  /** Steps not written yet: the clinician's own wording and score, where they changed them. Held
   *  by the situation row, so closing the situation and opening it again keeps them. */
  pending: PendingSteps
  setPending: React.Dispatch<React.SetStateAction<PendingSteps>>
  onArrow: (rungId?: string) => void
  onEdited: () => void
}) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')
  const [showSuggested, setShowSuggested] = useState(true)
  // Which view the clinician chose: Done, or Add behavior. Until they choose, it is
  // read from the rows, so coming back to a finished situation opens it finished.
  const [mode, setMode] = useState<'edit' | 'saved' | null>(null)
  const [addingRung, setAddingRung] = useState(false)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['behaviors', trigger.id] })
    qc.invalidateQueries({ queryKey: ['plan-rungs', planId] })
    qc.invalidateQueries({ queryKey: ['insights', patientId, 'behavior'] })
    onEdited()
  }

  const safety = behaviors.filter(b => b.behavior_type === BEHAVIOR_TYPE_SAFETY)
  const avoidance = behaviors.filter(b => b.behavior_type === BEHAVIOR_TYPE_AVOIDANCE)
  const stepOf = (id: string) =>
    behaviors.find(b => b.behavior_type === BEHAVIOR_TYPE_COMBINATION && b.without_behavior_id === id)
  const noStep = safety.filter(b => !stepOf(b.id))
  // A step waiting to be written always means the behaviours are not saved. Otherwise a situation
  // with something on the ladder already opens saved.
  const saved = noStep.length === 0 && (mode
    ? mode === 'saved'
    : behaviors.some(b => b.behavior_type === BEHAVIOR_TYPE_COMBINATION || b.behavior_type === BEHAVIOR_TYPE_SCENARIO))

  // The sentence for each safety behaviour without a step, drafted as soon as it is on the list.
  // Cached for good, so reopening the situation does not draft it again.
  const drafts = useQueries({
    queries: noStep.map(b => ({
      queryKey: ['combination-draft', b.id],
      queryFn: () => draftCombination(trigger.id, b.id),
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: false,
    })),
  })
  // If the draft call itself fails, the same plain wording the backend falls back to.
  const sentenceFor = (b: AvoidanceBehavior, i: number) =>
    pending[b.id]?.text ?? drafts[i]?.data?.sentence ?? (drafts[i]?.isError ? `${trigger.name} — without: ${b.name}` : '')
  // Float could not word it, so the row asks for it to be reworded before it is saved.
  const needsWording = (b: AvoidanceBehavior, i: number) =>
    pending[b.id]?.text == null && (drafts[i]?.isError || drafts[i]?.data?.drafted_by === 'template')
  const drafting = drafts.some(d => d.isLoading)

  const addMut = useMutation({
    mutationFn: (v: { name: string; type: 'safety' | 'avoidance' }) =>
      createBehavior(trigger.id, { name: v.name, behavior_type: v.type }),
    onSuccess: () => { invalidate(); setDraft(''); setMode('edit') },
  })

  // What the log and sessions say the child does in THIS situation, not yet added, and one
  // avoidance — staying away from the situation — while there is none on the list.
  const { data: suggested } = useQuery({
    queryKey: ['insights', patientId, 'behavior'],
    queryFn: () => getPatientInsights(patientId, 'behavior'),
  })
  const listedNames = new Set(behaviors.map(b => b.name.trim().toLowerCase()))
  const fromLog = (suggested ?? []).filter(i =>
    i.situation_id === trigger.id && !listedNames.has(i.name.trim().toLowerCase()),
  )
  const avoidsIt = avoidsTheSituation(trigger.name)
  const offerAvoidance = avoidance.length === 0
    && !fromLog.some(i => i.behavior_type === BEHAVIOR_TYPE_AVOIDANCE)
  const suggestionCount = fromLog.length + (offerAvoidance ? 1 : 0)

  const takeMut = useMutation({
    // The log did not always say which kind it is. Peter, 2026-10-16: one added by hand is a
    // safety behaviour, so one the log did not type is too.
    mutationFn: (item: PatientInsight) =>
      addInsightToPlan(patientId, item.id, item.behavior_type ? undefined : 'safety'),
    onSuccess: () => { invalidate(); setMode('edit') },
  })
  const dropMut = useMutation({
    mutationFn: (id: string) => removeInsight(patientId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insights', patientId, 'behavior'] }),
  })

  const saveMut = useMutation({
    mutationFn: () => Promise.all(noStep.map((b, i) => createBehavior(trigger.id, {
      name: sentenceFor(b, i).trim(),
      behavior_type: BEHAVIOR_TYPE_COMBINATION,
      without_behavior_id: b.id,
      ...(pending[b.id]?.score != null ? { distress_thermometer_when_refraining: pending[b.id]!.score } : {}),
    }))),
    onSuccess: () => { setPending({}); setMode('saved'); invalidate() },
    // A 409 means another tab already wrote that step. Re-reading shows it.
    onError: invalidate,
  })

  const saveMutRow = useMutation({
    mutationFn: (v: { id: string; data: Parameters<typeof updateBehavior>[2] }) =>
      updateBehavior(trigger.id, v.id, v.data),
    onSuccess: invalidate,
  })
  const delMut = useMutation({
    mutationFn: (id: string) => deleteBehavior(trigger.id, id),
    onSuccess: invalidate,
  })

  // One flat list. Peter, 2026-10-16: lowest Fear Level at the top; added rungs are rows in the
  // same list, not nested under a behaviour. Unscored rows come next, and avoidance last — it is
  // not a rung.
  type Row = { key: string; score: number | null; last?: boolean; node: React.ReactNode }
  const rows: Row[] = []
  safety.forEach(b => {
    const step = stepOf(b.id)
    if (step) {
      const done = !!arrows && arrowDoneOn(step.id, arrows)
      rows.push({
        key: b.id,
        score: dtOf(step.distress_thermometer_when_refraining),
        node: (
          <ListRow
            text={step.name}
            onRename={name => saveMutRow.mutate({ id: step.id, data: { name } })}
            score={dtOf(step.distress_thermometer_when_refraining)}
            onScore={n => saveMutRow.mutate({ id: step.id, data: { distress_thermometer_when_refraining: n } })}
            arrow={saved ? { done, open: () => onArrow(step.id) } : undefined}
            // Takes the behaviour, its step and its downward arrow, so it asks first. Peter,
            // 2026-10-16: the button just says Remove.
            confirmRemove
            onRemove={() => delMut.mutate(b.id)}
          />
        ),
      })
    } else {
      const i = noStep.indexOf(b)
      rows.push({
        key: b.id,
        score: pending[b.id]?.score ?? null,
        node: (
          <ListRow
            text={sentenceFor(b, i)}
            placeholder={drafts[i]?.isLoading ? 'Drafting…' : undefined}
            warning={needsWording(b, i) ? 'Float could not word this. Reword it before saving.' : undefined}
            onRename={text => setPending(p => ({ ...p, [b.id]: { ...p[b.id], text } }))}
            score={pending[b.id]?.score ?? null}
            onScore={score => setPending(p => ({ ...p, [b.id]: { ...p[b.id], score } }))}
            onRemove={() => delMut.mutate(b.id)}
          />
        ),
      })
    }
  })
  // Easier versions, whether added to the situation or (before 2026-10-16) under one step.
  behaviors.filter(b => b.behavior_type === BEHAVIOR_TYPE_SCENARIO).forEach(b => rows.push({
    key: b.id,
    score: dtOf(b.distress_thermometer_when_refraining),
    node: (
      <ListRow
        text={b.name}
        onRename={name => saveMutRow.mutate({ id: b.id, data: { name } })}
        score={dtOf(b.distress_thermometer_when_refraining)}
        onScore={n => saveMutRow.mutate({ id: b.id, data: { distress_thermometer_when_refraining: n } })}
        arrowSlot={saved}
        onRemove={() => delMut.mutate(b.id)}
      />
    ),
  }))
  avoidance.forEach(b => rows.push({
    key: b.id,
    score: null,
    last: true,
    node: (
      <ListRow
        text={b.name}
        onRename={name => saveMutRow.mutate({ id: b.id, data: { name } })}
        onRemove={() => delMut.mutate(b.id)}
      />
    ),
  }))
  const rank = (r: Row) => (r.last ? 2e9 : r.score ?? 1e9)
  rows.sort((a, b) => rank(a) - rank(b))

  const error = addMut.error ?? takeMut.error ?? saveMut.error ?? saveMutRow.error ?? delMut.error ?? dropMut.error

  return (
    <div style={{ background: 'var(--float-surface)', padding: '16px 14px 16px 35px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ ...sectionLabel, marginBottom: 8 }}>What does the child do to avoid it or feel safer?</div>
        {rows.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map(r => <div key={r.key}>{r.node}</div>)}
          </div>
        )}
      </div>

      {!saved && (<>
        <div>
          <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
            <input value={draft} onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && draft.trim() && !addMut.isPending) addMut.mutate({ name: draft.trim(), type: 'safety' }) }}
              placeholder="e.g. sits at the back so the teacher does not call on them"
              aria-label="A safety behavior"
              style={textBox} />
            <Button kind="secondary" size="sm" onClick={() => addMut.mutate({ name: draft.trim(), type: 'safety' })}
              disabled={!draft.trim() || addMut.isPending} style={{ flexShrink: 0 }}>
              Add
            </Button>
          </div>

          {suggestionCount > 0 && (
            <div style={{ marginTop: 12 }}>
              <button onClick={() => setShowSuggested(v => !v)} aria-expanded={showSuggested}
                style={showHideLink}>
                {showSuggested ? '▾ Hide' : '▸ Show'} suggested behaviors ({suggestionCount})
              </button>
              {showSuggested && (
                <div style={chipList}>
                  {offerAvoidance && (
                    <SuggestionChip text={avoidsIt} disabled={addMut.isPending}
                      onAdd={() => addMut.mutate({ name: avoidsIt, type: 'avoidance' })} />
                  )}
                  {fromLog.map(item => (
                    <SuggestionChip key={item.id} text={item.name} disabled={takeMut.isPending}
                      onAdd={() => takeMut.mutate(item)}
                      // Taken off the list for good, or the same one comes back every week.
                      onDismiss={() => dropMut.mutate(item.id)} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* No Cancel: a behavior is saved as soon as it is added, so there is nothing to undo.
            Done writes the steps for any new safety behaviors and closes the panel. */}
        <div style={panelFooter}>
          <Button kind="secondary" size="sm" onClick={() => saveMut.mutate()}
            disabled={drafting || saveMut.isPending}>
            Done
          </Button>
        </div>
      </>)}

      {saved && !addingRung && (
        // Where the panel's own Done will appear, so nothing jumps across.
        <div style={panelFooter}>
          <Button kind="secondary" size="sm" onClick={() => setMode('edit')}>Add behavior</Button>
          <Button kind="secondary" size="sm" onClick={() => setAddingRung(true)}>Add rung</Button>
        </div>
      )}

      {saved && addingRung && (
        <AddRung planId={planId} trigger={trigger} behaviors={behaviors}
          onAdded={invalidate} onClose={() => setAddingRung(false)} />
      )}

      {error && (
        <div role="alert" style={{ fontSize: 12, color: '#991b1b' }}>
          {errorMessage(error, 'Could not save that just now.')}
        </div>
      )}
    </div>
  )
}

/** A rung on the situation itself: typed, or picked from Float's suggestions. */
function AddRung({ planId, trigger, behaviors, onAdded, onClose }: {
  planId: string
  trigger: TriggerSituation
  behaviors: AvoidanceBehavior[]
  onAdded: () => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState('')
  const [suggesting, setSuggesting] = useState(false)
  // Asked for, never automatic: it costs a model call. staleTime 0 so asking again after a
  // downward arrow is done gets a fresh answer that uses its feared outcome.
  const suggestQuery = useQuery({
    queryKey: ['suggested-steps', trigger.id, null],
    queryFn: () => getSuggestedSteps(planId, trigger.id),
    enabled: suggesting,
    staleTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  })
  const addMut = useMutation({
    mutationFn: (name: string) => createBehavior(trigger.id, { name, behavior_type: BEHAVIOR_TYPE_SCENARIO }),
    onSuccess: () => { onAdded(); setDraft('') },
  })
  const taken = new Set(behaviors.map(b => b.name.trim().toLowerCase()))
  const options = (suggestQuery.data?.suggestions ?? []).filter(s => !taken.has(s.trim().toLowerCase()))

  return (
    <div>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} autoFocus
          onKeyDown={e => { if (e.key === 'Enter' && draft.trim() && !addMut.isPending) addMut.mutate(draft.trim()) }}
          placeholder="e.g. walk to the classroom door with mom"
          aria-label="A rung"
          style={textBox} />
        <Button kind="secondary" size="sm" onClick={() => addMut.mutate(draft.trim())}
          disabled={!draft.trim() || addMut.isPending} style={{ flexShrink: 0 }}>
          Add
        </Button>
      </div>

      {/* Asked for rather than shown straight away, because it costs a model call. Nothing is
          written until the clinician picks one. */}
      <div style={{ marginTop: 12 }}>
        <button onClick={() => setSuggesting(v => !v)} aria-expanded={suggesting} style={showHideLink}>
          {suggesting ? '▾ Hide' : '▸ Show'} suggested rungs
        </button>
      </div>
      {suggesting && (
        <div style={chipList}>
          {suggestQuery.isLoading && <div style={{ fontSize: 12.5, color: '#6b7a79' }}>Thinking of easier versions…</div>}
          {suggestQuery.isError && <div style={{ fontSize: 12.5, color: '#991b1b' }}>Could not get suggestions just now.</div>}
          {suggestQuery.data?.blocked && !suggestQuery.isFetching && (
            <div style={{ fontSize: 12.5, color: '#6b7a79' }}>{suggestQuery.data.blocked}</div>
          )}
          {options.map(s => (
            <SuggestionChip key={s} text={s} disabled={addMut.isPending} onAdd={() => addMut.mutate(s)} />
          ))}
        </div>
      )}

      {addMut.isError && (
        <div role="alert" style={{ fontSize: 12, color: '#991b1b', marginTop: 6 }}>
          {errorMessage(addMut.error, 'Could not add that just now.')}
        </div>
      )}

      <div style={{ ...panelFooter, marginTop: 14 }}>
        <Button kind="secondary" size="sm" onClick={onClose}>Done</Button>
      </div>
    </div>
  )
}

/** One suggestion you tap to add. */
function SuggestionChip({ text, disabled, onAdd, onDismiss }: {
  text: string
  disabled: boolean
  onAdd: () => void
  onDismiss?: () => void
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', background: 'var(--float-surface)', border: '1px solid #cfe0db', borderRadius: 'var(--float-radius-pill)', maxWidth: '100%' }}>
      <button onClick={onAdd} disabled={disabled}
        style={{ fontSize: 13, fontWeight: 600, color: 'var(--float-primary-dark)', background: 'transparent', border: 'none', padding: '7px 8px 7px 13px', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ color: '#4d8478', marginRight: 6 }}>+</span>{text}
      </button>
      {onDismiss && (
        <button onClick={onDismiss} title="Not relevant — take it off the list"
          style={{ fontSize: 14, color: '#c3d0cd', background: 'transparent', border: 'none', cursor: 'pointer', padding: '0 11px 0 2px' }}>×</button>
      )}
    </span>
  )
}

/**
 * One row in a situation's list: the wording, its Fear Level, the DA link once the behaviours are
 * saved, and remove. Peter, 2026-10-16: nothing else on the row.
 */
function ListRow({ text, placeholder, warning, onRename, score, onScore, arrow, arrowSlot, confirmRemove, onRemove }: {
  text: string
  placeholder?: string
  warning?: string
  onRename: (next: string) => void
  /** Leave both out for a row with no Fear Level — the avoidance behaviour. */
  score?: number | null
  onScore?: (n: number) => void
  arrow?: { done: boolean; open: () => void }
  /** Keep the DA link's room on a row without one, so every Fear Level box lines up. */
  arrowSlot?: boolean
  /** Removing loses work, so it asks first. */
  confirmRemove?: boolean
  onRemove: () => void
}) {
  const [confirm, setConfirm] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--float-surface)', border: '1px solid #e6efec', borderRadius: 'var(--float-radius-card)', padding: '8px 8px 8px 12px', minHeight: 46 }}>
      {placeholder
        ? <span style={{ flex: 1, fontSize: 13, color: '#9aa9a8' }}>{placeholder}</span>
        : (
          <span style={{ flex: '0 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <InlineText value={text} weight={600} onSave={onRename} />
            {warning && <span style={{ fontSize: 11.5, color: '#b47814' }}>{warning}</span>}
          </span>
        )}
      <span aria-hidden="true" style={{ flex: 1, minWidth: 12, alignSelf: 'flex-end', marginBottom: 9, borderBottom: '1px dotted #dde8e6' }} />
      {onScore && <ScoreBox value={score ?? null} onSet={onScore} />}
      {arrow && (
        <button onClick={arrow.open} title={arrow.done ? 'Downward arrow done — open it' : 'Downward arrow'}
          style={{ ...quietLink, flexShrink: 0, width: 40, fontSize: 12, fontWeight: 700, color: arrow.done ? '#4d8478' : '#9aa9a8', padding: '4px 2px' }}>
          {arrow.done ? '✓ DA' : 'DA'}
        </button>
      )}
      {!arrow && arrowSlot && onScore && <span aria-hidden="true" style={{ flexShrink: 0, width: 40 }} />}
      {confirm ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0 }}>
          <Button kind="danger" size="sm" onClick={() => { setConfirm(false); onRemove() }}>Remove</Button>
          <button onClick={() => setConfirm(false)} style={quietLink}>Keep</button>
        </span>
      ) : (
        <button onClick={() => (confirmRemove ? setConfirm(true) : onRemove())} title="Take this out"
          style={{ fontSize: 14, lineHeight: 1, color: '#cbd8d6', background: 'none', border: 0, cursor: 'pointer', flexShrink: 0, width: 16, padding: 0, textAlign: 'center' }}>×</button>
      )}
    </div>
  )
}

/** Text you click to reword in place. Enter or leaving the box saves; Escape puts it back. */
function InlineText({ value, weight, onSave }: { value: string; weight: number; onSave: (next: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const commit = () => {
    const next = draft.trim()
    setEditing(false)
    if (next && next !== value) onSave(next)
    else setDraft(value)
  }
  return editing ? (
    <input value={draft} autoFocus onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') commit()
        if (e.key === 'Escape') { setDraft(value); setEditing(false) }
      }}
      style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: weight, color: 'var(--float-text)', padding: '3px 5px', border: '1px solid #cfe3de', borderRadius: 'var(--float-radius-control)' }} />
  ) : (
    <button onClick={() => { setDraft(value); setEditing(true) }} title="Change the wording"
      style={{ flex: '0 1 auto', minWidth: 0, textAlign: 'left', background: 'none', border: 0, padding: 0, cursor: 'text', fontSize: 13, fontWeight: weight, color: 'var(--float-text)' }}>
      {value}
    </button>
  )
}
