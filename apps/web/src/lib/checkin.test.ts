import { describe, it, expect } from 'vitest'
import { weekStartOf, weekLabel } from './checkin'

describe('the week a check-in is for', () => {
  it('runs Monday to Sunday', () => {
    expect(weekStartOf(new Date(2026, 8, 7, 8))).toBe('2026-09-07') // Monday
    expect(weekStartOf(new Date(2026, 8, 10, 23))).toBe('2026-09-07') // Thursday night
    expect(weekStartOf(new Date(2026, 8, 13, 23, 59))).toBe('2026-09-07') // Sunday, last minute
    expect(weekStartOf(new Date(2026, 8, 14, 0, 1))).toBe('2026-09-14') // next Monday
  })

  it('crosses a month', () => {
    expect(weekStartOf(new Date(2026, 9, 2))).toBe('2026-09-28')
  })

  it('reads as the week of its Monday', () => {
    expect(weekLabel('2026-09-07')).toBe('Week of Sep 7')
  })
})
