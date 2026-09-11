/**
 * Setting up a parent's accommodation experiment in a parent session.
 *
 * The parent app's questions on one sheet, full screen so the parent can see it, with the clinician
 * typing what they say (Peter, 2026-09-11: set up by the parent or the clinician). Any accommodation
 * on the plan, the weekly focus first. docs/plans/parent-accommodation-experiments.md
 */
import { useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Chrome, FearScale, primaryBtn, quietLink } from '../../pages/practitioner/sessionKit'
import { setUpParentExperimentInSession, type Bucket, type Readiness } from '../../api/parentExperiments'
import type { Accommodation } from '../../api/accommodations'
import { CONFIDENCE, TIME_BUCKETS } from '../../lib/setupQuestions'
import { getNextSchoolDayISO } from '../../pages/practitioner/patient/shared'

const question: CSSProperties = { fontSize: 16, fontWeight: 800, color: '#0d3d3a', marginBottom: 10, display: 'block' }
const section: CSSProperties = { padding: '16px 0', borderTop: '1px solid #e3eeeb' }
const field: CSSProperties = { width: '100%', boxSizing: 'border-box', fontSize: 15, padding: '10px 12px', borderRadius: 10, border: '1px solid #cfe3de', fontFamily: 'inherit' }
const choice = (on: boolean): CSSProperties => ({
  fontSize: 14, fontWeight: 700, borderRadius: 10, padding: '9px 16px', cursor: 'pointer',
  color: on ? '#fff' : '#135450', background: on ? '#135450' : '#fff',
  border: `1.5px solid ${on ? '#135450' : '#cfe3de'}`,
})

export default function ParentExperimentSheet({
  planId,
  accommodations,
  onClose,
}: {
  planId: string
  accommodations: Accommodation[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const ordered = [...accommodations].sort((a, b) => Number(b.is_weekly_focus) - Number(a.is_weekly_focus))
  const [accId, setAccId] = useState(ordered[0]?.id ?? '')
  const acc = ordered.find(a => a.id === accId) ?? null
  const [day, setDay] = useState(getNextSchoolDayISO())
  const [bucket, setBucket] = useState<Bucket | null>(null)
  const [instead, setInstead] = useState('')
  const [afraid, setAfraid] = useState('')
  const [belief, setBelief] = useState(50)
  const [level, setLevel] = useState<number | null>(null)
  const [ready, setReady] = useState<Readiness | null>(null)

  // Starts from the parent's own estimate for that accommodation, when they gave one.
  const estimate = acc?.parent_estimate_min != null
    ? Math.round((acc.parent_estimate_min + (acc.parent_estimate_max ?? acc.parent_estimate_min)) / 2)
    : 5
  const fear = level ?? estimate

  const saveMut = useMutation({
    mutationFn: () => {
      const at = new Date(`${day}T00:00:00`)
      at.setHours(TIME_BUCKETS.find(b => b.key === bucket)?.hour ?? 12, 0, 0, 0)
      return setUpParentExperimentInSession(planId, {
        accommodation_id: accId,
        scheduled_date: at.toISOString(),
        scheduled_time_bucket: bucket!,
        instead: instead.trim() || null,
        prediction: afraid.trim(),
        belief_before: belief,
        expected_fear: fear,
        readiness: ready,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parent-experiments', planId] })
      onClose()
    },
  })
  const canSave = !!accId && !!day && !!bucket && !!afraid.trim() && !saveMut.isPending

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Set up an experiment with the parent"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, overflowY: 'auto' }}>
      <Chrome onExit={onClose} exitLabel="← Back to the plan">
        <div style={{ background: '#fff', border: '1px solid #dde8e6', borderRadius: 18, padding: '22px 24px 8px' }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: '.04em', marginBottom: 6 }}>ASK THE PARENT · TYPE WHAT THEY SAY</div>

          <div style={{ ...section, borderTop: 0, paddingTop: 4 }}>
            <label htmlFor="exp-which" style={question}>Which one will you try?</label>
            <select id="exp-which" value={accId} onChange={e => { setAccId(e.target.value); setLevel(null) }} style={field}>
              {ordered.map(a => (
                <option key={a.id} value={a.id}>{a.name}{a.is_weekly_focus ? ' (this week’s focus)' : ''}</option>
              ))}
            </select>
          </div>

          <div style={section}>
            <span style={question}>When will you try it?</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <input type="date" aria-label="Day" value={day} onChange={e => setDay(e.target.value)} style={{ ...field, width: 'auto' }} />
              {TIME_BUCKETS.map(b => (
                <button key={b.key} aria-pressed={bucket === b.key} onClick={() => setBucket(b.key)} style={choice(bucket === b.key)}>{b.label}</button>
              ))}
            </div>
          </div>

          <div style={section}>
            <label htmlFor="exp-instead" style={question}>What will you do instead?</label>
            <textarea id="exp-instead" rows={2} value={instead} onChange={e => setInstead(e.target.value)} style={{ ...field, resize: 'vertical' }}
              placeholder="e.g. Say goodnight, remind her I'm downstairs, and leave" />
          </div>

          <div style={section}>
            <label htmlFor="exp-afraid" style={question}>What are you afraid will happen?</label>
            <input id="exp-afraid" value={afraid} onChange={e => setAfraid(e.target.value)} style={field} placeholder="In their words" />
          </div>

          <div style={section}>
            <label htmlFor="exp-believe" style={question}>How strongly do you believe that will happen?</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <input id="exp-believe" type="range" min={0} max={100} value={belief} onChange={e => setBelief(Number(e.target.value))} style={{ flex: 1, accentColor: '#135450' }} />
              <span style={{ fontSize: 22, fontWeight: 800, color: '#135450', width: 60, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{belief}%</span>
            </div>
          </div>

          <div style={section}>
            <span style={question}>How upset do you expect your child to be?</span>
            <FearScale value={fear} onPick={setLevel} label="Fear Level" />
          </div>

          <div style={section}>
            <span style={question}>How ready do you feel?</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CONFIDENCE.map(c => (
                <button key={c.key} aria-pressed={ready === c.key} onClick={() => setReady(c.key)} style={choice(ready === c.key)}>{c.label}</button>
              ))}
            </div>
          </div>

          <div style={{ ...section, display: 'flex', flexDirection: 'column', gap: 12 }}>
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
