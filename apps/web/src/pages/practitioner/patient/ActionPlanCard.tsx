/**
 * The action plan on the Plan tab's Action plan sub-tab: a view for checking in, and an edit view
 * with Save. Both copy the patient page's cards (the Treatment Plan card's header, the ladder's rows
 * and labels, the shared buttons and chips), per CLAUDE.md "Match the existing design".
 * Mockup agreed with Peter 2026-11-27: https://claude.ai/artifact/1N6pVXRJUCJg6HZS9PKC7x.
 * docs/plans/action-plans-build.md
 */
import { useState, type CSSProperties, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  setCheckNote, tickItem,
  type ActionPlan, type ActionPlanItem, type ItemIn, type PlanIn, type Recording,
} from '../../../api/action_plans'
import {
  getPatientExperiments, getPlanRungs, getTreatmentPlan, getTriggers,
  type AvoidanceBehavior, type PlannedExperiment,
} from '../../../api/treatment'
import { listAccommodations } from '../../../api/accommodations'
import { listTools, type ToolPage } from '../../../api/tools'
import { btn } from '../../../components/ui/buttons'
import { SessionSetupSheet } from './SessionSetupSheet'
import { RecordExposureSheet } from './RecordExposureSheet'
import { card, range } from './actionPlanCardStyle'

const cardHeader: CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', padding: '12px 20px', borderBottom: '1px solid var(--float-border)' }
const sectionLabel: CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--float-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }
// The editor's sections: a pale band with the Case Summary's teal heading, then named groups.
// Mockup agreed with Peter 2026-11-27: https://claude.ai/artifact/3bRyryh7o8z9KDdaQ7TmqY.
const sectionBand: CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', padding: '12px 20px', background: 'var(--float-surface-muted)', borderBottom: '1px solid var(--float-border)' }
const sectionTitle: CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--float-primary)', textTransform: 'uppercase', letterSpacing: '0.06em' }
const groupTitle: CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--float-text)' }
const row: CSSProperties = { border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-card)', padding: '10px 13px', display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--float-surface)' }
const rowTitle: CSSProperties = { flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--float-text)' }
const field: CSSProperties = { fontFamily: 'inherit', fontSize: 12, padding: '6px 8px', border: '1px solid var(--float-border)', borderRadius: 6, boxSizing: 'border-box', color: 'var(--float-text)', background: 'var(--float-surface)' }
const titleField: CSSProperties = { ...field, flex: 1, fontSize: 14, fontWeight: 600, padding: '5px 8px' }
const hint: CSSProperties = { fontSize: 12, color: 'var(--float-text-hint)', margin: 0 }
const removeBtn: CSSProperties = { background: 'none', border: 'none', color: 'var(--float-text-hint)', cursor: 'pointer', fontSize: 14, padding: '0 2px' }
const linkBtn: CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--float-primary)' }
const pill = (tone: 'ready' | 'warn' | 'none'): CSSProperties => ({
  fontSize: 11, fontWeight: 600, borderRadius: 'var(--float-radius-pill)', padding: '2px 8px', whiteSpace: 'nowrap',
  color: tone === 'ready' ? 'var(--float-success)' : tone === 'warn' ? 'var(--float-warning)' : 'var(--float-text-secondary)',
  background: tone === 'ready' ? 'var(--float-primary-light)' : 'var(--float-surface-sunken)',
})

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const weekday = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const errText = (e: unknown) => (e as { response?: { data?: { detail?: string } } } | null)?.response?.data?.detail ?? "That didn't save. Try again."

type Group = { match: (i: { kind: string; parent_only?: boolean | null }) => boolean }
const SECTIONS: { label: (child: string) => string; groups: Group[] }[] = [
  { label: c => `${c}'s work`, groups: [
    { match: i => i.kind === 'exposure' },
    { match: i => i.kind === 'tool' && !i.parent_only },
  ] },
  { label: () => 'Parent work', groups: [
    { match: i => i.kind === 'accommodation' },
    { match: i => i.kind === 'tool' && !!i.parent_only },
    { match: i => i.kind === 'parent_instruction' },
  ] },
  { label: () => 'Rewards', groups: [{ match: i => i.kind === 'reward' }] },
]

// ── The view: checking in ────────────────────────────────────────────────────

function whoTicked(i: ActionPlanItem): string {
  const when = i.done_at ? ` · ${shortDate(i.done_at)}` : ''
  if (i.done_by === 'child') return `In their app${when}`
  if (i.done_by === 'parent') return `Parent, in their app${when}`
  return `In session${when}`
}

function recordingLine(r: Recording): string {
  const parts = [r.recorded_by === 'clinician' ? 'in session' : r.recorded_by === 'child' ? 'by the child' : null]
  if (r.fear_expected != null || r.fear_felt != null) parts.push(`Fear Level ${r.fear_expected ?? '–'} expected, ${r.fear_felt ?? '–'} felt`)
  if (r.belief_before != null || r.belief_after != null) parts.push(`belief ${r.belief_before ?? '–'}% → ${r.belief_after ?? '–'}%`)
  if (r.feared_outcome_occurred === false) parts.push("didn't happen")
  if (r.feared_outcome_occurred === true) parts.push('it happened')
  return parts.filter(Boolean).join(' · ')
}

function NoteField({ initial, onSave, onCancel }: { initial: string; onSave: (note: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(initial)
  return (
    <div style={{ display: 'flex', gap: 8, padding: '2px 0 6px 26px' }}>
      <input aria-label="Check-in note" autoFocus value={draft} placeholder="A note only you will see" onChange={e => setDraft(e.target.value)} style={{ ...field, flex: 1 }}
        onKeyDown={e => { if (e.key === 'Enter') onSave(draft); if (e.key === 'Escape') onCancel() }} />
      <button onClick={() => onSave(draft)} style={btn('secondary', 'sm')}>Save</button>
      <button onClick={onCancel} style={btn('quiet', 'sm')}>Cancel</button>
    </div>
  )
}

export function PlanView({ patientId, childName, plan, onEdit, onNew, onShare, sharing, shareError }: {
  patientId: string; childName: string; plan: ActionPlan; onEdit?: () => void; onNew?: () => void
  /** A draft's Share with family. docs/plans/action-plan-drafts.md */
  onShare?: () => void; sharing?: boolean; shareError?: unknown
}) {
  const qc = useQueryClient()
  const save = (p: ActionPlan) => qc.setQueryData<ActionPlan[]>(['action-plans', patientId], old => (old ?? [p]).map(x => (x.id === p.id ? p : x)))
  const tickMut = useMutation({ mutationFn: ({ id, done }: { id: string; done: boolean }) => tickItem(id, done), onSuccess: save })
  const noteMut = useMutation({ mutationFn: ({ id, note }: { id: string; note: string }) => setCheckNote(id, note), onSuccess: save })
  const [noting, setNoting] = useState<string | null>(null)
  const [recording, setRecording] = useState<ActionPlanItem | null>(null)
  const closed = plan.state === 'closed'
  // A draft is not shared yet: nothing on it can be ticked, recorded or noted.
  const draft = plan.state === 'draft'
  const { data: experiments = [] } = useQuery({ queryKey: ['experiments', patientId], queryFn: () => getPatientExperiments(patientId), enabled: draft })
  const unready = draft ? plan.items.filter(i => i.kind === 'exposure' && i.avoidance_behavior_id && readinessOf(i.avoidance_behavior_id, experiments).tone !== 'ready') : []

  const draftLine = (i: ActionPlanItem) => (
    <div key={i.id} style={{ borderBottom: '1px solid var(--float-surface-sunken)', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
      <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: i.label ? 'var(--float-text)' : 'var(--float-text-hint)' }}>
        {i.label || 'Blank line'}
        {i.kind === 'reward' && i.reward_for && <span style={{ fontWeight: 400, color: 'var(--float-text-secondary)' }}> · for {i.reward_for}</span>}
      </span>
      {unready.includes(i) && i.avoidance_behavior_id && <span style={pill(readinessOf(i.avoidance_behavior_id, experiments).tone)}>{readinessOf(i.avoidance_behavior_id, experiments).label}</span>}
    </div>
  )

  const line = (i: ActionPlanItem) => draft ? draftLine(i) : (
    <div key={i.id} style={{ borderBottom: '1px solid var(--float-surface-sunken)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0' }}>
        <input type="checkbox" aria-label={i.label} checked={i.done} disabled={tickMut.isPending}
          aria-readonly={i.kind === 'exposure'} title={i.kind === 'exposure' ? 'Done once it is recorded' : undefined}
          // An exposure is ticked by recording it, so its box only shows the state.
          onChange={() => { if (i.kind !== 'exposure') tickMut.mutate({ id: i.id, done: !i.done }) }}
          style={{ width: 16, height: 16, flexShrink: 0, accentColor: 'var(--float-primary)', cursor: i.kind === 'exposure' ? 'default' : 'pointer' }} />
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--float-text)' }}>
          {i.label}
          {i.kind === 'reward' && i.reward_for && <span style={{ fontWeight: 400, color: 'var(--float-text-secondary)' }}> · for {i.reward_for}</span>}
        </span>
        {i.kind === 'exposure'
          ? <>
              <span style={{ fontSize: 12, fontWeight: i.recordings?.length ? 600 : 400, color: i.recordings?.length ? 'var(--float-success)' : 'var(--float-text-hint)' }}>
                {i.recordings?.length ? `${i.recordings.length} recorded` : 'Not recorded yet'}
              </span>
              {i.avoidance_behavior_id && !closed && <button onClick={() => setRecording(i)} style={{ ...btn('secondary', 'sm'), height: 24, fontSize: 12 }}>Record one</button>}
            </>
          : i.done && <span style={{ fontSize: 12, color: 'var(--float-text-secondary)' }}>{i.kind === 'reward' ? 'Given · ' : ''}{whoTicked(i)}</span>}
        {!i.check_note && noting !== i.id && <button onClick={() => setNoting(i.id)} style={linkBtn}>+ Note</button>}
      </div>
      {i.kind === 'exposure' && !!i.recordings?.length && (
        <div style={{ padding: '0 0 6px 26px', display: 'flex', flexDirection: 'column', gap: 3, fontSize: 12, color: 'var(--float-text-secondary)' }}>
          {i.recordings.map(r => (
            <span key={r.id}><b style={{ color: 'var(--float-text)', fontWeight: 600 }}>{r.completed_date ? weekday(r.completed_date) : ''}</b> · {recordingLine(r)}</span>
          ))}
        </div>
      )}
      {noting === i.id
        ? <NoteField initial={i.check_note ?? ''} onSave={note => { noteMut.mutate({ id: i.id, note }); setNoting(null) }} onCancel={() => setNoting(null)} />
        : i.check_note && (
          <button onClick={() => setNoting(i.id)} title="Change the note"
            style={{ ...linkBtn, display: 'block', fontWeight: 400, fontStyle: 'italic', color: 'var(--float-text-secondary)', textAlign: 'left', padding: '0 0 6px 26px' }}>
            Note: {i.check_note}
          </button>
        )}
    </div>
  )

  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={cardHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="text-sm font-semibold text-slate-700">Action plan</span>
          <span style={{ fontSize: 12, color: 'var(--float-border-strong)' }}>&middot;</span>
          <span style={{ fontSize: 13, color: 'var(--float-text-secondary)' }}>{range(plan)}</span>
          {draft
            ? <span style={pill('warn')}>Draft · not shared</span>
            : <>
                <span style={pill(closed ? 'none' : 'ready')}>{closed ? 'Closed' : plan.state === 'upcoming' ? 'Starts soon' : 'Current'}</span>
                <span style={{ fontSize: 12, color: 'var(--float-text-secondary)', marginLeft: 4 }}>{plan.done_count} of {plan.items.length} done</span>
              </>}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {onEdit && !closed && <button onClick={onEdit} style={btn('secondary', 'sm')}>Edit</button>}
          {onShare && <button onClick={onShare} disabled={sharing} style={btn('primary', 'sm')}>{sharing ? 'Sharing…' : 'Share with family'}</button>}
          {onNew && <button onClick={onNew} style={btn('primary', 'sm')}>+ New action plan</button>}
        </div>
      </div>
      <div style={{ padding: '14px 20px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {SECTIONS.map((sec, n) => {
          const items = sec.groups.flatMap(g => plan.items.filter(g.match))
          if (items.length === 0) return null
          return <div key={n}><div style={sectionLabel}>{sec.label(childName)}</div>{items.map(line)}</div>
        })}
        {draft && (
          <p style={{ margin: 0, fontSize: 12, color: 'var(--float-text-secondary)' }}>
            {plan.items.length === 0 ? 'Nothing on it yet. ' : ''}{childName}'s family can't see this yet.
            {unready.length > 0 && ' To share it, set up each exposure with High confidence.'}
          </p>
        )}
        {!!shareError && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--float-danger)' }}>{errText(shareError)}</p>}
        {(tickMut.isError || noteMut.isError) && (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--float-danger)' }}>{errText(tickMut.error ?? noteMut.error)}</p>
        )}
      </div>
      {recording?.avoidance_behavior_id && (
        <RecordExposureSheet patientId={patientId} rungId={recording.avoidance_behavior_id} title={recording.label}
          onClose={() => setRecording(null)}
          onSaved={() => {
            setRecording(null)
            qc.invalidateQueries({ queryKey: ['action-plans', patientId] })
            qc.invalidateQueries({ queryKey: ['experiments', patientId] })
          }} />
      )}
    </div>
  )
}

// ── The edit view: Save sends the whole plan ─────────────────────────────────

/** A line being edited. `label` and the display fields are for showing it; the rest is what is saved. */
type Draft = ItemIn & { key: string; label: string; tool_name?: string | null; summary?: string | null; fear_level?: number | null }

let nextKey = 0
const newKey = () => `new-${nextKey++}`

function draftsFrom(plan: ActionPlan | null): Draft[] {
  return (plan?.items ?? []).map(i => ({
    key: i.id, id: i.id, kind: i.kind, label: i.label,
    avoidance_behavior_id: i.avoidance_behavior_id, accommodation_behavior_id: i.accommodation_behavior_id,
    tool_id: i.tool_id, tool_example_id: i.tool_example_id, text: i.text ?? null, reward_for: i.reward_for,
    note: i.note, share_with_child: i.share_with_child, parent_only: i.parent_only,
    tool_name: i.tool_name, summary: i.example_how_used || (!i.tool_name ? i.tool_summary : null), fear_level: i.fear_level,
  }))
}

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

function AddExposure({ patientId, onAdd, onClose, usedRungIds, draft }: {
  patientId: string; onAdd: (rung: AvoidanceBehavior) => void; onClose: () => void; usedRungIds: Set<string>
  /** A draft takes any step; sharing checks the set-up. */
  draft: boolean
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
              ? <button onClick={() => onAdd(r)} style={btn('primary', 'sm')}>Add</button>
              : <>
                  <button onClick={() => setSettingUp({ rung: r, existing: ready.experiment })} style={btn('secondary', 'sm')}>
                    {ready.tone === 'warn' ? 'Edit' : 'Set it up'}
                  </button>
                  {draft && <button onClick={() => onAdd(r)} style={btn('secondary', 'sm')}>Add to draft</button>}
                </>}
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
            const rung = settingUp.rung
            setSettingUp(null)
            qc.invalidateQueries({ queryKey: ['experiments', patientId] })
            // Saved with High confidence: it goes on the plan. Otherwise it stays off, showing its level.
            if (saved?.confidence_level === 'high') onAdd(rung)
          }}
        />
      )}
    </div>
  )
}

/** Pick from the Library, then one of its examples or your own; or write one with no page. */
function ToolAdder({ pages, onAdd, parentOnly }: { pages: ToolPage[]; parentOnly: boolean; onAdd: (d: Draft) => void }) {
  const [page, setPage] = useState<ToolPage | null>(null)
  const [own, setOwn] = useState<string | null>(null)
  const [free, setFree] = useState('')
  const reset = () => { setPage(null); setOwn(null) }
  const fromPage = (p: ToolPage, label: string, extra: Partial<Draft>) =>
    onAdd({ key: newKey(), kind: 'tool', tool_id: p.id, label, tool_name: label !== p.name ? p.name : null, parent_only: p.audience === 'parent', ...extra })
  const pick = (id: string) => {
    const p = pages.find(x => x.id === id)
    if (!p) return reset()
    if (p.examples.length === 0) { fromPage(p, p.name, { summary: p.summary }); reset() } else setPage(p)
  }
  return (
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
          onChange={e => {
            const v = e.target.value
            if (v === '__own') { setOwn(''); return }
            const ex = page.examples.find(x => x.id === v)
            if (ex) { fromPage(page, ex.name, { tool_example_id: ex.id, summary: ex.how_used }); reset() }
          }}
          style={{ ...field, height: 28 }}>
          <option value="">Which one?</option>
          {page.examples.map(ex => <option key={ex.id} value={ex.id}>{ex.name}</option>)}
          <option value="__own">Write your own</option>
        </select>
      )}
      {page && own !== null && <>
        <input aria-label={`Your own from ${page.name}`} autoFocus value={own} placeholder="Write it here" style={{ ...field, flex: '1 1 200px' }} onChange={e => setOwn(e.target.value)} />
        <button disabled={!own.trim()} onClick={() => { fromPage(page, own.trim(), { text: own.trim() }); reset() }} style={btn('secondary', 'sm')}>Add</button>
      </>}
      {!page && <>
        <input aria-label="Write your own tool or strategy" value={free} placeholder={pages.length > 0 ? 'or write your own' : 'Write a tool or strategy'}
          style={{ ...field, flex: '1 1 240px' }} onChange={e => setFree(e.target.value)} />
        <button disabled={!free.trim()} onClick={() => { onAdd({ key: newKey(), kind: 'tool', text: free.trim(), label: free.trim(), parent_only: parentOnly }); setFree('') }}
          style={btn('secondary', 'sm')}>Add</button>
      </>}
    </div>
  )
}

function Section({ label, aside, children, first }: { label: string; aside: string; children: ReactNode; first?: boolean }) {
  return (
    <section>
      <div style={first ? sectionBand : { ...sectionBand, borderTop: '1px solid var(--float-border)' }}>
        <span style={sectionTitle}>{label}</span>
        <span style={{ fontSize: 12, color: 'var(--float-text-secondary)' }}>{aside}</span>
      </div>
      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 28 }}>{children}</div>
    </section>
  )
}

/** A named group in a section: its title, its lines, then the controls that add to it. */
function Group({ label, children }: { label: string; children: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><span style={groupTitle}>{label}</span>{children}</div>
}

/** The lines in a group, or nothing when there are none, so an empty group has no extra gap. */
function Lines({ children }: { children: ReactNode[] }) {
  return children.length ? <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div> : null
}

function isoDay(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function PlanEditor({ patientId, childName, plan, saving, error, onSave, onCancel }: {
  patientId: string; childName: string; plan: ActionPlan | null; saving: boolean; error: unknown
  onSave: (body: PlanIn) => void; onCancel: () => void
}) {
  // A new plan or a draft saves as a draft or is shared; a shared plan just saves.
  const isDraft = !plan || plan.state === 'draft'
  const qc = useQueryClient()
  const [startsOn, setStartsOn] = useState(() => plan?.starts_on ?? isoDay(new Date()))
  const [endsOn, setEndsOn] = useState(() => plan?.ends_on ?? isoDay(new Date(Date.now() + 7 * 86400000)))
  const [items, setItems] = useState<Draft[]>(() => draftsFrom(plan))
  const [addingExposure, setAddingExposure] = useState(false)
  const [instruction, setInstruction] = useState('')
  const [reward, setReward] = useState({ text: '', reward_for: '' })
  const { data: tp } = useQuery({ queryKey: ['plan', patientId], queryFn: () => getTreatmentPlan(patientId) })
  const { data: accommodations = [] } = useQuery({ queryKey: ['accommodations', tp?.id], queryFn: () => listAccommodations(tp!.id), enabled: !!tp?.id })
  const { data: tools = [] } = useQuery({ queryKey: ['tools'], queryFn: listTools })
  const { data: experiments = [] } = useQuery({ queryKey: ['experiments', patientId], queryFn: () => getPatientExperiments(patientId), enabled: isDraft })
  const { data: rungs = [] } = useQuery({ queryKey: ['plan-rungs', tp?.id], queryFn: () => getPlanRungs(tp!.id), enabled: isDraft && !!tp?.id })
  const { data: triggers = [] } = useQuery({ queryKey: ['triggers', tp?.id], queryFn: () => getTriggers(tp!.id), enabled: isDraft && !!tp?.id })
  const [settingUp, setSettingUp] = useState<{ rung: AvoidanceBehavior; existing: PlannedExperiment | null } | null>(null)

  const add = (d: Draft) => setItems(prev => [...prev, d])
  const patch = (k: string, p: Partial<Draft>) => setItems(prev => prev.map(i => (i.key === k ? { ...i, ...p } : i)))
  const remove = (k: string) => setItems(prev => prev.filter(i => i.key !== k))
  const of = (match: (i: Draft) => boolean) => items.filter(match)
  const usedRungs = new Set(items.filter(i => i.kind === 'exposure').map(i => i.avoidance_behavior_id).filter((x): x is string => !!x))
  const usedTools = new Set(items.map(i => i.tool_id))
  const canAdd = (t: ToolPage) => t.examples.length > 0 || !usedTools.has(t.id)
  const working = accommodations.filter(a => a.status === 'started')
  const accChoices = working.filter(a => !items.some(i => i.accommodation_behavior_id === a.id))
  const badDates = endsOn < startsOn
  const emptyText = items.some(d => (d.kind === 'parent_instruction' || d.kind === 'reward' || (d.kind === 'tool' && !d.tool_id)) && !(d.text ?? '').trim())
  // On a draft, the exposures not yet set up with High confidence: they block sharing.
  const readiness = (d: Draft) => (isDraft && d.kind === 'exposure' && d.avoidance_behavior_id ? readinessOf(d.avoidance_behavior_id, experiments) : null)
  const unready = items.some(d => { const r = readiness(d); return r !== null && r.tone !== 'ready' })
  const canShare = !saving && items.length > 0 && !badDates && !emptyText && !unready
  const canSaveDraft = !saving && !badDates

  const removeX = (d: Draft) => <button aria-label={`Remove ${d.label}`} title="Remove" onClick={() => remove(d.key)} style={removeBtn}>×</button>
  const noteBox = (d: Draft) => (
    <input aria-label={`Note on ${d.label}`} value={d.note ?? ''} placeholder="Add a note the family will see" style={field}
      onChange={e => patch(d.key, { note: e.target.value })} />
  )
  // Rewording keeps the line's link; an example reworded becomes this plan's own words.
  const wording = (d: Draft) => (
    <input aria-label="Wording on this plan" value={d.label} style={titleField}
      onChange={e => { const v = e.target.value; patch(d.key, { label: v, text: v, tool_example_id: d.kind === 'tool' ? null : d.tool_example_id }) }} />
  )
  const toolRow = (d: Draft) => (
    <div key={d.key} style={row}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>{wording(d)}{removeX(d)}</div>
      {d.tool_name && <span style={{ fontSize: 11, color: 'var(--float-text-hint)' }}>From {d.tool_name}</span>}
      {!d.tool_id && <span style={{ fontSize: 11, color: 'var(--float-text-hint)' }}>Written in. No Library page.</span>}
      {d.summary && <span style={{ fontSize: 12.5, color: 'var(--float-text-secondary)', lineHeight: 1.5 }}>{d.summary}</span>}
      {noteBox(d)}
    </div>
  )
  const body = (): ItemIn[] => items.map(d => ({
    id: d.id, kind: d.kind, avoidance_behavior_id: d.avoidance_behavior_id, accommodation_behavior_id: d.accommodation_behavior_id,
    tool_id: d.tool_id, tool_example_id: d.tool_example_id, text: d.text, reward_for: d.reward_for, note: d.note,
    share_with_child: d.share_with_child, parent_only: d.parent_only,
  }))

  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={cardHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span className="text-sm font-semibold text-slate-700">{!plan ? 'New action plan' : isDraft ? 'Edit draft' : 'Edit action plan'}</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--float-text-secondary)' }}>
            From <input type="date" value={startsOn} onChange={e => setStartsOn(e.target.value)} style={{ ...field, padding: '3px 6px' }} />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--float-text-secondary)' }}>
            to <input type="date" value={endsOn} onChange={e => setEndsOn(e.target.value)} style={{ ...field, padding: '3px 6px' }} />
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onCancel} style={btn('quiet', 'sm')}>Cancel</button>
          {isDraft && (
            <button disabled={!canSaveDraft} onClick={() => onSave({ starts_on: startsOn, ends_on: endsOn, items: body(), draft: true })}
              style={{ ...btn('secondary', 'sm'), opacity: canSaveDraft ? 1 : 0.45 }}>
              Save draft
            </button>
          )}
          <button disabled={!canShare} title={isDraft && !canShare ? 'Every line needs text, and every exposure a High set-up' : undefined}
            onClick={() => onSave({ starts_on: startsOn, ends_on: endsOn, items: body(), draft: false })}
            style={{ ...btn('primary', 'sm'), opacity: canShare ? 1 : 0.45 }}>
            {saving ? 'Saving…' : isDraft ? 'Save and share' : 'Save'}
          </button>
        </div>
      </div>

      <Section label={`${childName}'s work`} aside={`What ${childName} practices this week`} first>
        <Group label="Exposures">
          <Lines>
            {of(i => i.kind === 'exposure').map(d => (
              <div key={d.key} style={row}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {wording(d)}
                  {(() => {
                    const r = readiness(d)
                    if (!r || r.tone === 'ready') return null
                    const rung = rungs.find(x => x.id === d.avoidance_behavior_id)
                    return <>
                      <span style={pill(r.tone)}>{r.label}</span>
                      {rung && <button onClick={() => setSettingUp({ rung, existing: r.experiment })} style={btn('secondary', 'sm')}>
                        {r.tone === 'warn' ? 'Edit set-up' : 'Set it up'}
                      </button>}
                    </>
                  })()}
                  {d.fear_level != null && <>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--float-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fear Level</span>
                    <span style={{ width: 34, textAlign: 'center', fontSize: 14, fontWeight: 700, border: '1px solid var(--float-border)', borderRadius: 6, padding: '3px 0' }}>{d.fear_level}</span>
                  </>}
                  {removeX(d)}
                </div>
                {noteBox(d)}
              </div>
            ))}
          </Lines>
          {addingExposure
            ? <AddExposure patientId={patientId} usedRungIds={usedRungs} draft={isDraft} onClose={() => setAddingExposure(false)}
                onAdd={r => { add({ key: newKey(), kind: 'exposure', avoidance_behavior_id: r.id, label: r.name, fear_level: r.distress_thermometer_when_refraining }); setAddingExposure(false) }} />
            : <button onClick={() => setAddingExposure(true)} style={{ ...btn('secondary', 'sm'), alignSelf: 'flex-start' }}>+ Add an exposure</button>}
        </Group>
        <Group label="Tools and strategies">
          <Lines>{of(i => i.kind === 'tool' && !i.parent_only).map(toolRow)}</Lines>
          <ToolAdder pages={tools.filter(t => t.audience !== 'parent' && canAdd(t))} parentOnly={false} onAdd={add} />
        </Group>
      </Section>

      <Section label="Parent work" aside="What the parent works on this week">
        <Group label="Accommodations">
          <Lines>
            {of(i => i.kind === 'accommodation').map(d => (
              <div key={d.key} style={row}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={rowTitle}>{d.label}</span>{removeX(d)}</div>
                {noteBox(d)}
              </div>
            ))}
          </Lines>
          {working.length === 0
            ? <p style={hint}>None yet. Mark an accommodation "Working on it" on the Accommodations sub-tab first.</p>
            : accChoices.length > 0 && (
              <select aria-label="Add an accommodation" value=""
                onChange={e => { const a = accChoices.find(x => x.id === e.target.value); if (a) add({ key: newKey(), kind: 'accommodation', accommodation_behavior_id: a.id, label: a.name }) }}
                style={{ ...btn('secondary', 'sm'), alignSelf: 'flex-start', paddingRight: 6 }}>
                <option value="">+ Add an accommodation</option>
                {accChoices.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            )}
        </Group>
        <Group label="Strategies for the parent">
          <Lines>{of(i => i.kind === 'tool' && !!i.parent_only).map(toolRow)}</Lines>
          <ToolAdder pages={tools.filter(t => t.audience === 'parent' && canAdd(t))} parentOnly onAdd={add} />
        </Group>
        <Group label="How to help">
          <Lines>
            {of(i => i.kind === 'parent_instruction').map(d => (
              <div key={d.key} style={row}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input aria-label="How to help" value={d.text ?? ''} style={titleField} onChange={e => patch(d.key, { text: e.target.value, label: e.target.value })} />
                  {removeX(d)}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--float-text-secondary)' }}>
                  <input type="checkbox" checked={!!d.share_with_child} onChange={e => patch(d.key, { share_with_child: e.target.checked })} />
                  {childName} sees this too
                </label>
                {noteBox(d)}
              </div>
            ))}
          </Lines>
          <div style={{ display: 'flex', gap: 8 }}>
            <input aria-label="Add a line for the parent" value={instruction} placeholder="Add a line for the parent" style={{ ...field, flex: 1 }} onChange={e => setInstruction(e.target.value)} />
            <button disabled={!instruction.trim()} onClick={() => { add({ key: newKey(), kind: 'parent_instruction', text: instruction.trim(), label: instruction.trim() }); setInstruction('') }} style={btn('secondary', 'sm')}>Add</button>
          </div>
        </Group>
      </Section>

      <Section label="Rewards" aside={`What ${childName} earns, and for what`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Lines>
            {of(i => i.kind === 'reward').map(d => (
              <div key={d.key} style={row}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input aria-label="Reward" value={d.text ?? ''} style={titleField} onChange={e => patch(d.key, { text: e.target.value, label: e.target.value })} />
                  {removeX(d)}
                </div>
                <input aria-label="What it is for" value={d.reward_for ?? ''} placeholder="What it is for" style={field} onChange={e => patch(d.key, { reward_for: e.target.value })} />
              </div>
            ))}
          </Lines>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input aria-label="New reward" value={reward.text} placeholder="The reward" style={{ ...field, flex: '1 1 200px' }} onChange={e => setReward({ ...reward, text: e.target.value })} />
            <input aria-label="What the new reward is for" value={reward.reward_for} placeholder="What it is for" style={{ ...field, flex: '1 1 200px' }} onChange={e => setReward({ ...reward, reward_for: e.target.value })} />
            <button disabled={!reward.text.trim()}
              onClick={() => { add({ key: newKey(), kind: 'reward', text: reward.text.trim(), reward_for: reward.reward_for.trim() || null, label: reward.text.trim() }); setReward({ text: '', reward_for: '' }) }}
              style={btn('secondary', 'sm')}>Add</button>
          </div>
        </div>
      </Section>

      {(badDates || !!error) && (
        <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {badDates && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--float-danger)' }}>The plan has to end after it starts.</p>}
          {!!error && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--float-danger)' }}>{errText(error)}</p>}
        </div>
      )}
      {settingUp && (
        <SessionSetupSheet
          rung={settingUp.rung}
          situationName={triggers.find(t => t.id === settingUp.rung.trigger_situation_id)?.name ?? null}
          existing={settingUp.existing}
          onClose={() => setSettingUp(null)}
          onSaved={() => { setSettingUp(null); qc.invalidateQueries({ queryKey: ['experiments', patientId] }) }}
        />
      )}
    </div>
  )
}
