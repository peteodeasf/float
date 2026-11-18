import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MonitoringLog from './MonitoringLog'
import type { MonitoringReport } from '../../api/monitoring'

const entry = (id: string, over: object = {}) => ({
  id, entry_date: '2026-11-18', situation: 'Getting ready for school',
  child_behavior_observed: 'Dragged his heels', parent_response: 'Drove him', fear_thermometer: 7,
  recipient_label: 'Parent 1', ...over,
})

const report: MonitoringReport = {
  patient_id: 'p1', patient_name: 'Test Child', total_entries: 2,
  date_range: { from: '2026-11-13', to: '2026-11-18', days: 6 }, dt_range: { min: 7, max: 7 }, average_dt: 7,
  top_situations_by_frequency: [], top_situations_by_distress: [], parent_response_themes: [],
  entries: [entry('e1'), entry('e2', { situation: null, child_behavior_observed: null, parent_response: null, fear_thermometer: null })],
}

// Peter, 2026-11-18: the log was "a bit bland". A summary on top, clinician-facing column names,
// and an entry with nothing in it says so instead of a row of dashes.
describe('the monitoring log', () => {
  it('shows the summary and names the columns for the clinician', () => {
    render(<MonitoringLog report={report} />)
    expect(screen.getByText('Average Fear Level')).toBeInTheDocument()
    expect(screen.getByText('6 days', { exact: false })).toBeInTheDocument()
    expect(screen.getByText('What the child did')).toBeInTheDocument()
    expect(screen.getByText('How the parent responded')).toBeInTheDocument()
    expect(screen.queryByText('What I observed about my child')).toBeNull()
  })

  it('says when nothing was filled in', () => {
    render(<MonitoringLog report={report} />)
    expect(screen.getByText(/Nothing was filled in for this one/)).toBeInTheDocument()
  })
})
