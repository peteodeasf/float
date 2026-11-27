import type { CSSProperties } from 'react'

/** The patient page's card (PatientPage.tsx cardStyle), shared by the action plan cards. */
export const card: CSSProperties = {
  background: 'var(--float-surface)', borderRadius: 'var(--float-radius-card)', border: '1px solid var(--float-border-strong)',
  boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', width: '100%', boxSizing: 'border-box',
}

const short = (iso: string) => new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
/** "Nov 27 – Dec 4". */
export const range = (p: { starts_on: string; ends_on: string }) => `${short(p.starts_on)} – ${short(p.ends_on)}`
