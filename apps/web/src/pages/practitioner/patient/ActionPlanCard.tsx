/**
 * The action plan, as a card on the patient page's Sessions tab. It copies the patient page's cards
 * (the Treatment Plan card's header, the ladder's rows and section labels, the shared buttons and
 * chips), per CLAUDE.md "Match the existing design". Mockup agreed with Peter 2026-11-27:
 * https://claude.ai/artifact/1N6pVXRJUCJg6HZS9PKC7x. docs/plans/action-plans-build.md
 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  addActionPlanItem, clinicianMarksReward, createActionPlan, deleteActionPlan, deleteActionPlanItem,
  publishActionPlan, updateActionPlanItem,
  type ActionPlan, type ActionPlanItem, type NewItem,
} from '../../../api/action_plans'
import {
  getPatientExperiments, getPlanRungs, getTreatmentPlan, getTriggers,
  type AvoidanceBehavior, type PlannedExperiment,
} from '../../../api/treatment'
import { listAccommodations } from '../../../api/accommodations'
import { listTools, type ToolPage } from '../../../api/tools'
import { btn, chip } from '../../../components/ui/buttons'
import { SessionSetupSheet } from './SessionSetupSheet'
import { card } from './actionPlanCardStyle'

// The patient page's card and its parts (PatientPage.tsx cardStyle, the Treatment Plan header,
// FlatLadder's rows and labels).
const cardHeader: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', padding: '14px 20px', borderBottom: '1px solid var(--float-border)' }
const sectionLabel: CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--float-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }
const groupLabel: CSSProperties = { fontSize: 12, color: 'var(--float-text-hint)', margin: '0 0 10px' }
const row: CSSProperties = { border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-card)', padding: '10px 13px', display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--float-surface)' }
const rowTitle: CSSProperties = { flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--float-text)' }
const field: CSSProperties = { fontFamily: 'inherit', fontSize: 12, padding: '6px 8px', border: '1px solid var(--float-border)', borderRadius: 6, boxSizing: 'border-box', color: 'var(--float-text)', background: 'var(--float-surface)' }
const titleField: CSSProperties = { ...field, flex: 1, fontSize: 14, fontWeight: 600, padding: '5px 8px' }
const hint: CSSProperties = { fontSize: 12, color: 'var(--float-text-hint)', margin: 0 }
const removeBtn: CSSProperties = { background: 'none', border: 'none', color: 'var(--float-text-hint)', cursor: 'pointer', fontSize: 14, padding: '0 2px' }
const divider: CSSProperties = { borderTop: '1px solid var(--float-border)', paddingTop: 20 }
const pill = (tone: 'ready' | 'warn' | 'none'): CSSProperties => ({
  fontSize: 11, fontWeight: 600, borderRadius: 'var(--float-radius-pill)', padding: '2px 8px', whiteSpace: 'nowrap',
  color: tone === 'ready' ? 'var(--float-success)' : tone === 'warn' ? 'var(--float-warning)' : 'var(--float-text-secondary)',
  background: tone === 'ready' ? 'var(--float-primary-light)' : 'var(--float-surface-sunken)',
})

const day = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

/** A text box that saves when you leave it, and takes the saved value when it changes. */
function SaveOnBlur({ value, placeholder, onSave, style, label, required }: {
  value: string; placeholder?: string; onSave: (v: string) => void; style?: CSSProperties; label: string; required?: boolean
}) {
  const [draft, setDraft] = useState(value)
  const [saved, setSaved] = useState(value)
  if (value !== saved) { setSaved(value); setDraft(value) }
  return (
    <input aria-label={label} value={draft} placeholder={placeholder} style={style ?? field}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        if (required && !draft.trim()) { setDraft(value); return }
        if (draft.trim() !== value.trim()) onSave(draft)
      }} />
  )
}

function AddLine({ placeholder, onAdd, label }: { placeholder: string; onAdd: (text: string) => void; label: string }) {
  const [text, setText] = useState('')
  const add = () => { if (text.trim()) { onAdd(text.trim()); setText('') } }
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <input aria-label={label} value={text} placeholder={placeholder} style={{ ...field, flex: '1 1 240px' }}
        onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} />
      <button onClick={add} disabled={!text.trim()} style={btn('secondary', 'sm')}>Add</button>
    </div>
  )
}

// ── Exposures: every ladder step, with whether it is ready ──────────────────

type Readiness = { tone: 'ready' | 'warn' | 'none'; label: string; experiment: PlannedExperiment | null }

/** Ready = set up (not yet done) with High confidence. Peter, 2026-11-27. */
function readinessOf(rungId: string, experiments: PlannedExperiment[]): Readiness {
  const pending = experiments.filter(e => e.avoidance_behavior_id === rungId && (e.status === 'planned' || e.status === 'committed'))
  const high = pending.find(e => e.confidence_level === 'high')
  if (high) return { tone: 'ready', label: 'Ready', experiment: high }
  const set = pending[0]
  if (set?.confidence_level) {
    const c = set.confidence_level
    return { tone: 'warn', label: `${c.charAt(0).toUpperCase()}${c.slice(1)} confidence`, experiment: set }
  }
  return { tone: 'none', label: 'Not ready', experiment: set ?? null }
}

function AddExposure({ patientId, onAdd, onClose, usedRungIds }: {
  patientId: string; onAdd: (rungId: string) => void; onClose: () => void; usedRungIds: Set<string>
}) {
  const qc = useQueryClient()
  const { data: tp } = useQuery({ queryKey: ['plan', patientId], queryFn: () => getTreatmentPlan(patientId) })
  const planId = tp?.id
  const { data: rungs = [] } = useQuery({ queryKey: ['plan-rungs', planId], queryFn: () => getPlanRungs(planId!), enabled: !!planId })
  const { data: triggers = [] } = useQuery({ queryKey: ['triggers', planId], queryFn: () => getTriggers(planId!), enabled: !!planId })
  const { data: experiments = [] } = useQuery({ queryKey: ['experiments', patientId], queryFn: () => getPatientExperiments(patientId) })
  const [settingUp, setSettingUp] = useState<{ rung: AvoidanceBehavior; existing: PlannedExperiment | null } | null>(null)

  const steps = rungs.filter(r => !usedRungIds.has(r.id))
    .sort((a, b) => (a.distress_thermometer_when_refraining ?? 99) - (b.distress_thermometer_when_refraining ?? 99))

  return (
    <div style={{ marginTop: 8, border: '1px solid var(--float-primary)', borderRadius: 'var(--float-radius-card)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--float-primary)' }}>Add an exposure</span>
        <button onClick={onClose} style={{ ...btn('quiet', 'sm'), marginLeft: 'auto' }}>Cancel</button>
      </div>
      {rungs.length === 0 && <p style={hint}>The ladder has no steps yet.</p>}
      {rungs.length > 0 && steps.length === 0 && <p style={hint}>Every step on the ladder is already on the plan.</p>}
      {steps.map(r => {
        const ready = readinessOf(r.id, experiments)
        return (
          <div key={r.id} style={{ border: '1px solid var(--float-border)', borderRadius: 10, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span title="Fear Level" style={{ width: 28, textAlign: 'center', fontSize: 13, fontWeight: 700, color: 'var(--float-text)' }}>{r.distress_thermometer_when_refraining ?? '–'}</span>
            <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--float-text)' }}>{r.name}</span>
            <span style={pill(ready.tone)}>{ready.label}</span>
            {ready.tone === 'ready'
              ? <button onClick={() => onAdd(r.id)} style={btn('primary', 'sm')}>Add</button>
              : <button onClick={() => setSettingUp({ rung: r, existing: ready.experiment })} style={btn('secondary', 'sm')}>
                  {ready.tone === 'warn' ? 'Edit' : 'Set it up'}
                </button>}
          </div>
        )
      })}
      {settingUp && (
        <SessionSetupSheet
          rung={settingUp.rung}
          situationName={triggers.find(t => t.id === settingUp.rung.trigger_situation_id)?.name ?? null}
          existing={settingUp.existing}
          onClose={() => setSettingUp(null)}
          onSaved={saved => {
            setSettingUp(null)
            qc.invalidateQueries({ queryKey: ['experiments', patientId] })
            // Saved with High confidence: it goes on the plan. Otherwise it stays off, showing its level.
            if (saved?.confidence_level === 'high') onAdd(settingUp.rung.id)
          }}
        />
      )}
    </div>
  )
}

// ── Tools and strategies ─────────────────────────────────────────────────────

/** Pick from the Library, then one of its examples or your own; or write one with no page. */
function ToolAdder({ pages, onAdd, parentOnly }: {
  pages: ToolPage[]; parentOnly: boolean
  onAdd: (item: { tool_id?: string; tool_example_id?: string; text?: string; parent_only?: boolean }) => void
}) {
  const [page, setPage] = useState<ToolPage | null>(null)
  const [own, setOwn] = useState<string | null>(null)
  const reset = () => { setPage(null); setOwn(null) }
  const pick = (id: string) => {
    const p = pages.find(x => x.id === id)
    if (!p) return reset()
    if (p.examples.length === 0) { onAdd({ tool_id: p.id }); reset() } else setPage(p)
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {pages.length > 0 && (
          <select aria-label="Add a tool or strategy" value={page?.id ?? ''} onChange={e => { setOwn(null); pick(e.target.value) }}
            style={{ ...btn('secondary', 'sm'), paddingRight: 6 }}>
            <option value="">+ Add a tool or strategy</option>
            {pages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        {page && (
          <select aria-label={`Which one from ${page.name}`} value={own !== null ? '__own' : ''}
            onChange={e => { const v = e.target.value; if (v === '__own') setOwn(''); else if (v) { onAdd({ tool_id: page.id, tool_example_id: v }); reset() } }}
            style={{ ...field, height: 28 }}>
            <option value="">Which one?</option>
            {page.examples.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
            <option value="__own">Write your own</option>
          </select>
        )}
        {page && own !== null && <>
          <input aria-label={`Your own from ${page.name}`} autoFocus value={own} placeholder="Write it here" style={{ ...field, flex: '1 1 200px' }}
            onChange={e => setOwn(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && own.trim()) { onAdd({ tool_id: page.id, text: own.trim() }); reset() } }} />
          <button disabled={!own.trim()} onClick={() => { onAdd({ tool_id: page.id, text: own.trim() }); reset() }} style={btn('secondary', 'sm')}>Add</button>
        </>}
      </div>
      {!page && (
        <AddLine label="Write your own tool or strategy" placeholder={pages.length > 0 ? 'or write your own' : 'Write a tool or strategy'}
          onAdd={text => onAdd({ text, parent_only: parentOnly })} />
      )}
    </div>
  )
}

// ── The plan, in the card ────────────────────────────────────────────────────

function Section({ label, children, first }: { label: string; children: ReactNode; first?: boolean }) {
  return <div style={first ? undefined : divider}><div style={sectionLabel}>{label}</div>{children}</div>
}

export function PlanCard({ patientId, childName, plan, isLatest, onNew }: {
  patientId: string; childName: string; plan: ActionPlan; isLatest: boolean; onNew: () => void
}) {
  const qc = useQueryClient()
  const refresh = () => qc.invalidateQueries({ queryKey: ['action-plans', patientId] })
  const save = (p: ActionPlan) => qc.setQueryData<ActionPlan[]>(['action-plans', patientId], old => (old ?? [p]).map(x => (x.id === p.id ? p : x)))
  const { data: tp } = useQuery({ queryKey: ['plan', patientId], queryFn: () => getTreatmentPlan(patientId) })
  const { data: accommodations = [] } = useQuery({ queryKey: ['accommodations', tp?.id], queryFn: () => listAccommodations(tp!.id), enabled: !!tp?.id })
  const { data: tools = [] } = useQuery({ queryKey: ['tools'], queryFn: listTools })
  const [addingExposure, setAddingExposure] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const addMut = useMutation({ mutationFn: (item: NewItem) => addActionPlanItem(plan.id, item), onSuccess: p => { save(p); setAddingExposure(false) } })
  const editMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateActionPlanItem>[1] }) => updateActionPlanItem(id, data),
    onSuccess: save,
  })
  const removeMut = useMutation({ mutationFn: (id: string) => deleteActionPlanItem(id), onSuccess: refresh })
  const publishMut = useMutation({ mutationFn: () => publishActionPlan(plan.id), onSuccess: save })
  const deleteMut = useMutation({ mutationFn: () => deleteActionPlan(plan.id), onSuccess: refresh })

  const failed = [addMut, editMut, removeMut, publishMut, deleteMut].find(m => m.isError)?.error
  const editable = isLatest
  const shared = !!plan.published_at
  const of = (kind: string) => plan.items.filter(i => i.kind === kind)
  const childTools = of('tool').filter(i => !i.parent_only)
  const parentTools = of('tool').filter(i => i.parent_only)
  const usedRungs = new Set(of('exposure').map(i => i.avoidance_behavior_id).filter((x): x is string => !!x))
  const usedTools = new Set(of('tool').map(i => i.tool_id))
  const canAdd = (t: ToolPage) => t.examples.length > 0 || !usedTools.has(t.id)
  const childPages = tools.filter(t => t.audience !== 'parent' && canAdd(t))
  const parentPages = tools.filter(t => t.audience === 'parent' && canAdd(t))
  const working = accommodations.filter(a => a.status === 'started')
  const accChoices = working.filter(a => !of('accommodation').some(i => i.accommodation_behavior_id === a.id))

  const remove = (i: ActionPlanItem) => editable && (
    <button aria-label={`Remove ${i.label}`} title="Remove" onClick={() => removeMut.mutate(i.id)} style={removeBtn}>×</button>
  )
  const note = (i: ActionPlanItem) => editable
    ? <SaveOnBlur label={`Note on ${i.label}`} value={i.note ?? ''} placeholder="Add a note" onSave={v => editMut.mutate({ id: i.id, data: { note: v } })} />
    : i.note ? <span style={{ fontSize: 12.5, color: 'var(--float-text-secondary)' }}>{i.note}</span> : null
  const title = (i: ActionPlanItem, required = false) => editable
    ? <SaveOnBlur label="Wording on this plan" value={i.label} style={titleField} required={required} onSave={v => editMut.mutate({ id: i.id, data: { text: v } })} />
    : <span style={rowTitle}>{i.label}</span>
  const toolRow = (i: ActionPlanItem) => (
    <div key={i.id} style={row}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{title(i, true)}{remove(i)}</div>
      {i.tool_name && <span style={{ fontSize: 11, color: 'var(--float-text-hint)' }}>From {i.tool_name}</span>}
      {!i.tool_id && <span style={{ fontSize: 11, color: 'var(--float-text-hint)' }}>Written in. No Library page.</span>}
      {(i.example_how_used || (!i.tool_name && i.tool_summary)) && (
        <span style={{ fontSize: 12.5, color: 'var(--float-text-secondary)', lineHeight: 1.5 }}>{i.example_how_used || i.tool_summary}</span>
      )}
      {note(i)}
    </div>
  )
  const addTool = (item: { tool_id?: string; tool_example_id?: string; text?: string; parent_only?: boolean }) =>
    addMut.mutate({ kind: 'tool', ...item })

  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={cardHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="text-sm font-semibold text-slate-700">Action plan</span>
          <span style={{ fontSize: 12, color: 'var(--float-border-strong)' }}>&middot;</span>
          <span style={{ fontSize: 13, color: 'var(--float-text-secondary)' }}>Session {plan.session_number} · {day(plan.session_date)}</span>
          <span style={pill(shared ? 'ready' : 'warn')}>{shared ? 'Shared' : 'Draft'}</span>
        </div>
        {editable && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {!shared && (confirmDelete ? <>
              <span style={{ fontSize: 12.5, color: 'var(--float-text-secondary)' }}>Delete this draft?</span>
              <button onClick={() => deleteMut.mutate()} style={btn('danger', 'sm')}>Yes, delete</button>
              <button onClick={() => setConfirmDelete(false)} style={btn('quiet', 'sm')}>Cancel</button>
            </> : <button onClick={() => setConfirmDelete(true)} style={btn('quiet', 'sm')}>Delete draft</button>)}
            {shared
              ? <button onClick={onNew} style={btn('primary', 'sm')}>+ New action plan</button>
              : <button onClick={() => publishMut.mutate()} disabled={plan.items.length === 0 || publishMut.isPending}
                  style={{ ...btn('primary', 'sm'), opacity: plan.items.length === 0 ? 0.45 : 1 }}>
                  {publishMut.isPending ? 'Sharing…' : 'Share with the family'}
                </button>}
          </div>
        )}
      </div>

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 22 }}>
        <Section label={`${childName}'s work`} first>
          <p style={groupLabel}>What to work on this week</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {of('exposure').map(i => (
              <div key={i.id} style={row}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {title(i)}
                  {i.fear_level != null && <>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--float-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fear Level</span>
                    <span style={{ width: 34, textAlign: 'center', fontSize: 14, fontWeight: 700, border: '1px solid var(--float-border)', borderRadius: 6, padding: '3px 0' }}>{i.fear_level}</span>
                  </>}
                  {remove(i)}
                </div>
                {note(i)}
              </div>
            ))}
            {!editable && of('exposure').length === 0 && <p style={hint}>No exposures.</p>}
          </div>
          {editable && (addingExposure
            ? <AddExposure patientId={patientId} usedRungIds={usedRungs} onClose={() => setAddingExposure(false)}
                onAdd={rungId => addMut.mutate({ kind: 'exposure', avoidance_behavior_id: rungId })} />
            : <button onClick={() => setAddingExposure(true)} style={{ ...btn('secondary', 'sm'), marginTop: 8 }}>+ Add an exposure</button>)}

          <p style={{ ...groupLabel, marginTop: 18 }}>Tools and strategies</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{childTools.map(toolRow)}</div>
          {editable && <ToolAdder pages={childPages} parentOnly={false} onAdd={addTool} />}
        </Section>

        <Section label="Parent work">
          <p style={groupLabel}>What to work on this week</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {of('accommodation').map(i => (
              <div key={i.id} style={row}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={rowTitle}>{i.label}</span>{remove(i)}</div>
                {note(i)}
              </div>
            ))}
          </div>
          {editable && (working.length === 0
            ? <p style={{ ...hint, marginTop: 8 }}>None yet. Mark an accommodation "Working on it" on the Plan tab's Accommodations first.</p>
            : accChoices.length > 0 && (
              <select aria-label="Add an accommodation" value="" onChange={e => e.target.value && addMut.mutate({ kind: 'accommodation', accommodation_behavior_id: e.target.value })}
                style={{ ...btn('secondary', 'sm'), marginTop: 8, paddingRight: 6 }}>
                <option value="">+ Add an accommodation</option>
                {accChoices.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            ))}

          {(parentTools.length > 0 || editable) && <>
            <p style={{ ...groupLabel, marginTop: 18 }}>Strategies for the parent</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{parentTools.map(toolRow)}</div>
            {editable && <ToolAdder pages={parentPages} parentOnly onAdd={addTool} />}
          </>}

          <p style={{ ...groupLabel, marginTop: 18 }}>How to help</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {of('parent_instruction').map(i => (
              <div key={i.id} style={row}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{title(i, true)}{remove(i)}</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--float-text-secondary)' }}>
                  <input type="checkbox" checked={!!i.share_with_child} disabled={!editable}
                    onChange={e => editMut.mutate({ id: i.id, data: { share_with_child: e.target.checked } })} />
                  {childName} sees this too
                </label>
                {note(i)}
              </div>
            ))}
          </div>
          {editable && <AddLine label="Add a line for the parent" placeholder="Add a line for the parent" onAdd={text => addMut.mutate({ kind: 'parent_instruction', text })} />}
        </Section>

        <Section label="Rewards">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {of('reward').map(i => (
              <div key={i.id} style={row}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{title(i, true)}{remove(i)}</div>
                {editable
                  ? <SaveOnBlur label="What it is for" value={i.reward_for ?? ''} placeholder="What it is for" onSave={v => editMut.mutate({ id: i.id, data: { reward_for: v } })} />
                  : i.reward_for && <span style={{ fontSize: 12, color: 'var(--float-text-secondary)' }}>For: {i.reward_for}</span>}
              </div>
            ))}
          </div>
          {editable && <RewardAdder onAdd={(text, reward_for) => addMut.mutate({ kind: 'reward', text, reward_for })} />}
        </Section>

        {failed && (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--float-danger)' }}>
            {(failed as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "That didn't save. Try again."}
          </p>
        )}
      </div>
    </div>
  )
}

function RewardAdder({ onAdd }: { onAdd: (text: string, rewardFor: string) => void }) {
  const [what, setWhat] = useState('')
  const [forWhat, setForWhat] = useState('')
  const add = () => { if (what.trim()) { onAdd(what.trim(), forWhat.trim()); setWhat(''); setForWhat('') } }
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
      <input aria-label="New reward" value={what} placeholder="The reward" style={{ ...field, flex: '1 1 200px' }} onChange={e => setWhat(e.target.value)} />
      <input aria-label="What it is for" value={forWhat} placeholder="What it is for" style={{ ...field, flex: '1 1 200px' }}
        onChange={e => setForWhat(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} />
      <button onClick={add} disabled={!what.trim()} style={btn('secondary', 'sm')}>Add</button>
    </div>
  )
}

// ── Starting the next plan: last week's plan first ───────────────────────────

const KIND_NAME: Record<string, string> = {
  exposure: 'Exposure', tool: 'Tool or strategy', accommodation: 'Accommodation', parent_instruction: 'How to help', reward: 'Reward',
}

export function StartCard({ patientId, last, nextNumber, onStarted, onCancel }: {
  patientId: string; last: ActionPlan | null; nextNumber: number; onStarted: () => void; onCancel: () => void
}) {
  const qc = useQueryClient()
  const carryable = (last?.items ?? []).filter(i => i.kind !== 'reward')
  const [keep, setKeep] = useState<Set<string>>(() => new Set(carryable.map(i => i.id)))
  const rewards = (last?.items ?? []).filter(i => i.kind === 'reward' && i.reward_given_by !== 'parent')
  const rewardMut = useMutation({
    mutationFn: ({ id, given }: { id: string; given: boolean }) => clinicianMarksReward(id, given),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['action-plans', patientId] }),
  })
  const startMut = useMutation({
    mutationFn: () => createActionPlan(patientId, [...keep]),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['action-plans', patientId] }); onStarted() },
  })
  const toggle = (id: string, on: boolean) => setKeep(prev => { const n = new Set(prev); if (on) n.add(id); else n.delete(id); return n })

  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={cardHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="text-sm font-semibold text-slate-700">New action plan</span>
          <span style={{ fontSize: 12, color: 'var(--float-border-strong)' }}>&middot;</span>
          <span style={{ fontSize: 13, color: 'var(--float-text-secondary)' }}>Session {nextNumber}</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={btn('quiet', 'sm')}>Cancel</button>
          <button onClick={() => startMut.mutate()} disabled={startMut.isPending} style={btn('primary', 'sm')}>
            {startMut.isPending ? 'Starting…' : 'Start the plan'}
          </button>
        </div>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 22 }}>
        {carryable.length > 0 && (
          <Section label="Last week's plan" first>
            <p style={groupLabel}>Session {last!.session_number}. Keep practicing what still needs work. The rest is marked done.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {carryable.map(i => (
                <div key={i.id} style={{ ...row, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: 'var(--float-text-hint)' }}>{KIND_NAME[i.kind]}{i.tool_name ? ` · from ${i.tool_name}` : ''}</div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--float-text)' }}>{i.label}</div>
                  </div>
                  <button aria-pressed={keep.has(i.id)} onClick={() => toggle(i.id, true)} style={chip(keep.has(i.id), 'sm')}>Keep practicing</button>
                  <button aria-pressed={!keep.has(i.id)} onClick={() => toggle(i.id, false)} style={chip(!keep.has(i.id), 'sm')}>Done</button>
                </div>
              ))}
            </div>
          </Section>
        )}
        {rewards.length > 0 && (
          <Section label="Rewards" first={carryable.length === 0}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rewards.map(r => (
                <div key={r.id} style={{ ...row, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--float-text)' }}>{r.label}</div>
                    {r.reward_for && <div style={{ fontSize: 12, color: 'var(--float-text-secondary)', marginTop: 2 }}>For: {r.reward_for}</div>}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--float-text-secondary)' }}>Was it given?</span>
                  <button aria-pressed={r.reward_given === true} onClick={() => rewardMut.mutate({ id: r.id, given: true })} style={chip(r.reward_given === true, 'sm')}>Yes</button>
                  <button aria-pressed={r.reward_given === false} onClick={() => rewardMut.mutate({ id: r.id, given: false })} style={chip(r.reward_given === false, 'sm')}>No</button>
                </div>
              ))}
            </div>
            <p style={{ ...hint, marginTop: 8 }}>Shown only for a reward the parent hasn't answered in their app.</p>
          </Section>
        )}
        {carryable.length === 0 && rewards.length === 0 && <p style={hint}>Nothing to carry over. Start the plan to add this week's work.</p>}
        {startMut.isError && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--float-danger)' }}>That didn't work. Try again.</p>}
      </div>
    </div>
  )
}
