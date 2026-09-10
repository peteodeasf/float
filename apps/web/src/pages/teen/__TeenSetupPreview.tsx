// Local design preview for the child's setup — `/__teen-setup-preview/r3`, dev builds only (see
// main.tsx). Add `?experiment=e1` for one set up in session with the day left for home, or
// `?experiment=e2` for an older plan that only had a day.
//
// Seeds the react-query cache so the screens render without signing in. The only database a dev
// machine reaches is PRODUCTION, so do not press Lock it in here — it would try to save.
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import TeenExperimentPage from './TeenExperimentPage'

const FEAR = "He'll think I'm weird and look away"

export default function TeenSetupPreview() {
  const qc = useQueryClient()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // A request with no sign-in comes back "Not authenticated" and signs the page out, so nothing
    // may go stale and re-fetch (api/session.ts).
    qc.setDefaultOptions({ queries: { staleTime: Infinity, retry: false } })
    qc.setQueryData(['teen-behavior', 'r3'], {
      id: 'r3', name: 'Make eye contact with John', dt: 6, ladder_active: true,
      situation: { name: 'Eye contact in the hall', feared_outcome: FEAR },
    })
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(12, 0, 0, 0)
    qc.setQueryData(['teen-pending', 'experiment-page'], [
      { id: 'e1', status: 'planned', scheduled_date: null, scheduled_time_bucket: null,
        prediction: FEAR, bip_before: 70, distress_thermometer_expected: 6, confidence_level: 'medium' },
      { id: 'e2', status: 'planned', scheduled_date: tomorrow.toISOString(), scheduled_time_bucket: null,
        prediction: null, bip_before: null, distress_thermometer_expected: null, confidence_level: 'medium' },
    ])
    setReady(true)
  }, [qc])

  return ready ? <TeenExperimentPage /> : null
}
