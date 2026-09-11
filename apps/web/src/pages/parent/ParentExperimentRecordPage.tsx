import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { parentApiClient } from '../../api/client'
import {
  experimentWhen, getFamilyExperiments, recordExperiment, type DidIt, type Happened,
} from '../../api/parentExperiments'
import TeenScreen from '../../components/teen/TeenScreen'
import BeliefSlider from '../../components/teen/BeliefSlider'
import Thermometer from '../../components/teen/Thermometer'
import teen from '../../styles/teenTokens'

/**
 * How a parent's experiment went. One question per screen, mirroring the child's record.
 *
 * "Not this time" in place of "I gave in" (Peter is still unsure about that answer on the check-in);
 * it skips the rest and asks, optionally, what made it too hard.
 * docs/plans/parent-accommodation-experiments.md
 */
type Step = 'didit' | 'happened' | 'level' | 'predicted' | 'believe' | 'learned' | 'why'
const DID_IT: { key: DidIt; label: string }[] = [
  { key: 'yes', label: 'Yes' },
  { key: 'partly', label: 'Partly' },
  { key: 'not_this_time', label: 'Not this time' },
]
const HAPPENED: { key: Happened; label: string }[] = [
  { key: 'yes', label: 'Yes' },
  { key: 'partly', label: 'Partly' },
  { key: 'no', label: 'No' },
]

export default function ParentExperimentRecordPage() {
  const { experimentId } = useParams<{ experimentId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: me } = useQuery({
    queryKey: ['parent-me'],
    queryFn: async () => (await parentApiClient.get('/auth/me')).data,
  })
  const child: string = me?.patient_name?.split(' ')[0] ?? 'your child'
  const { data: experiments, isLoading } = useQuery({ queryKey: ['parent-experiments'], queryFn: getFamilyExperiments })
  const e = experiments?.find(x => x.id === experimentId) ?? null

  const [didIt, setDidIt] = useState<DidIt | null>(null)
  const [pos, setPos] = useState(0)
  const [happened, setHappened] = useState('')
  const [level, setLevel] = useState<number | null>(null)
  const [predicted, setPredicted] = useState<Happened | null>(null)
  const [belief, setBelief] = useState<number | null>(null)
  const [learned, setLearned] = useState('')
  const [why, setWhy] = useState('')
  const [done, setDone] = useState(false)

  const steps: Step[] = didIt === null
    ? ['didit']
    : didIt === 'not_this_time'
      ? ['didit', 'why']
      : ['didit', 'happened', 'level', 'predicted', 'believe', 'learned']
  const step = steps[pos]
  const last = pos === steps.length - 1 && didIt !== null
  const fear = level ?? (e ? Math.round(e.expected_fear) : 5)
  const beliefNow = belief ?? (e ? Math.round(e.belief_before) : 50)

  const saveMut = useMutation({
    mutationFn: () => recordExperiment(e!.id, didIt === 'not_this_time'
      ? { did_it: 'not_this_time', too_hard_reason: why.trim() || null }
      : {
          did_it: didIt!,
          what_happened: happened.trim() || null,
          actual_fear: fear,
          prediction_happened: predicted,
          belief_after: beliefNow,
          what_learned: learned.trim() || null,
        }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parent-experiments'] })
      setDone(true)
    },
  })

  const tile = (on: boolean): React.CSSProperties => ({
    border: `2px solid ${on ? teen.color.teal : teen.color.lineChip}`,
    background: on ? teen.color.mintSoft : teen.color.cardPure,
    borderRadius: 16, cursor: 'pointer', fontFamily: teen.font.sans, color: teen.color.ink,
    padding: '15px 16px', fontSize: 17, fontWeight: 700, textAlign: 'left',
  })
  const field: React.CSSProperties = {
    border: `2px solid ${teen.color.lineChip}`, background: teen.color.cardPure, borderRadius: 16,
    padding: '12px 14px', fontFamily: teen.font.sans, fontSize: 16, color: teen.color.ink, resize: 'vertical',
  }
  const screen = (children: ReactNode) => (
    <TeenScreen>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `16px ${teen.space.pad} 6px`, flex: 'none' }}>
        <button onClick={() => (pos > 0 && !done ? setPos(pos - 1) : navigate('/parent/home'))} aria-label="Back"
          style={{ background: 'none', border: 0, cursor: 'pointer', font: `600 28px ${teen.font.sans}`, color: teen.color.ink, lineHeight: 1, padding: 0, width: 22 }}>
          ‹
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, padding: `8px ${teen.space.pad} 24px` }}>
        {children}
      </div>
    </TeenScreen>
  )
  const heading = (text: string) => <h1 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: 0 }}>{text}</h1>
  const lead = (text: string) => <p style={{ ...teen.type.body, margin: '-8px 0 0', color: teen.color.textSecondary }}>{text}</p>
  const back = (
    <div style={{ marginTop: 'auto' }}>
      <button className="teen-btn teen-btn--primary" onClick={() => navigate('/parent/home')}>Back home</button>
    </div>
  )

  if (isLoading) return screen(<p style={teen.type.body}>Loading…</p>)
  if (!e) return screen(<>{heading('Not found')}{lead("This experiment isn't on your plan.")}{back}</>)
  if (done) return screen(<>{heading('Thank you')}{lead('Your clinician will see how it went.')}{back}</>)
  if (e.status !== 'planned') return screen(<>{heading('Already recorded')}{lead('How this one went is already saved.')}{back}</>)

  return screen(
    <>
      <span style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>{e.accommodation_name} · {experimentWhen(e)}</span>

      {step === 'didit' && (
        <>
          {heading('Did you do it?')}
          {e.instead && lead(`You planned: ${e.instead}`)}
          {/* Equal weight, like the child's answers: no answer is the right one to tap. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {DID_IT.map(d => (
              <button key={d.key} aria-pressed={didIt === d.key} style={tile(didIt === d.key)}
                onClick={() => { setDidIt(d.key); setPos(1) }}>
                {d.label}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'why' && (
        <>
          {heading('What made it too hard?')}
          {lead('Only if you want to say.')}
          <textarea value={why} onChange={ev => setWhy(ev.target.value)} rows={3} aria-label="What made it too hard" style={field} />
        </>
      )}

      {step === 'happened' && (
        <>
          {heading('What happened?')}
          <textarea value={happened} onChange={ev => setHappened(ev.target.value)} rows={3} aria-label="What happened" style={field} />
        </>
      )}

      {step === 'level' && (
        <>
          {heading(`How upset was ${child}, really?`)}
          {lead(`You expected a ${Math.round(e.expected_fear)}.`)}
          <div style={{ ...teen.type.data, fontSize: 56, textAlign: 'center', color: teen.color.teal }}>{fear}</div>
          <Thermometer value={fear} onChange={setLevel} height={110} label={`How upset ${child} was`} />
        </>
      )}

      {step === 'predicted' && (
        <>
          {heading('Did what you were afraid of happen?')}
          {lead(`“${e.prediction}”`)}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {HAPPENED.map(h => (
              <button key={h.key} aria-pressed={predicted === h.key} style={tile(predicted === h.key)} onClick={() => setPredicted(h.key)}>
                {h.label}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'believe' && (
        <>
          {heading('How strongly do you believe it now?')}
          {lead(`Before, you said ${Math.round(e.belief_before)}%.`)}
          <div style={{ ...teen.type.data, fontSize: 56, textAlign: 'center', color: teen.color.teal }}>{beliefNow}%</div>
          <BeliefSlider value={beliefNow} onChange={setBelief} label="How strongly you believe it now" />
        </>
      )}

      {step === 'learned' && (
        <>
          {heading('What did you learn?')}
          {lead('Only if you want to say.')}
          <textarea value={learned} onChange={ev => setLearned(ev.target.value)} rows={3} aria-label="What you learned" style={field} />
        </>
      )}

      {step !== 'didit' && (
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {saveMut.isError && (
            <p role="alert" style={{ ...teen.type.body, fontSize: 14, color: '#b91c1c', margin: 0 }}>That didn't save. Please try again.</p>
          )}
          <button className="teen-btn teen-btn--primary" disabled={saveMut.isPending || (step === 'predicted' && !predicted)}
            onClick={() => (last ? saveMut.mutate() : setPos(pos + 1))}>
            {last ? (saveMut.isPending ? 'Saving…' : 'Save') : 'Next'}
          </button>
        </div>
      )}
    </>,
  )
}
