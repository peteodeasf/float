import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTeenAuth } from '../../context/TeenAuthContext'
import { teenApiClient } from '../../api/client'

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
  const { patientId, logout } = useTeenAuth()
  const navigate = useNavigate()
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

  const handleLogout = () => {
    logout()
    navigate('/teen/login')
  }

  const handleSend = () => {
    const content = replyContent.trim()
    if (!content) return
    sendMessage.mutate(content)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      maxWidth: '480px',
      margin: '0 auto',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        background: '#fff',
        padding: '20px 24px 16px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => navigate('/teen/home')}
            style={{ fontSize: '14px', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ← Back
          </button>
          <span style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>Messages</span>
        </div>
        <button
          onClick={handleLogout}
          style={{ fontSize: '13px', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>

      {/* Thread (scrollable) */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px 16px',
        display: 'flex',
        flexDirection: 'column',
      }}>
        {isLoading && (
          <p style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center', marginTop: '40px' }}>
            Loading...
          </p>
        )}

        {!isLoading && messages && messages.length === 0 && (
          <p style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center', marginTop: '40px' }}>
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
                <div style={{ maxWidth: '70%', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#15803d', marginBottom: '4px' }}>✓ Experiment completed</div>
                  <p style={{ fontSize: '14px', color: '#1e293b', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</p>
                </div>
                {ts && <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{ts}</span>}
              </div>
            )
          }

          if (m.message_type === 'too_hard') {
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop }}>
                <div style={{ maxWidth: '70%', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '12px', padding: '10px 14px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: '#b45309', marginBottom: '4px' }}>⚠ Too hard</div>
                  <p style={{ fontSize: '14px', color: '#1e293b', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</p>
                </div>
                {ts && <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{ts}</span>}
              </div>
            )
          }

          if (isFromMe) {
            return (
              <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginTop }}>
                <div style={{ maxWidth: '70%', background: '#eafaf6', border: '1px solid #eafaf6', borderRadius: '12px 12px 4px 12px', padding: '10px 14px' }}>
                  <p style={{ fontSize: '14px', color: '#1e293b', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</p>
                </div>
                {ts && <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{ts}</span>}
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
              <div style={{ maxWidth: '70%', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '12px 12px 12px 4px', padding: '10px 14px', cursor: m.read_at ? 'default' : 'pointer' }}>
                <p style={{ fontSize: '14px', color: '#1e293b', margin: 0, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</p>
              </div>
              {ts && <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>{ts}</span>}
            </div>
          )
        })}
      </div>

      {/* Reply input — always visible at bottom */}
      <div style={{
        background: '#f8fafc',
        borderTop: '1px solid #e2e8f0',
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
            padding: '10px 12px',
            fontSize: '15px',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            resize: 'none',
            fontFamily: 'inherit',
            lineHeight: 1.4,
            maxHeight: '120px',
            background: '#fff',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!replyContent.trim() || sendMessage.isPending}
          style={{
            padding: '10px 16px',
            background: '#135450',
            color: '#fff',
            border: 'none',
            borderRadius: '10px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: replyContent.trim() && !sendMessage.isPending ? 'pointer' : 'not-allowed',
            opacity: replyContent.trim() && !sendMessage.isPending ? 1 : 0.5,
          }}
        >
          {sendMessage.isPending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
