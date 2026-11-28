/**
 * The Progress tab (called Exposures until 2026-10-21). Since 2026-11-28 it is built around the
 * action plan: This plan / All plans, each exposure a small grid of its days (PlanProgress.tsx).
 * The graph stays: belief (or fear) over time, an overall trend plus a line per situation.
 * The summary numbers band and the week strip were replaced. docs/plans/progress-tab-action-plan.md
 *
 * Everything is derived from the patient's experiments and action plans, so it reflects work done in
 * any session or by the child in their own app.
 */
import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { PlannedExperiment } from '../../../api/treatment'
import { PlanProgress } from './PlanProgress'

const SERIES = ['var(--float-series-a)', 'var(--float-series-b)', 'var(--float-series-c)', 'var(--float-series-d)']
const num = (v: number | null | undefined): number | null => (v == null ? null : Math.round(Number(v)))
const metricLabel = (m: 'belief' | 'fear') => (m === 'belief' ? 'Belief in Prediction' : 'Fear Level')
const dayOf = (iso: string) => iso.split('T')[0]
const shortDate = (iso: string) =>
  new Date(dayOf(iso) + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid var(--float-border-strong)', borderRadius: 'var(--float-radius-card)', padding: '16px 18px',
}
const eyebrow: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--float-text-secondary)',
}

export function ProgressTab({ patientId, planId, childName, experiments }: {
  patientId: string; planId: string | null; childName: string; experiments: PlannedExperiment[]
}) {
  const [metric, setMetric] = useState<'belief' | 'fear'>('belief')

  const completed = useMemo(
    () => experiments
      .filter(e => e.status === 'completed' && e.completed_date)
      .sort((a, b) => new Date(a.completed_date!).getTime() - new Date(b.completed_date!).getTime()),
    [experiments],
  )
  const situations = useMemo(
    () => [...new Set(completed.map(e => e.situation_name).filter((s): s is string => !!s))],
    [completed],
  )

  // One point per completed exposure, in order. `overall` is on every point; each situation key is
  // set only on its own points (null elsewhere) so connectNulls links a situation's own line.
  const chartData = useMemo(() => completed.map(e => {
    const v = num(metric === 'belief' ? e.bip_before : e.distress_thermometer_actual)
    const p: Record<string, number | string | null> = { label: shortDate(e.completed_date!), overall: v }
    for (const s of situations) p[s] = e.situation_name === s ? v : null
    return p
  }), [completed, situations, metric])

  const yDomain: [number, number] = metric === 'belief' ? [0, 100] : [0, 10]

  const graph = (
    <div style={card}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={eyebrow}>Progress over time</span>
      <div style={{ display: 'flex', border: '1px solid var(--float-border)', borderRadius: 8, overflow: 'hidden' }}>
        {(['belief', 'fear'] as const).map(m => (
          <button key={m} onClick={() => setMetric(m)} data-walkthrough={m === 'belief' ? 'graph-metric' : undefined}
            style={{
              fontSize: 12, fontWeight: 700, padding: '5px 14px', cursor: 'pointer', border: 0,
              background: metric === m ? 'var(--float-primary)' : '#fff',
              color: metric === m ? '#fff' : 'var(--float-text-secondary)',
            }}>
            {metricLabel(m)}
          </button>
        ))}
      </div>
    </div>
    {completed.length === 0 ? (
      <p style={{ fontSize: 13, color: 'var(--float-text-hint)', margin: '18px 0' }}>No completed exposures yet — the trend appears once they've done a few.</p>
    ) : (
      <div style={{ marginTop: 10 }}>
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 6, right: 16, bottom: 2, left: -8 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--float-text-hint)' }} tickLine={false} axisLine={{ stroke: 'var(--float-border)' }} />
            <YAxis domain={yDomain} tick={{ fontSize: 11, fill: 'var(--float-text-hint)' }} tickLine={false} axisLine={false} width={38}
              tickFormatter={v => metric === 'belief' ? `${v}%` : `${v}`} />
            <Tooltip />
            <Legend iconSize={14} wrapperStyle={{ fontSize: 14.5, fontWeight: 700, paddingTop: 12, lineHeight: 1.6 }} />
            {situations.length === 0 ? (
              <Line type="monotone" dataKey="overall" name={metricLabel(metric)}
                stroke="var(--float-primary)" strokeWidth={3} dot={{ r: 3 }} isAnimationActive={false} />
            ) : situations.map((s, i) => (
              <Line key={s} type="monotone" dataKey={s} name={s} stroke={SERIES[i % SERIES.length]}
                strokeWidth={2.4} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    )}
  </div>
  )

  return <PlanProgress patientId={patientId} planId={planId} childName={childName} experiments={experiments} graph={graph} />
}
