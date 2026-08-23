/**
 * Session kit — the shared register for the co-located (clinician + child) capture flows.
 *
 * Session mode and the downward arrow are two different interviews that have to feel like the
 * same app talking. The rules they share live here so they can't drift:
 *
 *   - one loud question per screen (`Ask`), everything else quiet
 *   - the subject of the question gets a block, not a line (`Context`)
 *   - what's been said is a transcript of one-line exchanges (`Exchange`), never a form
 *   - text answers send on Enter with a quiet arrow (`SayIt`) — never a labelled "Add" button
 *   - no progress counters, no section eyebrows, no internal mechanics on screen
 *
 * Design record: docs/plans/session-situation-screen-focus.md
 */
import { type CSSProperties, type ReactNode } from 'react'

// Fear scores are a fixed 1–10 scale (see docs/solutions — enforced backend + here).
export const clampDt = (n: number) => Math.min(10, Math.max(1, Math.round(n)))
export const dtColor = (v: number | null | undefined) =>
  v == null ? '#cbd5e1' : v >= 7 ? '#ef6b53' : v >= 4 ? '#f2a33f' : '#4bb98a'
export const dtOf = (v: number | string | null | undefined) => (v != null ? Number(v) : null)
export const article = (n: number) => (n === 8 ? 'an' : 'a')

// ── styles ──────────────────────────────────────────────────────
export const screenSurface: CSSProperties = { background: 'linear-gradient(180deg,#f2fbf8,#ffffff 55%)', border: '1px solid #d7ebe5', borderRadius: 16, padding: '22px 24px' }
export const card: CSSProperties = { background: '#fff', border: '1px solid #dde8e6', borderRadius: 18, padding: 22, boxShadow: '0 8px 24px rgba(13,61,58,.06)' }
export const primaryBtn: CSSProperties = { marginTop: 14, background: '#135450', color: '#fff', fontWeight: 800, fontSize: 14, border: 'none', borderRadius: 12, padding: '11px 22px', cursor: 'pointer' }
export const ghostBtn: CSSProperties = { ...primaryBtn, background: '#fff', color: '#135450', border: '1.5px solid #135450' }
export const bigQ: CSSProperties = { fontSize: 20, fontWeight: 800, color: '#0d3d3a', lineHeight: 1.3 }
export const lead: CSSProperties = { fontSize: 14, color: '#4b5a59', lineHeight: 1.5, marginTop: 6 }
export const eyebrow: CSSProperties = { fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: '.04em', marginBottom: 4 }
export const quietLink: CSSProperties = { fontSize: 12.5, fontWeight: 600, color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }

// Module scope, deliberately: defined inside the page it would get a new identity every render,
// and React would remount the whole tree — losing step state and input focus mid-session.
export function Chrome({ onExit, children }: { onExit: () => void; children: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--teen-canvas, #eef4f3)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 20px 48px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <button onClick={onExit}
            style={{ fontSize: 13, fontWeight: 700, color: '#6b7a79', background: '#fff', border: '1px solid #dbe8e5', borderRadius: 999, padding: '7px 14px', cursor: 'pointer' }}>
            ← Exit session
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// Shared 1–10 fear scale — tappable, colour-graded. The one scoring object in the flow.
export function FearScale({ value, onPick, height = 44 }: { value: number | null; onPick: (n: number) => void; height?: number }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 4 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
          const active = value === n
          return (
            <button key={n} onClick={() => onPick(n)}
              style={{ flex: 1, height, borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: height >= 38 ? 13.5 : 12,
                border: active ? '2px solid #0d3d3a' : '1px solid #e2e8f0',
                background: active ? dtColor(n) : '#fff',
                color: active ? '#fff' : '#94a3b8' }}>
              {n}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginTop: 5 }}>
        <span style={{ color: '#2f9e6f' }}>1 · no big deal</span><span style={{ color: '#ef6b53' }}>10 · the worst</span>
      </div>
    </div>
  )
}

export const DTBadge = ({ v, size = 26 }: { v: number | null; size?: number }) => (
  v == null ? null : (
    <span style={{ minWidth: size, height: size, padding: `0 ${Math.round(size / 3.2)}px`, borderRadius: 999, color: '#fff', fontWeight: 800, fontSize: Math.round(size * 0.46), display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: dtColor(v), flexShrink: 0 }}>{v}</span>
  )
)

// The thing being talked about. It gets a block of its own rather than a line of text, because it
// is the frame for every question on the screen — styled like body copy it reads as just more
// words. The score sits INSIDE the block, next to the name: a number parked at the far right edge
// doesn't read as belonging to anything.
export function Context({ text, dt, quiet }: { text: string; dt?: number | null; quiet?: boolean }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap',
      // `quiet` separates the two blocks by FILL, not by size. Shrinking the situation made it
      // slower to read the context you need to answer the question — the wrong thing to trade
      // away for visual hierarchy. Same type size, same colour; only the panel differs.
      background: quiet ? 'transparent' : '#e8f7f1',
      border: quiet ? 'none' : '1px solid #cdeee2',
      borderLeft: '4px solid #135450',
      borderRadius: quiet ? 0 : 12,
      padding: quiet ? '1px 0 1px 12px' : '13px 16px',
      marginBottom: quiet ? 16 : 18,
    }}>
      <span style={{ fontSize: 19, fontWeight: 800, color: '#0d3d3a', minWidth: 0, lineHeight: 1.25 }}>{text}</span>
      {dt != null && <DTBadge v={dt} size={quiet ? 30 : 34} />}
    </div>
  )
}

// ── The transcript: what's already been said, quiet and above the live question ──
// This is the difference between a conversation and a form. Answers accumulate as spoken lines
// rather than as rows in a table, and tapping one reopens it — so there are no edit affordances
// (× buttons, "score it" links) cluttering the child-facing surface.
export function Exchange({ q, a, onReopen }: { q: string; a: string; onReopen?: () => void }) {
  // One line per exchange, question and answer together — a spoken record, not stacked form rows.
  // Compactness matters: five behaviours is ten exchanges, and the live question has to stay
  // on screen underneath them.
  return (
    <button onClick={onReopen} disabled={!onReopen}
      style={{ display: 'flex', alignItems: 'baseline', gap: 8, width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '5px 0', cursor: onReopen ? 'pointer' : 'default', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12.5, color: '#a8b6b4', flexShrink: 0 }}>{q}</span>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: '#3d5451' }}>{a}</span>
    </button>
  )
}

// The live question. One per screen, and the only loud thing on it.
export function Ask({ children }: { children: ReactNode }) {
  return <div style={{ ...bigQ, marginTop: 4, marginBottom: 12 }}>{children}</div>
}

// A text answer: Enter sends it. The submit control is a quiet arrow, not an "Add" button —
// a labelled button beside a field reads as data entry.
export function SayIt({ value, onChange, onSend, placeholder, pending }: {
  value: string; onChange: (v: string) => void; onSend: () => void; placeholder: string; pending?: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      <input autoFocus value={value} onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && value.trim()) onSend() }}
        placeholder={placeholder}
        style={{ flex: 1, border: '1.5px solid #cfe0db', borderRadius: 12, padding: '12px 14px', fontSize: 14.5, minWidth: 0, background: '#fff' }} />
      <button onClick={onSend} disabled={!value.trim() || pending} aria-label="Send"
        style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, border: 'none', background: '#135450', color: '#fff', fontSize: 17, fontWeight: 800, cursor: 'pointer', opacity: !value.trim() ? 0.35 : 1 }}>→</button>
    </div>
  )
}

