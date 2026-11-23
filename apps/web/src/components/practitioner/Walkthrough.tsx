import type { CSSProperties } from 'react'
import { findTarget, type Walkthrough as WalkthroughData } from '../../lib/walkthroughs'
import { btn, panelLabel } from '../ui/buttons'

/**
 * One "How this works" walkthrough, inside the guide's side panel. docs/plans/how-this-works.md
 *
 * "Show me" scrolls the step's control into view and makes it pulse. A step whose control is not
 * on the screen right now has no Show me.
 */

const label = { ...panelLabel, margin: '18px 0 6px' }
const para = { fontSize: '13px', lineHeight: 1.5, color: 'var(--float-text)', margin: 0 }
const PULSE_MS = 3600 // three pulses, index.css .float-show-me
const pulseTimers = new WeakMap<HTMLElement, number>()

/** The control itself, or the nearest box around it that does not cut its ring off. The Access
 *  buttons sit in a group with overflow: hidden, which would hide the ring entirely. */
function pulseBox(el: HTMLElement): HTMLElement {
  let box = el
  while (box.parentElement && getComputedStyle(box.parentElement).overflow === 'hidden') box = box.parentElement
  return box
}

const overlaps = (a: DOMRect, b: DOMRect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

function showMe(el: HTMLElement, panel: HTMLElement | null) {
  el.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  const box = pulseBox(el)
  window.clearTimeout(pulseTimers.get(box))
  box.classList.remove('float-show-me')
  void box.offsetWidth // restart the animation if it is already running
  box.classList.add('float-show-me')
  // A control under the panel (on a narrow window) would pulse out of sight: fade the panel
  // until the pulse is over.
  const hidden = !!panel && overlaps(box.getBoundingClientRect(), panel.getBoundingClientRect())
  if (hidden) panel!.style.opacity = '0.12'
  pulseTimers.set(box, window.setTimeout(() => {
    box.classList.remove('float-show-me')
    if (hidden) panel!.style.opacity = ''
  }, PULSE_MS))
}

/** The "How this works" link: at the end of the patient page's tab bar, and above Access. */
export function HowThisWorksLink({ onClick, style }: { onClick: () => void; style?: CSSProperties }) {
  return (
    <button type="button" aria-haspopup="dialog" onClick={onClick}
      style={{ ...btn('quiet', 'sm'), textDecoration: 'underline', textUnderlineOffset: '3px', ...style }}>
      How this works
    </button>
  )
}

export default function Walkthrough({ walkthrough, open }: {
  walkthrough: WalkthroughData
  /** Whether the panel is showing; which controls are on screen is checked as it opens. */
  open: boolean
}) {
  const targets = open ? walkthrough.steps.map(s => (s.show ? findTarget(s.show) : null)) : []

  return (
    <div>
      <div style={{ ...label, marginTop: '4px' }}>What it's for</div>
      <p style={para}>{walkthrough.for}</p>

      <div style={label}>Before you start</div>
      <p style={para}>{walkthrough.before}</p>

      <div style={label}>Steps</div>
      <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {walkthrough.steps.map((s, i) => {
          const target = targets[i]
          return (
            <li key={s.title} style={{ display: 'flex', gap: '10px' }}>
              <span aria-hidden="true" style={{
                width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0, background: 'var(--float-primary-light)',
                color: 'var(--float-primary-dark)', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{i + 1}</span>
              <span style={{ flex: 1 }}>
                <span style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: 'var(--float-text-strong)' }}>{s.title}</span>
                <span style={{ display: 'block', fontSize: '13px', lineHeight: 1.5, color: 'var(--float-text-secondary)', marginTop: '2px' }}>{s.body}</span>
                {target && (
                  <button type="button" onClick={e => showMe(target, e.currentTarget.closest<HTMLElement>('[role="dialog"]'))} style={btn('secondary', 'sm', { marginTop: '6px' })}>
                    Show me
                  </button>
                )}
              </span>
            </li>
          )
        })}
      </ol>

      <div style={label}>{walkthrough.seesLabel}</div>
      <p style={para}>{walkthrough.sees}</p>

      <div style={label}>Things to know</div>
      <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', lineHeight: 1.5, color: 'var(--float-text)' }}>
        {walkthrough.know.map(k => <li key={k}>{k}</li>)}
      </ul>
    </div>
  )
}
