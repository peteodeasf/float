import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { AvoidanceBehavior, TriggerSituation } from '../../../api/treatment'

// The ladder's rungs, read by the component through getPlanRungs. Each test sets them.
const db = vi.hoisted(() => ({ rungs: [] as AvoidanceBehavior[] }))
vi.mock('../../../api/treatment', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/treatment')>()),
  getPlanRungs: async () => db.rungs.map(r => ({ ...r })),
  getPatientExperiments: async () => [],
}))

import { FlatLadder } from './FlatLadder'

const situation = (id: string, name: string, rating: number | null, order: number): TriggerSituation => ({
  id, treatment_plan_id: 'plan-1', name, description: null,
  distress_thermometer_rating: rating, distress_thermometer_max: 10, situation_library_id: null,
  display_order: order, is_active: true, created_at: '2026-10-26T00:00:00Z',
})
const rung = (id: string, name: string, situationId: string | null, fear: number): AvoidanceBehavior => ({
  id, trigger_situation_id: situationId, name, description: null, behavior_type: 'avoidance',
  distress_thermometer_when_refraining: fear, behavior_library_id: null, parent_behavior_id: null,
  created_at: '2026-10-26T00:00:00Z',
})

// Listed out of Fear Level order on purpose, so the tests show the chips are sorted.
const TRIGGERS = [
  situation('sleep', 'Sleeping at a friend’s house', 7, 0),
  situation('hand', 'Raising a hand in class', 5, 1),
  situation('order', 'Ordering at a restaurant', 3, 2),
]
const RUNGS = [
  rung('r1', 'Say hi to the server', 'order', 2),
  rung('r2', 'Ask a question after class', 'hand', 3),
  rung('r3', 'Order a drink', 'order', 4),
  rung('r4', 'Answer one question in class', 'hand', 6),
  rung('r5', 'Stay until bedtime', 'sleep', 7),
]

const ALL_RUNGS = RUNGS.map(r => r.name)

/** Renders the ladder and waits for its rungs (or its empty line) to arrive. */
async function showLadder(patientId = 'p1') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(
    <QueryClientProvider client={qc}>
      <FlatLadder planId="plan-1" patientId={patientId} triggers={TRIGGERS} ladderActive recommendedRungId={null} />
    </QueryClientProvider>,
  )
  await screen.findByRole('group', { name: 'Filter by situation' })
  return view
}

const chips = () => within(screen.getByRole('group', { name: 'Filter by situation' }))
const tap = (name: string) => fireEvent.click(chips().getByRole('button', { name }))
const isOn = (name: string) => chips().getByRole('button', { name }).getAttribute('aria-pressed') === 'true'
/** The rung names on screen, top to bottom. */
const shownRungs = () => (screen.getAllByTitle('Change the wording') as HTMLElement[]).map(b => b.textContent)

beforeEach(() => {
  window.localStorage.clear()
  db.rungs = RUNGS
})

describe('filtering the ladder by situation', () => {
  // The chips follow the ladder editor's order, lowest Fear Level first, after All.
  it('lists All, then the situations easiest first', async () => {
    await showLadder()
    expect(chips().getAllByRole('button').map(b => b.textContent)).toEqual([
      'All', 'Ordering at a restaurant', 'Raising a hand in class', 'Sleeping at a friend’s house',
    ])
    expect(isOn('All')).toBe(true)
  })

  // The ask: pick one situation and see only its rungs.
  it('one situation shows only its rungs', async () => {
    await showLadder()
    tap('Ordering at a restaurant')
    expect(shownRungs()).toEqual(['Say hi to the server', 'Order a drink'])
    expect(isOn('All')).toBe(false)
  })

  // Multi-select: two situations show the rungs of both, and the list is still easiest first
  // across them rather than grouped by situation.
  it('two situations show both, still easiest first', async () => {
    await showLadder()
    tap('Ordering at a restaurant')
    tap('Raising a hand in class')
    expect(shownRungs()).toEqual([
      'Say hi to the server', 'Ask a question after class', 'Order a drink', 'Answer one question in class',
    ])
  })

  // All is the way back from any selection.
  it('All shows everything again', async () => {
    await showLadder()
    tap('Ordering at a restaurant')
    tap('Sleeping at a friend’s house')
    tap('All')
    expect(shownRungs()).toEqual(ALL_RUNGS)
    expect(isOn('All')).toBe(true)
  })

  // Tapping a selected chip deselects it. With nothing left selected, the list must not go empty:
  // All is on and every rung shows.
  it('deselecting the last situation returns to All', async () => {
    await showLadder()
    tap('Raising a hand in class')
    tap('Raising a hand in class')
    expect(shownRungs()).toEqual(ALL_RUNGS)
    expect(isOn('All')).toBe(true)
  })

  // Remembered per patient: coming back to this patient keeps the selection, and another
  // patient's ladder is not filtered by it.
  it('remembers the selection for that patient only', async () => {
    const first = await showLadder('p1')
    tap('Sleeping at a friend’s house')
    first.unmount()

    const other = await showLadder('p2')
    expect(shownRungs()).toEqual(ALL_RUNGS)
    other.unmount()

    await showLadder('p1')
    expect(shownRungs()).toEqual(['Stay until bedtime'])
    expect(isOn('Sleeping at a friend’s house')).toBe(true)
  })

  // A remembered situation that has since been deleted must not leave the list filtered to nothing.
  it('ignores a remembered situation that no longer exists', async () => {
    window.localStorage.setItem('float.ladder.situations.p1', JSON.stringify(['gone']))
    await showLadder()
    expect(shownRungs()).toEqual(ALL_RUNGS)
    expect(isOn('All')).toBe(true)
  })

  // A situation whose rungs were all removed keeps its chip while selected, and the list says
  // plainly that there is nothing to show, with a way back to All.
  it('says so when the selection has no rungs, with a way back', async () => {
    window.localStorage.setItem('float.ladder.situations.p1', JSON.stringify(['sleep']))
    db.rungs = RUNGS.filter(r => r.trigger_situation_id !== 'sleep')
    await showLadder()
    expect(screen.queryAllByTitle('Change the wording')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Show all' }))
    expect(shownRungs()).toEqual(db.rungs.map(r => r.name))
  })
})
