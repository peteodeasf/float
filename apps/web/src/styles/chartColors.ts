/**
 * Chart colours in one place.
 *
 * Charts (recharts) draw with SVG `stroke`/`fill` attributes, which cannot read a CSS variable —
 * so the design tokens in tokens.css do not reach them. This file is the single source for chart
 * colours instead: change one here and every chart follows. The values mirror the matching design
 * tokens; keep them in step when a token changes.
 */
export const CHART = {
  /** Brand line and dots (mirrors --float-primary). */
  primary: '#135450',
  /** A second, lighter brand line — e.g. expected vs actual (a muted teal). */
  primarySoft: '#3f817b',
  /** Axis ticks and labels (mirrors --float-text-hint). */
  axis: '#94a3b8',
  /** Grid lines (mirrors --float-border). */
  grid: '#e2e8f0',
  /** A positive/actual series (green). */
  positive: '#16a34a',
  /** Fear-level scale, low → high (mirrors --float-fear-*). */
  fearLow: '#4bb98a',
  fearMid: '#f2a33f',
  fearHigh: '#ef6b53',
} as const
