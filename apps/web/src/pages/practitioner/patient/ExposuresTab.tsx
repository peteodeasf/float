/**
 * The Exposures tab — how the child's exposure work is going, read at a glance.
 *
 * Three parts, data first (Peter, 2026-09-18, redesign):
 *  1. One graph: belief (or fear) over time — an overall trend plus a line per situation.
 *  2. A slim dashboard band: done, on-schedule, feared-outcome-came-true, and the average drops.
 *  3. A week strip you page through; the selected day's scheduled/done exposures show underneath.
 *
 * Everything is derived from the patient's experiments, so it reflects work done in any session or
 * by the child in their own app.
 */
import { useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import type { PlannedExperiment } from '../../../api/treatment'

const SERIES = ['var(--float-series-a)', 'var(--float-series-b)', 'var(--float-series-c)', 'var(--float-series-d)']
const num = (v: number | null | undefined): number | null => (v == null ? null : Math.round(Number(v)))

// Dates are handled as UTC day-strings ("2026-09-18"), the same way the rest of the app compares
// scheduled/completed dates — so the week lines up with the stored values.
const ymd = (d: Date) => d.toISOString().split('T')[0]
const dayOf = (iso: string) => iso.split('T')[0]
const addDays = (key: string, n: number) => {
  const d = new Date(key + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return ymd(d)
}
const mondayKey = (key: string) => addDays(key, -(((new Date(key + 'T00:00:00Z').getUTCDay()) + 6) % 7))
const shortDate = (iso: string) =>
  new Date(dayOf(iso) + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const fullDate = (key: string) =>
  new Date(key + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })

const card: React.CSSProperties = {
  background: '#fff', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-card)', padding: '16px 18px',
}
const eyebrow: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--float-text-secondary)',
}

export function ExposuresTab({ experiments }: { experiments: PlannedExperiment[] }) {
  const [metric, setMetric] = useState<'belief' | 'fear'>('belief')
  const [weekOffset, setWeekOffset] = useState(0)
  const todayKey = ymd(new Date())
  const [selectedDay, setSelectedDay] = useState(todayKey)

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

  // ── dashboard numbers ──
  const done = completed.length
  const weekStartNow = mondayKey(todayKey)
  const weekEndNow = addDays(weekStartNow, 7)
  const inThisWeek = (iso: string | null) => !!iso && dayOf(iso) >= weekStartNow && dayOf(iso) < weekEndNow
  const scheduledThisWeek = experiments.filter(e => inThisWeek(e.scheduled_date)).length
  const doneThisWeek = completed.filter(e => inThisWeek(e.completed_date)).length

  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
  const fearDelta = avg(completed
    .filter(e => e.distress_thermometer_actual != null && e.distress_thermometer_expected != null)
    .map(e => Number(e.distress_thermometer_actual) - Number(e.distress_thermometer_expected)))
  const beliefDelta = avg(completed
    .filter(e => e.bip_after != null && e.bip_before != null)
    .map(e => Number(e.bip_after) - Number(e.bip_before)))
  const signed = (n: number, suffix = '') => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(Math.round(n * 10) / 10)}${suffix}`

  // Longest run of consecutive calendar days with at least one completed exposure.
  const longestStreak = useMemo(() => {
    const days = [...new Set(completed.map(e => dayOf(e.completed_date!)))].sort()
    let best = 0, run = 0, prev: string | null = null
    for (const d of days) {
      run = prev && addDays(prev, 1) === d ? run + 1 : 1
      best = Math.max(best, run)
      prev = d
    }
    return best
  }, [completed])

  // ── week strip ──
  const weekStart = addDays(mondayKey(todayKey), weekOffset * 7)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  // The day an exposure belongs to: when it happened for done/too-hard, when it's due otherwise.
  const dayFor = (e: PlannedExperiment) =>
    (e.status === 'completed' || e.status === 'too_hard') ? dayOf(e.completed_date || e.scheduled_date || '') : dayOf(e.scheduled_date || '')
  const itemsByDay = useMemo(() => {
    const m = new Map<string, PlannedExperiment[]>()
    for (const e of experiments) {
      const k = dayFor(e)
      if (!k) continue
      if (!m.has(k)) m.set(k, [])
      m.get(k)!.push(e)
    }
    return m
  }, [experiments])

  const gotoWeek = (delta: number) => {
    const next = weekOffset + delta
    setWeekOffset(next)
    setSelectedDay(addDays(mondayKey(todayKey), next * 7)) // land on the new week's Monday
  }

  const selectedItems = itemsByDay.get(selectedDay) ?? []

  const yDomain: [number, number] = metric === 'belief' ? [0, 100] : [0, 10]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── DASHBOARD BAND ── */}
      <div style={{ ...card, padding: '12px 18px', background: 'var(--float-primary-light)', border: '1px solid var(--float-success-border)' }}>
        <div style={{ display: 'flex', alignItems: 'stretch' }}>
          <Stat k="Completed Exposures" v={String(done)} first />
          <Stat k="Completed / Scheduled" v={scheduledThisWeek ? `${doneThisWeek}/${scheduledThisWeek}` : '—'} />
          <Stat k="Avg BIP Change" v={beliefDelta == null ? '—' : signed(beliefDelta, '%')}
            color={beliefDelta != null && beliefDelta < 0 ? 'var(--float-success)' : undefined} />
          <Stat k="Avg Fear Change" v={fearDelta == null ? '—' : signed(fearDelta)}
            color={fearDelta != null && fearDelta < 0 ? 'var(--float-success)' : undefined} />
          <Stat k="Longest Streak" v={longestStreak === 0 ? '—' : `${longestStreak}d`} last />
        </div>
      </div>

      {/* ── ONE GRAPH ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={eyebrow}>Progress over time</span>
          <div style={{ display: 'flex', border: '1px solid var(--float-border)', borderRadius: 8, overflow: 'hidden' }}>
            {(['belief', 'fear'] as const).map(m => (
              <button key={m} onClick={() => setMetric(m)}
                style={{
                  fontSize: 12, fontWeight: 700, padding: '5px 14px', cursor: 'pointer', border: 0,
                  background: metric === m ? 'var(--float-primary)' : '#fff',
                  color: metric === m ? '#fff' : 'var(--float-text-secondary)',
                }}>
                {m === 'belief' ? 'Belief in Prediction' : 'Fear Level'}
              </button>
            ))}
          </div>
        </div>
        {completed.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--float-text-hint)', margin: '18px 0' }}>No completed exposures yet — the trend appears once they've done a few.</p>
        ) : (
          <div style={{ marginTop: 10 }}>
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={chartData} margin={{ top: 6, right: 16, bottom: 2, left: -8 }}>
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--float-text-hint)' }} tickLine={false} axisLine={{ stroke: 'var(--float-border)' }} />
                <YAxis domain={yDomain} tick={{ fontSize: 11, fill: 'var(--float-text-hint)' }} tickLine={false} axisLine={false} width={38}
                  tickFormatter={v => metric === 'belief' ? `${v}%` : `${v}`} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12.5, fontWeight: 600, paddingTop: 8, lineHeight: 1.5 }} />
                {situations.length === 0 ? (
                  <Line type="monotone" dataKey="overall" name={metric === 'belief' ? 'Belief in Prediction' : 'Fear Level'}
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

      {/* ── WEEK STRIP + SELECTED DAY ── */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={eyebrow}>{shortDate(days[0])} – {shortDate(days[6])}</span>
          <span style={{ fontSize: 12, color: 'var(--float-text-hint)' }}>{weekOffset === 0 ? 'This week' : weekOffset < 0 ? `${-weekOffset} week${weekOffset === -1 ? '' : 's'} ago` : `In ${weekOffset} week${weekOffset === 1 ? '' : 's'}`}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
          <button onClick={() => gotoWeek(-1)} aria-label="Previous week" style={navBtn}>‹</button>
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {days.map(key => {
              const items = itemsByDay.get(key) ?? []
              const sel = key === selectedDay
              const isToday = key === todayKey
              return (
                <button key={key} onClick={() => setSelectedDay(key)}
                  style={{
                    border: `1px solid ${sel ? 'var(--float-primary)' : isToday ? 'var(--float-primary-mid)' : 'var(--float-border)'}`,
                    background: sel ? 'var(--float-primary)' : '#fff', borderRadius: 10, padding: '8px 0 9px', cursor: 'pointer', textAlign: 'center',
                  }}>
                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', color: sel ? 'rgba(255,255,255,0.75)' : 'var(--float-text-hint)' }}>
                    {new Date(key + 'T00:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginTop: 2, color: sel ? '#fff' : 'var(--float-text)' }}>
                    {new Date(key + 'T00:00:00Z').getUTCDate()}
                  </div>
                  <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginTop: 6, height: 7 }}>
                    {dayDots(items, key, todayKey).map((c, i) => (
                      <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: c.bg, border: c.border ? `1px solid ${c.border}` : undefined }} />
                    ))}
                  </div>
                </button>
              )
            })}
          </div>
          <button onClick={() => gotoWeek(1)} aria-label="Next week" style={navBtn}>›</button>
        </div>

        <div style={{ marginTop: 14, borderTop: '1px solid var(--float-border)', paddingTop: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--float-text)' }}>
            {fullDate(selectedDay)}{selectedDay === todayKey ? ' · today' : ''}
          </div>
          {selectedItems.length === 0 ? (
            <p style={{ fontSize: 12.5, color: 'var(--float-text-hint)', margin: '10px 0 2px' }}>Nothing scheduled or done.</p>
          ) : (
            selectedItems.map(e => <DayRow key={e.id} e={e} selectedDay={selectedDay} todayKey={todayKey} />)
          )}
        </div>
      </div>
    </div>
  )
}

function Stat({ k, v, color, first, last }: { k: string; v: string; color?: string; first?: boolean; last?: boolean }) {
  return (
    <div style={{ flex: 1, padding: last ? '2px 2px 2px 16px' : '2px 16px', borderLeft: '1px solid var(--float-border)', ...(first ? { borderLeft: 0, paddingLeft: 2 } : {}) }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--float-text-hint)' }}>{k}</div>
      <div style={{ fontSize: 19, fontWeight: 800, marginTop: 3, lineHeight: 1, color: color ?? 'var(--float-text)' }}>{v}</div>
    </div>
  )
}

/** The coloured dots under a day: green = done, red = too hard, amber = missed, teal = scheduled ahead. */
function dayDots(items: PlannedExperiment[], key: string, todayKey: string): { bg: string; border?: string }[] {
  const out: { bg: string; border?: string }[] = []
  if (items.some(e => e.status === 'completed')) out.push({ bg: 'var(--float-success)' })
  if (items.some(e => e.status === 'too_hard')) out.push({ bg: 'var(--float-danger)' })
  const pending = items.filter(e => e.status === 'committed' || e.status === 'planned')
  if (pending.length) {
    if (key < todayKey) out.push({ bg: 'var(--float-warning)' }) // scheduled but the day passed with nothing done
    else out.push({ bg: 'var(--float-primary-light)', border: 'var(--float-primary)' })
  }
  return out
}

function DayRow({ e, selectedDay, todayKey }: { e: PlannedExperiment; selectedDay: string; todayKey: string }) {
  const name = e.behavior_name || e.plan_description || 'Exposure'
  const done = e.status === 'completed'
  let tag = { label: 'Scheduled', bg: 'var(--float-primary-light)', fg: 'var(--float-primary)' }
  if (done) tag = { label: 'Completed', bg: 'var(--float-success-bg)', fg: 'var(--float-success)' }
  else if (e.status === 'too_hard') tag = { label: 'Too hard', bg: 'var(--float-danger-bg)', fg: 'var(--float-danger)' }
  else if (selectedDay < todayKey) tag = { label: 'Missed', bg: 'var(--float-warning-bg)', fg: 'var(--float-warning)' }

  return (
    <div style={{ padding: '12px 13px', background: 'var(--float-surface-sunken)', border: '1px solid var(--float-border)', borderRadius: 10, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', borderRadius: 5, padding: '2px 7px', background: tag.bg, color: tag.fg, flexShrink: 0 }}>{tag.label}</span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--float-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
        <Metric label="Fear level" pred={num(e.distress_thermometer_expected)} act={done ? num(e.distress_thermometer_actual) : null} />
        <Metric label="Belief in prediction" pred={num(e.bip_before)} act={done ? num(e.bip_after) : null} suffix="%" />
      </div>
    </div>
  )
}

/** Predicted vs actual for one measure. Actual turns green when it dropped below the prediction. */
function Metric({ label, pred, act, suffix = '' }: { label: string; pred: number | null; act: number | null; suffix?: string }) {
  const fmt = (n: number | null) => (n == null ? '—' : `${n}${suffix}`)
  const good = pred != null && act != null && act < pred
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--float-text-hint)' }}>{label}</div>
      <div style={{ display: 'flex', gap: 18, marginTop: 5 }}>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--float-text-hint)' }}>Predicted</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--float-text)', fontVariantNumeric: 'tabular-nums' }}>{fmt(pred)}</div>
        </div>
        <div>
          <div style={{ fontSize: 10.5, color: 'var(--float-text-hint)' }}>Actual</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: act == null ? 'var(--float-text-hint)' : good ? 'var(--float-success)' : 'var(--float-text)', fontVariantNumeric: 'tabular-nums' }}>{fmt(act)}</div>
        </div>
      </div>
    </div>
  )
}

const navBtn: React.CSSProperties = {
  width: 32, flex: 'none', border: '1px solid var(--float-border)', borderRadius: 10, background: '#fff',
  color: 'var(--float-text-secondary)', fontSize: 16, cursor: 'pointer',
}
