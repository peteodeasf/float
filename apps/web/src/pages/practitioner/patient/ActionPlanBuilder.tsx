/**
 * Building an action plan, full screen so the child can see it. docs/plans/action-plans-build.md
 *
 * Two screens: the last plan (keep practicing or done, and any reward the parent has not answered),
 * then the new plan itself — for the child, for the parent, rewards, and the child's confidence.
 * Sharing it with the family needs confidence high.
 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addActionPlanItem, clinicianMarksReward, getActionPlans, createActionPlan, deleteActionPlan, deleteActionPlanItem,
  getTools, publishActionPlan, updateActionPlan, updateActionPlanItem,
  type ActionPlan, type ActionPlanItem, type Confidence, type NewItem,
} from '../../../api/action_plans'
import { getPlanRungs, getTreatmentPlan } from '../../../api/treatment'
import { listAccommodations } from '../../../api/accommodations'
import { chip, btn } from '../../../components/ui/buttons'
import { Chrome, primaryBtn, quietLink } from '../sessionKit'

const heading: CSSProperties = { fontSize: 22, fontWeight: 800, color: 'var(--float-primary-dark)', margin: 0 }
const sectionTitle: CSSProperties = { fontSize: 17, fontWeight: 800, color: 'var(--float-primary-dark)', margin: '0 0 4px' }
const groupTitle: CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--float-text-secondary)', margin: '14px 0 8px' }
const section: CSSProperties = { padding: '22px 0', borderTop: '1px solid var(--float-border)' }
const row: CSSProperties = { background: 'var(--float-surface)', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-card)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }
const input: CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 14, padding: '7px 10px', borderRadius: 'var(--float-radius-control)', border: '1px solid var(--float-border-strong)', fontFamily: 'inherit' }
const noteInput: CSSProperties = { ...input, fontSize: 13, padding: '5px 9px', color: 'var(--float-text-secondary)' }
const hint: CSSProperties = { fontSize: 13, color: 'var(--float-text-hint)', margin: 0 }
const removeBtn: CSSProperties = { background: 'none', border: 'none', color: 'var(--float-text-hint)', cursor: 'pointer', fontSize: 16, padding: '0 4px', lineHeight: 1 }

const CONFIDENCE: { key: Confidence; label: string }[] = [
  { key: 'low', label: 'Low' }, { key: 'medium', label: 'Medium' }, { key: 'high', label: 'High' },
]

function Sheet({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Action plan"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, overflowY: 'auto' }}>
      <Chrome onExit={onClose} exitLabel="← Back to the patient">{children}</Chrome>
    </div>,
    document.body,
  )
}

/** A text box that saves when you leave it. `required`: emptying it puts the old text back. */
function SaveOnBlur({ value, placeholder, onSave, style, label, required }: {
  value: string; placeholder?: string; onSave: (v: string) => void; style?: CSSProperties; label: string; required?: boolean
}) {
  const [draft, setDraft] = useState(value)
  // Take what the server saved, e.g. the rung's own wording after the plan's wording is cleared.
  const [saved, setSaved] = useState(value)
  if (value !== saved) { setSaved(value); setDraft(value) }
  return (
    <input aria-label={label} value={draft} placeholder={placeholder} style={style ?? input}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        if (required && !draft.trim()) { setDraft(value); return }
        if (draft.trim() !== value.trim()) onSave(draft)
      }} />
  )
}

// ── The last plan ────────────────────────────────────────────────────────────

const KIND_NAME: Record<string, string> = {
  exposure: 'Exposure', tool: 'Tool', accommodation: 'Accommodation',
  parent_instruction: 'How to help', reward: 'Reward',
}

/** Before a new plan: which of the last plan's items to keep practicing, and whether each reward
 *  was given when the parent has not said. */
export function LastPlanReview({ patientId, last, onStarted, onClose }: {
  patientId: string; last: ActionPlan; onStarted: (plan: ActionPlan) => void; onClose: () => void
}) {
  const qc = useQueryClient()
  const carryable = last.items.filter(i => i.kind !== 'reward')
  const [keep, setKeep] = useState<Set<string>>(() => new Set(carryable.map(i => i.id)))
  const rewardMut = useMutation({
    mutationFn: ({ id, given }: { id: string; given: boolean }) => clinicianMarksReward(id, given),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['action-plans', patientId] }),
  })
  const startMut = useMutation({
    mutationFn: () => createActionPlan(patientId, [...keep]),
    onSuccess: plan => { qc.invalidateQueries({ queryKey: ['action-plans', patientId] }); onStarted(plan) },
  })
  const rewards = last.items.filter(i => i.kind === 'reward')
  const toggle = (id: string, on: boolean) => setKeep(prev => {
    const next = new Set(prev)
    if (on) next.add(id); else next.delete(id)
    return next
  })

  return (
    <Sheet onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 120px)' }}>
        <h1 style={heading}>Last week's plan</h1>
        <p style={{ ...hint, marginTop: 6 }}>Session {last.session_number}. Keep practicing what still needs work. The rest is marked done.</p>

        {carryable.length > 0 && (
          <div style={{ ...section, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {carryable.map(i => (
              <div key={i.id} style={{ ...row, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--float-text-hint)' }}>{KIND_NAME[i.kind]}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--float-text)' }}>{i.label}</div>
                </div>
                <button aria-pressed={keep.has(i.id)} onClick={() => toggle(i.id, true)} style={chip(keep.has(i.id), 'sm')}>Keep practicing</button>
                <button aria-pressed={!keep.has(i.id)} onClick={() => toggle(i.id, false)} style={chip(!keep.has(i.id), 'sm')}>Done</button>
              </div>
            ))}
          </div>
        )}

        {rewards.length > 0 && (
          <div style={{ ...section, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 style={sectionTitle}>Rewards</h2>
            {rewards.map(r => (
              <div key={r.id} style={{ ...row, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--float-text)' }}>{r.label}</div>
                  {r.reward_for && <div style={{ fontSize: 12.5, color: 'var(--float-text-secondary)' }}>For: {r.reward_for}</div>}
                </div>
                {r.reward_given_by === 'parent' ? (
                  <span style={{ fontSize: 12.5, color: 'var(--float-text-secondary)' }}>Parent said: {r.reward_given ? 'given' : 'not given'}</span>
                ) : (
                  <>
                    <span style={{ fontSize: 12.5, color: 'var(--float-text-secondary)' }}>Was it given?</span>
                    <button aria-pressed={r.reward_given === true} onClick={() => rewardMut.mutate({ id: r.id, given: true })} style={chip(r.reward_given === true, 'sm')}>Yes</button>
                    <button aria-pressed={r.reward_given === false} onClick={() => rewardMut.mutate({ id: r.id, given: false })} style={chip(r.reward_given === false, 'sm')}>No</button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 24 }}>
          {startMut.isError && <p role="alert" style={{ fontSize: 13.5, color: 'var(--float-danger)' }}>That didn't work. Try again.</p>}
          <button onClick={() => startMut.mutate()} disabled={startMut.isPending} style={{ ...primaryBtn, marginTop: 0 }}>
            {startMut.isPending ? 'Starting…' : 'Start the new plan'}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

// ── The plan ─────────────────────────────────────────────────────────────────

export function ActionPlanBuilder({ patientId, childName, plan, onClose, readOnly = false }: {
  patientId: string; childName: string; plan: ActionPlan; onClose: () => void
  /** An older plan: the record of what the family was asked to do that week. */
  readOnly?: boolean
}) {
  const qc = useQueryClient()
  const { data: treatmentPlan } = useQuery({ queryKey: ['plan', patientId], queryFn: () => getTreatmentPlan(patientId) })
  const planId = treatmentPlan?.id
  const { data: rungs } = useQuery({ queryKey: ['plan-rungs', planId], queryFn: () => getPlanRungs(planId!), enabled: !!planId })
  const { data: accommodations } = useQuery({ queryKey: ['accommodations', planId], queryFn: () => listAccommodations(planId!), enabled: !!planId })
  const { data: tools } = useQuery({ queryKey: ['tools'], queryFn: getTools })

  // The latest version of this plan, from the list the Sessions tab already holds.
  const { data: plans } = useQuery({ queryKey: ['action-plans', patientId], queryFn: () => getActionPlans(patientId) })
  const current = plans?.find(p => p.id === plan.id) ?? plan
  const save = (p: ActionPlan) => qc.setQueryData<ActionPlan[]>(['action-plans', patientId],
    old => (old ?? [p]).map(x => (x.id === p.id ? p : x)))
  const refresh = () => qc.invalidateQueries({ queryKey: ['action-plans', patientId] })

  const addMut = useMutation({ mutationFn: (item: NewItem) => addActionPlanItem(current.id, item), onSuccess: save })
  const editMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateActionPlanItem>[1] }) => updateActionPlanItem(id, data),
    onSuccess: save,
  })
  const removeMut = useMutation({ mutationFn: (id: string) => deleteActionPlanItem(id), onSuccess: refresh })
  const confidenceMut = useMutation({ mutationFn: (c: Confidence) => updateActionPlan(current.id, { confidence: c }), onSuccess: save })
  const publishMut = useMutation({ mutationFn: () => publishActionPlan(current.id), onSuccess: p => { save(p); onClose() } })
  const deleteMut = useMutation({ mutationFn: () => deleteActionPlan(current.id), onSuccess: () => { refresh(); onClose() } })
  const [confirmDelete, setConfirmDelete] = useState(false)

  const of = (kind: string) => current.items.filter(i => i.kind === kind)
  const usedRungs = new Set(of('exposure').map(i => i.avoidance_behavior_id))
  const usedTools = new Set(of('tool').map(i => i.tool_id))
  const usedAccs = new Set(of('accommodation').map(i => i.accommodation_behavior_id))
  // Easiest first, like the ladder.
  const rungChoices = (rungs ?? []).filter(r => !usedRungs.has(r.id))
    .sort((a, b) => (a.distress_thermometer_when_refraining ?? 99) - (b.distress_thermometer_when_refraining ?? 99))
  const toolChoices = (tools ?? []).filter(t => !usedTools.has(t.id))
  // Only accommodations the parent is working on: one goes on a plan once the parent is willing.
  const working = (accommodations ?? []).filter(a => a.status === 'started')
  const accChoices = working.filter(a => !usedAccs.has(a.id))

  const canShare = current.confidence === 'high' && current.items.length > 0 && !publishMut.isPending
  const shared = !!current.published_at

  const noteBox = (i: ActionPlanItem) => (
    <SaveOnBlur label={`Note on ${i.label}`} value={i.note ?? ''} placeholder="Add a note" style={noteInput}
      onSave={v => editMut.mutate({ id: i.id, data: { note: v } })} />
  )
  const remove = (i: ActionPlanItem) => (
    <button aria-label={`Remove ${i.label}`} title="Remove" onClick={() => removeMut.mutate(i.id)} style={removeBtn}>×</button>
  )

  return (
    <Sheet onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 'calc(100vh - 120px)' }}>
        <h1 style={heading}>Action plan</h1>
        <p style={{ ...hint, marginTop: 6 }}>
          Session {current.session_number} · {new Date(current.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {shared ? ' · Shared with the family' : ' · Draft'}
        </p>
        {readOnly && <p style={{ ...hint, marginTop: 6, color: 'var(--float-text-secondary)' }}>An older plan. Only the latest one can be changed.</p>}

        <fieldset disabled={readOnly} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>

        {/* For the child */}
        <div style={section}>
          <h2 style={sectionTitle}>For {childName}</h2>

          <div style={groupTitle}>Exposures</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {of('exposure').map(i => (
              <div key={i.id} style={row}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <SaveOnBlur label="Wording on this plan" value={i.label} onSave={v => editMut.mutate({ id: i.id, data: { text: v } })} />
                  {i.fear_level != null && <span title="Fear Level" style={{ fontSize: 12, fontWeight: 700, color: 'var(--float-text-secondary)', flexShrink: 0 }}>{i.fear_level}</span>}
                  {remove(i)}
                </div>
                {i.text && i.rung_name && <span style={{ fontSize: 11.5, color: 'var(--float-text-hint)' }}>On the ladder: {i.rung_name}</span>}
                {noteBox(i)}
              </div>
            ))}
          </div>
          <Picker label="Add an exposure"
            empty={(rungs ?? []).length === 0 ? 'The ladder has no steps yet.' : 'Every step on the ladder is already on the plan.'}
            options={rungChoices.map(r => ({ id: r.id, name: r.distress_thermometer_when_refraining != null ? `${r.name} (${r.distress_thermometer_when_refraining})` : r.name }))}
            onPick={id => addMut.mutate({ kind: 'exposure', avoidance_behavior_id: id })} />

          <div style={groupTitle}>Tools</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {of('tool').map(i => (
              <div key={i.id} style={row}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--float-text)' }}>{i.label}</span>
                  {remove(i)}
                </div>
                {i.tool_description && <span style={{ fontSize: 12.5, color: 'var(--float-text-secondary)' }}>{i.tool_description}</span>}
                {noteBox(i)}
              </div>
            ))}
          </div>
          {tools && tools.length === 0
            ? <p style={{ ...hint, marginTop: 8 }}>The tools list is empty. Tools are added in the admin app.</p>
            : <Picker label="Add a tool" empty="Every tool is already on the plan."
                options={toolChoices.map(t => ({ id: t.id, name: t.name }))}
                onPick={id => addMut.mutate({ kind: 'tool', tool_id: id })} />}
        </div>

        {/* For the parent */}
        <div style={section}>
          <h2 style={sectionTitle}>For the parent</h2>

          <div style={groupTitle}>Accommodations to work on</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {of('accommodation').map(i => (
              <div key={i.id} style={row}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--float-text)' }}>{i.label}</span>
                  {remove(i)}
                </div>
                {noteBox(i)}
              </div>
            ))}
          </div>
          {working.length === 0
            ? <p style={{ ...hint, marginTop: 8 }}>None yet. Mark an accommodation "Working on it" on the Accommodations tab first.</p>
            : <Picker label="Add an accommodation" empty="Every accommodation they are working on is on the plan."
                options={accChoices.map(a => ({ id: a.id, name: a.name }))}
                onPick={id => addMut.mutate({ kind: 'accommodation', accommodation_behavior_id: id })} />}

          <div style={groupTitle}>How to help</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {of('parent_instruction').map(i => (
              <div key={i.id} style={row}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <SaveOnBlur label="How to help" required value={i.label} onSave={v => editMut.mutate({ id: i.id, data: { text: v } })} />
                  {remove(i)}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--float-text-secondary)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!i.share_with_child}
                    onChange={e => editMut.mutate({ id: i.id, data: { share_with_child: e.target.checked } })} />
                  {childName} sees this too
                </label>
                {noteBox(i)}
              </div>
            ))}
          </div>
          <AddText placeholder="e.g. When they cry, acknowledge it once, then don't keep reassuring"
            onAdd={text => addMut.mutate({ kind: 'parent_instruction', text })} />
        </div>

        {/* Rewards */}
        <div style={section}>
          <h2 style={sectionTitle}>Rewards</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            {of('reward').map(i => (
              <div key={i.id} style={row}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <SaveOnBlur label="Reward" required value={i.label} onSave={v => editMut.mutate({ id: i.id, data: { text: v } })} />
                  {remove(i)}
                </div>
                <SaveOnBlur label="What it is for" value={i.reward_for ?? ''} placeholder="What it is for"
                  style={noteInput} onSave={v => editMut.mutate({ id: i.id, data: { reward_for: v } })} />
              </div>
            ))}
          </div>
          <AddReward onAdd={(text, reward_for) => addMut.mutate({ kind: 'reward', text, reward_for })} />
        </div>

        {/* Confidence */}
        <div style={section}>
          <h2 style={sectionTitle}>How sure is {childName} they can do all of this?</h2>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            {CONFIDENCE.map(c => (
              <button key={c.key} aria-pressed={current.confidence === c.key}
                onClick={() => confidenceMut.mutate(c.key)} style={chip(current.confidence === c.key, 'md')}>{c.label}</button>
            ))}
          </div>
          {current.confidence && current.confidence !== 'high' && (
            <p style={{ ...hint, marginTop: 10, color: 'var(--float-text-secondary)' }}>Make the plan easier, then ask again. It can be shared once they say high.</p>
          )}
        </div>

        </fieldset>

        <div style={{ marginTop: 'auto', paddingTop: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          {shared || readOnly ? (
            <button onClick={onClose} style={{ ...primaryBtn, marginTop: 0 }}>Done</button>
          ) : (
            <button onClick={() => publishMut.mutate()} disabled={!canShare}
              style={{ ...primaryBtn, marginTop: 0, opacity: canShare ? 1 : 0.45, cursor: canShare ? 'pointer' : 'not-allowed' }}>
              {publishMut.isPending ? 'Sharing…' : 'Share with the family'}
            </button>
          )}
          {!shared && !readOnly && (confirmDelete ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              Delete this draft?
              <button onClick={() => deleteMut.mutate()} style={btn('danger', 'sm')}>Yes, delete</button>
              <button onClick={() => setConfirmDelete(false)} style={quietLink}>Cancel</button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} style={quietLink}>Delete draft</button>
          ))}
          {(addMut.isError || editMut.isError || publishMut.isError) && (
            <p role="alert" style={{ fontSize: 13.5, color: 'var(--float-danger)', margin: 0, width: '100%' }}>That didn't save. Try again.</p>
          )}
        </div>
      </div>
    </Sheet>
  )
}

function Picker({ label, options, onPick, empty }: {
  label: string; options: { id: string; name: string }[]; onPick: (id: string) => void; empty: string
}) {
  if (options.length === 0) return <p style={{ ...hint, marginTop: 8 }}>{empty}</p>
  return (
    <select aria-label={label} value="" onChange={e => { if (e.target.value) onPick(e.target.value) }}
      style={{ ...input, marginTop: 8, color: 'var(--float-primary)', fontWeight: 700, cursor: 'pointer', background: 'var(--float-surface)' }}>
      <option value="">+ {label}</option>
      {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  )
}

function AddText({ placeholder, onAdd }: { placeholder: string; onAdd: (text: string) => void }) {
  const [text, setText] = useState('')
  const add = () => { if (text.trim()) { onAdd(text.trim()); setText('') } }
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
      <input aria-label="New line" value={text} placeholder={placeholder} style={input}
        onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} />
      <button onClick={add} disabled={!text.trim()} style={btn('secondary', 'sm')}>Add</button>
    </div>
  )
}

function AddReward({ onAdd }: { onAdd: (text: string, rewardFor: string) => void }) {
  const [what, setWhat] = useState('')
  const [forWhat, setForWhat] = useState('')
  const add = () => { if (what.trim()) { onAdd(what.trim(), forWhat.trim()); setWhat(''); setForWhat('') } }
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
      <input aria-label="New reward" value={what} placeholder="The reward, e.g. pick the movie on Friday"
        style={{ ...input, flex: '1 1 220px' }} onChange={e => setWhat(e.target.value)} />
      <input aria-label="What it is for" value={forWhat} placeholder="What it is for"
        style={{ ...input, flex: '1 1 220px' }} onChange={e => setForWhat(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') add() }} />
      <button onClick={add} disabled={!what.trim()} style={btn('secondary', 'sm')}>Add</button>
    </div>
  )
}
