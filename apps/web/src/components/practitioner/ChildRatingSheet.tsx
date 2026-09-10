/**
 * Rating the accommodations with the child, in session.
 *
 * Full screen so the child can see it, so it shows each accommodation and nothing else — never the
 * parent's estimate (Peter, 2026-09-10: the clinician sees the two side by side; "The child does
 * not"). The clinician types what the child says, and it counts as the child's rating.
 * docs/plans/accommodation-conversation.md
 */
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Chrome, FearRangeScale, primaryBtn } from '../../pages/practitioner/sessionKit'
import { rateWithChild, type Accommodation } from '../../api/accommodations'

export default function ChildRatingSheet({
  planId,
  accommodations,
  onClose,
}: {
  planId: string
  accommodations: Accommodation[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const rateMut = useMutation({
    mutationFn: (v: { id: string; lo: number; hi: number }) => rateWithChild(planId, v.id, v.lo, v.hi),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accommodations', planId] }),
  })

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Rate together in session"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, overflowY: 'auto' }}>
      <Chrome onExit={onClose} exitLabel="← Back to the plan">
        <div style={{ background: '#fff', border: '1px solid #dde8e6', borderRadius: 18, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: '.04em' }}>ASK THE CHILD · TYPE WHAT THEY SAY</div>
          <div style={{ fontSize: 21, fontWeight: 800, color: '#0d3d3a' }}>
            If your parent stopped doing these, how hard would it be for you?
          </div>
          <p style={{ fontSize: 13.5, color: '#4b5a59', margin: 0 }}>A Fear Level for each, or two if it depends.</p>

          {accommodations.map(a => {
            // Only the child's own answer is shown here; an unrated score is the clinician's guess.
            const lo = a.child_rated_at ? a.distress_min : null
            const hi = a.child_rated_at ? a.distress_max : null
            return (
              <div key={a.id} role="group" aria-label={a.name}
                style={{ border: '1px solid #dde8e6', borderRadius: 12, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0d3d3a' }}>
                  {a.name}
                  {lo != null && <b style={{ color: '#135450' }}> · {lo === hi ? lo : `${lo}–${hi}`}</b>}
                </div>
                <FearRangeScale lo={lo} hi={hi} onChange={(l, h) => rateMut.mutate({ id: a.id, lo: l, hi: h })} />
              </div>
            )
          })}

          {rateMut.isError && (
            <p role="alert" style={{ fontSize: 13.5, color: '#b91c1c', margin: 0 }}>That didn't save. Try again.</p>
          )}
          <div>
            <button onClick={onClose} style={{ ...primaryBtn, marginTop: 4 }}>Done</button>
          </div>
        </div>
      </Chrome>
    </div>,
    document.body,
  )
}
