import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { WALKTHROUGHS } from '../../lib/walkthroughs'

// No backend here: every request answers "nothing", except the lists these tabs read, which
// answer an empty list. The page's own data is seeded below.
vi.mock('../../api/client', async importOriginal => {
  const real = await importOriginal<typeof import('../../api/client')>()
  const get = vi.fn(async (url: string) => ({ data: /\/(parents|accommodations|recordings|session-notes|notes)$/.test(url) ? [] : null }))
  const empty = vi.fn(async () => ({ data: null }))
  return { ...real, apiClient: { get, post: empty, put: empty, patch: empty, delete: empty } }
})
vi.mock('../../components/ui/PractitionerNav', () => ({ default: () => null }))

import PatientPage from './PatientPage'

// jsdom lays nothing out, so every element would look hidden to "Show me".
beforeAll(() => {
  Element.prototype.getClientRects = function () { return [{}] as unknown as DOMRectList }
})

function openTab(tab: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['patient', 'pt1'], { id: 'pt1', name: 'Sam Rivera', closed_at: null })
  qc.setQueryData(['plan', 'pt1'], { id: 'plan1', patient_id: 'pt1', status: 'setup', nickname: null })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/patients/pt1?tab=${tab}`]}>
        <Routes><Route path="/patients/:patientId" element={<PatientPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const panel = () => screen.getByRole('dialog', { hidden: true })

// docs/plans/how-this-works.md
// The whole patient page renders here, which can pass 5 seconds when every test file runs at once.
describe('How this works', { timeout: 20000 }, () => {
  it('opens the walkthrough for the tab you are on', async () => {
    openTab('sessions')
    fireEvent.click(await screen.findByRole('button', { name: 'How this works' }))
    expect(panel().getAttribute('aria-label')).toBe('How session notes work')
  })

  it('follows Ladder / Accommodations on the Plan tab', async () => {
    openTab('plan')
    fireEvent.click(await screen.findByRole('button', { name: 'Accommodations' }))
    fireEvent.click(screen.getByRole('button', { name: 'How this works' }))
    expect(panel().getAttribute('aria-label')).toBe('How accommodations work')
  })

  it('switches the same panel to the guide, and the Guide button never opens a walkthrough', async () => {
    openTab('plan')
    fireEvent.click(await screen.findByRole('button', { name: 'How this works' }))
    expect(panel().getAttribute('aria-label')).toBe('How the ladder works')
    fireEvent.click(within(panel()).getByRole('button', { name: /Open the guide for Sam/ }))
    expect(panel().getAttribute('aria-label')).toBe('Guide')
    expect(screen.getAllByRole('dialog', { hidden: true })).toHaveLength(1)
  })

  it('shows Show me only for a control that is on the screen, and pulses it', async () => {
    openTab('sessions')
    fireEvent.click(await screen.findByRole('button', { name: 'How this works' }))
    const shows = within(panel()).getAllByRole('button', { name: 'Show me' })
    // + Add note and Record session are on the Sessions tab; Transcript and Approve note only
    // appear on a recorded note, and Stop and save is on another page.
    expect(shows).toHaveLength(2)
    fireEvent.click(shows[0])
    const addNote = screen.getAllByRole('button', { name: '+ Add note' }).find(b => !panel().contains(b))!
    expect(addNote.classList.contains('float-show-me')).toBe(true)
  })
})

describe('Walkthrough steps', () => {
  it('each name a control that is marked in the app', async () => {
    // Every Show me points at a data-walkthrough="<name>" somewhere in the source.
    const sources = import.meta.glob(['../../**/*.tsx', '!../../**/*.test.tsx'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    const all = Object.values(sources).join('\n')
    const names = Object.values(WALKTHROUGHS).flatMap(w => w.steps.map(s => s.show)).filter(Boolean) as string[]
    const missing = names.filter(n => !new RegExp(`data-walkthrough=[^\\n]*["']${n}["']`).test(all))
    expect(missing).toEqual([])
  })
})
