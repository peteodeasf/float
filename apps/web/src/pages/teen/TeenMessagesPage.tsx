import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTeenAuth } from '../../context/TeenAuthContext'
import { teenApiClient } from '../../api/client'

type TeenMessage = {
  id: string
  content: string
  message_type: string
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

  useEffect(() => {
    if (!messages) return
    for (const m of messages) {
      if (!m.read_at) {
        markRead.mutate(m.id)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages?.length])

  const handleLogout = () => {
    logout()
    navigate('/teen/login')
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      maxWidth: '480px',
      margin: '0 auto',
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

      <div style={{ padding: '24px' }}>
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
          const unread = !m.read_at
          return (
            <button
              key={m.id}
              onClick={() => {
                if (!m.read_at) markRead.mutate(m.id)
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                background: unread ? '#ccfbf1' : '#fff',
                borderRadius: '14px',
                padding: '16px 18px',
                marginBottom: '12px',
                border: '1px solid #e2e8f0',
                cursor: 'pointer',
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '8px',
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
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>
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
          )
        })}
      </div>
    </div>
  )
}
