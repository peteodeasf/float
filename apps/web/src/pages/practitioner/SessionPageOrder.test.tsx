import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import type { AvoidanceBehavior, TriggerSituation } from '../../api/treatment'

// A small stand-in for the backend: what is saved is what is read back, so a Fear Level change goes
// through the same save-then-refetch the real screen does.
const db = vi.hoisted(() => ({
  triggers: [] as TriggerSituation[],
  behaviors: [] as AvoidanceBehavior[],
}))
vi.mock('../../api/treatment', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/treatment')>()),
  getTreatmentPlan: async () => ({ id: 'plan-order', patient_id: 'p1', practitioner_id: 'c1', clinical_track: 'x', parent_visibility_level: 'x', status: 'active', created_at: '', updated_at: '' }),
  getTriggers: async () => db.triggers.map(t => ({ ...t })),
  updateTrigger: async (_plan: string, id: string, data: Partial<TriggerSituation>) => {
    db.triggers = db.triggers.map(t => (t.id === id ? { ...t, ...data } : t))
    return db.triggers.find(t => t.id === id)
  },
  getBehaviors: async () => db.behaviors.map(b => ({ ...b })),
  updateBehavior: async (_t: string, id: string, data: Partial<AvoidanceBehavior>) => {
    db.behaviors = db.behaviors.map(b => (b.id === id ? { ...b, ...data } : b))
    return db.behaviors.find(b => b.id === id)
  },
  getStepArrows: async () => [],
  getPlanRungs: async () => [],
  getPatientInsights: async () => [],
  getLadderReview: async () => ({ findings: [], ai_pending: false }),
}))

import { SessionInterview } from './SessionPage'
import { sortNextTime } from './ladderEditor'

// The shown order lives outside the component, so each test starts from a freshly opened editor.
beforeEach(() => sortNextTime())

const situation = (id: string, name: string, rating: number, order: number): TriggerSituation => ({
  id, treatment_plan_id: 'plan-order', name, description: null,
  distress_thermometer_rating: rating, distress_thermometer_max: 10, situation_library_id: null,
  display_order: order, is_active: true, created_at: '2026-10-24T00:00:00Z',
})
const behavior = (id: string, name: string, type: string, extra: Partial<AvoidanceBehavior> = {}): AvoidanceBehavior => ({
  id, trigger_situation_id: 't1', name, description: null, behavior_type: type,
  distress_thermometer_when_refraining: null, behavior_library_id: null, parent_behavior_id: null,
  created_at: '2026-10-24T00:00:00Z', ...extra,
})

function openEditor(opts: { openSituationId?: string } = {}) {
  const onExit = vi.fn()
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SessionInterview patientId="p1" embedded openSituationId={opts.openSituationId} onExit={onExit} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
  return { onExit, unmount: view.unmount }
}

/** The given texts, in the order they appear on the screen. */
function onScreenOrder(texts: string[]): string[] {
  return texts
    .map(t => ({ t, el: screen.getByText(t) }))
    .sort((a, b) => (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    .map(x => x.t)
}

const fearBoxes = () => screen.getAllByTitle('Fear Level, 1–10') as HTMLInputElement[]

describe('the situation list keeps its order while the editor is open', () => {
  beforeEach(() => {
    db.triggers = [
      situation('a', 'Ordering at a restaurant', 3, 0),
      situation('b', 'Raising a hand in class', 5, 1),
      situation('c', 'Sleeping at a friend’s house', 7, 2),
    ]
    db.behaviors = []
  })

  // Peter, 2026-10-24: a situation jumping to a new place the moment its Fear Level changes is
  // confusing, so it stays put while the editor is open. Save ladder, and opening the editor
  // again, sort it.
  it('does not move a situation whose Fear Level changes, and sorts after Save ladder', async () => {
    const names = db.triggers.map(t => t.name)
    const first = openEditor()
    await screen.findByText('Ordering at a restaurant')
    expect(onScreenOrder(names)).toEqual(names)

    // Restaurant goes from 3 to 9: highest now, but it stays at the top.
    fireEvent.change(fearBoxes()[0], { target: { value: '9' } })
    await waitFor(() => expect(fearBoxes()[0].value).toBe('9'))
    await waitFor(() => expect(db.triggers[0].distress_thermometer_rating).toBe(9))
    expect(onScreenOrder(names)).toEqual(names)

    fireEvent.click(screen.getByRole('button', { name: 'Save ladder' }))
    await waitFor(() => expect(first.onExit).toHaveBeenCalled())
    first.unmount()

    openEditor()
    await screen.findByText('Ordering at a restaurant')
    expect(onScreenOrder(names)).toEqual([names[1], names[2], names[0]])
  })
})

describe('the steps inside a situation keep their order until Done', () => {
  beforeEach(() => {
    db.triggers = [situation('t1', 'Raising a hand in class', 5, 0)]
    db.behaviors = [
      behavior('s1', 'Sits at the back', 'safety'),
      behavior('s2', 'Asks a friend to answer', 'safety'),
      behavior('c1', 'Raise a hand without sitting at the back', 'combination', { without_behavior_id: 's1', distress_thermometer_when_refraining: 3 }),
      behavior('c2', 'Raise a hand without a friend answering', 'combination', { without_behavior_id: 's2', distress_thermometer_when_refraining: 6 }),
    ]
  })

  const steps = ['Raise a hand without sitting at the back', 'Raise a hand without a friend answering']

  async function rescoreFirstStep() {
    openEditor({ openSituationId: 't1' })
    await screen.findByText(steps[0])
    expect(onScreenOrder(steps)).toEqual(steps)
    // The first box is the situation's own; the next is the first step's. 3 goes to 8.
    fireEvent.change(fearBoxes()[1], { target: { value: '8' } })
    await waitFor(() => expect(db.behaviors[2].distress_thermometer_when_refraining).toBe(8))
    await waitFor(() => expect(fearBoxes()[1].value).toBe('8'))
    // Highest now, but it stays where it was.
    expect(onScreenOrder(steps)).toEqual(steps)
  }

  // Peter, 2026-10-24: the same for behaviors and rungs — they re-sort when the clinician presses
  // Done, not as each Fear Level is typed. This is the Done that saves the behaviors.
  it('does not move a step whose Fear Level changes, and sorts after the behaviors Done', async () => {
    await rescoreFirstStep()
    fireEvent.click(screen.getByRole('button', { name: 'Add behavior' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(onScreenOrder(steps)).toEqual([steps[1], steps[0]]))
  })

  // The same, for the Done that closes Add rung.
  it('sorts the steps after the Add rung Done', async () => {
    await rescoreFirstStep()
    fireEvent.click(screen.getByRole('button', { name: 'Add rung' }))
    const panel = screen.getByLabelText('A rung').closest('div')!.parentElement!
    fireEvent.click(within(panel).getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(onScreenOrder(steps)).toEqual([steps[1], steps[0]]))
  })
})
