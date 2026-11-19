import { useEffect, useState } from 'react'
import { STAGES, type Guide, type Goal } from '../../lib/clinicianGuide'
import { btn } from '../ui/buttons'

/**
 * The clinician guide, as a panel that slides in over the page and back out. It never pushes the
 * page around (Peter, 2026-11-18). Three parts: where you are, what to do next, what to know.
 * docs/plans/clinician-guide.md
 *
 * Always mounted, so closing slides it out as smoothly as opening slides it in.
 */

const EASE = 'cubic-bezier(.22,1,.36,1)'
const label = { fontSize: '11px', fontWeight: 700, color: 'var(--float-primary)', textTransform: 'uppercase' as const, letterSpacing: '0.06em' }

// "Quieter over time": a clinician can fold away what to know for a stage they know well.
// Remembered in this browser for now (Peter, 2026-11-18).
const foldKey = (stage: string) => `float.guide.folded.${stage}`
function readFolded(stage: string): boolean {
  try { return window.localStorage.getItem(foldKey(stage)) === '1' } catch { return false }
}
function writeFolded(stage: string, folded: boolean) {
  try { folded ? window.localStorage.setItem(foldKey(stage), '1') : window.localStorage.removeItem(foldKey(stage)) } catch { /* private window */ }
}

export default function GuidePanel({ open, onClose, guide, patientName, onTick, loading }: {
  open: boolean
  onClose: () => void
  guide: Guide
  patientName: string
  /** Saves one of the clinician's ticks (a goal, or moving on), with the patient. */
  onTick: (key: string, value: boolean) => void
  /** True while the patient's data is still loading: the panel waits rather than show a wrong stage. */
  loading?: boolean
}) {
  const [folded, setFolded] = useState(() => readFolded(guide.stage))
  useEffect(() => setFolded(readFolded(guide.stage)), [guide.stage])

  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [open, onClose])

  const current = STAGES.findIndex(s => s.id === guide.stage)
  const toggleFold = () => { writeFolded(guide.stage, !folded); setFolded(!folded) }

  return (
    <>
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: 'fixed', inset: 0, zIndex: 60, background: 'color-mix(in srgb, var(--float-text-strong) 10%, transparent)',
          opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none', transition: 'opacity .35s ease',
        }}
      />
      <aside
        role="dialog"
        aria-label="Guide"
        aria-hidden={!open}
        style={{
          position: 'fixed', top: '12px', right: '12px', bottom: '12px', width: 'min(400px, calc(100vw - 24px))', zIndex: 61,
          background: 'var(--float-surface)', borderRadius: 'var(--float-radius-lg)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          transform: open ? 'translateX(0)' : 'translateX(calc(100% + 24px))', opacity: open ? 1 : 0,
          boxShadow: open ? '0 18px 50px color-mix(in srgb, var(--float-text-strong) 20%, transparent)' : 'none',
          pointerEvents: open ? 'auto' : 'none', visibility: open ? 'visible' : 'hidden',
          transition: `transform .42s ${EASE}, opacity .3s ease, box-shadow .42s ease, visibility 0s linear ${open ? '0s' : '.42s'}`,
        }}
      >
        <div style={{ padding: '18px 20px 10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--float-text-strong)', flex: 1 }}>
            Guide <span style={{ fontWeight: 400, color: 'var(--float-text-secondary)' }}>· {patientName}</span>
          </span>
          <button type="button" onClick={onClose} aria-label="Close the guide"
            style={{ width: '32px', height: '32px', borderRadius: 'var(--float-radius-control)', border: 0, background: 'var(--float-surface-sunken)', color: 'var(--float-text-secondary)', fontSize: '18px', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ margin: '0 20px 8px', fontSize: '11px', color: 'var(--float-warning)', background: 'var(--float-warning-bg)', border: '1px solid var(--float-warning-border)', borderRadius: 'var(--float-radius-control)', padding: '6px 10px' }}>
          Draft guidance, for Dr. Walker's review.
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: '8px 20px 20px', opacity: open ? 1 : 0, transition: 'opacity .25s ease .08s' }}>
          {loading ? <p style={{ fontSize: '13px', color: 'var(--float-text-hint)' }}>Loading…</p> : <>
          <div style={{ ...label, marginBottom: '10px' }}>Where you are</div>
          <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {STAGES.map((s, i) => {
              const done = i < current, now = i === current, last = i === STAGES.length - 1
              return (
                <li key={s.id} style={{ display: 'flex', gap: '12px' }} aria-current={now ? 'step' : undefined}>
                  <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '14px' }}>
                    <span style={{
                      width: '12px', height: '12px', borderRadius: '50%', marginTop: '3px', boxSizing: 'border-box', flexShrink: 0,
                      background: done ? 'var(--float-primary)' : 'var(--float-surface)',
                      border: done ? 0 : now ? '3px solid var(--float-primary)' : '2px solid var(--float-border-strong)',
                      boxShadow: now ? '0 0 0 3px var(--float-primary-light)' : 'none',
                    }} />
                    {!last && <span style={{ flex: 1, width: '2px', margin: '3px 0', background: done ? 'var(--float-primary)' : 'var(--float-border)' }} />}
                  </span>
                  <span style={{ paddingBottom: '12px', flex: 1 }}>
                    <span style={{ display: 'block', fontSize: now ? '14px' : '13px', fontWeight: now ? 600 : 400, color: now ? 'var(--float-text-strong)' : done ? 'var(--float-text-secondary)' : 'var(--float-text-hint)' }}>{s.name}</span>
                    {now && <span style={{ display: 'block', fontSize: '12px', color: 'var(--float-primary)', marginTop: '2px' }}>{guide.progress}</span>}
                  </span>
                </li>
              )
            })}
          </ol>

          <div style={{ ...label, margin: '10px 0 8px' }}>What to do next</div>
          <div style={{ background: 'var(--float-primary-light)', borderRadius: 'var(--float-radius-card)', padding: '14px', marginBottom: '10px' }}>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--float-primary-dark)' }}>{guide.next.title}</div>
            <div style={{ fontSize: '13px', color: 'var(--float-primary-dark)', marginTop: '6px', lineHeight: 1.5 }}>{guide.next.why}</div>
          </div>
          {guide.goals.length > 0 && <GoalList goals={guide.goals} onTick={onTick} />}
          {guide.routine && (
            <ol style={{ listStyle: 'decimal', margin: '4px 0 0', paddingLeft: '20px', fontSize: '13px', lineHeight: 1.6, color: 'var(--float-text)' }}>
              {guide.routine.map(r => <li key={r}>{r}</li>)}
            </ol>
          )}
          {guide.note && <p style={{ fontSize: '12px', color: 'var(--float-text-secondary)', margin: '8px 0 0' }}>{guide.note}</p>}
          {guide.moveOn && (
            <button type="button" onClick={() => onTick(guide.moveOn!.key, true)} style={btn('secondary', 'sm', { marginTop: '12px' })}>
              {guide.moveOn.label} →
            </button>
          )}
          {guide.movedOnFrom && (
            <p style={{ fontSize: '12px', color: 'var(--float-text-hint)', margin: '8px 0 0' }}>
              You moved on to this stage.{' '}
              <button type="button" onClick={() => onTick(guide.movedOnFrom!, false)} style={btn('quiet', 'sm')}>Go back</button>
            </p>
          )}

          {guide.earlier.length > 0 && (
            <>
              <div style={{ ...label, margin: '20px 0 4px' }}>Not done earlier</div>
              <GoalList goals={guide.earlier} onTick={onTick} />
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0 6px' }}>
            <span style={{ ...label, flex: 1 }}>What to know</span>
            <button type="button" onClick={toggleFold} aria-expanded={!folded}
              style={{ border: 0, background: 'transparent', color: 'var(--float-text-secondary)', fontSize: '12px', cursor: 'pointer', padding: 0 }}>
              {folded ? 'Show' : 'I know this stage, fold it away'}
            </button>
          </div>
          {!folded && guide.know.map(k => (
            <div key={k.title} style={{ padding: '10px 0', borderTop: '1px solid var(--float-surface-sunken)' }}>
              <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--float-text-strong)' }}>{k.title}</div>
              <div style={{ fontSize: '13px', lineHeight: 1.5, color: 'var(--float-text-secondary)', marginTop: '2px' }}>{k.body}</div>
              {k.example && (
                <div style={{ marginTop: '6px', fontSize: '13px', lineHeight: 1.5, color: 'var(--float-primary-dark)', background: 'var(--float-primary-light)', borderRadius: 'var(--float-radius-control)', padding: '8px 10px' }}>
                  <strong>For {patientName.split(' ')[0]}:</strong> {k.example}
                </div>
              )}
            </div>
          ))}
          </>}
        </div>
      </aside>
    </>
  )
}

/** Goals. Float ticks the ones it can see; the clinician ticks the rest by tapping them. */
function GoalList({ goals, onTick }: { goals: Goal[]; onTick: (key: string, value: boolean) => void }) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {goals.map(g => {
        const mark = (
          <span aria-hidden="true" style={{
            width: '18px', height: '18px', borderRadius: g.byClinician ? '5px' : '50%', flexShrink: 0, boxSizing: 'border-box', marginTop: '1px',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700,
            background: g.done ? 'var(--float-primary)' : 'var(--float-surface)', color: 'var(--float-surface)',
            border: g.done ? 0 : '2px solid var(--float-primary)',
          }}>{g.done ? '✓' : ''}</span>
        )
        const text = (
          <span style={{ flex: 1, textAlign: 'left' }}>
            <span style={{ display: 'block', fontSize: '13px', fontWeight: g.done ? 400 : 600, color: g.done ? 'var(--float-text-secondary)' : 'var(--float-text)' }}>
              {g.title}<span className="sr-only">{g.done ? ' (done)' : ' (to do)'}</span>
            </span>
            <span style={{ display: 'block', fontSize: '12px', color: 'var(--float-text-hint)' }}>
              {g.from ? `${g.from} · ` : ''}{g.detail}{g.byClinician ? '' : ' · Float ticks this'}
            </span>
          </span>
        )
        const row = { display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '6px 0', width: '100%' } as const
        return (
          <li key={g.key}>
            {g.byClinician ? (
              <button type="button" role="checkbox" aria-checked={g.done} onClick={() => onTick(g.key, !g.done)}
                style={{ ...row, border: 0, background: 'transparent', cursor: 'pointer', font: 'inherit' }}>
                {mark}{text}
              </button>
            ) : <div style={row}>{mark}{text}</div>}
          </li>
        )
      })}
    </ul>
  )
}
