/**
 * One set of button styles for the clinician app.
 *
 * Peter, 2026-09-15: *"Design seems to just use different structures and designs for buttons. It
 * needs to be consistent across the board so that the UI is clear on what it is."* Every button in
 * the clinician app should come from here, so that the same kind of action looks the same
 * everywhere and nothing that is clickable looks like plain text.
 *
 * Five kinds, and what each one means:
 *   primary   — the one action this screen is for: Save, Update, Invite.
 *   secondary — an action that is always available: Edit profile, Record session, + Add note.
 *   on        — a secondary button whose panel is open right now: tinted, never solid.
 *   quiet     — walking away: Cancel, Back.
 *   danger    — deletes something: Delete.
 *
 * Three sizes: 'md' in a page header, 'sm' inside a row or a card, 'lg' on a phone screen the
 * parent or the clinician taps with a thumb (the monitoring form, the recording screen).
 *
 * Disabled and keyboard focus are not here: they are one rule each in styles/tokens.css, so every
 * button in the app fades the same way and shows the same focus ring.
 */
import type { CSSProperties } from 'react'

export type ButtonKind = 'primary' | 'secondary' | 'on' | 'quiet' | 'danger'
export type ButtonSize = 'md' | 'sm' | 'lg'

const SIZES: Record<ButtonSize, CSSProperties> = {
  md: { fontSize: '13px', padding: '0 14px', height: '36px' },
  sm: { fontSize: '12.5px', padding: '0 10px', height: '28px' },
  lg: { fontSize: '15px', padding: '0 20px', height: '48px' },
}

const KINDS: Record<ButtonKind, CSSProperties> = {
  primary: { color: '#fff', background: 'var(--float-primary)', border: '1px solid var(--float-primary)' },
  secondary: { color: 'var(--float-primary)', background: '#fff', border: '1px solid var(--float-border-strong)' },
  // Never the same as primary: a solid fill means "do the thing", so an open panel is the outlined
  // button tinted instead. Peter, 2026-09-15: *"they can't look the same - bad design"*.
  on: { color: 'var(--float-primary-dark)', background: 'var(--float-primary-light)', border: '1px solid var(--float-primary)' },
  quiet: { color: 'var(--float-text-secondary)', background: 'transparent', border: '1px solid transparent' },
  danger: { color: 'var(--float-danger)', background: '#fff', border: '1px solid #fecaca' },
}

/** The style for one button. `btn('secondary')`, or `btn('primary', 'sm')`. */
export function btn(kind: ButtonKind = 'secondary', size: ButtonSize = 'md', extra?: CSSProperties): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontFamily: 'inherit',
    fontWeight: 600,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    borderRadius: 'var(--float-radius-control)',
    cursor: 'pointer',
    ...SIZES[size],
    ...KINDS[kind],
    ...extra,
  }
}

/** A row of buttons: same gap everywhere, and they wrap rather than overflow. */
export const buttonRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flexWrap: 'wrap',
}

/** The small round dot on a button that says something is live, like Record session. */
export const liveDot: CSSProperties = {
  width: '8px',
  height: '8px',
  borderRadius: '50%',
  background: '#d64545',
  flexShrink: 0,
}

/** The count inside a button, like Process 0/28. */
export function countPill(on: boolean): CSSProperties {
  return {
    fontSize: '11px',
    fontWeight: 700,
    color: on ? 'var(--float-primary)' : '#fff',
    background: on ? '#fff' : 'var(--float-primary)',
    borderRadius: '999px',
    padding: '1px 7px',
    lineHeight: '15px',
  }
}

/**
 * The two cards in the patient header, for the child's and the parent's access. They are not
 * buttons with one word in them: each shows a state as well, so they keep the card shape — but the
 * same height, radius and border as the buttons beside them.
 */
export function statusCard(on: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    height: '36px',
    padding: '0 12px',
    background: on ? 'var(--float-primary-light)' : '#fff',
    border: `1px solid ${on ? 'var(--float-primary)' : 'var(--float-border-strong)'}`,
    borderRadius: 'var(--float-radius-control)',
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }
}

export const statusCardTitle: CSSProperties = {
  display: 'block', fontSize: '12.5px', fontWeight: 700, color: 'var(--float-text)', lineHeight: 1.15,
}
export const statusCardState: CSSProperties = {
  display: 'block', fontSize: '11px', color: 'var(--float-text-hint)', lineHeight: 1.15,
}


/**
 * A chip: one choice among several, on or off. Filter rows, who was in the room, a behaviour's
 * type, the fear-level tiles. Before this there were ten chip styles in the clinician app, and a
 * chip that was on was sometimes solid teal and sometimes pale teal.
 *
 * On is always the pale tint with a teal border, so a solid fill still only ever means "the main
 * action on this screen".
 */
export function chip(on: boolean, size: ButtonSize = 'sm'): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontFamily: 'inherit',
    fontWeight: 600,
    lineHeight: 1,
    whiteSpace: 'nowrap',
    borderRadius: 'var(--float-radius-pill)',
    cursor: 'pointer',
    ...SIZES[size],
    color: on ? 'var(--float-primary-dark)' : 'var(--float-text-secondary)',
    background: on ? 'var(--float-primary-light)' : '#fff',
    border: `1px solid ${on ? 'var(--float-primary)' : 'var(--float-border-strong)'}`,
  }
}

/** A square control with one character in it: − and + on a rating, × to remove, › to collapse. */
export function iconBtn(size: ButtonSize = 'sm'): CSSProperties {
  const box = size === 'lg' ? '44px' : size === 'md' ? '36px' : '28px'
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: box,
    height: box,
    padding: 0,
    fontFamily: 'inherit',
    fontSize: size === 'sm' ? '14px' : '16px',
    fontWeight: 600,
    color: 'var(--float-text-secondary)',
    background: '#fff',
    border: '1px solid var(--float-border-strong)',
    borderRadius: 'var(--float-radius-control)',
    cursor: 'pointer',
  }
}


/**
 * A tab along the top of a screen: Monitoring, Sessions, Plan, Experiments, Chat. The patient page
 * had two tab looks at once — these underlined ones, and small uppercase pills inside the process
 * panel. Sub-tabs are the chip above, so there is one tab and one chip rather than four of each.
 */
export function tab(on: boolean): CSSProperties {
  return {
    flex: '0 0 auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 18px',
    fontFamily: 'inherit',
    fontSize: '14px',
    fontWeight: on ? 800 : 600,
    // Active tab carries the brand colour; inactive stays readable (text-secondary), not the
    // near-invisible text-hint, which the tokens file reserves for hints/placeholders.
    color: on ? 'var(--float-primary)' : 'var(--float-text-secondary)',
    background: 'transparent',
    border: 'none',
    borderBottom: `3px solid ${on ? 'var(--float-primary)' : 'transparent'}`,
    marginBottom: '-1px',
    cursor: 'pointer',
  }
}

/**
 * A joined group of small controls that read as one thing — the header Access control
 * (Teen / Parent / Clinician). Same height as the buttons beside it, with one leading label so it
 * is clear the group is about who can log in.
 */
export const segGroup: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'stretch',
  height: '36px',
  background: '#fff',
  border: '1px solid var(--float-border-strong)',
  borderRadius: 'var(--float-radius-control)',
  overflow: 'hidden',
}

/** The leading, non-clickable label inside a seg group ("Access"). */
export const segLabel: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0 10px',
  fontSize: '10px',
  fontWeight: 800,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--float-text-hint)',
  background: 'var(--float-surface-muted)',
}

/** One cell of a seg group; `on` tints it like an open panel. Every cell carries a left divider. */
export function segItem(on: boolean): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '0 12px',
    fontFamily: 'inherit',
    fontSize: '12.5px',
    fontWeight: 600,
    color: on ? 'var(--float-primary-dark)' : 'var(--float-text)',
    background: on ? 'var(--float-primary-light)' : '#fff',
    border: 'none',
    borderLeft: '1px solid var(--float-border)',
    cursor: 'pointer',
  }
}

/** A small dropdown of rarely-used actions, opened from a ⋯ button in a header. */
export const menuPanel: CSSProperties = {
  position: 'absolute',
  top: 'calc(100% + 6px)',
  right: 0,
  minWidth: '170px',
  background: '#fff',
  border: '1px solid var(--float-border-strong)',
  borderRadius: 'var(--float-radius-control)',
  boxShadow: 'var(--float-shadow-md)',
  padding: '4px',
  zIndex: 30,
  display: 'flex',
  flexDirection: 'column',
}

/** One row in a menuPanel. `danger` for a destructive action like Close treatment. */
export function menuItem(danger = false): CSSProperties {
  return {
    display: 'block',
    width: '100%',
    textAlign: 'left',
    padding: '8px 10px',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 600,
    color: danger ? 'var(--float-danger)' : 'var(--float-text)',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--float-radius-control)',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}

/** The count on a tab, like Chat 3. */
export const tabCount: CSSProperties = {
  fontSize: '10px', fontWeight: 700, color: '#fff', background: 'var(--float-primary)',
  borderRadius: '999px', padding: '0 6px', lineHeight: '16px',
}

/**
 * A box you type in. Text boxes were their own size, border and radius on nearly every screen:
 * 6px, 8px and 10px corners, four different heights. 'lg' is for a phone screen.
 */
export function field(size: ButtonSize = 'md'): CSSProperties {
  const height = size === 'lg' ? '48px' : size === 'sm' ? '28px' : '36px'
  return {
    height,
    padding: size === 'sm' ? '0 8px' : '0 10px',
    fontFamily: 'inherit',
    fontSize: size === 'lg' ? '15px' : size === 'sm' ? '12.5px' : '13px',
    color: 'var(--float-text)',
    background: '#fff',
    border: '1px solid var(--float-border-strong)',
    borderRadius: 'var(--float-radius-control)',
    boxSizing: 'border-box',
  }
}
