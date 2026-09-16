/** The card, field and error styles shared by the clinician app's form pages: Settings, setup,
 *  and the practice screens. */
import axios from 'axios'

export const CARD = 'bg-white rounded-xl'
export const CARD_STYLE: React.CSSProperties = { border: '1px solid var(--float-border)', padding: '20px' }
export const SECTION_TITLE: React.CSSProperties = { fontSize: '15px', fontWeight: 600, color: 'var(--float-text)', margin: 0 }
export const SECTION_NOTE: React.CSSProperties = { fontSize: '13px', color: 'var(--float-text-secondary)', margin: '6px 0 0', lineHeight: 1.5 }
export const INPUT: React.CSSProperties = { width: '100%', padding: '8px 10px', boxSizing: 'border-box', fontSize: '14px', border: '1px solid #cbd5e1', borderRadius: '6px' }
export const ERROR_BOX: React.CSSProperties = { background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 12px', marginTop: '14px', fontSize: '13px', color: '#991b1b' }

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#64748b', marginBottom: '4px' }}>{label}</span>
      {children}
      {hint && <span style={{ display: 'block', fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{hint}</span>}
    </label>
  )
}

/** The server's message if it sent one, otherwise the fallback. */
export function errorMessage(e: unknown, fallback: string): string {
  const detail = axios.isAxiosError(e) ? e.response?.data?.detail : null
  return typeof detail === 'string' ? detail : fallback
}
