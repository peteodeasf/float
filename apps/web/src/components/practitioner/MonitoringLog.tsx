import type { CSSProperties } from 'react'
import type { MonitoringReport, ReportEntry } from '../../api/monitoring'
import ParentWords from './ParentWords'

/**
 * The parents' monitoring log as the clinician reads it: a short summary on top, then one row per
 * observation. Used on the Monitoring tab and on the printable report page. Peter, 2026-11-18: the
 * plain table was "a bit bland".
 */

// Green, amber, red: the same bands (1–3, 4–6, 7–10) as the Fear Level badges elsewhere in the
// clinician app, in the app's status colors (styles/tokens.css).
function fearColors(v: number): { bg: string; fg: string; border: string } {
  if (v >= 7) return { bg: 'var(--float-danger-bg)', fg: 'var(--float-danger)', border: 'var(--float-danger-border)' }
  if (v >= 4) return { bg: 'var(--float-warning-bg)', fg: 'var(--float-warning)', border: 'var(--float-warning-border)' }
  return { bg: 'var(--float-success-bg)', fg: 'var(--float-success)', border: 'var(--float-success-border)' }
}

function FearBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return <span style={{ color: 'var(--float-text-hint)' }}>—</span>
  const c = fearColors(Number(value))
  const size = 26
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: size, height: size,
      padding: '0 6px', borderRadius: size / 2, background: c.bg, color: c.fg, border: `1px solid ${c.border}`,
      fontSize: 13, fontWeight: 700,
    }}>{Number.isInteger(value) ? value : Number(value).toFixed(1)}</span>
  )
}

const day = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso + 'T00:00:00').toLocaleDateString('en-US', opts)

const th: CSSProperties = {
  textAlign: 'left', padding: '10px 12px', fontSize: 11, fontWeight: 600, color: 'var(--float-text-hint)',
  textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: '1px solid var(--float-border)', whiteSpace: 'nowrap',
}
const td: CSSProperties = { padding: '14px 12px', verticalAlign: 'top', fontSize: 13, lineHeight: 1.55 }

function Text({ value }: { value: string | null }) {
  return value
    ? <span style={{ color: 'var(--float-text-secondary)' }}>{value}</span>
    : <span style={{ color: 'var(--float-text-hint)' }}>—</span>
}

function isEmpty(e: ReportEntry) {
  return !e.situation && !e.child_behavior_observed && !e.parent_response && e.fear_thermometer == null && !e.parent_words
}

export default function MonitoringLog({ report }: { report: MonitoringReport }) {
  const range = report.date_range

  return (
    <div>
      {/* One line, not boxes: Peter, 2026-11-18, the boxes were "ridiculous in size for such a
          small amount of text". */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--float-text)' }}>Observations</h3>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--float-primary)', background: 'var(--float-primary-light)', padding: '1px 8px', borderRadius: 999 }}>
          {report.total_entries}
        </span>
        {range && (
          <span style={{ fontSize: 12, color: 'var(--float-text-hint)' }}>
            {day(range.from, { month: 'short', day: 'numeric' })} – {day(range.to, { month: 'short', day: 'numeric' })} · {range.days} {range.days === 1 ? 'day' : 'days'}
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={th}>Date</th>
              <th style={th}>Situation</th>
              <th style={th}>What the child did</th>
              <th style={th}>How the parent responded</th>
              <th style={{ ...th, textAlign: 'center' }}>Fear Level</th>
            </tr>
          </thead>
          <tbody>
            {report.entries.map(entry => (
              <tr key={entry.id} style={{ borderBottom: '1px solid var(--float-border)' }}>
                <td style={{ ...td, whiteSpace: 'nowrap', width: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--float-text)' }}>{day(entry.entry_date, { month: 'short', day: 'numeric' })}</div>
                  <div style={{ fontSize: 11, color: 'var(--float-text-hint)' }}>{day(entry.entry_date, { weekday: 'short' })}</div>
                </td>
                {isEmpty(entry) ? (
                  <td style={{ ...td, color: 'var(--float-text-hint)', fontStyle: 'italic' }} colSpan={4}>
                    Nothing was filled in for this one.
                    {entry.recipient_label && <Who label={entry.recipient_label} />}
                  </td>
                ) : (
                  <>
                    <td style={{ ...td, width: '22%' }}>
                      <div style={{ fontWeight: 600, color: 'var(--float-text)' }}>
                        {entry.situation || <span style={{ color: 'var(--float-text-hint)', fontWeight: 400 }}>—</span>}
                      </div>
                      {entry.recipient_label && <Who label={entry.recipient_label} />}
                      <ParentWords entry={entry} />
                    </td>
                    <td style={{ ...td, width: '32%' }}><Text value={entry.child_behavior_observed} /></td>
                    <td style={{ ...td, width: '32%' }}><Text value={entry.parent_response} /></td>
                    <td style={{ ...td, textAlign: 'center', width: 1 }}><FearBadge value={entry.fear_thermometer} /></td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Who({ label }: { label: string }) {
  return (
    <div style={{ marginTop: 4 }}>
      <span style={{ fontSize: 11, fontStyle: 'normal', padding: '1px 8px', borderRadius: 999, background: 'var(--float-surface-sunken)', border: '0.5px solid var(--float-border)', color: 'var(--float-text-secondary)', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  )
}
