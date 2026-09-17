/** The admin app's table header and cell styles. */
import type { CSSProperties } from 'react'

export const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '10px 12px',
  fontSize: '12px',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--float-text-secondary)',
  borderBottom: '1px solid var(--float-border)',
}

export const tdStyle: CSSProperties = {
  padding: '12px',
  fontSize: '13px',
  color: 'var(--float-text)',
  borderBottom: '1px solid var(--float-surface-sunken)',
}
