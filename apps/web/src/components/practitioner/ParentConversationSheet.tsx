/**
 * Going through the accommodation conversation with the parent, in session.
 *
 * The parent app's questions, one situation per screen, full screen so the parent can see it, with
 * the clinician typing what they say (Peter, 2026-09-10: "It can be done in the room with the
 * clinician during the parent session, or the parent can do it in the app"). Every answer saves as
 * it is given and lands as a suggestion on the Parent Accommodations panel — nothing goes onto the
 * plan from here. Plan: docs/plans/accommodation-conversation.md
 */
import { useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Chrome, primaryBtn, quietLink } from '../../pages/practitioner/sessionKit'
import {
  answerInSession,
  getConversationInSession,
  nameInSession,
  type ConversationItemInSession,
} from '../../api/treatment'

const choice = (on: boolean): CSSProperties => ({
  fontSize: 13, fontWeight: 700, borderRadius: 10, padding: '7px 14px', cursor: 'pointer',
  color: on ? '#fff' : '#135450', background: on ? '#135450' : '#fff',
  border: `1.5px solid ${on ? '#135450' : '#cfe3de'}`,
})

/** One Fear Level, or a range: tap a number, tap a second for a range, tap again to start over. */
function RangeScale({ lo, hi, onChange }: { lo: number | null; hi: number | null; onChange: (lo: number, hi: number) => void }) {
  const pick = (n: number) => {
    if (lo == null || hi == null || lo !== hi) return onChange(n, n)
    onChange(Math.min(lo, n), Math.max(lo, n))
  }
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => {
        const on = lo != null && hi != null && n >= lo && n <= hi
        return (
          <button key={n} aria-label={`Fear Level ${n}`} aria-pressed={on} onClick={() => pick(n)}
            style={{ flex: 1, height: 36, borderRadius: 8, cursor: 'pointer', fontWeight: 800, fontSize: 13,
              border: on ? '2px solid #0d3d3a' : '1px solid #e2e8f0', background: on ? '#135450' : '#fff',
              color: on ? '#fff' : '#94a3b8' }}>
            {n}
          </button>
        )
      })}
    </div>
  )
}

export default function ParentConversationSheet({ patientId, onClose }: { patientId: string; onClose: () => void }) {
  const qc = useQueryClient()
  const key = ['conversation-in-session', patientId]
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: () => getConversationInSession(patientId) })
  const [idx, setIdx] = useState(0)
  const [draft, setDraft] = useState('')

  const refresh = () => qc.invalidateQueries({ queryKey: key })
  const answerMut = useMutation({
    mutationFn: (v: { id: string; data: Parameters<typeof answerInSession>[2] }) => answerInSession(patientId, v.id, v.data),
    onSuccess: refresh,
  })
  const nameMut = useMutation({
    mutationFn: (v: { situationId: string; name: string }) =>
      nameInSession(patientId, { trigger_situation_id: v.situationId, name: v.name }),
    onSuccess: () => { setDraft(''); refresh() },
  })

  const close = () => {
    // What they said is now on the panel's suggestions.
    qc.invalidateQueries({ queryKey: ['insights'] })
    qc.invalidateQueries({ queryKey: ['accommodations'] })
    onClose()
  }

  const situations = data?.situations ?? []
  const sit = situations[Math.min(idx, Math.max(situations.length - 1, 0))]
  const child = data?.child_name || 'the child'
  const last = idx >= situations.length - 1

  const item = (it: ConversationItemInSession) => (
    <div key={it.id} role="group" aria-label={it.name}
      style={{ border: '1px solid #dde8e6', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, opacity: it.still_does === false ? 0.6 : 1 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: '#0d3d3a' }}>
        {it.name}
        <span style={{ fontSize: 11.5, fontWeight: 600, color: '#8fa5a1' }}> · {it.from_record ? 'from the monitoring log' : 'said before'}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: '#4b5a59' }}>Do they still do this?</span>
        <button aria-pressed={it.still_does === true} style={choice(it.still_does === true)}
          onClick={() => answerMut.mutate({ id: it.id, data: { still_does: true } })}>Yes</button>
        <button aria-pressed={it.still_does === false} style={choice(it.still_does === false)}
          onClick={() => answerMut.mutate({ id: it.id, data: { still_does: false } })}>Not any more</button>
      </div>
      {it.still_does !== false && (
        <div>
          <div style={{ fontSize: 13, color: '#4b5a59', marginBottom: 6 }}>
            If they stopped, how hard would it be for {child}?
            {it.estimate_min != null && (
              <b style={{ color: '#135450' }}> {it.estimate_min === it.estimate_max ? it.estimate_min : `${it.estimate_min}–${it.estimate_max}`}</b>
            )}
          </div>
          <RangeScale lo={it.estimate_min} hi={it.estimate_max}
            onChange={(lo, hi) => answerMut.mutate({ id: it.id, data: { estimate_min: lo, estimate_max: hi } })} />
        </div>
      )}
    </div>
  )

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Go through with the parent"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, overflowY: 'auto' }}>
      <Chrome onExit={close} exitLabel="← Back to the plan">
        <div style={{ background: '#fff', border: '1px solid #dde8e6', borderRadius: 18, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {isLoading ? (
            <p style={{ color: '#6b7a79', fontSize: 14 }}>Loading…</p>
          ) : !sit ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0d3d3a' }}>No situations on the ladder yet</div>
              <p style={{ fontSize: 14, color: '#4b5a59', margin: 0 }}>Add {child}'s situations to the plan first; the questions go situation by situation.</p>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: '.04em' }}>ASK THE PARENT · TYPE WHAT THEY SAY</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#94a3b8' }}>Situation {idx + 1} of {situations.length}</div>
              </div>
              <div style={{ fontSize: 21, fontWeight: 800, color: '#0d3d3a' }}>When {child} is anxious about “{sit.name}”, what do you do?</div>

              {sit.items.map(item)}

              <div style={{ display: 'flex', gap: 8 }}>
                <input value={draft} onChange={e => setDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && draft.trim()) nameMut.mutate({ situationId: sit.id, name: draft.trim() }) }}
                  placeholder={sit.items.length ? 'Anything else they do?' : 'What they do'}
                  aria-label="Something else they do"
                  style={{ flex: 1, fontSize: 14, padding: '9px 12px', borderRadius: 10, border: '1px solid #cfe3de' }} />
                <button disabled={!draft.trim() || nameMut.isPending}
                  onClick={() => nameMut.mutate({ situationId: sit.id, name: draft.trim() })}
                  style={{ ...choice(false), opacity: !draft.trim() ? 0.5 : 1 }}>Add</button>
              </div>

              {(answerMut.isError || nameMut.isError) && (
                <p role="alert" style={{ fontSize: 13.5, color: '#b91c1c', margin: 0 }}>That didn't save. Try again.</p>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingTop: 6 }}>
                <button onClick={() => (last ? close() : (setIdx(idx + 1), setDraft('')))} style={{ ...primaryBtn, marginTop: 0 }}>
                  {last ? 'Done' : 'Next situation'}
                </button>
                {idx > 0 && <button onClick={() => { setIdx(idx - 1); setDraft('') }} style={quietLink}>Previous situation</button>}
              </div>
            </>
          )}
        </div>
      </Chrome>
    </div>,
    document.body,
  )
}
