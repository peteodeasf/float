/**
 * Set it up — an exposure agreed in session, full screen so the child can see it.
 *
 * The child answers out loud and the clinician types (Peter, 2026-09-10). The questions and their
 * words are the child app's own (lib/setupQuestions.ts), on one sheet here because in session it has
 * to be quick. Any number of days in the next two weeks, at one time of day, each its own exposure
 * (Peter, 2026-11-28). The day can still be left for the child to pick at home; the step then shows
 * on their ladder as set up with the clinician and waiting for a day.
 *
 * Plans: docs/plans/teen-home-ladder-and-session-setup.md, docs/plans/action-plan-centred-treatment.md
 */
import { chip } from '../../../components/ui/buttons'
import { useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  getBehaviors, getSituationDownwardArrow,
  getStepArrows, setUpInSession, type AvoidanceBehavior, type PlannedExperiment,
} from '../../../api/treatment'
import { Chrome, Context, FearScale, clampDt, dtOf, primaryBtn, quietLink } from '../sessionKit'
import {
  CONFIDENCE, QUESTION, TIME_BUCKETS, type BucketKey, type ConfidenceKey,
} from '../../../lib/setupQuestions'
import { encodeSafetyBehaviors, readSafetyAnswer } from '../../../lib/temptingBehaviors'
import { useSafetyPicker } from '../../../lib/useSafetyPicker'
import { SAFETY_QUESTION_TYPES } from './shared'

const question: CSSProperties = { fontSize: 16, fontWeight: 800, color: 'var(--float-primary-dark)', marginBottom: 10, display: 'block' }
const section: CSSProperties = { padding: '18px 0', borderTop: '1px solid #e3eeeb' }
// The same chip as everywhere else: these three sheets each had their own, and two of
// them had already drifted apart in size. components/ui/buttons.ts
const choice = (on: boolean): CSSProperties => chip(on, 'md')

/** yyyy-mm-dd (local) and the time-of-day bucket for a scheduled ISO, to prefill from an existing setup. */
const localDay = (iso: string): string => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
const bucketOf = (iso: string): BucketKey => {
  const h = new Date(iso).getHours()
  return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
}

/** Today and the 13 days after: a two-week plan fits. */
const DAYS_AHEAD = 14
const nextDays = (): Date[] => Array.from({ length: DAYS_AHEAD }, (_, i) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + i)
  return d
})
const dayTile = (on: boolean): CSSProperties => ({
  fontFamily: 'inherit', padding: '8px 0', borderRadius: 10, cursor: 'pointer',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
  border: `1px solid ${on ? 'var(--float-primary)' : 'var(--float-border-strong)'}`,
  background: on ? 'var(--float-primary)' : '#fff', color: on ? '#fff' : 'var(--float-text)',
})

export function SessionSetupSheet({
  rung,
  situationName,
  existing,
  onClose,
  onSaved,
}: {
  rung: AvoidanceBehavior
  situationName: string | null
  /** A pending exposure already set up on this rung, or null. Prefills the sheet and shows a banner. */
  existing?: PlannedExperiment | null
  onClose: () => void
  /** Gets the saved exposure, so a caller can act on its confidence (the action plan adds it at High). */
  onSaved: (saved?: PlannedExperiment) => void
}) {
  const qc = useQueryClient()

  // The fear starts as the one from this rung's downward arrow (or, for a sub-situation, its
  // combination's), then the situation's.
  const { data: arrow } = useQuery({
    queryKey: ['situation-da', rung.trigger_situation_id],
    queryFn: () => getSituationDownwardArrow(rung.trigger_situation_id!),
    enabled: !!rung.trigger_situation_id,
  })
  const { data: stepArrows } = useQuery({
    queryKey: ['step-arrows', rung.trigger_situation_id],
    queryFn: () => getStepArrows(rung.trigger_situation_id!),
    enabled: !!rung.trigger_situation_id,
  })
  // A rung's own arrow comes first: since 2026-11-02 every rung can have one.
  const arrowOn = (rungId: string | null | undefined) => (stepArrows ?? []).find(a =>
    !!rungId && a.rung_id === rungId
    && a.facilitated_by !== 'parent' && !!(a.feared_outcome ?? '').trim(),
  )?.feared_outcome
  const stepFear = arrowOn(rung.id) ?? arrowOn(rung.parent_behavior_id)
  const [typedFear, setTypedFear] = useState<string | null>(null)
  const fear = typedFear ?? (existing?.prediction || null) ?? stepFear ?? arrow?.feared_outcome ?? ''

  // The safety and avoidance behaviors and rituals on this situation, to pick from.
  const { data: situationBehaviors } = useQuery({
    queryKey: ['behaviors', rung.trigger_situation_id],
    queryFn: () => getBehaviors(rung.trigger_situation_id!),
    enabled: !!rung.trigger_situation_id,
  })
  const planSafety = [...new Set((situationBehaviors ?? [])
    .filter(b => SAFETY_QUESTION_TYPES.has(b.behavior_type))
    .map(b => b.name.trim())
    .filter(Boolean))]
  const [know, setKnow] = useState(existing?.how_will_i_know ?? '')
  const {
    picked: safety, own: ownSafety, setOwn: setOwnSafety,
    options: safetyOptions, toggle: toggleSafety, addOwn: addOwnSafety, answer: safetyAnswer,
  } = useSafetyPicker(planSafety, readSafetyAnswer(existing?.tempting_behaviors) ?? [])

  const stepDt = dtOf(rung.distress_thermometer_when_refraining)
  // Prefill from an exposure already set up on this rung, when there is one.
  const [bip, setBip] = useState(existing?.bip_before != null ? Math.round(existing.bip_before) : 50)
  const [level, setLevel] = useState(
    existing?.distress_thermometer_expected != null
      ? clampDt(existing.distress_thermometer_expected)!
      : stepDt != null ? clampDt(stepDt) : 5,
  )
  const [days] = useState(nextDays)
  const [pickDays, setPickDays] = useState(!!existing?.scheduled_date)
  // yyyy-mm-dd, local. An existing day is kept when it is still ahead.
  const [picked, setPicked] = useState<string[]>(() => {
    const d = existing?.scheduled_date ? localDay(existing.scheduled_date) : null
    return d && days.some(x => localDay(x.toISOString()) === d) ? [d] : []
  })
  const togglePicked = (d: string) => setPicked(prev => (prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]))
  const [bucket, setBucket] = useState<BucketKey | null>(existing?.scheduled_date ? bucketOf(existing.scheduled_date) : null)
  const [confidence, setConfidence] = useState<ConfidenceKey | null>((existing?.confidence_level as ConfidenceKey) ?? null)

  const saveMut = useMutation({
    mutationFn: () => {
      const hour = TIME_BUCKETS.find(b => b.key === bucket)?.hour ?? 12
      const stamps = [...picked].sort().map(d => {
        const at = new Date(`${d}T00:00:00`)
        at.setHours(hour, 0, 0, 0)
        return at.toISOString()
      })
      return setUpInSession(rung.id, {
        prediction: fear.trim(),
        how_will_i_know: know.trim(),
        bip_before: bip,
        distress_thermometer_expected: level,
        tempting_behaviors: encodeSafetyBehaviors(safetyAnswer),
        confidence_level: confidence!,
        ...(pickDays && bucket && stamps.length ? { scheduled_dates: stamps, scheduled_time_bucket: bucket } : {}),
      })
    },
    onSuccess: saved => {
      qc.invalidateQueries({ queryKey: ['experiments'] })
      onSaved(saved)
    },
  })

  const canSave = !!fear.trim() && !!confidence && (!pickDays || (picked.length > 0 && !!bucket)) && !saveMut.isPending

  const existingWhen = existing?.scheduled_date
    ? `${new Date(existing.scheduled_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${bucketOf(existing.scheduled_date)}`
    : null

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Set up ${rung.name}`}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, overflowY: 'auto' }}>
      <Chrome onExit={onClose} exitLabel="← Back to the ladder">
        <div style={{ background: 'var(--float-surface)', border: '1px solid #dde8e6', borderRadius: 'var(--float-radius-card)', padding: '22px 24px 8px' }}>
          <Context text={rung.name} dt={stepDt} />
          {situationName && (
            <div style={{ fontSize: 13, color: '#6b7a79', margin: '-8px 0 12px' }}>{situationName}</div>
          )}
          {existing && (
            <div style={{ background: '#eef7f4', border: '1px solid #bcdfd4', borderRadius: 'var(--float-radius-card)', padding: '10px 14px', margin: '0 0 14px', fontSize: 13, color: '#2f5d54', lineHeight: 1.45 }}>
              <strong style={{ fontWeight: 800 }}>Already set up.</strong>{' '}
              {existingWhen ? `Scheduled ${existingWhen}` : 'Waiting for a day at home'}
              {existing.bip_before != null && ` · belief ${Math.round(existing.bip_before)}%`}
              {existing.distress_thermometer_expected != null && ` · fear level ${Math.round(existing.distress_thermometer_expected)}`}
              . The fields below are filled in from it — saving sets up another exposure.
            </div>
          )}
          <p style={{ fontSize: 13.5, color: '#4b5a59', margin: '0 0 6px' }}>
            Ask them each question and type what they say.
          </p>

          <div style={section}>
            <label htmlFor="setup-fear" style={question}>{QUESTION.fear}</label>
            <textarea id="setup-fear" rows={2} value={fear} onChange={e => setTypedFear(e.target.value)}
              placeholder="In their words"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 15, padding: '10px 12px', borderRadius: 'var(--float-radius-control)', border: '1px solid #cfe3de', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          <div style={section}>
            <label htmlFor="setup-know" style={question}>{QUESTION.know}</label>
            <textarea id="setup-know" rows={2} value={know} onChange={e => setKnow(e.target.value)}
              placeholder="In their words"
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 15, padding: '10px 12px', borderRadius: 'var(--float-radius-control)', border: '1px solid #cfe3de', resize: 'vertical', fontFamily: 'inherit' }} />
          </div>

          <div style={section}>
            <label htmlFor="setup-believe" style={question}>{QUESTION.believe}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <input id="setup-believe" type="range" min={0} max={100} value={bip}
                onChange={e => setBip(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--float-primary)' }} />
              <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--float-primary)', width: 60, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{bip}%</span>
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
            <span style={question}>{QUESTION.safety}</span>
            {safetyOptions.length > 0 && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {safetyOptions.map(name => (
                  <button key={name} aria-pressed={safety.includes(name)} onClick={() => toggleSafety(name)} style={choice(safety.includes(name))}>
                    {name}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={ownSafety} onChange={e => setOwnSafety(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addOwnSafety() } }}
                placeholder="Another, in their words" aria-label="Add another"
                style={{ flex: 1, fontSize: 14, padding: '8px 10px', borderRadius: 'var(--float-radius-control)', border: '1px solid #cfe3de' }} />
              <button onClick={addOwnSafety} disabled={!ownSafety.trim()} style={choice(false)}>Add</button>
            </div>
          </div>

          <div style={section}>
            <span style={question}>{QUESTION.confident}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CONFIDENCE.map(c => (
                <button key={c.key} aria-pressed={confidence === c.key} onClick={() => setConfidence(c.key)} style={choice(confidence === c.key)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div style={section}>
            <span style={question}>{QUESTION.when}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button aria-pressed={!pickDays} onClick={() => setPickDays(false)} style={choice(!pickDays)}>They pick the day at home</button>
              <button aria-pressed={pickDays} onClick={() => setPickDays(true)} style={choice(pickDays)}>Pick days</button>
            </div>
            {pickDays && <>
              <div role="group" aria-label="Days" style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 6, marginTop: 14 }}>
                {days.map((d, i) => {
                  const key = localDay(d.toISOString())
                  const on = picked.includes(key)
                  return (
                    <button key={key} aria-pressed={on} onClick={() => togglePicked(key)} style={dayTile(on)}
                      aria-label={d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: on ? 'var(--float-primary-light)' : 'var(--float-text-secondary)' }}>
                        {i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}
                      </span>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{d.getDate()}</span>
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                {TIME_BUCKETS.map(b => (
                  <button key={b.key} aria-pressed={bucket === b.key} onClick={() => setBucket(b.key)} style={choice(bucket === b.key)}>
                    {b.label}
                  </button>
                ))}
              </div>
              {picked.length > 1 && (
                <p style={{ fontSize: 13, color: '#4b5a59', margin: '10px 0 0' }}>
                  {picked.length} days{bucket ? `, each in the ${bucket}` : ''}. Each day is its own exposure.
                </p>
              )}
            </>}
          </div>

          <div style={{ ...section, display: 'flex', flexDirection: 'column', gap: 14 }}>
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
