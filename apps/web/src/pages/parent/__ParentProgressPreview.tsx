// Local design preview for the parent's Progress tab — `/__parent-progress-preview`, dev builds only
// (see main.tsx). Add `?off=1` to see it before the clinician has shared anything.
//
// Seeds the react-query cache so it renders without signing in; nothing is saved.
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import ParentProgressPage from './ParentProgressPage'

export default function ParentProgressPreview() {
  const qc = useQueryClient()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Nothing may go stale and re-fetch: a request with no sign-in signs the page out.
    qc.setDefaultOptions({ queries: { staleTime: Infinity, retry: false } })
    qc.setQueryData(['parent-me'], { patient_name: 'Sam Rivera' })
    const off = new URLSearchParams(window.location.search).has('off')
    const day = (n: number, h: number) => {
      const d = new Date()
      d.setDate(d.getDate() + n)
      d.setHours(h, 0, 0, 0)
      return d.toISOString()
    }
    qc.setQueryData(['parent-progress'], off ? { shared: false } : {
      shared: true,
      steps: [
        { id: 's1', name: 'Imagine looking up at someone you know a little', fear_level: 3, situation_name: 'Eye contact in the hall', status: 'mastered', times_done: 2 },
        { id: 's2', name: 'Make eye contact with Jack', fear_level: 5, situation_name: 'Eye contact in the hall', status: 'in_progress', times_done: 1 },
        { id: 's3', name: 'Make eye contact with John', fear_level: 6, situation_name: 'Eye contact in the hall', status: 'not_started', times_done: 0 },
        { id: 's4', name: 'Say hi to Jack as you pass', fear_level: 7, situation_name: 'Eye contact in the hall', status: 'not_started', times_done: 0 },
      ],
      planned: [
        { id: 'p1', step_name: 'Make eye contact with Jack', scheduled_date: day(1, 9), scheduled_time_bucket: 'morning', status: 'committed' },
        { id: 'p2', step_name: 'Make eye contact with John', scheduled_date: null, scheduled_time_bucket: null, status: 'planned' },
      ],
      done: [
        { id: 'd1', step_name: 'Make eye contact with Jack', done_on: day(-1, 15), outcome: 'did_it' },
        { id: 'd2', step_name: 'Imagine looking up at someone you know a little', done_on: day(-3, 18), outcome: 'did_it' },
      ],
    })
    setReady(true)
  }, [qc])

  return ready ? <ParentProgressPage /> : null
}
