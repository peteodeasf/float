import type { CSSProperties } from 'react'

/**
 * Typed accessors for the teen design tokens.
 *
 * Every value points at a CSS custom property declared in `teen-tokens.css`,
 * so the hex values live in exactly one place. Use these in inline styles —
 * the pattern the teen pages already follow.
 *
 *   <div style={{ background: teen.color.canvas, color: teen.color.ink }}>
 *   <span style={teen.type.eyebrow}>Approved experiment</span>
 */

export const color = {
  ink: 'var(--teen-ink)',
  teal: 'var(--teen-teal)',
  tealMid: 'var(--teen-teal-mid)',
  inkSoft: 'var(--teen-ink-soft)',
  muted: 'var(--teen-muted)',
  mutedQuiet: 'var(--teen-muted-quiet)',
  onDark: 'var(--teen-on-dark)',

  mint: 'var(--teen-mint)',
  mintSoft: 'var(--teen-mint-soft)',
  mintLine: 'var(--teen-mint-line)',
  mintDeep: 'var(--teen-mint-deep)',

  canvas: 'var(--teen-canvas)',
  canvasAlt: 'var(--teen-canvas-alt)',
  card: 'var(--teen-card)',
  cardPure: 'var(--teen-card-pure)',
  track: 'var(--teen-track)',
  chevron: 'var(--teen-chevron)',

  line: 'var(--teen-line)',
  lineCard: 'var(--teen-line-card)',
  lineSoft: 'var(--teen-line-soft)',
  lineChip: 'var(--teen-line-chip)',
  lineBtn: 'var(--teen-line-btn)',

  white: '#fff',
} as const

export const font = {
  sans: 'var(--teen-font-sans)',
  mono: 'var(--teen-font-mono)',
} as const

export const radius = {
  pill: 'var(--teen-radius-pill)',
  btn: 'var(--teen-radius-btn)',
  btnLg: 'var(--teen-radius-btn-lg)',
  card: 'var(--teen-radius-card)',
  cardLg: 'var(--teen-radius-card-lg)',
  sheet: 'var(--teen-radius-sheet)',
} as const

export const shadow = {
  btn: 'var(--teen-shadow-btn)',
  card: 'var(--teen-shadow-card)',
  cardSoft: 'var(--teen-shadow-card-soft)',
  cardDark: 'var(--teen-shadow-card-dark)',
  tile: 'var(--teen-shadow-tile)',
  knob: 'var(--teen-shadow-knob)',
  mint: 'var(--teen-shadow-mint)',
} as const

export const decor = {
  bubble: 'var(--teen-bubble)',
  glowMint: 'var(--teen-glow-mint)',
  glowMintFaint: 'var(--teen-glow-mint-faint)',
} as const

export const chart = {
  grid: 'var(--teen-chart-grid)',
  axis: 'var(--teen-chart-axis)',
  bip: 'var(--teen-chart-bip)',
  dt: 'var(--teen-chart-dt)',
  label: 'var(--teen-chart-label)',
  sparkUp: 'var(--teen-spark-up)',
  sparkFlat: 'var(--teen-spark-flat)',
} as const

export const space = {
  pad: 'var(--teen-pad)',
  padLg: 'var(--teen-pad-lg)',
  maxW: 'var(--teen-max-w)',
} as const

export const motion = {
  ease: 'var(--teen-ease)',
  duration: 'var(--teen-dur)',
} as const

/** Recurring type composites, ready to spread into `style`. */
export const type = {
  eyebrow: {
    fontFamily: font.mono,
    fontSize: 'var(--teen-eyebrow-size)',
    fontWeight: 700,
    letterSpacing: 'var(--teen-eyebrow-track)',
    textTransform: 'uppercase',
    color: color.muted,
  },
  stepNum: {
    fontFamily: font.mono,
    fontSize: 'var(--teen-eyebrow-size)',
    fontWeight: 700,
    color: chart.label,
  },
  label: {
    fontFamily: font.sans,
    fontSize: 'var(--teen-text-label)',
    fontWeight: 600,
    color: color.ink,
  },
  headline: {
    fontFamily: font.sans,
    fontWeight: 400,
    fontSize: 'var(--teen-head-md)',
    lineHeight: 'var(--teen-head-leading)',
    letterSpacing: 'var(--teen-head-track)',
    color: color.ink,
    textWrap: 'balance',
    margin: 0,
  },
  body: {
    fontFamily: font.sans,
    fontSize: 'var(--teen-text-md)',
    lineHeight: 'var(--teen-body-leading)',
    color: color.inkSoft,
  },
  data: {
    fontFamily: font.mono,
    fontWeight: 400,
    lineHeight: 1,
    color: color.teal,
  },
  wordmark: {
    fontFamily: font.sans,
    fontSize: '20px',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: color.ink,
  },
} satisfies Record<string, CSSProperties>

/** Headline sizes, per screen (the design uses 21–29px). */
export const headSize = {
  sm: 'var(--teen-head-sm)',
  md: 'var(--teen-head-md)',
  lg: 'var(--teen-head-lg)',
  xl: 'var(--teen-head-xl)',
} as const

/** Big data numeral sizes. */
export const dataSize = {
  sm: 'var(--teen-data-sm)',
  md: 'var(--teen-data-md)',
  lg: 'var(--teen-data-lg)',
  xl: 'var(--teen-data-xl)',
  xxl: 'var(--teen-data-2xl)',
} as const

/**
 * Thermometer bar heights, as percentages of the track — the rising ramp
 * from the design (10 bars, 1–10).
 */
export const THERMOMETER_BAR_HEIGHTS = [
  34, 41, 48, 55, 62, 69, 76, 83, 91, 100,
] as const

/** Belief slider snaps to the nearest 5%. */
export const BIP_STEP = 5

export const teen = {
  color,
  font,
  radius,
  shadow,
  decor,
  chart,
  space,
  motion,
  type,
  headSize,
  dataSize,
} as const

export default teen
