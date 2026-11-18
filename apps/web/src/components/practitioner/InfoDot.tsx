import { useEffect, useRef, useState } from 'react'

/**
 * A small ⓘ dot beside a term. Tapping it opens a short pop-up next to it: two or three lines.
 * Separate from the guide panel (Peter, 2026-11-18). docs/plans/clinician-guide.md
 */
export default function InfoDot({ title, body, align = 'right' }: { title: string; body: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    const outside = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', outside)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', outside); document.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <span ref={box} style={{ position: 'relative', display: 'inline-flex', verticalAlign: 'middle' }}>
      <button
        type="button"
        className="float-info-dot"
        aria-label={title}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        style={{
          width: '16px', height: '16px', borderRadius: '50%', border: 0, padding: 0, cursor: 'pointer',
          background: 'var(--float-primary)', color: 'var(--float-surface)', fontSize: '10px', fontWeight: 700, lineHeight: '16px',
        }}
      >i</button>
      {open && (
        <span
          role="dialog"
          aria-label={title}
          className="float-info-pop"
          style={{
            position: 'absolute', top: '24px', [align === 'right' ? 'right' : 'left']: '-8px', zIndex: 40,
            width: '260px', background: 'var(--float-primary-dark)', color: 'var(--float-surface)',
            borderRadius: 'var(--float-radius-card)', padding: '12px 14px', boxShadow: 'var(--float-shadow-md)',
            textAlign: 'left', textTransform: 'none', letterSpacing: 'normal', fontWeight: 400,
            transformOrigin: align === 'right' ? 'top right' : 'top left',
          }}
        >
          <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>{title}</span>
          <span style={{ display: 'block', fontSize: '13px', lineHeight: 1.5, opacity: 0.9 }}>{body}</span>
        </span>
      )}
    </span>
  )
}
