import { describe, it, expect } from 'vitest'
import { whatsDone } from './setupQuestions'

describe('whatsDone', () => {
  it('set up in session with the day left for home: everything but when', () => {
    expect(whatsDone({
      scheduled_date: null, scheduled_time_bucket: null, prediction: "He'll think I'm weird",
      bip_before: 70, distress_thermometer_expected: 6, confidence_level: 'medium',
    })).toEqual({ fear: true, believe: true, level: true, ready: true, when: false })
  })

  it('the older date-only plan counts nothing, though it carries a readiness', () => {
    expect(whatsDone({
      scheduled_date: '2026-09-11T12:00:00Z', scheduled_time_bucket: null, prediction: null,
      bip_before: null, distress_thermometer_expected: null, confidence_level: 'medium',
    })).toEqual({ fear: false, believe: false, level: false, ready: false, when: false })
  })

  it('when needs both the day and the time of day', () => {
    expect(whatsDone({ scheduled_date: '2026-09-11T09:00:00Z', scheduled_time_bucket: 'morning' }).when).toBe(true)
  })

  it('a blank fear is not an answer', () => {
    expect(whatsDone({ scheduled_date: null, prediction: '   ', bip_before: 50 }).believe).toBe(false)
  })
})
