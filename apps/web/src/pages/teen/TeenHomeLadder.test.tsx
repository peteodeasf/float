import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

// No child can be signed in here, so the child's identity is stubbed and every query is seeded.
vi.mock('../../context/TeenAuthContext', () => ({
  useTeenAuth: () => ({ patientId: 'p1', logout: vi.fn() }),
}))

import TeenHomePage from './TeenHomePage'
import TeenProgressPage from './TeenProgressPage'

const at = (daysFromToday: number, hour: number) => {
  const d = new Date()
  d.setDate(d.getDate() + daysFromToday)
  d.setHours(hour, 0, 0, 0)
  return d.toISOString()
}

const rung = (id: string, name: string, dt: number, over: Record<string, unknown> = {}) => ({
  id, name, dt, status: 'not_started', situation_name: 'Eye contact in the hall',
  situation_id: 's1', is_recommended: false, behavior_type: 'scenario', experiment_count: 0,
  latest_dt_actual: null, feared_outcome: null, experiments: [], ...over,
})

const RUNGS = [
  rung('r1', 'Imagine looking up at someone you know a little', 3, { status: 'mastered' }),
  rung('r2', 'Make eye contact with Jack', 5),
  rung('r3', 'Make eye contact with John', 6),
  rung('r4', 'Say hi to Jack as you pass', 7, { is_recommended: true }),
  rung('r5', 'Stop and ask John a question', 9),
]
const PENDING = [
  { id: 'e-today', status: 'committed', scheduled_date: at(0, 9), scheduled_time_bucket: 'morning', avoidance_behavior_id: 'r2', plan_description: 'Make eye contact with Jack' },
  { id: 'e-planned', status: 'planned', scheduled_date: at(1, 12), scheduled_time_bucket: null, avoidance_behavior_id: 'r3', plan_description: 'Make eye contact with John' },
  { id: 'e-later', status: 'committed', scheduled_date: at(3, 19), scheduled_time_bucket: 'evening', avoidance_behavior_id: 'r5', plan_description: 'Stop and ask John a question' },
]

function renderWith(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['teen-ladder', 'p1'], {
    plan: { id: 'plan', ladder_active: true },
    rungs: RUNGS,
    situations: [{ id: 's1', name: 'Eye contact in the hall', behaviors: RUNGS.map(r => ({ ...r, experiments: [] })) }],
  })
  qc.setQueryData(['teen-pending', 'p1'], PENDING)
  qc.setQueryData(['teen-me', 'p1'], { patient_name: 'Sam', user_id: 'u1' })
  qc.setQueryData(['teen-messages', 'p1'], [])
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  localStorage.setItem('float_onboarded_p1', '1')
})

describe('the child home is the ladder', () => {
  it('lifts out what is due today, with both ways in', () => {
    renderWith(<TeenHomePage />)
    // Twice on purpose: on the card, and as the chip on that step's row in the ladder.
    expect(screen.getAllByText('Today · Morning')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'Make eye contact with Jack' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Do it now' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tell me how it went' })).toBeInTheDocument()
  })

  it('shows each step in its own state', () => {
    renderWith(<TeenHomePage />)
    const step = (name: string) => screen.getAllByText(name).map(n => n.closest('button')!).find(b => b?.textContent?.includes('/10'))!

    expect(within(step('Imagine looking up at someone you know a little')).getByLabelText('Done')).toBeInTheDocument()
    expect(step('Imagine looking up at someone you know a little')).toBeDisabled()
    expect(within(step('Make eye contact with Jack')).getByText('Today · Morning')).toBeInTheDocument()
    expect(within(step('Make eye contact with John')).getByText('Set up with your clinician')).toBeInTheDocument()
    expect(within(step('Make eye contact with John')).getByText('Finish setting it up')).toBeInTheDocument()
    expect(within(step('Say hi to Jack as you pass')).getByText('Do this next')).toBeInTheDocument()
    expect(within(step('Stop and ask John a question')).getByText(/· Evening$/)).toBeInTheDocument()
  })

  it('has no separate setup card, Set it up button, or scheduled list', () => {
    renderWith(<TeenHomePage />)
    expect(screen.queryByText('Set up an experiment')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Set it up' })).not.toBeInTheDocument()
    expect(screen.queryByText('Scheduled experiments')).not.toBeInTheDocument()
  })

  it('puts a dot on Progress when something is waiting', () => {
    renderWith(<TeenHomePage />)
    expect(screen.getByRole('button', { name: 'Progress, something is waiting' })).toBeInTheDocument()
  })
})

describe('Progress leads with what they are working on', () => {
  it('lists due, waiting and later, above how it is going', () => {
    renderWith(<TeenProgressPage />)
    expect(screen.getByText("What you're working on")).toBeInTheDocument()
    expect(screen.getByText('Today · Morning')).toBeInTheDocument()
    expect(screen.getByText('Set up with your clinician')).toBeInTheDocument()
    expect(screen.getByText(/· Evening$/)).toBeInTheDocument()
    expect(screen.getByText("How it's going")).toBeInTheDocument()
  })
})
