import type { CSSProperties } from 'react'

/** The patient page's card (PatientPage.tsx cardStyle), shared by the action plan cards. */
export const card: CSSProperties = {
  background: 'var(--float-surface)', borderRadius: 'var(--float-radius-card)', border: '1px solid var(--float-border-strong)',
  boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', width: '100%', boxSizing: 'border-box',
}
