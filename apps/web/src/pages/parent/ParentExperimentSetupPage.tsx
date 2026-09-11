import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { parentApiClient } from '../../api/client'
import { getParentAccommodations, getSituationTips } from '../../api/parent'
import { experimentWhen, setUpExperiment, type Bucket, type ParentExperiment, type Readiness } from '../../api/parentExperiments'
import TeenScreen from '../../components/teen/TeenScreen'
import BeliefSlider from '../../components/teen/BeliefSlider'
import Thermometer from '../../components/teen/Thermometer'
import teen from '../../styles/teenTokens'
import { CONFIDENCE, TIME_BUCKETS } from '../../lib/setupQuestions'

/**
 * A parent plans one attempt at not doing an accommodation. One question per screen, like the
 * child's exposure setup; the same questions the clinician asks in a parent session.
 *
 * Any accommodation on the plan, not only the weekly focus (Peter, 2026-09-11: "they choose to work
 * on more than one and we shouldn't limit that"). The wording is on Dr. Walker's list.
 * docs/plans/parent-accommodation-experiments.md
 */
type Step = 'which' | 'when' | 'instead' | 'afraid' | 'believe' | 'level' | 'ready'
const STEPS: Step[] = ['which', 'when', 'instead', 'afraid', 'believe', 'level', 'ready']

export default function ParentExperimentSetupPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()

  const { data: me } = useQuery({
    queryKey: ['parent-me'],
    queryFn: async () => (await parentApiClient.get('/auth/me')).data,
  })
  const child: string = me?.patient_name?.split(' ')[0] ?? 'your child'
  const { data: accommodations = [], isLoading } = useQuery({
    queryKey: ['parent-accommodations'],
    queryFn: getParentAccommodations,
  })
  // The weekly focus first: the one they are most likely to try.
  const ordered = useMemo(
    () => [...accommodations].sort((a, b) => Number(b.is_weekly_focus) - Number(a.is_weekly_focus)),
    [accommodations],
  )

  const [pos, setPos] = useState(0)
  const [pickedId, setPickedId] = useState<string | null>(params.get('accommodation'))
  const picked = ordered.find(a => a.id === (pickedId ?? ordered[0]?.id)) ?? null
  const [dayIdx, setDayIdx] = useState<number | null>(null)
  const [bucket, setBucket] = useState<Bucket | null>(null)
  const [instead, setInstead] = useState('')
  const [afraid, setAfraid] = useState('')
  const [belief, setBelief] = useState(50)
  const [level, setLevel] = useState<number | null>(null)
  const [ready, setReady] = useState<Readiness | null>(null)
  const [saved, setSaved] = useState<ParentExperiment | null>(null)

  // Starts from the estimate they gave in the accommodation conversation.
  const estimate =
    picked?.parent_estimate_min != null
      ? Math.round((picked.parent_estimate_min + (picked.parent_estimate_max ?? picked.parent_estimate_min)) / 2)
      : 5
  const fear = level ?? estimate

  const { data: tips = [] } = useQuery({
    queryKey: ['parent-tips', picked?.trigger_situation_id],
    queryFn: () => getSituationTips(picked!.trigger_situation_id!),
    enabled: !!picked?.trigger_situation_id,
  })

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() + i)
      d.setHours(0, 0, 0, 0)
      return d
    }),
    [],
  )

  const saveMut = useMutation({
    mutationFn: () => {
      const at = new Date(days[dayIdx!])
      at.setHours(TIME_BUCKETS.find(b => b.key === bucket)?.hour ?? 12, 0, 0, 0)
      return setUpExperiment({
        accommodation_id: picked!.id,
        scheduled_date: at.toISOString(),
        scheduled_time_bucket: bucket!,
        instead: instead.trim() || null,
        prediction: afraid.trim(),
        belief_before: belief,
        expected_fear: fear,
        readiness: ready,
      })
    },
    onSuccess: e => {
      qc.invalidateQueries({ queryKey: ['parent-experiments'] })
      setSaved(e)
    },
  })

  const step = STEPS[pos]
  const last = pos === STEPS.length - 1
  const canNext: Record<Step, boolean> = {
    which: !!picked,
    when: dayIdx != null && !!bucket,
    instead: true,
    afraid: afraid.trim().length > 0,
    believe: true,
    level: true,
    ready: true,
  }

  const tile = (on: boolean): React.CSSProperties => ({
    border: `2px solid ${on ? teen.color.teal : teen.color.lineChip}`,
    background: on ? teen.color.mintSoft : teen.color.cardPure,
    borderRadius: 16, cursor: 'pointer', fontFamily: teen.font.sans, color: teen.color.ink, textAlign: 'left',
  })
  const screen = (children: ReactNode) => (
    <TeenScreen>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `16px ${teen.space.pad} 6px`, flex: 'none' }}>
        <button
          onClick={() => (pos > 0 && !saved ? setPos(pos - 1) : navigate('/parent/home'))}
          aria-label="Back"
          style={{ background: 'none', border: 0, cursor: 'pointer', font: `600 28px ${teen.font.sans}`, color: teen.color.ink, lineHeight: 1, padding: 0, width: 22 }}
        >
          ‹
        </button>
        <div style={{ flex: 1, display: 'flex', gap: 4 }} aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s} style={{ flex: 1, height: 6, borderRadius: 3, background: saved || i < pos ? teen.color.teal : teen.color.track }} />
          ))}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, padding: `8px ${teen.space.pad} 24px` }}>
        {children}
      </div>
    </TeenScreen>
  )
  const heading = (text: string) => <h1 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: 0 }}>{text}</h1>
  const lead = (text: string) => <p style={{ ...teen.type.body, margin: '-8px 0 0', color: teen.color.textSecondary }}>{text}</p>
  const eyebrow = picked ? <span style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>{picked.name}</span> : null

  if (isLoading) return screen(<p style={teen.type.body}>Loading…</p>)

  if (ordered.length === 0) {
    return screen(
      <>
        {heading('Nothing to try yet')}
        {lead("Your clinician hasn't added accommodations to your plan yet.")}
        <div style={{ marginTop: 'auto' }}>
          <button className="teen-btn teen-btn--primary" onClick={() => navigate('/parent/home')}>Back home</button>
        </div>
      </>,
    )
  }

  if (saved) {
    return screen(
      <>
        <span style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>Your experiment</span>
        {heading("It's planned")}
        <div className="teen-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontFamily: teen.font.sans, fontSize: 17, fontWeight: 700, color: teen.color.ink }}>{saved.accommodation_name}</span>
          <span style={{ fontFamily: teen.font.sans, fontSize: 14, fontWeight: 600, color: teen.color.tealMid }}>{experimentWhen(saved)}</span>
          {saved.instead && (
            <span style={{ ...teen.type.body, fontSize: 14, color: teen.color.inkSoft }}>Instead: {saved.instead}</span>
          )}
        </div>
        {lead('Afterwards, come back and say how it went.')}
        <div style={{ marginTop: 'auto' }}>
          <button className="teen-btn teen-btn--primary" onClick={() => navigate('/parent/home')}>Back home</button>
        </div>
      </>,
    )
  }

  return screen(
    <>
      {step !== 'which' && eyebrow}

      {step === 'which' && (
        <>
          {heading('Which one will you try?')}
          {lead('Pick one. You can work on more than one.')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ordered.map(a => (
              <button key={a.id} aria-pressed={picked?.id === a.id} onClick={() => setPickedId(a.id)} style={{ ...tile(picked?.id === a.id), padding: '14px 16px' }}>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 700 }}>{a.name}</span>
                {a.is_weekly_focus && (
                  <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: teen.color.tealMid, marginTop: 3 }}>This week's focus</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'when' && (
        <>
          {heading('When will you try it?')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
            {days.map((d, i) => {
              const on = dayIdx === i
              return (
                <button key={i} aria-pressed={on} onClick={() => setDayIdx(i)}
                  style={{ ...tile(on), padding: '9px 0 8px', textAlign: 'center', background: on ? teen.color.ink : teen.color.cardPure, borderColor: on ? teen.color.ink : teen.color.lineChip, color: on ? '#fff' : teen.color.ink }}>
                  <span style={{ display: 'block', fontSize: 11, fontWeight: 700, color: on ? teen.color.mint : teen.color.textSecondary }}>
                    {i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span style={{ display: 'block', fontSize: 16, fontWeight: 700 }}>{d.getDate()}</span>
                </button>
              )
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 7 }}>
            {TIME_BUCKETS.map(b => (
              <button key={b.key} aria-pressed={bucket === b.key} onClick={() => setBucket(b.key)} style={{ ...tile(bucket === b.key), padding: '13px 4px', textAlign: 'center', fontSize: 15, fontWeight: 700 }}>
                {b.label}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'instead' && (
        <>
          {heading('What will you do instead?')}
          {lead('Something to say or do in its place.')}
          <textarea value={instead} onChange={e => setInstead(e.target.value)} rows={3} aria-label="What you'll do instead"
            placeholder="e.g. Say goodnight, remind her I'm downstairs, and leave"
            style={{ border: `2px solid ${teen.color.lineChip}`, background: teen.color.cardPure, borderRadius: 16, padding: '12px 14px', fontFamily: teen.font.sans, fontSize: 16, color: teen.color.ink, resize: 'vertical' }} />
          {tips.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ ...teen.type.eyebrow, fontSize: 12 }}>Ideas</span>
              {tips.map(t => (
                <div key={t.id} className="teen-card" style={{ padding: '12px 14px' }}>
                  <div style={{ fontFamily: teen.font.sans, fontSize: 14, fontWeight: 600, color: teen.color.ink }}>{t.title}</div>
                  <div style={{ ...teen.type.body, fontSize: 13, color: teen.color.inkSoft, marginTop: 3 }}>{t.body}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {step === 'afraid' && (
        <>
          {heading('What are you afraid will happen?')}
          <input value={afraid} onChange={e => setAfraid(e.target.value)} aria-label="What you're afraid will happen"
            placeholder="e.g. She'll cry for an hour"
            style={{ border: `2px solid ${teen.color.lineChip}`, background: teen.color.cardPure, borderRadius: 16, padding: '14px 16px', fontFamily: teen.font.sans, fontSize: 16, color: teen.color.ink }} />
        </>
      )}

      {step === 'believe' && (
        <>
          {heading('How strongly do you believe that will happen?')}
          <div style={{ ...teen.type.data, fontSize: 56, textAlign: 'center', color: teen.color.teal }}>{belief}%</div>
          <BeliefSlider value={belief} onChange={setBelief} label="How strongly you believe it will happen" />
        </>
      )}

      {step === 'level' && (
        <>
          {heading(`How upset do you expect ${child} to be?`)}
          {lead('As a Fear Level.')}
          <div style={{ ...teen.type.data, fontSize: 56, textAlign: 'center', color: teen.color.teal }}>{fear}</div>
          <Thermometer value={fear} onChange={setLevel} height={110} label={`How upset you expect ${child} to be`} />
        </>
      )}

      {step === 'ready' && (
        <>
          {heading('How ready do you feel?')}
          {lead('Any answer is fine. It helps your clinician.')}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {CONFIDENCE.map(c => (
              <button key={c.key} aria-pressed={ready === c.key} onClick={() => setReady(c.key)} style={{ ...tile(ready === c.key), padding: '15px 16px', fontSize: 17, fontWeight: 700 }}>
                {c.label}
              </button>
            ))}
          </div>
        </>
      )}

      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {saveMut.isError && (
          <p role="alert" style={{ ...teen.type.body, fontSize: 14, color: '#b91c1c', margin: 0 }}>That didn't save. Please try again.</p>
        )}
        <button className="teen-btn teen-btn--primary" disabled={!canNext[step] || saveMut.isPending}
          onClick={() => (last ? saveMut.mutate() : setPos(pos + 1))}>
          {last ? (saveMut.isPending ? 'Saving…' : 'Plan it') : 'Next'}
        </button>
      </div>
    </>,
  )
}
