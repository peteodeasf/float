import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTeenAuth } from '../../context/TeenAuthContext'
import TeenScreen from '../../components/teen/TeenScreen'
import FearRange from '../../components/parent/FearRange'
import teen from '../../styles/teenTokens'
import { getAccommodationsToRate, rateAccommodation } from '../../api/teenAccommodations'

/**
 * The child rates what their parent does: if they stopped, how hard would it be? One per screen.
 *
 * Only what the clinician added to the plan and sent (Peter, 2026-09-10). The child never sees the
 * parent's estimate. The wording is Dr. Walker's to check: a list of what a parent does can read as
 * blame, so it is framed as the parent helping. docs/plans/accommodation-conversation.md
 */
export default function TeenRateAccommodationsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { patientId } = useTeenAuth()
  const { data: items = [], isLoading } = useQuery({
    queryKey: ['teen-to-rate', patientId],
    queryFn: getAccommodationsToRate,
    enabled: !!patientId,
  })

  // The ones still to rate, fixed when the screen opens so the list does not shift under them.
  const [queue, setQueue] = useState<string[] | null>(null)
  useEffect(() => {
    if (!isLoading && queue === null) setQueue(items.filter(i => !i.rated).map(i => i.id))
  }, [isLoading, items, queue])

  const [pos, setPos] = useState(-1) // -1 is the intro
  const [lo, setLo] = useState<number | null>(null)
  const [hi, setHi] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const current = queue && pos >= 0 ? items.find(i => i.id === queue[pos]) ?? null : null
  const done = queue !== null && pos >= queue.length

  const next = () => {
    setPos(p => p + 1)
    setLo(null)
    setHi(null)
    setFailed(false)
  }
  const save = async () => {
    if (!current || lo == null || hi == null) return
    setSaving(true)
    setFailed(false)
    try {
      await rateAccommodation(current.id, lo, hi)
      next()
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }
  const finish = () => {
    qc.invalidateQueries({ queryKey: ['teen-to-rate'] })
    navigate('/teen/progress')
  }

  const screen = (children: ReactNode) => (
    <TeenScreen>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `16px ${teen.space.pad} 6px`, flex: 'none' }}>
        <button onClick={() => navigate('/teen/progress')} aria-label="Back"
          style={{ background: 'none', border: 0, cursor: 'pointer', font: `600 28px ${teen.font.sans}`, color: teen.color.ink, lineHeight: 1, padding: 0, width: 22 }}>
          ‹
        </button>
        <span style={{ flex: 1 }} />
        {queue && pos >= 0 && !done && (
          <span style={{ fontFamily: teen.font.sans, fontSize: 13, fontWeight: 700, color: teen.color.textSecondary }}>
            {pos + 1} of {queue.length}
          </span>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, padding: `8px ${teen.space.pad} 24px` }}>
        {children}
      </div>
    </TeenScreen>
  )
  const heading = (text: string) => <h1 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: 0 }}>{text}</h1>
  const lead = (text: string) => <p style={{ ...teen.type.body, margin: '-8px 0 0', color: teen.color.textSecondary }}>{text}</p>

  if (isLoading || queue === null) return screen(<p style={teen.type.body}>Loading…</p>)

  if (queue.length === 0 || done) {
    return screen(
      <>
        {heading(queue.length === 0 ? 'Nothing to rate right now' : 'Thank you')}
        {lead(queue.length === 0
          ? "Your clinician hasn't sent you anything to rate."
          : 'Your clinician will see your answers.')}
        <div style={{ marginTop: 'auto' }}>
          <button className="teen-btn teen-btn--primary" onClick={finish}>Back</button>
        </div>
      </>,
    )
  }

  if (pos < 0) {
    return screen(
      <>
        <span style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>Your parent</span>
        {heading('Your parent sometimes helps when you feel anxious')}
        {lead("We'd like to know how hard it would be for you if they stopped. There are no wrong answers.")}
        <div style={{ marginTop: 'auto' }}>
          <button className="teen-btn teen-btn--primary" onClick={next}>Start</button>
        </div>
      </>,
    )
  }

  return screen(
    <>
      {current?.situation_name && <span style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>{current.situation_name}</span>}
      <div className="teen-card" style={{ padding: 18, fontFamily: teen.font.sans, fontSize: 18, fontWeight: 700, color: teen.color.ink }}>
        “{current?.name}”
      </div>
      {heading('If they stopped doing this, how hard would it be for you?')}
      {lead('Pick a Fear Level, or two if it depends.')}
      <FearRange lo={lo} hi={hi} onChange={(l, h) => { setLo(l); setHi(h) }} />
      {lo != null && hi != null && (
        <div style={{ ...teen.type.data, fontSize: 44, textAlign: 'center', color: teen.color.teal }}>
          {lo === hi ? lo : `${lo}–${hi}`}
        </div>
      )}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {failed && (
          <p role="alert" style={{ ...teen.type.body, fontSize: 14, color: '#b91c1c', margin: 0 }}>
            That didn't save. Please try again.
          </p>
        )}
        <button className="teen-btn teen-btn--primary" disabled={saving || lo == null} onClick={save}>Next</button>
        <button className="teen-btn teen-btn--outline" disabled={saving} onClick={next}>Not sure</button>
      </div>
    </>,
  )
}
