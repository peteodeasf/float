import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { teenApiClient } from '../../api/client'
import TeenScreen from '../../components/teen/TeenScreen'
import BeliefSlider from '../../components/teen/BeliefSlider'
import Thermometer from '../../components/teen/Thermometer'
import teen from '../../styles/teenTokens'
import {
  ANSWERED_AS,
  CONFIDENCE,
  QUESTION,
  SETUP_ORDER,
  TIME_BUCKETS,
  bucketLabel,
  confidenceLabel,
  whatsDone,
  type BucketKey,
  type ConfidenceKey,
  type SetupKey,
  type SetupSoFar,
} from '../../lib/setupQuestions'

type Finishing = SetupSoFar & { id: string; status: string }

const NOTHING_DONE: Record<SetupKey, boolean> = {
  fear: false, believe: false, level: false, when: false, ready: false,
}

// The child sets the plan up on one screen — the fear, how much they believe it, and the fear
// level they expect — laid out like the recording screen. Then when, then how ready. Three steps.
const STEPS: SetupKey[][] = [['fear', 'believe', 'level'], ['when'], ['ready']]
const stepIndexOf = (k: SetupKey) => STEPS.findIndex(s => s.includes(k))

/**
 * Setting an exposure up — the child's version.
 *
 * Peter, 2026-09-10: "child setup ux should be different than clinician. it should be more
 * interactive and engaging." So one question per screen, with things to tap and drag, a bar of five
 * showing how far they are, and a card at the end. The questions and words are the ones the
 * clinician's sheet uses (lib/setupQuestions.ts).
 *
 * Opened with `?experiment=` when the clinician set it up in session: it starts on a summary of
 * what's done, ticked and changeable, and asks only what's left.
 *
 * Plan: docs/plans/teen-home-ladder-and-session-setup.md
 */
export default function TeenExperimentPage() {
  const { behaviorId } = useParams<{ behaviorId: string }>()
  const [searchParams] = useSearchParams()
  const finishingId = searchParams.get('experiment')
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: behaviorData } = useQuery({
    queryKey: ['teen-behavior', behaviorId],
    queryFn: async () => (await teenApiClient.get(`/patient/behaviors/${behaviorId}`)).data,
    enabled: !!behaviorId,
  })
  // The pending list is the only patient-scoped way to read one exposure.
  const { data: pending } = useQuery({
    queryKey: ['teen-pending', 'experiment-page'],
    queryFn: async () => (await teenApiClient.get('/patient/experiments/pending')).data,
    enabled: !!finishingId,
  })
  const finishing: Finishing | null =
    finishingId ? ((pending ?? []) as Finishing[]).find(e => e.id === finishingId) ?? null : null

  const stepName: string = behaviorData?.name ?? 'Your experiment'
  const clinicianFear: string | null = behaviorData?.situation?.feared_outcome || null
  const done = finishing ? whatsDone(finishing) : NOTHING_DONE
  // The summary is worth showing only when something was answered in session. An older plan that
  // only has a day goes straight to the questions, and the day shows on the "when" screen.
  const hasSummary = SETUP_ORDER.some(k => done[k])
  // The clinician picked the day in session; the child still says the time of day.
  const dayFixed = !!finishing?.scheduled_date

  // ── the answers, seeded once from what was set up in session ──
  const [seeded, setSeeded] = useState(false)

  // Ladder switched off: nothing to set up. The same rule as the exposure screen. A link to an
  // exposure that is no longer waiting has nothing to finish either.
  useEffect(() => {
    if (behaviorData && behaviorData.ladder_active === false) navigate('/teen/home', { replace: true })
    // Only on arrival: the list is fetched again after locking in, and that must not move them.
    if (finishingId && pending && !finishing && !seeded) navigate('/teen/home', { replace: true })
  }, [behaviorData, finishingId, pending, finishing, seeded, navigate])

  const [fear, setFear] = useState('')
  const [bip, setBip] = useState(50)
  const [level, setLevel] = useState<number | null>(null)
  const [days, setDays] = useState<number[]>([])
  const [bucket, setBucket] = useState<BucketKey | null>(null)
  const [confidence, setConfidence] = useState<ConfidenceKey | null>(null)

  useEffect(() => {
    if (seeded || !behaviorData) return
    if (finishingId && !finishing) return
    const inSession = !!finishing && done.fear
    setFear((inSession && finishing?.prediction) || clinicianFear || '')
    if (inSession && finishing?.bip_before != null) setBip(Math.round(finishing.bip_before))
    setLevel(
      inSession && finishing?.distress_thermometer_expected != null
        ? Math.round(finishing.distress_thermometer_expected)
        : behaviorData.dt != null
          ? Math.round(behaviorData.dt)
          : 5,
    )
    if (finishing?.scheduled_time_bucket) setBucket(finishing.scheduled_time_bucket as BucketKey)
    if (inSession && finishing?.confidence_level) setConfidence(finishing.confidence_level as ConfidenceKey)
    if (!hasSummary) setPhase('ask')
    setSeeded(true)
  }, [seeded, behaviorData, finishingId, finishing, done.fear, hasSummary, clinicianFear])

  // ── which screens to walk through ──
  const missing = SETUP_ORDER.filter(k => !done[k])
  const [phase, setPhase] = useState<'summary' | 'ask' | 'locked'>(finishingId ? 'summary' : 'ask')
  const [queue, setQueue] = useState<SetupKey[][]>(STEPS)
  const [pos, setPos] = useState(0)
  const currentStep = queue[pos]
  const isLast = pos === queue.length - 1

  // Progress is by step now (three), not by answer. A step counts as filled when every answer in
  // it is done, or once it has been walked past in this queue.
  const doneStepIdx = new Set<number>()
  STEPS.forEach((s, i) => { if (s.every(k => done[k])) doneStepIdx.add(i) })
  queue.slice(0, pos).forEach(s => doneStepIdx.add(STEPS.indexOf(s)))
  const filled = phase === 'locked' ? STEPS.length : doneStepIdx.size

  const startWith = (firstKey?: SetupKey) => {
    const missingSteps = STEPS.filter(s => s.some(k => !done[k]))
    if (firstKey) {
      const first = STEPS[stepIndexOf(firstKey)]
      setQueue([first, ...missingSteps.filter(s => s !== first)])
      setPos(0)
      setPhase('ask')
      return
    }
    if (missingSteps.length === 0) return void lockIn()
    setQueue(missingSteps)
    setPos(0)
    setPhase('ask')
  }

  const next7 = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() + i)
        d.setHours(0, 0, 0, 0)
        return d
      }),
    [],
  )

  const canNext: Record<SetupKey, boolean> = {
    fear: fear.trim().length > 0,
    believe: true,
    level: level != null,
    when: (dayFixed || days.length > 0) && !!bucket,
    ready: confidence != null,
  }

  // ── saving ──
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [lockedDays, setLockedDays] = useState<string[]>([])
  const hour = TIME_BUCKETS.find(b => b.key === bucket)?.hour ?? 12
  const stamp = (d: Date) => {
    const x = new Date(d)
    x.setHours(hour, 0, 0, 0)
    return x.toISOString()
  }
  const answers = (scheduled_date?: string) => ({
    plan_description: stepName,
    prediction: fear.trim(),
    bip_before: bip,
    distress_thermometer_expected: level ?? 5,
    confidence_level: confidence ?? 'medium',
    scheduled_time_bucket: bucket,
    ...(scheduled_date ? { scheduled_date } : {}),
  })
  const createAndCommit = async (iso: string) => {
    const created = (
      await teenApiClient.post(`/patient/behaviors/${behaviorId}/experiments`, { scheduled_date: iso })
    ).data
    await teenApiClient.put(`/patient/experiments/${created.id}/before`, answers())
    await teenApiClient.post(`/patient/experiments/${created.id}/commit`)
  }

  async function lockIn() {
    setSaving(true)
    setSaveFailed(false)
    try {
      const chosen = [...days].sort((a, b) => a - b).map(i => stamp(next7[i]))
      const saved: string[] = []
      if (finishing) {
        // Finish the clinician's row rather than making a second one. Any extra days the child
        // picked become exposures of their own.
        const first = dayFixed ? stamp(new Date(finishing.scheduled_date as string)) : chosen[0]
        await teenApiClient.put(`/patient/experiments/${finishing.id}/before`, answers(first))
        await teenApiClient.post(`/patient/experiments/${finishing.id}/commit`)
        saved.push(first)
        for (const iso of dayFixed ? [] : chosen.slice(1)) {
          await createAndCommit(iso)
          saved.push(iso)
        }
      } else {
        for (const iso of chosen) {
          await createAndCommit(iso)
          saved.push(iso)
        }
      }
      queryClient.invalidateQueries({ queryKey: ['teen-ladder'] })
      queryClient.invalidateQueries({ queryKey: ['teen-pending'] })
      setLockedDays(saved)
      setPhase('locked')
    } catch {
      setSaveFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const goNext = () => (isLast ? lockIn() : setPos(pos + 1))
  const goBack = () => {
    if (phase === 'ask' && pos > 0) return setPos(pos - 1)
    if (phase === 'ask' && hasSummary) return setPhase('summary')
    navigate('/teen/home')
  }

  const dayLabel = (iso: string) => {
    const d = new Date(iso)
    const today = new Date()
    const day =
      d.toDateString() === today.toDateString()
        ? 'Today'
        : `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${d.getDate()}`
    const b = bucketLabel(bucket)
    return b ? `${day} · ${b}` : day
  }

  // Plain functions that return elements — never components declared in this body, which would
  // be rebuilt on every render (docs/solutions/inline-component-remounts.md).
  const topBar = (backLabel: string, count: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `16px ${teen.space.pad} 6px`, flex: 'none' }}>
      <button
        onClick={goBack}
        aria-label={backLabel}
        style={{ background: 'none', border: 0, cursor: 'pointer', font: `600 28px ${teen.font.sans}`, color: teen.color.ink, lineHeight: 1, padding: 0, width: 22 }}
      >
        ‹
      </button>
      <div style={{ flex: 1, display: 'flex', gap: 5 }} aria-hidden="true">
        {STEPS.map((_, i) => (
          <span key={i} style={{ flex: 1, height: 7, borderRadius: 4, background: i < filled ? teen.color.teal : teen.color.track }} />
        ))}
      </div>
      <span style={{ fontFamily: teen.font.sans, fontSize: 13, fontWeight: 700, color: teen.color.textSecondary, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
        {count}
      </span>
    </div>
  )

  const page = (children: ReactNode) => (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, padding: `8px ${teen.space.pad} 24px` }}>
      {children}
    </div>
  )

  const eyebrow = <span style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>{stepName}</span>
  const tile = (selected: boolean): React.CSSProperties => ({
    border: `2px solid ${selected ? teen.color.teal : teen.color.lineChip}`,
    background: selected ? teen.color.mintSoft : teen.color.cardPure,
    borderRadius: 16,
    cursor: 'pointer',
    fontFamily: teen.font.sans,
    color: teen.color.ink,
  })

  if (!seeded) return <TeenScreen>{topBar('Back to your ladder', '')}</TeenScreen>

  // ──────────────────────────── SUMMARY ────────────────────────────
  if (phase === 'summary') {
    const valueOf = (k: SetupKey): string => {
      if (!finishing) return ''
      if (k === 'fear') return `“${finishing.prediction}”`
      if (k === 'believe') return `${Math.round(finishing.bip_before ?? 0)}%`
      if (k === 'level') return `${Math.round(finishing.distress_thermometer_expected ?? 0)}`
      if (k === 'ready') return confidenceLabel(finishing.confidence_level) ?? ''
      return finishing.scheduled_date ? dayLabel(finishing.scheduled_date) : ''
    }
    const notYet = (k: SetupKey) =>
      k === 'when' && dayFixed && finishing?.scheduled_date
        ? `${dayLabel(finishing.scheduled_date).split(' · ')[0]} — pick the time of day`
        : k === 'when'
          ? 'Not picked yet'
          : 'Not answered yet'

    return (
      <TeenScreen>
        {topBar('Back to your ladder', `${filled} of ${STEPS.length}`)}
        {page(
          <>
            {eyebrow}
            <h1 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: 0 }}>
              You and your clinician set this up
            </h1>
            <p style={{ ...teen.type.body, margin: '-8px 0 0', color: teen.color.textSecondary }}>
              {missing.length === 0 ? 'Everything is in.' : missing.length === 1 ? 'One thing left.' : `${missing.length} things left.`}
            </p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SETUP_ORDER.map((k, i) => (
                <li
                  key={k}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, padding: '12px 14px', borderRadius: 16,
                    background: done[k] ? teen.color.card : teen.color.mintSoft,
                    border: done[k] ? `1.5px solid ${teen.color.lineCard}` : `1.5px dashed ${teen.color.teal}`,
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: 26, height: 26, flex: 'none', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: teen.font.sans, fontSize: 13, fontWeight: 700,
                      background: done[k] ? teen.color.mintDeep : teen.color.cardPure,
                      border: done[k] ? 0 : `2px solid ${teen.color.teal}`,
                      color: done[k] ? teen.color.ink : teen.color.teal,
                    }}
                  >
                    {done[k] ? '✓' : i + 1}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontFamily: teen.font.sans, fontSize: 13, color: teen.color.textSecondary }}>{ANSWERED_AS[k]}</span>
                    <span style={{ fontFamily: teen.font.sans, fontSize: 15, fontWeight: 700, color: teen.color.ink }}>
                      {done[k] ? valueOf(k) : notYet(k)}
                    </span>
                  </span>
                  {done[k] && (
                    <button
                      onClick={() => startWith(k)}
                      style={{ background: 'none', border: 0, cursor: 'pointer', fontFamily: teen.font.sans, fontSize: 13, fontWeight: 700, color: teen.color.teal, padding: '4px 0', alignSelf: 'center' }}
                    >
                      Change
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 'auto' }}>
              <button className="teen-btn teen-btn--primary" disabled={!seeded || saving} onClick={() => startWith()}>
                {missing.length === 0 ? 'Lock it in' : missing.length === 1 && missing[0] === 'when' ? 'Pick when' : 'Keep going'}
              </button>
            </div>
          </>,
        )}
      </TeenScreen>
    )
  }

  // ──────────────────────────── LOCKED IN ────────────────────────────
  if (phase === 'locked') {
    return (
      <TeenScreen bubbles>
        {topBar('Back to your ladder', 'Done')}
        {page(
          <>
            <div style={{ background: teen.color.ink, color: teen.color.white, borderRadius: 24, padding: '24px 22px', display: 'flex', flexDirection: 'column', gap: 12, boxShadow: teen.shadow.cardDark, marginTop: 12 }}>
              <span style={{ ...teen.type.eyebrow, color: teen.color.mint }}>It's on your ladder</span>
              <h1 style={{ ...teen.type.headline, fontSize: teen.headSize.md, color: teen.color.white, margin: 0 }}>{stepName}</h1>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {lockedDays.map(iso => (
                  <span key={iso} style={{ background: teen.color.mint, color: teen.color.ink, fontFamily: teen.font.sans, fontWeight: 700, fontSize: 13, borderRadius: teen.radius.pill, padding: '5px 12px' }}>
                    {dayLabel(iso)}
                  </span>
                ))}
              </div>
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', fontFamily: teen.font.sans, fontSize: 14 }}>
                <dt style={{ color: teen.color.onDark, fontWeight: 700 }}>You think</dt>
                <dd style={{ margin: 0 }}>“{fear.trim()}”</dd>
                <dt style={{ color: teen.color.onDark, fontWeight: 700 }}>How sure</dt>
                <dd style={{ margin: 0 }}>{bip}%</dd>
                <dt style={{ color: teen.color.onDark, fontWeight: 700 }}>Fear Level</dt>
                <dd style={{ margin: 0 }}>{level ?? '—'}</dd>
              </dl>
            </div>
            <p style={{ ...teen.type.body, color: teen.color.textSecondary, margin: 0 }}>
              Afterwards you'll check what really happened.
            </p>
            <div style={{ marginTop: 'auto' }}>
              <button className="teen-btn teen-btn--primary" onClick={() => navigate('/teen/home')}>
                Back to my ladder
              </button>
            </div>
          </>,
        )}
      </TeenScreen>
    )
  }

  // ──────────────────────── PLAN (fear + belief + level) ────────────────────────
  // One screen, spread down the page like the recording screen.
  const backLabel = pos === 0 && !hasSummary ? 'Back to your ladder' : 'Back'
  const curIdx = STEPS.indexOf(currentStep)
  const count = `${doneStepIdx.has(curIdx) ? filled : filled + 1} of ${STEPS.length}`

  if (currentStep.includes('fear')) {
    const planReady = currentStep.every(k => canNext[k])
    return (
      <TeenScreen>
        {topBar(backLabel, count)}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', padding: `16px ${teen.space.pad} 0` }}>
          {/* Content flows from the top with one even gap between blocks; slack pools above the
              button. See the screen-layout rule in CLAUDE.md. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 80 }}>
            {/* What are you afraid will happen? — the feared outcome, and a box to change it. */}
            <div>
              <h1 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: 0 }}>
                What are you afraid will happen?
              </h1>
              {clinicianFear && (
                <>
                  <div style={{ ...teen.type.eyebrow, color: teen.color.tealMid, marginTop: 14 }}>Your fear</div>
                  <div style={{ fontFamily: teen.font.sans, fontSize: 16, color: teen.color.ink, lineHeight: 1.35, marginTop: 6 }}>
                    “{clinicianFear}”
                  </div>
                </>
              )}
              <input
                value={clinicianFear ? (fear !== clinicianFear ? fear : '') : fear}
                onChange={e => { const v = e.target.value; setFear(!v && clinicianFear ? clinicianFear : v) }}
                placeholder={clinicianFear ? 'Something else…' : 'e.g. Everyone will stare'}
                aria-label="Say it your own way"
                style={{ marginTop: 11, width: '100%', boxSizing: 'border-box', background: teen.color.cardPure, border: `1px solid ${teen.color.lineChip}`, borderRadius: teen.radius.card, padding: '11px 13px', fontFamily: teen.font.sans, fontSize: 14, color: teen.color.ink, outline: 'none' }}
              />
            </div>

            {/* How strong is your belief? */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 11 }}>
                <span style={teen.type.label}>How strong is your belief?</span>
                <span style={{ ...teen.type.data, fontSize: teen.dataSize.sm }}>{bip}%</span>
              </div>
              <BeliefSlider value={bip} onChange={setBip} label="How strongly you believe it will happen" />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: teen.font.sans, fontSize: 12, fontWeight: 600, color: teen.color.textTertiary }}>
                <span>Not at all</span>
                <span>Completely</span>
              </div>
            </div>

            {/* What fear level do you expect? */}
            <div>
              <div style={{ ...teen.type.label, marginBottom: 10 }}>What fear level do you expect?</div>
              <Thermometer value={level} onChange={setLevel} height={46} label="Expected Fear Level" />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8, fontFamily: teen.font.sans, fontSize: 12, color: teen.color.textTertiary }}>
                <span>a little</span>
                <span>a lot</span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 28, paddingBottom: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {saveFailed && (
              <p role="alert" style={{ ...teen.type.body, fontSize: 14, color: '#b91c1c', margin: 0 }}>
                That didn't save. Please try again.
              </p>
            )}
            <button className="teen-btn teen-btn--primary" disabled={!planReady || saving || !seeded} onClick={goNext}>
              {isLast ? (saving ? 'Locking in…' : 'Lock it in') : 'Next'}
            </button>
          </div>
        </div>
      </TeenScreen>
    )
  }

  // ──────────────────────────── WHEN / READY ────────────────────────────
  const current = currentStep[0]
  const cta = isLast ? (saving ? 'Locking in…' : 'Lock it in') : 'Next'

  return (
    <TeenScreen>
      {topBar(backLabel, count)}
      {page(
        <>
          {eyebrow}
          <h1 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: 0 }}>{QUESTION[current]}</h1>

          {current === 'when' && (
            <>
              {dayFixed && finishing?.scheduled_date ? (
                <div style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: teen.radius.btn, background: teen.color.ink, color: teen.color.white, fontFamily: teen.font.sans, fontSize: 15, fontWeight: 700 }}>
                  {new Date(finishing.scheduled_date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
                </div>
              ) : (
                <>
                  <span style={{ ...teen.type.eyebrow, fontSize: 12 }}>Pick a day — or a few</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
                    {next7.map((d, i) => {
                      const on = days.includes(i)
                      return (
                        <button
                          key={i}
                          aria-pressed={on}
                          onClick={() => setDays(prev => (prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i]))}
                          style={{
                            ...tile(on), padding: '9px 0 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                            background: on ? teen.color.ink : teen.color.cardPure, borderColor: on ? teen.color.ink : teen.color.lineChip, color: on ? teen.color.white : teen.color.ink,
                          }}
                        >
                          <span style={{ fontSize: 11, fontWeight: 700, color: on ? teen.color.mint : teen.color.textSecondary }}>
                            {i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}
                          </span>
                          <span style={{ fontSize: 16, fontWeight: 700 }}>{d.getDate()}</span>
                        </button>
                      )
                    })}
                  </div>
                </>
              )}
              <span style={{ ...teen.type.eyebrow, fontSize: 12 }}>What time of day?</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
                {TIME_BUCKETS.map(b => (
                  <button key={b.key} aria-pressed={bucket === b.key} onClick={() => setBucket(b.key)} style={{ ...tile(bucket === b.key), padding: '13px 4px', fontSize: 15, fontWeight: 700 }}>
                    {b.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {current === 'ready' && (
            <>
              <p style={{ ...teen.type.body, margin: '-8px 0 0', color: teen.color.textSecondary }}>
                Any answer is fine. It helps your clinician.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {CONFIDENCE.map((c, i) => (
                  <button
                    key={c.key}
                    aria-pressed={confidence === c.key}
                    onClick={() => setConfidence(c.key)}
                    style={{ ...tile(confidence === c.key), display: 'flex', alignItems: 'center', gap: 14, padding: '15px 16px', fontSize: 18, fontWeight: 700, textAlign: 'left' }}
                  >
                    <span aria-hidden="true" style={{ display: 'flex', alignItems: 'flex-end', gap: 3 }}>
                      {[10, 16, 22].map((h, j) => (
                        <span key={h} style={{ width: 7, height: h, borderRadius: 2, background: j <= i ? teen.color.teal : teen.color.track }} />
                      ))}
                    </span>
                    {c.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {saveFailed && (
              <p role="alert" style={{ ...teen.type.body, fontSize: 14, color: '#b91c1c', margin: 0 }}>
                That didn't save. Please try again.
              </p>
            )}
            <button className="teen-btn teen-btn--primary" disabled={!canNext[current] || saving || !seeded} onClick={goNext}>
              {cta}
            </button>
          </div>
        </>,
      )}
    </TeenScreen>
  )
}
