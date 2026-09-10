/**
 * Set it up — an exposure agreed in session, full screen so the child can see it.
 *
 * The child answers out loud and the clinician types (Peter, 2026-09-10). The questions and their
 * words are the child app's own (lib/setupQuestions.ts), on one sheet here because in session it has
 * to be quick. The day can be left for the child to pick at home; the step then shows on their
 * ladder as set up with the clinician and waiting for a day.
 *
 * Plan: docs/plans/teen-home-ladder-and-session-setup.md
 */
import { useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getSituationDownwardArrow, setUpInSession, type AvoidanceBehavior,
} from '../../../api/treatment'
import { Chrome, Context, FearScale, clampDt, dtOf, primaryBtn, quietLink } from '../sessionKit'
import {
  CONFIDENCE, QUESTION, TIME_BUCKETS, type BucketKey, type ConfidenceKey,
} from '../../../lib/setupQuestions'
import { getNextSchoolDayISO } from './shared'

const question: CSSProperties = { fontSize: 16, fontWeight: 800, color: '#0d3d3a', marginBottom: 10, display: 'block' }
const section: CSSProperties = { padding: '18px 0', borderTop: '1px solid #e3eeeb' }
const choice = (on: boolean): CSSProperties => ({
  fontSize: 14, fontWeight: 700, borderRadius: 10, padding: '9px 16px', cursor: 'pointer',
  color: on ? '#fff' : '#135450',
  background: on ? '#135450' : '#fff',
  border: `1.5px solid ${on ? '#135450' : '#cfe3de'}`,
})

export function SessionSetupSheet({
  rung,
  situationName,
  isRecommended,
  onRecommend,
  onClose,
  onSaved,
}: {
  rung: AvoidanceBehavior
  situationName: string | null
  isRecommended: boolean
  /** Moves "Do this next" to this step, or takes it off. */
  onRecommend: () => void
  onClose: () => void
  onSaved: () => void
}) {
  const qc = useQueryClient()

  // The fear starts as the one from this situation's downward arrow, when there is one.
  const { data: arrow } = useQuery({
    queryKey: ['situation-da', rung.trigger_situation_id],
    queryFn: () => getSituationDownwardArrow(rung.trigger_situation_id!),
    enabled: !!rung.trigger_situation_id,
  })
  const [typedFear, setTypedFear] = useState<string | null>(null)
  const fear = typedFear ?? arrow?.feared_outcome ?? ''

  const stepDt = dtOf(rung.distress_thermometer_when_refraining)
  const [bip, setBip] = useState(50)
  const [level, setLevel] = useState(stepDt != null ? clampDt(stepDt) : 5)
  // Left for home unless they pick one now. Peter: picking the day "is more likely to be something
  // done by the child."
  const [dayNow, setDayNow] = useState(false)
  const [day, setDay] = useState(getNextSchoolDayISO())
  const [bucket, setBucket] = useState<BucketKey | null>(null)
  const [confidence, setConfidence] = useState<ConfidenceKey | null>(null)
  const [wantNext, setWantNext] = useState(isRecommended)

  const saveMut = useMutation({
    mutationFn: () => {
      const at = new Date(`${day}T00:00:00`)
      at.setHours(TIME_BUCKETS.find(b => b.key === bucket)?.hour ?? 12, 0, 0, 0)
      return setUpInSession(rung.id, {
        prediction: fear.trim(),
        bip_before: bip,
        distress_thermometer_expected: level,
        confidence_level: confidence!,
        ...(dayNow && bucket ? { scheduled_date: at.toISOString(), scheduled_time_bucket: bucket } : {}),
      })
    },
    onSuccess: () => {
      if (wantNext !== isRecommended) onRecommend()
      qc.invalidateQueries({ queryKey: ['experiments'] })
      onSaved()
    },
  })

  const canSave = !!fear.trim() && !!confidence && (!dayNow || (!!day && !!bucket)) && !saveMut.isPending

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Set up ${rung.name}`}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, overflowY: 'auto' }}>
      <Chrome onExit={onClose} exitLabel="← Back to the ladder">
        <div style={{ background: '#fff', border: '1px solid #dde8e6', borderRadius: 18, padding: '22px 24px 8px' }}>
          <Context text={rung.name} dt={stepDt} />
          {situationName && (
            <div style={{ fontSize: 13, color: '#6b7a79', margin: '-8px 0 12px' }}>{situationName}</div>
          )}
          <p style={{ fontSize: 13.5, color: '#4b5a59', margin: '0 0 6px' }}>
            Ask them each question and type what they say.
          </p>

          <div style={section}>
            <label htmlFor="setup-fear" style={question}>{QUESTION.fear}</label>
            <textarea id="setup-fear" rows={2} value={fear} onChange={e => setTypedFear(e.target.value)}
              placeholder="In their words"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 15, padding: '10px 12px', borderRadius: 10, border: '1px solid #cfe3de', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          <div style={section}>
            <label htmlFor="setup-believe" style={question}>{QUESTION.believe}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <input id="setup-believe" type="range" min={0} max={100} value={bip}
                onChange={e => setBip(Number(e.target.value))} style={{ flex: 1, accentColor: '#135450' }} />
              <span style={{ fontSize: 22, fontWeight: 800, color: '#135450', width: 60, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{bip}%</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#6b7a79', marginTop: 4, paddingRight: 76 }}>
              <span>Not at all</span><span>Completely</span>
            </div>
          </div>

          <div style={section}>
            <span style={question}>{QUESTION.level}</span>
            <FearScale value={level} onPick={setLevel} label="Fear Level" />
          </div>

          <div style={section}>
            <span style={question}>{QUESTION.when}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button aria-pressed={!dayNow} onClick={() => setDayNow(false)} style={choice(!dayNow)}>They pick the day at home</button>
              <button aria-pressed={dayNow} onClick={() => setDayNow(true)} style={choice(dayNow)}>Pick a day now</button>
            </div>
            {dayNow && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <input type="date" aria-label="Day" value={day} onChange={e => setDay(e.target.value)}
                  style={{ fontSize: 14, padding: '8px 10px', borderRadius: 10, border: '1px solid #cfe3de' }} />
                {TIME_BUCKETS.map(b => (
                  <button key={b.key} aria-pressed={bucket === b.key} onClick={() => setBucket(b.key)} style={choice(bucket === b.key)}>
                    {b.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div style={section}>
            <span style={question}>{QUESTION.ready}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CONFIDENCE.map(c => (
                <button key={c.key} aria-pressed={confidence === c.key} onClick={() => setConfidence(c.key)} style={choice(confidence === c.key)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ ...section, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Advice, not a lock: the child can still pick any step. Only one step carries it, so
                ticking this takes it off whichever step had it. */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#334155', cursor: 'pointer' }}>
              <input type="checkbox" checked={wantNext} onChange={e => setWantNext(e.target.checked)} style={{ cursor: 'pointer' }} />
              Tell them to do this one next
            </label>
            {saveMut.isError && (
              <p role="alert" style={{ fontSize: 13.5, color: '#b91c1c', margin: 0 }}>That didn't save. Try again.</p>
            )}
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
