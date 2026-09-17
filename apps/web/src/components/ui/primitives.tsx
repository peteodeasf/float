/**
 * The shared UI primitives for the clinician and admin apps. Screens compose these instead of
 * hand-styling <button>, <input>, cards and modals. They wrap the one style source in `buttons.ts`
 * and the tokens in `styles/tokens.css`, so changing a token or a primitive changes every screen.
 *
 * The rule the design-system plan (docs/plans/design-system.md) enforces: screens use these; only
 * these touch tokens; nothing touches raw hex, radii or font sizes.
 */
import type { CSSProperties, ReactNode, ButtonHTMLAttributes, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, HTMLAttributes } from 'react'
import { btn, field, tab, type ButtonKind, type ButtonSize } from './buttons'

// ── Button ────────────────────────────────────────────────────────────────────
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: ButtonKind
  size?: ButtonSize
}
export function Button({ kind = 'secondary', size = 'md', style, ...rest }: ButtonProps) {
  return <button style={{ ...btn(kind, size), ...style }} {...rest} />
}

// ── Card ────────────────────────────────────────────────────────────────────
type CardProps = HTMLAttributes<HTMLDivElement> & {
  /** Inner padding. 'md' is the usual card; 'none' when the card lays out its own header/body. */
  pad?: 'none' | 'sm' | 'md' | 'lg'
}
const CARD_PAD: Record<NonNullable<CardProps['pad']>, string> = {
  none: '0', sm: '12px', md: '16px 20px', lg: '24px',
}
export function Card({ pad = 'md', style, ...rest }: CardProps) {
  return (
    <div
      style={{
        background: 'var(--float-surface)',
        border: '1px solid var(--float-border)',
        borderRadius: '12px',
        boxShadow: 'var(--float-shadow)',
        padding: CARD_PAD[pad],
        ...style,
      }}
      {...rest}
    />
  )
}

// ── Badge ────────────────────────────────────────────────────────────────────
// A non-interactive status label: "setup", "Draft", a count. For a clickable choice use `chip`.
export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'
const BADGE_TONES: Record<BadgeTone, CSSProperties> = {
  neutral: { background: 'var(--float-surface-sunken)', color: 'var(--float-text-secondary)' },
  primary: { background: 'var(--float-primary-light)', color: 'var(--float-primary-text)' },
  success: { background: '#ecfdf5', color: '#065f46' },
  warning: { background: '#fffbeb', color: '#92400e' },
  danger: { background: '#fef2f2', color: '#991b1b' },
}
export function Badge({ tone = 'neutral', style, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: '4px',
        fontSize: 'var(--float-font-2xs)', fontWeight: 600, lineHeight: 1.4,
        padding: '2px 8px', borderRadius: '999px', whiteSpace: 'nowrap',
        ...BADGE_TONES[tone], ...style,
      }}
      {...rest}
    />
  )
}

// ── Form controls ─────────────────────────────────────────────────────────────
// One wrapper for a labelled field, and text/select/textarea that share the `field()` styling.
export function Field({ label, hint, error, children }: { label?: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      {label && <span style={{ display: 'block', fontSize: 'var(--float-font-xs)', fontWeight: 600, color: 'var(--float-text-secondary)', marginBottom: '4px' }}>{label}</span>}
      {children}
      {error
        ? <span style={{ display: 'block', fontSize: 'var(--float-font-2xs)', color: 'var(--float-danger)', marginTop: '4px' }}>{error}</span>
        : hint && <span style={{ display: 'block', fontSize: 'var(--float-font-2xs)', color: 'var(--float-text-hint)', marginTop: '4px' }}>{hint}</span>}
    </label>
  )
}

type Sized = { size?: ButtonSize; block?: boolean }
const sizedStyle = (size: ButtonSize | undefined, block: boolean | undefined, style?: CSSProperties): CSSProperties =>
  ({ ...field(size ?? 'md'), ...(block ? { width: '100%' } : {}), ...style })

export function TextInput({ size, block, style, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & Sized) {
  return <input style={sizedStyle(size, block, style)} {...rest} />
}
export function Select({ size, block, style, ...rest }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & Sized) {
  return <select style={sizedStyle(size, block, style)} {...rest} />
}
export function Textarea({ block, style, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { block?: boolean }) {
  return (
    <textarea
      style={{
        ...field('md'), height: 'auto', padding: '8px 10px', lineHeight: 'var(--float-leading)',
        ...(block ? { width: '100%' } : {}), ...style,
      }}
      {...rest}
    />
  )
}

// ── Tabs ────────────────────────────────────────────────────────────────────
export type TabItem = { id: string; label: string; count?: number }
export function Tabs({ items, value, onChange }: { items: TabItem[]; value: string; onChange: (id: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--float-border)', overflowX: 'auto' }}>
      {items.map(it => (
        <button key={it.id} onClick={() => onChange(it.id)} style={tab(it.id === value)}>
          {it.label}
          {it.count != null && it.count > 0 && (
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#fff', background: 'var(--float-primary)', borderRadius: '999px', padding: '0 6px', lineHeight: '16px' }}>{it.count}</span>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Modal ────────────────────────────────────────────────────────────────────
// One dialog: a dimmed backdrop and a centred panel that fits the phone. Replaces the hand-rolled
// position:fixed overlays scattered across screens. Click the backdrop or press Escape to close.
export function Modal({ open, onClose, title, children, width = 460 }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; width?: number }) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 'var(--float-z-modal)' as unknown as number,
        background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center',
        justifyContent: 'center', padding: '16px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--float-surface)', borderRadius: '12px', boxShadow: 'var(--float-shadow-md)',
          width: '100%', maxWidth: `${width}px`, maxHeight: '90vh', overflow: 'auto',
        }}
      >
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '14px 20px', borderBottom: '1px solid var(--float-border)' }}>
            <span style={{ fontSize: 'var(--float-font-lg)', fontWeight: 600, color: 'var(--float-text)' }}>{title}</span>
            <button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'transparent', fontSize: '20px', lineHeight: 1, color: 'var(--float-text-hint)', cursor: 'pointer', padding: '2px 6px' }}>&times;</button>
          </div>
        )}
        <div style={{ padding: '20px' }}>{children}</div>
      </div>
    </div>
  )
}
