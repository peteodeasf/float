/**
 * Record one: how an exposure went, recorded by the clinician in session with the same questions the
 * child answers in their app after an exposure (TeenRecordPage, Dr. Walker's worksheet). Full screen
 * like Set it up, because the child is looking at it. Action plan check-in, Peter 2026-11-27.
 */
import { useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useMutation } from '@tanstack/react-query'
import { recordExposure } from '../../../api/action_plans'
import { chip } from '../../../components/ui/buttons'
import { Chrome, Context, FearScale, primaryBtn, quietLink } from '../sessionKit'

const question: CSSProperties = { fontSize: 16, fontWeight: 800, color: 'var(--float-primary-dark)', marginBottom: 10, display: 'block' }
const section: CSSProperties = { padding: '18px 0', borderTop: '1px solid #e3eeeb' }
const box: CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 15, padding: '10px 12px', borderRadius: 'var(--float-radius-control)', border: '1px solid #cfe3de', resize: 'vertical', fontFamily: 'inherit' }
const choice = (on: boolean): CSSProperties => chip(on, 'md')

// The child app's hints, word for word (TeenRecordPage).
const HAPPENED_HINT = 'What did you do? What did other people do?'
const LEARNED_HINT = 'How was it different to what you expected?'

function YesNo({ value, onPick, label }: { value: boolean | null; onPick: (v: boolean) => void; label: string }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'flex', gap: 8 }}>
      <button aria-pressed={value === true} onClick={() => onPick(true)} style={choice(value === true)}>Yes</button>
      <button aria-pressed={value === false} onClick={() => onPick(false)} style={choice(value === false)}>No</button>
    </div>
  )
}

export function RecordExposureSheet({ patientId, rungId, title, onClose, onSaved }: {
  patientId: string; rungId: string; title: string; onClose: () => void; onSaved: () => void
}) {
  const [happened, setHappened] = useState<boolean | null>(null)
  const [whatHappened, setWhatHappened] = useState('')
  const [surprised, setSurprised] = useState<boolean | null>(null)
  const [level, setLevel] = useState<number | null>(null)
  const [belief, setBelief] = useState(50)
  const [learned, setLearned] = useState('')
  const saveMut = useMutation({
    mutationFn: () => recordExposure(patientId, rungId, {
      feared_outcome_occurred: happened!, what_happened: whatHappened.trim(), was_surprised: surprised,
      distress_thermometer_actual: level!, bip_after: belief, what_learned: learned.trim(),
    }),
    onSuccess: onSaved,
  })
  const canSave = happened !== null && level !== null && !!whatHappened.trim() && !!learned.trim() && !saveMut.isPending

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Record ${title}`} style={{ position: 'fixed', inset: 0, zIndex: 1000, overflowY: 'auto' }}>
      <Chrome onExit={onClose} exitLabel="← Back to the action plan">
        <div style={{ background: 'var(--float-surface)', border: '1px solid #dde8e6', borderRadius: 'var(--float-radius-card)', padding: '22px 24px 8px' }}>
          <Context text={title} />
          <p style={{ fontSize: 13.5, color: '#4b5a59', margin: '0 0 6px' }}>Ask them each question and type what they say.</p>

          <div style={section}>
            <span style={question}>Did what you were most worried about happen?</span>
            <YesNo value={happened} onPick={setHappened} label="Did it happen" />
          </div>
          <div style={section}>
            <label htmlFor="rec-happened" style={question}>What did happen?</label>
            <textarea id="rec-happened" rows={2} value={whatHappened} placeholder={HAPPENED_HINT} onChange={e => setWhatHappened(e.target.value)} style={box} />
          </div>
          <div style={section}>
            <span style={question}>Were you surprised?</span>
            <YesNo value={surprised} onPick={setSurprised} label="Were you surprised" />
          </div>
          <div style={section}>
            <span style={question}>What was your Fear Level?</span>
            <FearScale value={level} onPick={setLevel} label="Fear Level" />
          </div>
          <div style={section}>
            <label htmlFor="rec-belief" style={question}>How strong is your belief now?</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <input id="rec-belief" type="range" min={0} max={100} value={belief} onChange={e => setBelief(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--float-primary)' }} />
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--float-primary)', width: 60, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{belief}%</span>
            </div>
          </div>
          <div style={section}>
            <label htmlFor="rec-learned" style={question}>What did you learn?</label>
            <textarea id="rec-learned" rows={2} value={learned} placeholder={LEARNED_HINT} onChange={e => setLearned(e.target.value)} style={box} />
          </div>

          <div style={{ ...section, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {saveMut.isError && <p role="alert" style={{ fontSize: 13.5, color: '#b91c1c', margin: 0 }}>That didn't save. Try again.</p>}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 14 }}>
              <button onClick={() => saveMut.mutate()} disabled={!canSave}
                style={{ ...primaryBtn, marginTop: 0, opacity: canSave ? 1 : 0.45, cursor: canSave ? 'pointer' : 'not-allowed' }}>
                {saveMut.isPending ? 'Saving…' : 'Save'}
              </button>
              <button onClick={onClose} style={quietLink}>Cancel</button>
            </div>
          </div>
        </div>
      </Chrome>
    </div>,
    document.body,
  )
}
