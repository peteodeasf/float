import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

import type { AvoidanceBehavior, DownwardArrow, TriggerSituation } from '../../../api/treatment'

// The ladder's rungs and the patient's arrows, as the server would return them. Each test sets them.
const db = vi.hoisted(() => ({ rungs: [] as AvoidanceBehavior[], arrows: [] as DownwardArrow[] }))
vi.mock('../../../api/treatment', async importOriginal => ({
  ...(await importOriginal<typeof import('../../../api/treatment')>()),
  getPlanRungs: async () => db.rungs.map(r => ({ ...r })),
  getPatientExperiments: async () => [],
  listPatientDownwardArrows: async () => db.arrows.map(a => ({ ...a })),
}))

import { FlatLadder } from './FlatLadder'

const SCHOOL: TriggerSituation = {
  id: 'school', treatment_plan_id: 'plan-1', name: 'Being dropped off at school', description: null,
  distress_thermometer_rating: 6, distress_thermometer_max: 10, situation_library_id: null,
  display_order: 0, is_active: true, created_at: '2026-11-02T00:00:00Z',
}
const rung = (id: string, name: string, type: string, situationId: string | null, fear: number): AvoidanceBehavior => ({
  id, trigger_situation_id: situationId, name, description: null, behavior_type: type,
  distress_thermometer_when_refraining: fear, behavior_library_id: null, parent_behavior_id: null,
  created_at: '2026-11-02T00:00:00Z',
})
const arrow = (rungId: string, fearedOutcome: string | null, facilitatedBy = 'practitioner'): DownwardArrow => ({
  id: `a-${rungId}`, trigger_situation_id: null, rung_id: rungId, arrow_steps: [],
  feared_outcome: fearedOutcome, feared_outcome_approved: false, bip_derived: null,
  facilitated_by: facilitatedBy, created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-02T00:00:00Z',
})

const COMBO_1 = rung('c1', 'Get dropped off without Mom walking in', 'combination', 'school', 4)
const COMBO_2 = rung('c2', 'Get dropped off without texting Mom', 'combination', 'school', 6)

/** Where the app went: the arrow page's address, if a button sent it there. */
function Where() {
  const loc = useLocation()
  return <div data-testid="where">{loc.pathname + loc.search}</div>
}

async function showLadder() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/patients/p1?tab=plan']}>
        <Routes>
          <Route path="/patients/:patientId" element={
            <FlatLadder planId="plan-1" patientId="p1" triggers={[SCHOOL]} ladderActive recommendedRungId={null} />
          } />
          <Route path="/patients/:patientId/arrow" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
  await screen.findByText(db.rungs[0].name)
}

const arrowButtons = () => screen.queryAllByRole('button', { name: /^Downward Arrow/ })

beforeEach(() => {
  db.rungs = [COMBO_1, COMBO_2]
  db.arrows = []
})

describe('the Downward Arrow button on the main ladder', () => {
  // Peter, 2026-11-02: the arrow moves from the ladder editor to the main ladder, one button on
  // each rung, inline just left of the Fear Level box.
  it('shows on each rung, immediately left of the Fear Level', async () => {
    await showLadder()
    const buttons = arrowButtons()
    expect(buttons).toHaveLength(2)
    for (const b of buttons) {
      expect(b).toHaveTextContent('Downward Arrow')
      expect(b.nextElementSibling).toHaveAttribute('title', 'Fear Level, 1–10')
    }
  })

  // It has to open the same arrow page the editor's DA did, on this rung and its situation —
  // the page reads both from the address.
  it('opens the arrow for that rung', async () => {
    await showLadder()
    fireEvent.click(arrowButtons()[1])
    expect(screen.getByTestId('where')).toHaveTextContent('/patients/p1/arrow?situation=school&rung=c2')
  })

  // Same rule for done as the editor's old ✓ DA: the clinician's arrow on this rung has a feared
  // outcome. One with no outcome yet, or one the parent did, does not count.
  it('shows ✓ when the arrow on that rung is done', async () => {
    db.arrows = [arrow('c1', 'Everyone will see me cry.'), arrow('c2', 'They will laugh.', 'parent')]
    await showLadder()
    expect(await screen.findByRole('button', { name: 'Downward Arrow ✓' })).toBeInTheDocument()
    const [first, second] = arrowButtons()
    expect(first).toHaveTextContent('Downward Arrow ✓')
    expect(second).toHaveTextContent(/^Downward Arrow$/)
  })

  // The server opens an arrow only on a combination, and the arrow page needs the situation. So
  // an easier version, or a rung with no situation, has nothing to open and gets no button.
  it('does not show on a rung the arrow cannot open on', async () => {
    db.rungs = [
      COMBO_1,
      rung('s1', 'Get dropped off one block away', 'scenario', 'school', 3),
      rung('n1', 'Walk in alone', 'combination', null, 5),
    ]
    await showLadder()
    expect(arrowButtons()).toHaveLength(1)
  })
})
