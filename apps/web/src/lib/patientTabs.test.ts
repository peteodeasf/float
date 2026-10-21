import { describe, it, expect } from 'vitest'
import { tabFromParam } from './patientTabs'

// The Exposures tab became Progress (Peter, 2026-10-21). Links saved before the rename say
// ?tab=experiments, and must still land on it rather than falling back to Monitoring.
describe('which tab a ?tab= value opens', () => {
  it('opens Progress from the new value', () => {
    expect(tabFromParam('progress')).toBe('progress')
  })

  it('opens Progress from an old Exposures link', () => {
    expect(tabFromParam('experiments')).toBe('progress')
  })

  it('opens the other tabs by name', () => {
    expect(tabFromParam('plan')).toBe('plan')
    expect(tabFromParam('chat')).toBe('chat')
  })

  it('opens nothing for a missing or unknown value', () => {
    expect(tabFromParam(null)).toBeNull()
    expect(tabFromParam('exposures')).toBeNull()
  })
})
