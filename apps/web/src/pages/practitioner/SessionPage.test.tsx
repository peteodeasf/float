import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { LadderEditor } from './SessionPage'
import type { TriggerSituation } from '../../api/treatment'

function openEditor() {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['insights', 'p1', 'situation'], [])
  qc.setQueryData(['plan-rungs', 'plan1'], [])
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LadderEditor planId="plan1" patientId="p1" triggers={[]} onDone={() => {}} onArrow={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('adding a trigger situation', () => {
  // Issue #50: Peter asked for the hint in the box to read "Add a trigger situation", the name
  // the screen's own question uses, not "Add a situation the child finds hard".
  it('hints "Add a trigger situation"', () => {
    openEditor()
    fireEvent.click(screen.getByRole('button', { name: 'Add situation' }))
    expect(screen.getByLabelText('A situation')).toHaveAttribute('placeholder', 'Add a trigger situation')
  })
})

describe('the hint for adding a behavior', () => {
  // Issue #77: the hint was always about sitting at the back of a classroom, even under "Soccer
  // practice after school". Peter asked for it to fit the situation it sits under.
  it('names the situation, not a classroom', () => {
    const soccer: TriggerSituation = {
      id: 't1', treatment_plan_id: 'plan1', name: 'Soccer practice after school', description: null,
      distress_thermometer_rating: 5, distress_thermometer_max: 10, situation_library_id: null,
      display_order: 0, is_active: true, created_at: '2026-10-22T00:00:00Z',
    }
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
    qc.setQueryData(['insights', 'p1', 'situation'], [])
    qc.setQueryData(['insights', 'p1', 'behavior'], [])
    qc.setQueryData(['plan-rungs', 'plan1'], [])
    qc.setQueryData(['behaviors', 't1'], [])
    qc.setQueryData(['step-arrows', 't1'], [])
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <LadderEditor planId="plan1" patientId="p1" triggers={[soccer]} openSituationId="t1"
            onDone={() => {}} onArrow={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(screen.getByLabelText('A safety behavior')).toHaveAttribute(
      'placeholder', 'Soccer practice after school: something they do to feel safer')
  })
})

describe('the avoidance behavior', () => {
  // Dr. Walker, 2026-10-29: Float no longer offers "Avoids <situation>". A clinician types an
  // avoidance in their own words, like any other behavior. One already saved still shows.
  const school: TriggerSituation = {
    id: 't1', treatment_plan_id: 'plan1', name: 'Being dropped off at school', description: null,
    distress_thermometer_rating: 6, distress_thermometer_max: 10, situation_library_id: null,
    display_order: 0, is_active: true, created_at: '2026-10-29T00:00:00Z',
  }
  function openSituation(behaviors: unknown[]) {
    const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
    qc.setQueryData(['insights', 'p1', 'situation'], [])
    qc.setQueryData(['insights', 'p1', 'behavior'], [])
    qc.setQueryData(['plan-rungs', 'plan1'], [])
    qc.setQueryData(['behaviors', 't1'], behaviors)
    qc.setQueryData(['step-arrows', 't1'], [])
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <LadderEditor planId="plan1" patientId="p1" triggers={[school]} openSituationId="t1"
            onDone={() => {}} onArrow={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('is not offered as a suggestion', () => {
    openSituation([])
    expect(screen.queryByText(/^Avoids /)).toBeNull()
    expect(screen.queryByText(/suggested behaviors/)).toBeNull()
  })

  it('still shows one that was saved before', () => {
    openSituation([{
      id: 'b1', trigger_situation_id: 't1', name: 'Avoids being dropped off at school',
      behavior_type: 'avoidance', distress_thermometer_when_refraining: null, parent_behavior_id: null,
    }])
    expect(screen.getByText('Avoids being dropped off at school')).toBeInTheDocument()
  })
})
