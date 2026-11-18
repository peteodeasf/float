import { useEffect, useState, type CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { sendFeedback } from '../../api/feedback'
import { Banner, Button, CloseButton, Textarea } from './primitives'

/**
 * The Feedback link at the top right of every clinician page, and the side panel it opens.
 * What the clinician writes is saved and becomes a GitHub issue. docs/plans/clinician-feedback-link.md
 */
export default function FeedbackLink({ style }: { style?: CSSProperties }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button kind="quiet" size="sm" onClick={() => setOpen(true)} style={style}>Feedback</Button>
      {open && <FeedbackPanel onClose={() => setOpen(false)} />}
    </>
  )
}

function FeedbackPanel({ onClose }: { onClose: () => void }) {
  const { pathname } = useLocation()
  const [text, setText] = useState('')
  const send = useMutation({ mutationFn: () => sendFeedback(text.trim(), pathname) })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 'var(--float-z-modal)' as unknown as number, background: 'rgba(15,23,42,0.25)' }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Send feedback"
        onClick={e => e.stopPropagation()}
        style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, width: '400px', maxWidth: '100vw',
          background: 'var(--float-surface)', boxShadow: 'var(--float-shadow-md)',
          display: 'flex', flexDirection: 'column', padding: '24px', boxSizing: 'border-box',
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0, fontSize: 'var(--float-font-lg)', fontWeight: 600, color: 'var(--float-text)' }}>Feedback</h2>
          <CloseButton onClick={onClose} />
        </div>

        {send.isSuccess ? (
          <>
            <p style={{ marginTop: '24px', fontSize: 'var(--float-font-sm)', color: 'var(--float-text)', lineHeight: 'var(--float-leading)' }}>
              Thanks — we've got it.
            </p>
            <Button kind="primary" onClick={onClose} style={{ marginTop: 'auto' }}>Close</Button>
          </>
        ) : (
          <>
            <p style={{ margin: '8px 0 0', fontSize: 'var(--float-font-sm)', color: 'var(--float-text-secondary)', lineHeight: 'var(--float-leading)' }}>
              Something not working, or a way this page could be better? Tell us.
            </p>
            <Textarea
              block
              autoFocus
              aria-label="Your feedback"
              value={text}
              onChange={e => setText(e.target.value)}
              maxLength={5000}
              rows={8}
              style={{ marginTop: '24px', resize: 'vertical' }}
            />
            {send.isError && (
              <Banner tone="danger" style={{ marginTop: '12px' }}>That didn't send. Try again.</Banner>
            )}
            <div style={{ marginTop: 'auto', display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <Button kind="secondary" onClick={onClose}>Cancel</Button>
              <Button kind="primary" disabled={!text.trim() || send.isPending} onClick={() => send.mutate()}>
                {send.isPending ? 'Sending…' : 'Send'}
              </Button>
            </div>
          </>
        )}
      </aside>
    </div>
  )
}
