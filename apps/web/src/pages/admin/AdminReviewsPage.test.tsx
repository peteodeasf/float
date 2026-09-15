import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RoundResults, rowsOf } from './AdminReviewsPage'

const round = {
  id: 'r1', slug: 'extraction-samples-1', title: 'Check the AI’s reading',
  reviewers: [{ id: 'v1', name: 'Dr. Walker', last_seen_at: '2026-09-16T10:00:00Z' }, { id: 'v2', name: 'Peter', last_seen_at: null }],
  items: [{
    key: 's01', situation: 'Swim team',
    log: [{ situation: 'Swim practice', fear: 7, child: 'Climbed out after two laps.', parent: 'Told the coach.' }],
    rows: [
      { id: 's1b1', text: 'Climbed out after two laps', detail: 'the AI said: safety', proposed: 'safety',
        options: [{ v: 'safety', label: 'Safety' }, { v: 'escape', label: 'Escape' }] },
      { id: 's1a1', text: 'Told the coach he was unwell', options: [{ v: 'right', label: 'Right' }, { v: 'wrong', label: 'Wrong' }] },
    ],
  }],
  marks: { v1: { 's01:s1b1': 'escape', 's01:s1a1': 'right' }, v2: {} },
  additions: { v1: { s01: ['Sat on the bench'] }, v2: {} },
  comments: { v1: { s01: 'Leaving part-way is escape.' }, v2: {} },
}

describe('review results', () => {
  it('shows each reviewer’s choice, additions and comments', () => {
    render(<RoundResults round={round} onBack={() => {}} />)
    expect(screen.getByText('Escape')).toBeInTheDocument()
    expect(screen.getByText('Right')).toBeInTheDocument()
    expect(screen.getByText('+ Sat on the bench')).toBeInTheDocument()
    expect(screen.getByText('Leaving part-way is escape.')).toBeInTheDocument()
    // Peter has marked nothing
    expect(screen.getAllByText('—')).toHaveLength(2)
  })

  it('reads sub-situation rounds the same way', () => {
    expect(rowsOf({ key: 'k', situation: 'x', suggestions: ['a', 'b'] }).map(r => `${r.id}:${r.options[0].v}`)).toEqual(['0:show', '1:show'])
  })
})
