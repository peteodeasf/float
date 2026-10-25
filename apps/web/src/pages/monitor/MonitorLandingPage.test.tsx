import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import axios from 'axios'
import MonitorLandingPage from './MonitorLandingPage'

vi.mock('axios')

// Why this exists: Peter, 2026-10-25 (issue #86). The monitoring form is only for monitoring now,
// so the welcome screen no longer asks the parent for permission to connect their child to the app.
describe('monitoring form welcome screen', () => {
  it('has no teen permission checkbox', async () => {
    vi.mocked(axios.get).mockResolvedValue({
      data: { id: 'f1', status: 'in_progress', patient_first_name: 'Minnie', practitioner_name: 'Dr. Lee', entries: [], notes: [] },
    })
    render(
      <MemoryRouter initialEntries={['/monitor/tok']}>
        <Routes><Route path="/monitor/:token" element={<MonitorLandingPage />} /></Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByRole('button', { name: 'Get started' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText(/I give permission/)).not.toBeInTheDocument()
  })
})
