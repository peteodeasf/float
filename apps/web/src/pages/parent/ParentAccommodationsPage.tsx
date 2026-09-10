import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import TeenScreen from '../../components/teen/TeenScreen'
import FearRange from '../../components/parent/FearRange'
import teen from '../../styles/teenTokens'
import {
  answerSuggestion,
  getAccommodationConversation,
  nameAccommodation,
  type ConversationItem,
  type ConversationSituation,
} from '../../api/parent'

/**
 * The parent's half of the accommodation conversation, at home. One question per screen.
 *
 * For each of the child's situations: what the parent already wrote in the monitoring log ("Do you
 * still do this?"), then anything else, and for each one their guess at how hard it would be for the
 * child if they stopped. Everything lands as a suggestion for the clinician — nothing goes onto the
 * plan from here (Peter, 2026-09-10). Plan: docs/plans/accommodation-conversation.md
 */

type Card =
  | { kind: 'intro' }
  | { kind: 'still'; sit: ConversationSituation; item: ConversationItem }
  | { kind: 'estimate'; sit: ConversationSituation; item: ConversationItem }
  | { kind: 'else'; sit: ConversationSituation }
  | { kind: 'done' }

function buildQueue(situations: ConversationSituation[]): Card[] {
  const cards: Card[] = [{ kind: 'intro' }]
  for (const sit of situations) {
    for (const item of sit.items) cards.push({ kind: 'still', sit, item })
    cards.push({ kind: 'else', sit })
  }
  cards.push({ kind: 'done' })
  return cards
}

export default function ParentAccommodationsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['parent-conversation'],
    queryFn: getAccommodationConversation,
  })
  const child = data?.child_name || 'your child'
  const situations = data?.situations ?? []

  const [queue, setQueue] = useState<Card[] | null>(null)
  const [pos, setPos] = useState(0)
  useEffect(() => {
    if (data && queue === null) setQueue(buildQueue(data.situations))
  }, [data, queue])

  const [lo, setLo] = useState<number | null>(null)
  const [hi, setHi] = useState<number | null>(null)
  const [draft, setDraft] = useState('')
  const [added, setAdded] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  const card = queue?.[pos]

  // Start each estimate from what the parent said before, if anything.
  useEffect(() => {
    if (card?.kind === 'estimate') {
      setLo(card.item.estimate_min)
      setHi(card.item.estimate_max)
    }
  }, [card])

  const advance = (insert: Card[] = []) => {
    setQueue(q => (q ? [...q.slice(0, pos + 1), ...insert, ...q.slice(pos + 1)] : q))
    setPos(p => p + 1)
    setDraft('')
    setFailed(false)
  }
  const save = async (work: () => Promise<Card[] | void>) => {
    setSaving(true)
    setFailed(false)
    try {
      advance((await work()) || [])
    } catch {
      setFailed(true)
    } finally {
      setSaving(false)
    }
  }

  const finish = () => {
    qc.invalidateQueries({ queryKey: ['parent-conversation'] })
    navigate('/parent/home')
  }

  const sitIndex = card && 'sit' in card ? situations.findIndex(s => s.id === card.sit.id) : -1

  // A plain function that returns elements, not a component declared in this body — that would
  // remount everything below it on each keystroke (docs/solutions/inline-component-remounts.md).
  const screen = (children: ReactNode) => (
    <TeenScreen>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: `16px ${teen.space.pad} 6px`, flex: 'none' }}>
        <button
          onClick={() => (pos > 0 && card?.kind !== 'done' ? setPos(pos - 1) : navigate('/parent/home'))}
          aria-label="Back"
          style={{ background: 'none', border: 0, cursor: 'pointer', font: `600 28px ${teen.font.sans}`, color: teen.color.ink, lineHeight: 1, padding: 0, width: 22 }}
        >
          ‹
        </button>
        <span style={{ flex: 1 }} />
        {sitIndex >= 0 && (
          <span style={{ fontFamily: teen.font.sans, fontSize: 13, fontWeight: 700, color: teen.color.textSecondary }}>
            Situation {sitIndex + 1} of {situations.length}
          </span>
        )}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16, padding: `8px ${teen.space.pad} 24px` }}>
        {children}
      </div>
    </TeenScreen>
  )
  const eyebrow = (text: string) => <span style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>{text}</span>
  const heading = (text: string) => <h1 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: 0 }}>{text}</h1>
  const lead = (text: string) => <p style={{ ...teen.type.body, margin: '-8px 0 0', color: teen.color.textSecondary }}>{text}</p>
  const footer = (children: ReactNode) => (
    <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {failed && (
        <p role="alert" style={{ ...teen.type.body, fontSize: 14, color: '#b91c1c', margin: 0 }}>
          That didn't save. Please try again.
        </p>
      )}
      {children}
    </div>
  )

  if (isLoading || !queue || !card) return screen(<p style={{ ...teen.type.body }}>Loading…</p>)

  if (situations.length === 0) {
    return screen(
      <>
        {heading('Nothing to go through yet')}
        {lead(`Your clinician hasn't added ${child}'s situations yet. You'll be able to do this once they have.`)}
        {footer(<button className="teen-btn teen-btn--primary" onClick={() => navigate('/parent/home')}>Back home</button>)}
      </>,
    )
  }

  if (card.kind === 'intro') {
    return screen(
      <>
        {eyebrow('What you do')}
        {heading(`When ${child} is anxious, what do you do?`)}
        {lead(`Most parents step in to help — it's what caring looks like. We'll go through ${child}'s situations one at a time. There are no wrong answers, and your clinician will go through them with you.`)}
        {footer(<button className="teen-btn teen-btn--primary" onClick={() => advance()}>Start</button>)}
      </>,
    )
  }

  if (card.kind === 'still') {
    const { item } = card
    return screen(
      <>
        {eyebrow(card.sit.name)}
        {heading(item.from_record ? 'You wrote this down before:' : 'You told us this before:')}
        <div className="teen-card" style={{ padding: 18, fontFamily: teen.font.sans, fontSize: 18, fontWeight: 700, color: teen.color.ink }}>
          “{item.name}”
        </div>
        <p style={{ ...teen.type.body, margin: 0, fontWeight: 600 }}>Do you still do this?</p>
        {footer(
          <>
            <button className="teen-btn teen-btn--outline" disabled={saving}
              onClick={() => save(async () => {
                const saved = await answerSuggestion(item.id, { still_does: true })
                return [{ kind: 'estimate', sit: card.sit, item: { ...item, ...saved } }]
              })}>
              Yes, I still do
            </button>
            <button className="teen-btn teen-btn--outline" disabled={saving}
              onClick={() => save(async () => { await answerSuggestion(item.id, { still_does: false }) })}>
              Not any more
            </button>
          </>,
        )}
      </>,
    )
  }

  if (card.kind === 'estimate') {
    const { item } = card
    return screen(
      <>
        {eyebrow(card.sit.name)}
        {heading(`If you stopped, how hard would it be for ${child}?`)}
        {lead(`“${item.name}”. Pick a Fear Level, or two for a range.`)}
        <FearRange lo={lo} hi={hi} onChange={(l, h) => { setLo(l); setHi(h) }} />
        {lo != null && hi != null && (
          <div style={{ ...teen.type.data, fontSize: 44, textAlign: 'center', color: teen.color.teal }}>
            {lo === hi ? lo : `${lo}–${hi}`}
          </div>
        )}
        {footer(
          <>
            <button className="teen-btn teen-btn--primary" disabled={saving || lo == null}
              onClick={() => save(async () => { await answerSuggestion(item.id, { estimate_min: lo, estimate_max: hi }) })}>
              Next
            </button>
            <button className="teen-btn teen-btn--outline" disabled={saving} onClick={() => advance()}>
              Not sure
            </button>
          </>,
        )}
      </>,
    )
  }

  if (card.kind === 'else') {
    const already = added[card.sit.id] ?? []
    const last = sitIndex === situations.length - 1
    const addIt = () => save(async () => {
      const name = draft.trim()
      const saved = await nameAccommodation({ trigger_situation_id: card.sit.id, name })
      setAdded(a => ({ ...a, [card.sit.id]: [...(a[card.sit.id] ?? []), name] }))
      // Their estimate for it, then back to "anything else?" for this situation.
      return [{ kind: 'estimate', sit: card.sit, item: saved }, { kind: 'else', sit: card.sit }]
    })
    return screen(
      <>
        {eyebrow(card.sit.name)}
        {heading(already.length || card.sit.items.length
          ? `Anything else you do when this comes up?`
          : `What do you do when this comes up?`)}
        {lead('Things like staying with them, answering for them, or changing plans so they can avoid it.')}
        {already.length > 0 && (
          <ul style={{ margin: 0, paddingLeft: 18, fontFamily: teen.font.sans, fontSize: 14, color: teen.color.inkSoft }}>
            {already.map(n => <li key={n}>{n}</li>)}
          </ul>
        )}
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) addIt() }}
          placeholder="e.g. I sit outside the door"
          aria-label="What you do"
          style={{ border: `2px solid ${teen.color.lineChip}`, background: teen.color.cardPure, borderRadius: 16, padding: '14px 16px', fontFamily: teen.font.sans, fontSize: 16, color: teen.color.ink, outline: 'none' }}
        />
        {footer(
          <>
            <button className="teen-btn teen-btn--primary" disabled={saving || !draft.trim()} onClick={addIt}>
              Add it
            </button>
            <button className="teen-btn teen-btn--outline" disabled={saving} onClick={() => advance()}>
              {last ? "That's everything" : 'Next situation'}
            </button>
          </>,
        )}
      </>,
    )
  }

  return screen(
    <>
      {eyebrow('Done')}
      {heading('Thank you')}
      {lead(`Your clinician will go through these with you and decide where to start. Nothing changes for ${child} until then.`)}
      {footer(<button className="teen-btn teen-btn--primary" onClick={finish}>Back home</button>)}
    </>,
  )
}
