import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getMessages, sendMessage } from '../../api/patients'

interface Props {
  patientId: string
  patientUserId: string
}

const MESSAGE_TYPES = [
  { value: 'check_in', label: 'Check in' },
  { value: 'encouragement', label: 'Encouragement' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'general', label: 'General' }
]

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function MessagesPanel({ patientId, patientUserId }: Props) {
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const [messageType, setMessageType] = useState('general')
  const [showForm, setShowForm] = useState(false)

  const { data: messages } = useQuery({
    queryKey: ['messages', patientId],
    queryFn: () => getMessages(patientId)
  })

  const sendMutation = useMutation({
    mutationFn: () => sendMessage(patientId, patientUserId, content, messageType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', patientId] })
      setContent('')
      setMessageType('general')
      setShowForm(false)
    }
  })

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-slate-800">Messages</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-xs text-teal-600 font-medium hover:underline"
          >
            + New message
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-4 bg-slate-50 rounded-lg p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select
              value={messageType}
              onChange={e => setMessageType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              {MESSAGE_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Message</label>
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Write a message to the patient..."
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowForm(false)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={() => sendMutation.mutate()}
              disabled={!content || sendMutation.isPending}
              className="text-xs bg-teal-600 text-white px-3 py-1.5 rounded-lg hover:bg-teal-700 disabled:opacity-50"
            >
              {sendMutation.isPending ? 'Sending...' : 'Send'}
            </button>
          </div>
        </div>
      )}

      {messages && messages.length > 0 ? (
        <div className="space-y-3">
          {messages.map(msg => (
            <div key={msg.id} className="flex gap-3">
              <div className="w-7 h-7 rounded-full bg-teal-100 text-teal-600 text-xs flex items-center justify-center font-medium shrink-0 mt-0.5">
                P
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    msg.message_type === 'encouragement' ? 'bg-green-100 text-green-700' :
                    msg.message_type === 'check_in' ? 'bg-teal-100 text-teal-700' :
                    msg.message_type === 'adjustment' ? 'bg-amber-100 text-amber-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {msg.message_type.replace('_', ' ')}
                  </span>
                  <span className="text-xs text-slate-400">{timeAgo(msg.created_at)}</span>
                </div>
                <p className="text-sm text-slate-700">{msg.content}</p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        !showForm && (
          <p className="text-sm text-slate-400">
            No messages yet — send a check-in or encouragement between sessions
          </p>
        )
      )}
    </div>
  )
}
