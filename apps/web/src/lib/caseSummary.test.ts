import { describe, it, expect } from 'vitest'
import { mergeCaseSummary } from './caseSummary'
import type { PreliminaryReport } from '../api/monitoring'

const MONITORING: PreliminaryReport = {
  situations: [{ name: 'Bedtime / sleeping alone', fear_thermometer: 6 }],
  parental_responses: ["Lets her sleep in the parents' room"],
  safety_behaviors: ['Asks a parent to stay until she falls asleep'],
  safety_section_label: 'Safety & avoidance behaviors',
  treatment_targets: ['Bedtime / sleeping alone'],
  generated_at: '2026-10-14T12:00:00Z',
}

const SESSION = {
  session_note_id: 'n1', session_date: '2026-10-15', analyzed_at: '2026-10-21T12:00:00Z',
  situations: [{ name: 'Answering a question in class', fear_thermometer: 3 }, { name: 'Ordering at a cafe', fear_thermometer: null }],
  parental_responses: ['Emails the teacher'],
  safety_behaviors: [],
  comments: [
    { about: 'bedtime / sleeping alone.', note: 'Went well all week.' },
    { about: 'Something no longer in the summary', note: 'Check this.' },
  ],
  notes: ['Wants to try one question next week.'],
}

describe('mergeCaseSummary', () => {
  // Peter, 2026-10-21: a session updates the summary, never overwrites it. Monitoring's items stay,
  // unmarked, and the session's are added marked with the session they came from.
  it('keeps monitoring items and adds session items marked with their session', () => {
    const s = mergeCaseSummary({ ...MONITORING, session_additions: [SESSION] })
    expect(s.parentalResponses.map(i => [i.text, i.from])).toEqual([
      ["Lets her sleep in the parents' room", undefined],
      ['Emails the teacher', 'from session, Oct 15'],
    ])
    expect(s.safetyBehaviors.map(i => i.text)).toEqual(['Asks a parent to stay until she falls asleep'])
    expect(s.notes[0]).toMatchObject({ text: 'Wants to try one question next week.', from: 'from session, Oct 15' })
  })

  // Situations stay in Fear Level order with the session's merged in; one with no number goes last
  // rather than being read as zero.
  it('orders situations by Fear Level, with no number last', () => {
    const s = mergeCaseSummary({ ...MONITORING, session_additions: [SESSION] })
    expect(s.situations.map(i => i.text)).toEqual([
      'Answering a question in class', 'Bedtime / sleeping alone', 'Ordering at a cafe',
    ])
  })

  // A session that suggests an existing item is wrong adds a note under it, matched loosely on the
  // wording, and never removes it. A comment whose item is gone is kept as a note, not dropped.
  it('puts a comment under its item, or keeps it as a note', () => {
    const s = mergeCaseSummary({ ...MONITORING, session_additions: [SESSION] })
    expect(s.situations.find(i => i.text === 'Bedtime / sleeping alone')!.comments).toEqual([
      { note: 'Went well all week.', from: 'from session, Oct 15' },
    ])
    expect(s.notes.map(i => i.text)).toContain('About “Something no longer in the summary”: Check this.')
  })

  // A later session can comment on an earlier session's note (seen on demo data, 2026-10-21). It
  // sits under that note rather than appearing as a separate "About ..." line.
  it('puts a comment on an earlier note under that note', () => {
    const later = { ...SESSION, session_note_id: 'n2', session_date: '2026-10-22', situations: [], parental_responses: [], notes: [],
      comments: [{ about: 'Wants to try one question next week.', note: 'She did.' }] }
    const s = mergeCaseSummary({ ...MONITORING, session_additions: [SESSION, later] })
    expect(s.notes.find(i => i.text === 'Wants to try one question next week.')!.comments).toEqual([
      { note: 'She did.', from: 'from session, Oct 22' },
    ])
  })

  // A summary built from sessions only has empty monitoring sections.
  it('works with sessions and no monitoring analysis', () => {
    const s = mergeCaseSummary({
      situations: [], parental_responses: [], safety_behaviors: [], treatment_targets: [],
      safety_section_label: 'Safety & avoidance behaviors', session_additions: [SESSION],
    })
    expect(s.situations).toHaveLength(2)
    expect(s.treatmentTargets).toEqual([])
  })
})
