import { afterEach, describe, it, expect, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import { LadderEditor } from './SessionPage'
import { forgetHeldOrders } from './ladderEditor'
import type { AvoidanceBehavior, TriggerSituation } from '../../api/treatment'

// Done and Save ladder re-read what is saved. These hand back whatever the test has set up.
const api = vi.hoisted(() => ({ behaviors: [] as unknown[] }))
vi.mock('../../api/treatment', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/treatment')>()),
  getBehaviors: vi.fn(async () => api.behaviors),
  getPatientInsights: vi.fn(async () => []),
  updateTrigger: vi.fn(async () => ({})),
  // One finding, so Save ladder keeps the editor open and the list can be seen.
  getLadderReview: vi.fn(async () => ({ findings: [{ code: 'x', message: 'The ladder starts high.' }] })),
}))

// The editor's held order outlives the screen, on purpose. Each test starts from none.
afterEach(() => forgetHeldOrders('plan1'))

function situation(id: string, name: string, fear: number | null, order = 0): TriggerSituation {
  return {
    id, treatment_plan_id: 'plan1', name, description: null, distress_thermometer_rating: fear,
    distress_thermometer_max: 10, situation_library_id: null, display_order: order, is_active: true,
    created_at: '2026-10-24T00:00:00Z',
  }
}

function behavior(id: string, name: string, type: string, fear: number | null,
  without: string | null = null): AvoidanceBehavior {
  return {
    id, trigger_situation_id: 't1', name, description: null, behavior_type: type,
    distress_thermometer_when_refraining: fear, behavior_library_id: null, parent_behavior_id: null,
    without_behavior_id: without, created_at: '2026-10-24T00:00:00Z',
  }
}

/** A client with everything the editor reads already in it. `behaviors` are those of situation t1. */
function editorClient(behaviors: AvoidanceBehavior[] = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['insights', 'p1', 'situation'], [])
  qc.setQueryData(['insights', 'p1', 'behavior'], [])
  qc.setQueryData(['behaviors', 't1'], behaviors)
  qc.setQueryData(['step-arrows', 't1'], [])
  return qc
}

/** The editor, as an element so a test can render it again with new situations. */
function editor(qc: QueryClient, triggers: TriggerSituation[], openSituationId?: string) {
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LadderEditor planId="plan1" patientId="p1" triggers={triggers} openSituationId={openSituationId}
          onDone={() => {}} onArrow={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

/** The names, in the order they appear on screen. */
function shownOrder(...names: string[]) {
  const text = document.body.textContent ?? ''
  for (const n of names) expect(text).toContain(n)
  return [...names].sort((a, b) => text.indexOf(a) - text.indexOf(b))
}

/** The Fear Level boxes, top to bottom: the situation's, then its steps'. */
const fearLevels = () => screen.getAllByRole('spinbutton').map(b => (b as HTMLInputElement).value)

describe('adding a trigger situation', () => {
  // Issue #50: Peter asked for the hint in the box to read "Add a trigger situation", the name
  // the screen's own question uses, not "Add a situation the child finds hard".
  it('hints "Add a trigger situation"', () => {
    render(editor(editorClient(), []))
    fireEvent.click(screen.getByRole('button', { name: 'Add situation' }))
    expect(screen.getByLabelText('A situation')).toHaveAttribute('placeholder', 'Add a trigger situation')
  })
})

describe('the hint for adding a behavior', () => {
  // Issue #77: the hint was always about sitting at the back of a classroom, even under "Soccer
  // practice after school". Peter asked for it to fit the situation it sits under.
  it('names the situation, not a classroom', () => {
    render(editor(editorClient(), [situation('t1', 'Soccer practice after school', 5)], 't1'))
    expect(screen.getByLabelText('A safety behavior')).toHaveAttribute(
      'placeholder', 'Soccer practice after school: something they do to feel safer')
  })
})

describe('the situation list while the editor is open', () => {
  const school = situation('t1', 'Walking into school', 3, 0)
  const lunch = situation('t2', 'Eating lunch in the cafeteria', 5, 1)
  const party = situation('t3', 'Going to a birthday party', 7, 2)
  const shown = () => shownOrder(party.name, school.name, lunch.name)

  // Peter, 2026-10-24: a situation jumping to a new place the moment its Fear Level changed was
  // confusing. It stays where it is until Save ladder, which sorts the list.
  it('keeps a situation in place when its Fear Level changes, and sorts on Save ladder', async () => {
    const qc = editorClient()
    const { rerender } = render(editor(qc, [school, lunch, party]))
    expect(shown()).toEqual([school.name, lunch.name, party.name])

    // Lunch from 5 to 1, typed in its box, and the saved score coming back.
    fireEvent.change(screen.getAllByRole('spinbutton')[1], { target: { value: '1' } })
    await act(async () => {}) // the save finishing
    rerender(editor(qc, [school, { ...lunch, distress_thermometer_rating: 1 }, party]))
    expect(shown()).toEqual([school.name, lunch.name, party.name])

    fireEvent.click(screen.getByRole('button', { name: 'Save ladder' }))
    await screen.findByText('The ladder starts high.')
    expect(shown()).toEqual([lunch.name, school.name, party.name])
  })

  // A new situation goes at the end, whatever its Fear Level, so the clinician can see it arrive.
  it('puts a new situation at the end', () => {
    const qc = editorClient()
    const { rerender } = render(editor(qc, [school, party]))
    rerender(editor(qc, [school, party, lunch]))
    expect(shown()).toEqual([school.name, party.name, lunch.name])
  })

  // Full screen and inline are two screens. Going between them must not re-sort the list. Once the
  // editor is closed (the Plan tab shows the ladder and forgets the order), it opens sorted.
  it('keeps the order across full screen, and is sorted when opened again', () => {
    const changed = [school, { ...lunch, distress_thermometer_rating: 1 }, party]
    const inline = render(editor(editorClient(), [school, lunch, party]))
    inline.rerender(editor(editorClient(), changed))
    inline.unmount()

    const fullScreen = render(editor(editorClient(), changed))
    expect(shown()).toEqual([school.name, lunch.name, party.name])
    fullScreen.unmount()

    forgetHeldOrders('plan1')
    render(editor(editorClient(), changed))
    expect(shown()).toEqual([lunch.name, school.name, party.name])
  })

  // Peter, 2026-10-24: remove the "Start here" text from the situation list.
  it('has no "Start here" label', () => {
    render(editor(editorClient(), [school, lunch, party]))
    expect(screen.queryByText('Start here')).toBeNull()
  })
})

describe('the steps inside a situation while it is open', () => {
  const school = situation('t1', 'Walking into school', 3)

  // Peter, 2026-10-24: "similar with adding behaviors and rungs, we should re-order when user hits
  // Done". A step whose Fear Level changes stays put until Done, the one that saves the behaviors.
  it('keeps a step in place when its Fear Level changes, and sorts on Done', async () => {
    const mom = behavior('b1', 'Holds mom\'s hand', 'safety', null)
    const phone = behavior('b2', 'Checks her phone', 'safety', null)
    const withoutMom = behavior('s1', 'Walk in without holding mom\'s hand', 'combination', 3, 'b1')
    const withoutPhone = behavior('s2', 'Walk in without checking her phone', 'combination', 6, 'b2')
    const shown = () => shownOrder(withoutPhone.name, withoutMom.name)
    const qc = editorClient([mom, phone, withoutMom, withoutPhone])
    render(editor(qc, [school], 't1'))
    expect(shown()).toEqual([withoutMom.name, withoutPhone.name])

    const changed = [mom, phone, withoutMom, { ...withoutPhone, distress_thermometer_when_refraining: 1 }]
    api.behaviors = changed
    act(() => { qc.setQueryData(['behaviors', 't1'], changed) })
    // React Query passes the change on a moment later. Wait for it, or "did not move" proves nothing.
    await waitFor(() => expect(fearLevels()).toEqual(['3', '3', '1']))
    expect(shown()).toEqual([withoutMom.name, withoutPhone.name])

    fireEvent.click(screen.getByRole('button', { name: 'Add behavior' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(shown()).toEqual([withoutPhone.name, withoutMom.name]))
  })

  // Avoidance is not a rung, so it stays at the bottom even while the rest hold their places.
  it('keeps avoidance last when a behavior is added after it', async () => {
    const stays = behavior('a1', 'Stays home from school', 'avoidance', null)
    const step = behavior('s1', 'Walk in without holding mom\'s hand', 'combination', 3, 'b1')
    const mom = behavior('b1', 'Holds mom\'s hand', 'safety', null)
    const phone = behavior('b2', 'Checks her phone', 'safety', null)
    const qc = editorClient([mom, step, stays])
    render(editor(qc, [school], 't1'))
    expect(shownOrder(stays.name, step.name)).toEqual([step.name, stays.name])

    fireEvent.click(screen.getByRole('button', { name: 'Add behavior' }))
    act(() => { qc.setQueryData(['behaviors', 't1'], [mom, phone, step, stays]) })
    await waitFor(() => expect(document.body.textContent).toContain(phone.name))
    expect(shownOrder(stays.name, step.name, phone.name)).toEqual([step.name, phone.name, stays.name])
  })

  // The same for rungs: a rung stays put while you add and score, including across full screen,
  // and Done on Add rung sorts them.
  it('keeps a rung in place when its Fear Level changes, and sorts on Done in Add rung', async () => {
    const withMom = behavior('r1', 'Walk in with mom', 'scenario', 3)
    const alone = behavior('r2', 'Walk in alone', 'scenario', 6)
    const shown = () => shownOrder(alone.name, withMom.name)
    const qc = editorClient([withMom, alone])
    const inline = render(editor(qc, [school], 't1'))

    fireEvent.click(screen.getByRole('button', { name: 'Add rung' }))
    act(() => { qc.setQueryData(['behaviors', 't1'], [withMom, { ...alone, distress_thermometer_when_refraining: 1 }]) })
    await waitFor(() => expect(fearLevels()).toEqual(['3', '3', '1']))
    expect(shown()).toEqual([withMom.name, alone.name])

    inline.unmount()
    render(editor(qc, [school], 't1'))
    expect(shown()).toEqual([withMom.name, alone.name])

    api.behaviors = [withMom, { ...alone, distress_thermometer_when_refraining: 1 }]
    fireEvent.click(screen.getByRole('button', { name: 'Add rung' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(shown()).toEqual([alone.name, withMom.name]))
  })
})
