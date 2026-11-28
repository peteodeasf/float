/**
 * The Progress tab's action plan view: This plan / All plans. Each exposure is a small grid, a
 * column per day, so it reads at a glance: did they do it (or try and find it too hard), Fear Level
 * and Belief before and after, and whether the feared outcome happened. Then the plan's other items.
 * Mockup agreed with Peter 2026-11-28: https://claude.ai/artifact/3bRyryh7o8z9KDdaQ7TmqY#artboard-Progress
 * docs/plans/progress-tab-action-plan.md
 */
import { Fragment, useState, type CSSProperties, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getActionPlans, type ActionPlan, type ActionPlanItem } from '../../../api/action_plans'
import { listAccommodationCheckins, type AccommodationCheckin } from '../../../api/accommodations'
import type { PlannedExperiment } from '../../../api/treatment'
import { answerInfo } from '../../../lib/checkin'
import {
  columnsFor, countsOf, exposureRungs, localDay, planToShow, sharedPlans,
  type Attempt, type Column, type Counts,
} from '../../../lib/planProgress'
import { card, range } from './actionPlanCardStyle'

const MARK: Record<Attempt, { sign: string; color: string; label: string }> = {
  done: { sign: '✓', color: 'var(--float-success)', label: 'done' },
  hard: { sign: '◐', color: '#7c3aed', label: 'tried, too hard' },
  missed: { sign: '✗', color: 'var(--float-warning)', label: 'not done' },
  soon: { sign: '○', color: 'var(--float-text-hint)', label: 'coming up' },
}
const head: CSSProperties = { display: 'flex', alignItems: 'baseline', gap: 12, padding: '12px 20px', background: 'var(--float-surface-muted)', borderBottom: '1px solid var(--float-border)' }
const th: CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--float-text-secondary)', textAlign: 'center', padding: '6px 8px', borderBottom: '1px solid var(--float-border)', whiteSpace: 'nowrap' }
const td: CSSProperties = { fontSize: 13, textAlign: 'center', padding: '7px 8px', borderBottom: '1px solid var(--float-surface-sunken)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const rowLabel: CSSProperties = { ...td, textAlign: 'left', paddingLeft: 20, width: 130, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--float-text-secondary)' }
const eyebrow: CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--float-primary)' }
const divider = '2px solid var(--float-border-strong)'

const dayLabel = (day: string) => new Date(`${day}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const num = (v: number | null | undefined) => (v == null ? null : Math.round(Number(v)))
const pair = (a: number | null | undefined, b: number | null | undefined, unit = '') =>
  num(a) == null && num(b) == null ? '' : `${num(a) ?? '–'} → ${num(b) ?? '–'}${unit}`

export function PlanProgress({ patientId, planId, childName, experiments, graph }: {
  patientId: string; planId: string | null; childName: string; experiments: PlannedExperiment[]; graph: ReactNode
}) {
  const { data: plans } = useQuery({ queryKey: ['action-plans', patientId], queryFn: () => getActionPlans(patientId) })
  const { data: checkins = [] } = useQuery({ queryKey: ['accommodation-checkins', planId], queryFn: () => listAccommodationCheckins(planId!), enabled: !!planId })
  const [view, setView] = useState<'plan' | 'all'>('plan')
  const [picked, setPicked] = useState<string | null>(null)
  const today = localDay(new Date().toISOString())

  if (!plans) return null
  const shared = sharedPlans(plans)
  if (shared.length === 0) {
    return <>
      <div style={{ ...card, padding: 20, fontSize: 13, color: 'var(--float-text-hint)' }}>No action plan has been shared yet. Progress shows here once one is.</div>
      {graph}
    </>
  }
  const showing = shared.find(p => p.id === picked) ?? planToShow(plans)!
  const earlier = [...shared].reverse().filter(p => p.id !== showing.id)

  const switcher = (
    <div data-walkthrough="progress-switch" style={{ display: 'flex', border: '1px solid var(--float-border)', borderRadius: 8, overflow: 'hidden' }}>
      {(['plan', 'all'] as const).map(v => (
        <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
          style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 700, padding: '5px 14px', cursor: 'pointer', border: 0,
            background: view === v ? 'var(--float-primary)' : 'var(--float-surface)', color: view === v ? '#fff' : 'var(--float-text-secondary)' }}>
          {v === 'plan' ? 'This plan' : 'All plans'}
        </button>
      ))}
    </div>
  )
  const legend = (
    <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--float-text-secondary)', display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {(Object.keys(MARK) as Attempt[]).map(a => <span key={a}><b style={{ color: MARK[a].color }}>{MARK[a].sign}</b> {MARK[a].label}</span>)}
    </span>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {switcher}
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--float-text)' }}>
          {view === 'plan'
            ? `Action plan · ${range(showing)}`
            : `${shared.length} action plan${shared.length === 1 ? '' : 's'} · ${range({ starts_on: shared[0].starts_on, ends_on: shared[shared.length - 1].ends_on })}`}
        </span>
        {view === 'plan' && showing.state !== 'closed' && <span style={{ fontSize: 11, fontWeight: 600, borderRadius: 'var(--float-radius-pill)', padding: '2px 8px', color: 'var(--float-success)', background: 'var(--float-primary-light)' }}>{showing.state === 'upcoming' ? 'Starts soon' : 'Current'}</span>}
        {view === 'plan' && picked && <button onClick={() => setPicked(null)} style={{ fontFamily: 'inherit', fontSize: 12, fontWeight: 600, color: 'var(--float-primary)', background: 'none', border: 0, cursor: 'pointer' }}>Back to the current plan</button>}
        {legend}
      </div>

      {view === 'plan' ? <>
        {exposureRungs([showing]).map(r => (
          <ExposureGrid key={r.id} name={r.name} groups={[{ plan: null, cols: columnsFor(r.id, showing, plans, experiments, today) }]} />
        ))}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
          <ItemBox title={`${childName}'s to-dos`} items={showing.items.filter(i => i.kind === 'tool' && !i.parent_only)} render={i => tickCell(i)} />
          <ItemBox title="Parent" items={showing.items.filter(i => i.kind === 'accommodation' || i.kind === 'parent_instruction' || (i.kind === 'tool' && !!i.parent_only))}
            render={i => parentCell(i, showing, checkins)} />
          <ItemBox title="Rewards" items={showing.items.filter(i => i.kind === 'reward')} render={i => tickCell(i, 'Given')} />
        </div>
        {graph}
        {earlier.length > 0 && (
          <div style={{ ...card, padding: '12px 20px' }}>
            <div style={{ ...eyebrow, color: 'var(--float-text-secondary)', marginBottom: 4 }}>{picked ? 'Other action plans' : 'Earlier action plans'}</div>
            {earlier.map((p, n) => {
              const c = sumCounts(exposureRungs([p]).map(r => countsOf(columnsFor(r.id, p, plans, experiments, today))))
              return (
                <button key={p.id} onClick={() => setPicked(p.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', fontFamily: 'inherit', fontSize: 13.5, background: 'none', border: 0, borderBottom: n < earlier.length - 1 ? '1px solid var(--float-surface-sunken)' : 0, cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontWeight: 600, color: 'var(--float-text)' }}>{range(p)}</span>
                  <span style={{ color: 'var(--float-text-secondary)' }}>Exposures tried {c.tried} of {c.of}</span>
                  <span style={{ marginLeft: 'auto', color: 'var(--float-text-hint)' }} aria-hidden="true">›</span>
                </button>
              )
            })}
          </div>
        )}
      </> : <>
        {exposureRungs(plans).map(r => (
          <ExposureGrid key={r.id} name={r.name} groups={shared.map(p => ({ plan: p, cols: columnsFor(r.id, p, plans, experiments, today) })).filter(g => g.cols.length > 0)} />
        ))}
        <AllItems plans={shared} checkins={checkins} childName={childName} />
        {graph}
      </>}
    </div>
  )
}

function sumCounts(cs: Counts[]): Counts {
  return cs.reduce((a, c) => ({ tried: a.tried + c.tried, done: a.done + c.done, hard: a.hard + c.hard, missed: a.missed + c.missed, of: a.of + c.of }),
    { tried: 0, done: 0, hard: 0, missed: 0, of: 0 })
}

/** One exposure: its header counts and a column per day, grouped by plan in the All plans view. */
function ExposureGrid({ name, groups }: { name: string; groups: { plan: ActionPlan | null; cols: Column[] }[] }) {
  const cols = groups.flatMap(g => g.cols)
  const c = countsOf(cols)
  const soon = cols.length - c.of
  const big = (n: number, color: string) => <b style={{ color, fontSize: 14 }}>{n}</b>
  const starts = new Set(groups.filter(g => g.plan).map(g => g.cols[0]?.exp.id))
  const cell = (col: Column, children: ReactNode) => (
    <td key={col.exp.id} style={{ ...td, borderLeft: starts.has(col.exp.id) ? divider : undefined }}>{children}</td>
  )
  const row = (label: string, render: (col: Column) => ReactNode) => (
    <tr><td style={rowLabel}>{label}</td>{cols.map(col => cell(col, render(col)))}<td style={{ ...td, width: '100%' }} /></tr>
  )
  const done = (col: Column) => col.attempt === 'done'
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={head}>
        <span style={{ flex: 1, fontSize: 14.5, fontWeight: 700, color: 'var(--float-text)' }}>{name}</span>
        <span style={{ fontSize: 13, color: 'var(--float-text-secondary)' }}>
          {c.of === 0 && soon === 0
            ? 'Not scheduled or done in these dates'
            : <>Tried {big(c.tried, 'var(--float-primary)')} of {c.of} · Done {big(c.done, 'var(--float-primary)')} · Too hard {big(c.hard, MARK.hard.color)} · Not done {big(c.missed, MARK.missed.color)}{soon > 0 ? ` · ${soon} coming up` : ''}</>}
        </span>
      </div>
      {cols.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              {groups.some(g => g.plan) && (
                <tr>
                  <th style={{ ...th, background: 'var(--float-surface-muted)' }} />
                  {groups.map(g => (
                    <th key={g.plan!.id} colSpan={g.cols.length} style={{ ...th, ...eyebrow, fontSize: 10.5, background: 'var(--float-surface-muted)', borderLeft: divider }}>
                      {range(g.plan!)}{g.plan!.state === 'current' ? ' · current' : ''}
                    </th>
                  ))}
                  <th style={{ ...th, background: 'var(--float-surface-muted)' }} />
                </tr>
              )}
              <tr>
                <th style={{ ...th, textAlign: 'left', paddingLeft: 20, width: 130 }} />
                {cols.map(col => <th key={col.exp.id} style={{ ...th, borderLeft: starts.has(col.exp.id) ? divider : undefined }}>{dayLabel(col.day)}</th>)}
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {row('Did it', col => (
                <span style={{ color: MARK[col.attempt].color, fontWeight: 800 }}>
                  {MARK[col.attempt].sign}{col.attempt === 'hard' && <span style={{ fontSize: 12, fontWeight: 700 }}> Too hard</span>}
                  {col.attempt === 'hard' && col.exp.too_hard_reason && (
                    <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--float-text-secondary)', marginTop: 2, whiteSpace: 'normal', maxWidth: 140 }}>"{col.exp.too_hard_reason}"</div>
                  )}
                </span>
              ))}
              {row('Fear Level', col => (done(col) ? pair(col.exp.distress_thermometer_expected, col.exp.distress_thermometer_actual) : ''))}
              {row('Belief', col => (done(col) ? pair(col.exp.bip_before, col.exp.bip_after, '%') : ''))}
              {row('Feared outcome', col => (done(col) && col.exp.feared_outcome_occurred != null ? (col.exp.feared_outcome_occurred ? 'Yes' : 'No') : ''))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

type Cell = { sign?: string; color?: string; text: string }

function tickCell(i: ActionPlanItem, doneText?: string): Cell {
  return i.done
    ? { sign: '✓', color: 'var(--float-success)', text: `${doneText ? `${doneText} ` : ''}${i.done_at ? shortDay(i.done_at) : ''}`.trim() }
    : { sign: '✗', color: 'var(--float-warning)', text: doneText ? 'Not given' : '' }
}

/** The parent's weekly answer for this accommodation during this plan: the latest one. */
function checkinFor(i: ActionPlanItem, plan: ActionPlan, checkins: AccommodationCheckin[]): AccommodationCheckin | null {
  return checkins
    .filter(c => c.accommodation_id === i.accommodation_behavior_id && c.week_start <= plan.ends_on && c.week_start >= addDays(plan.starts_on, -6))
    .sort((a, b) => b.week_start.localeCompare(a.week_start))[0] ?? null
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00`)
  d.setDate(d.getDate() + n)
  return localDay(d.toISOString())
}

function parentCell(i: ActionPlanItem, plan: ActionPlan, checkins: AccommodationCheckin[]): Cell {
  if (i.kind === 'accommodation') {
    const c = checkinFor(i, plan, checkins)
    const info = c ? answerInfo(c.answer) : null
    return info ? { sign: '●', color: info.color, text: info.clinicianLabel } : { text: 'No check-in' }
  }
  // Parents cannot tick a how-to-help line yet; a tick here is the clinician's.
  if (i.kind === 'parent_instruction' && !i.done) return { text: 'No tick' }
  return tickCell(i)
}

function ItemBox({ title, items, render }: { title: string; items: ActionPlanItem[]; render: (i: ActionPlanItem) => Cell }) {
  return (
    <div style={{ ...card, padding: '12px 18px' }}>
      <div style={{ ...eyebrow, marginBottom: 4 }}>{title}</div>
      {items.length === 0 && <p style={{ margin: '6px 0', fontSize: 12.5, color: 'var(--float-text-hint)' }}>None on this plan.</p>}
      {items.map((i, n) => {
        const c = render(i)
        return (
          <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', fontSize: 13.5, borderBottom: n < items.length - 1 ? '1px solid var(--float-surface-sunken)' : 0 }}>
            <span style={{ width: 18, textAlign: 'center', fontWeight: 800, color: c.color ?? 'var(--float-text-hint)' }}>{c.sign ?? '–'}</span>
            <span style={{ flex: 1, color: 'var(--float-text)' }}>{i.label}</span>
            <span style={{ fontSize: 12, color: c.color && c.sign !== '✗' ? 'var(--float-text-secondary)' : 'var(--float-text-hint)' }}>{c.text}</span>
          </div>
        )
      })}
    </div>
  )
}

/** All plans: the to-dos, parent items and rewards in one table, a column per plan. */
function AllItems({ plans, checkins, childName }: { plans: ActionPlan[]; checkins: AccommodationCheckin[]; childName: string }) {
  const groups: { title: string; match: (i: ActionPlanItem) => boolean; render: (i: ActionPlanItem, p: ActionPlan) => Cell }[] = [
    { title: `${childName}'s to-dos`, match: i => i.kind === 'tool' && !i.parent_only, render: i => tickCell(i) },
    { title: 'Parent', match: i => i.kind === 'accommodation' || i.kind === 'parent_instruction' || (i.kind === 'tool' && !!i.parent_only), render: (i, p) => parentCell(i, p, checkins) },
    { title: 'Rewards', match: i => i.kind === 'reward', render: i => tickCell(i, 'Given') },
  ]
  // The same line on several plans is one row: its link, else its wording.
  const keyOf = (i: ActionPlanItem) => `${i.kind}:${i.accommodation_behavior_id ?? i.tool_example_id ?? i.tool_id ?? ''}:${i.label}`
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', paddingLeft: 20 }} />
              {plans.map(p => <th key={p.id} style={{ ...th, borderLeft: divider }}>{range(p)}</th>)}
            </tr>
          </thead>
          <tbody>
            {groups.map(g => {
              const rows = new Map<string, ActionPlanItem>()
              for (const p of plans) for (const i of p.items) if (g.match(i) && !rows.has(keyOf(i))) rows.set(keyOf(i), i)
              if (rows.size === 0) return null
              return (
                <Fragment key={g.title}>
                  <tr><td colSpan={plans.length + 1} style={{ ...td, ...eyebrow, textAlign: 'left', paddingLeft: 20, background: 'var(--float-surface-muted)' }}>{g.title}</td></tr>
                  {[...rows].map(([k, first]) => (
                    <tr key={k}>
                      <td style={{ ...td, textAlign: 'left', paddingLeft: 20, fontWeight: 600, whiteSpace: 'normal' }}>{first.label}</td>
                      {plans.map(p => {
                        const i = p.items.find(x => keyOf(x) === k)
                        const c = i ? g.render(i, p) : null
                        return (
                          <td key={p.id} style={{ ...td, borderLeft: divider, color: c?.color ?? 'var(--float-text-hint)', fontWeight: c?.sign ? 700 : 400 }}>
                            {c ? `${c.sign ?? ''} ${c.text}`.trim() || '–' : '–'}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
