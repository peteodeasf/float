import { useEffect, useState } from 'react'
import axios from 'axios'
import FloatLogo from '../components/ui/FloatLogo'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

/**
 * Where the link at the bottom of a reminder email lands. No sign-in, like any unsubscribe link:
 * the token in the link says whose reminder emails to turn off. docs/plans/scheduled-jobs.md
 */
export default function ReminderOffPage() {
  const token = new URLSearchParams(window.location.search).get('token') ?? ''
  const [state, setState] = useState<'working' | 'done' | 'bad'>('working')

  useEffect(() => {
    axios.post(`${API_URL}/reminders/off`, { token })
      .then(() => setState('done'))
      .catch(() => setState('bad'))
  }, [token])

  return (
    <div style={{ minHeight: '100vh', background: '#eef4f3', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', border: '1px solid #dde8e6', borderRadius: 16, padding: '28px 26px', maxWidth: 420, width: '100%', textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 18 }}><FloatLogo /></div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0d3d3a', margin: '0 0 10px' }}>
          {state === 'working' ? 'Turning off reminder emails…' : state === 'done' ? 'Reminder emails are off' : "This link didn't work"}
        </h1>
        <p style={{ fontSize: 14.5, color: '#4b5a59', lineHeight: 1.55, margin: 0 }}>
          {state === 'done'
            ? "You won't get reminder emails from Float any more. You can still use Float as usual."
            : state === 'bad'
              ? 'It may not have been copied in full. Try the link in the email again.'
              : ''}
        </p>
      </div>
    </div>
  )
}
