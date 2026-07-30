import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { parentApiClient } from '../../api/client'
import ParentTabBar from '../../components/parent/ParentTabBar'
import teen from '../../styles/teenTokens'
import {
  getParentMessages,
  sendParentMessage,
  markParentMessageRead,
  type ParentMessage,
} from '../../api/parent'

function formatMsgTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  const time = d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase()
    .replace(/\s+/g, '')
  if (isToday) return `Today ${time}`
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${time}`
}

export default function ParentMessagesPage() {
  const queryClient = useQueryClient()
  const [replyContent, setReplyContent] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)

  const { data: me } = useQuery<{ user_id: string }>({
    queryKey: ['parent-me'],
    queryFn: async () => (await parentApiClient.get('/auth/me')).data,
  })

  const { data: messages, isLoading } = useQuery<ParentMessage[]>({
    queryKey: ['parent-messages'],
    queryFn: getParentMessages,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })

  const markRead = useMutation({
    mutationFn: (id: string) => markParentMessageRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['parent-messages'] }),
  })

  const send = useMutation({
    mutationFn: (content: string) => sendParentMessage(content),
    onSuccess: () => {
      setReplyContent('')
      queryClient.invalidateQueries({ queryKey: ['parent-messages'] })
    },
  })

  // Mark clinician messages read.
  useEffect(() => {
    if (!messages || !me) return
    for (const m of messages) {
      if (!m.read_at && m.sender_user_id !== me.user_id) markRead.mutate(m.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages?.length, me?.user_id])

  // Keep the newest message in view.
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages?.length])

  const handleSend = () => {
    const content = replyContent.trim()
    if (content) send.mutate(content)
  }

  return (
    <div
      style={{
        height: '100dvh',
        background: teen.color.canvas,
        fontFamily: teen.font.sans,
        maxWidth: '480px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          flex: 'none',
          background: teen.color.cardPure,
          padding: '20px 24px 16px',
          borderBottom: `1px solid ${teen.color.track}`,
        }}
      >
        <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em', color: teen.color.ink }}>
          Messages
        </span>
      </div>

      <div
        ref={threadRef}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 16px', display: 'flex', flexDirection: 'column' }}
      >
        {isLoading && (
          <p style={{ fontSize: '14px', color: teen.color.textSecondary, textAlign: 'center', marginTop: '40px' }}>
            Loading…
          </p>
        )}
        {!isLoading && messages && messages.length === 0 && (
          <p style={{ fontSize: '14px', color: teen.color.textSecondary, textAlign: 'center', marginTop: '40px' }}>
            No messages with your clinician yet.
          </p>
        )}
        {messages &&
          messages.map((m, i) => {
            const prev = i > 0 ? messages[i - 1] : null
            const sameSender = prev && prev.sender_user_id === m.sender_user_id
            const marginTop = i === 0 ? 0 : sameSender ? 4 : 8
            const ts = formatMsgTime(m.created_at)
            const isFromMe = me ? m.sender_user_id === me.user_id : false
            if (isFromMe) {
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginTop }}>
                  <div style={{ maxWidth: '70%', background: teen.color.mintLine, border: `1px solid ${teen.color.mintLine}`, borderRadius: '12px 12px 4px 12px', padding: '10px 14px' }}>
                    <p style={{ fontSize: '15px', color: teen.color.ink, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</p>
                  </div>
                  {ts && <span style={{ fontSize: '13px', color: teen.color.textSecondary, marginTop: '4px' }}>{ts}</span>}
                </div>
              )
            }
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop }}>
                <div style={{ maxWidth: '70%', background: teen.color.cardPure, border: `1px solid ${teen.color.track}`, borderRadius: '12px 12px 12px 4px', padding: '10px 14px' }}>
                  <p style={{ fontSize: '15px', color: teen.color.ink, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</p>
                </div>
                {ts && <span style={{ fontSize: '13px', color: teen.color.textSecondary, marginTop: '4px' }}>{ts}</span>}
              </div>
            )
          })}
      </div>

      <div
        style={{
          background: teen.color.canvas,
          borderTop: `1px solid ${teen.color.track}`,
          padding: '12px 16px',
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-end',
        }}
      >
        <textarea
          value={replyContent}
          onChange={e => setReplyContent(e.target.value)}
          placeholder="Write a message to your clinician…"
          rows={1}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSend()
            }
          }}
          style={{
            flex: 1,
            padding: '12px 14px',
            fontSize: '15px',
            border: `1px solid ${teen.color.lineChip}`,
            borderRadius: teen.radius.btn,
            resize: 'none',
            fontFamily: teen.font.sans,
            color: teen.color.ink,
            lineHeight: 1.4,
            maxHeight: '120px',
            background: teen.color.cardPure,
          }}
        />
        <button
          onClick={handleSend}
          disabled={!replyContent.trim() || send.isPending}
          style={{
            minHeight: '44px',
            padding: '0 18px',
            background: teen.color.teal,
            color: '#fff',
            border: 'none',
            borderRadius: teen.radius.btn,
            fontSize: '15px',
            fontWeight: 700,
            cursor: replyContent.trim() && !send.isPending ? 'pointer' : 'not-allowed',
            opacity: replyContent.trim() && !send.isPending ? 1 : 0.5,
          }}
        >
          {send.isPending ? '…' : 'Send'}
        </button>
      </div>

      <ParentTabBar active="chat" />
    </div>
  )
}
