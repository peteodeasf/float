import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTeenAuth } from '../../context/TeenAuthContext'
import { teenApiClient } from '../../api/client'
import TeenTabBar from '../../components/teen/TeenTabBar'
import teen from '../../styles/teenTokens'

type TeenMessage = {
  id: string
  content: string
  message_type: string
  sender_user_id: string
  created_at: string | null
  read_at: string | null
}

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
  const datePart = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${datePart}, ${time}`
}

export default function TeenMessagesPage() {
  const { patientId } = useTeenAuth()
  const queryClient = useQueryClient()
  const [replyContent, setReplyContent] = useState('')

  const { data: me } = useQuery<{ user_id: string }>({
    queryKey: ['teen-me', patientId],
    queryFn: async () => (await teenApiClient.get('/auth/me')).data,
    enabled: !!patientId,
  })

  const { data: messages, isLoading } = useQuery<TeenMessage[]>({
    queryKey: ['teen-messages', patientId],
    queryFn: async () => (await teenApiClient.get('/patient/messages')).data,
    enabled: !!patientId,
    // No websockets — poll so the clinician's replies appear while the thread
    // is open, not only after the teen sends something. Background polling +
    // refetch-on-focus so it stays live even if the tab loses focus.
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })

  const markRead = useMutation({
    mutationFn: async (messageId: string) => {
      await teenApiClient.put(`/patient/messages/${messageId}/read`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teen-messages', patientId] })
    },
  })

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      await teenApiClient.post('/patient/messages', { content, message_type: 'general' })
    },
    onSuccess: () => {
      setReplyContent('')
      queryClient.invalidateQueries({ queryKey: ['teen-messages', patientId] })
    },
  })

  useEffect(() => {
    if (!messages || !me) return
    for (const m of messages) {
      if (!m.read_at && m.sender_user_id !== me.user_id) {
        markRead.mutate(m.id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages?.length, me?.user_id])

  const handleSend = () => {
    const content = replyContent.trim()
    if (!content) return
    sendMessage.mutate(content)
  }

  return (
    <div style={{
      height: '100dvh',
      background: teen.color.canvas,
      fontFamily: teen.font.sans,
      maxWidth: '480px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        flex: 'none',
        background: teen.color.cardPure,
        padding: '20px 24px 16px',
        borderBottom: `1px solid ${teen.color.track}`,
      }}>
        <span style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em', color: teen.color.ink }}>Messages</span>
      </div>

      {/* Thread (scrollable) */}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflowY: 'auto',
        padding: '20px 16px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {isLoading && (
          <p style={{ fontSize: '14px', color: teen.color.textSecondary, textAlign: 'center', marginTop: '40px' }}>
            Loading...
          </p>
        )}

        {!isLoading && messages && messages.length === 0 && (
          <p style={{ fontSize: '14px', color: teen.color.textSecondary, textAlign: 'center', marginTop: '40px' }}>
            No messages from your clinician yet.
          </p>
        )}

        {messages && messages.map((m, i) => {
          const prev = i > 0 ? messages[i - 1] : null
          const sameSender = prev && prev.sender_user_id === m.sender_user_id
          const marginTop = i === 0 ? 0 : (sameSender ? 4 : 8)
          const ts = formatMsgTime(m.created_at)
          const isFromMe = me ? m.sender_user_id === me.user_id : false

          if (m.message_type === 'experiment_completed') {
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop }}>
                <div style={{ maxWidth: '70%', background: teen.color.mintSoft, border: `1px solid ${teen.color.mint}`, borderRadius: '12px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: teen.color.teal, marginBottom: '4px' }}>✓ Experiment completed</div>
                  <p style={{ fontSize: '15px', color: teen.color.ink, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</p>
                </div>
                {ts && <span style={{ fontSize: '13px', color: teen.color.textSecondary, marginTop: '4px' }}>{ts}</span>}
              </div>
            )
          }

          if (m.message_type === 'too_hard') {
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop }}>
                <div style={{ maxWidth: '70%', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, color: '#b45309', marginBottom: '4px' }}>⚠ Too hard</div>
                  <p style={{ fontSize: '15px', color: teen.color.ink, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</p>
                </div>
                {ts && <span style={{ fontSize: '13px', color: teen.color.textSecondary, marginTop: '4px' }}>{ts}</span>}
              </div>
            )
          }

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

          // Clinician message — left aligned, grey bubble, no label
          return (
            <div
              key={m.id}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', marginTop }}
              onClick={() => { if (!m.read_at) markRead.mutate(m.id) }}
            >
              <div style={{ maxWidth: '70%', background: teen.color.cardPure, border: `1px solid ${teen.color.track}`, borderRadius: '12px 12px 12px 4px', padding: '10px 14px', cursor: m.read_at ? 'default' : 'pointer' }}>
                <p style={{ fontSize: '15px', color: teen.color.ink, margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</p>
              </div>
              {ts && <span style={{ fontSize: '13px', color: teen.color.textSecondary, marginTop: '4px' }}>{ts}</span>}
            </div>
          )
        })}
      </div>

      {/* Reply input — always visible at bottom */}
      <div style={{
        background: teen.color.canvas,
        borderTop: `1px solid ${teen.color.track}`,
        padding: '12px 16px',
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-end',
      }}>
        <textarea
          value={replyContent}
          onChange={(e) => setReplyContent(e.target.value)}
          placeholder="Write a message to your clinician..."
          rows={1}
          onKeyDown={(e) => {
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
          disabled={!replyContent.trim() || sendMessage.isPending}
          style={{
            minHeight: '44px',
            padding: '0 18px',
            background: teen.color.teal,
            color: '#fff',
            border: 'none',
            borderRadius: teen.radius.btn,
            fontSize: '15px',
            fontWeight: 700,
            cursor: replyContent.trim() && !sendMessage.isPending ? 'pointer' : 'not-allowed',
            opacity: replyContent.trim() && !sendMessage.isPending ? 1 : 0.5,
          }}
        >
          {sendMessage.isPending ? '…' : 'Send'}
        </button>
      </div>

      <TeenTabBar active="chat" unread={0} />
    </div>
  )
}
