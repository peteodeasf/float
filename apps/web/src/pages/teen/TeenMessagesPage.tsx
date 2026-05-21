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

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  const now = Date.now()
  const seconds = Math.max(0, Math.floor((now - then) / 1000))
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w ago`
  return new Date(iso).toLocaleDateString()
}

function typeLabel(type: string): string {
  switch (type) {
    case 'encouragement': return 'Encouragement'
    case 'reminder': return 'Reminder'
    case 'feedback': return 'Feedback'
    case 'general': return 'Message'
    default: return type.charAt(0).toUpperCase() + type.slice(1)
  }
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
        padding: '24px',
        paddingBottom: '12px',
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

        {messages && messages.map((m) => {
          const isFromMe = me ? m.sender_user_id === me.user_id : false
          const unread = !isFromMe && !m.read_at

          if (isFromMe) {
            return (
              <div
                key={m.id}
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  marginBottom: '12px',
                }}
              >
                <div
                  style={{
                    maxWidth: '85%',
                    background: '#f0fdfa',
                    borderRadius: '14px',
                    padding: '12px 14px',
                    border: '1px solid #ccfbf1',
                  }}
                >
                  <p style={{
                    fontSize: '15px',
                    color: '#1e293b',
                    margin: 0,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                    {m.content}
                  </p>
                  <p style={{
                    fontSize: '11px',
                    color: '#94a3b8',
                    margin: '6px 0 0',
                    textAlign: 'right',
                  }}>
                    {timeAgo(m.created_at)}
                  </p>
                </div>
              </div>
            )
          }

          return (
            <div
              key={m.id}
              style={{
                display: 'flex',
                justifyContent: 'flex-start',
                marginBottom: '12px',
              }}
            >
              <button
                onClick={() => {
                  if (!m.read_at) markRead.mutate(m.id)
                }}
                style={{
                  maxWidth: '85%',
                  textAlign: 'left',
                  background: unread ? '#ccfbf1' : '#fff',
                  borderRadius: '14px',
                  padding: '12px 14px',
                  border: '1px solid #e2e8f0',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '6px',
                  gap: '10px',
                }}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: '#0d9488',
                    background: unread ? '#fff' : '#f0fdfa',
                    padding: '3px 8px',
                    borderRadius: '999px',
                  }}>
                    {typeLabel(m.message_type)}
                  </span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                    {timeAgo(m.created_at)}
                  </span>
                </div>
                <p style={{
                  fontSize: '15px',
                  color: '#1e293b',
                  margin: 0,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {m.content}
                </p>
              </button>
            </div>
          )
        })}
      </div>

      {/* Reply input — always visible at bottom */}
      <div style={{
        background: '#fff',
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
          }}
        />
        <button
          onClick={handleSend}
          disabled={!replyContent.trim() || sendMessage.isPending}
          style={{
            padding: '10px 16px',
            background: '#0d9488',
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
