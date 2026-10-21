import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const notes = vi.hoisted(() => ({ updateSessionNote: vi.fn() }))
vi.mock('../../api/session_notes', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/session_notes')>()), updateSessionNote: notes.updateSessionNote,
}))
const recs = vi.hoisted(() => ({ retryRecording: vi.fn(), discardRecording: vi.fn(), listRecordings: vi.fn() }))
vi.mock('../../api/sessionRecordings', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/sessionRecordings')>()), ...recs,
}))

import { RecordedNoteDetails, RecordingsInProgress } from './RecordedNoteParts'
import type { SessionNote } from '../../api/session_notes'

const note: SessionNote = {
  id: 'n1', patient_id: 'pt1', organization_id: 'o1', practitioner_id: 'pr1', session_type: null,
  participants: ['patient', 'parent'], tags: ['Weekly'], session_date: '2026-09-15', content: 'What was covered\nBedtime.',
  is_draft: true, source: 'recording', created_at: '', updated_at: '',
  transcript: [{ speaker: '1:1', text: 'How did bedtime go?' }, { speaker: '1:2', text: 'It was an eight.' }],
  speaker_names: { '1:1': 'Clinician', '1:2': 'Speaker 2' },
}

function wrap(ui: React.ReactNode, seed?: (qc: QueryClient) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  seed?.(qc)
  render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

beforeEach(() => {
  notes.updateSessionNote.mockReset().mockResolvedValue({})
  Object.values(recs).forEach(f => f.mockReset().mockResolvedValue(undefined))
})

describe('a note from a recording', () => {
  it('shows the transcript with the speakers named, and a speaker can be renamed', async () => {
    wrap(<RecordedNoteDetails note={note} patientId="pt1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Transcript' }))
    expect(screen.getByText('Clinician:')).toBeInTheDocument()
    expect(screen.getByText('Speaker 2:')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Speaker 2 ✎' }))
    fireEvent.click(screen.getByRole('button', { name: 'Child' }))
    await waitFor(() => expect(notes.updateSessionNote).toHaveBeenCalledWith('n1', { speaker_names: { '1:2': 'Child' } }))
  })

  // Issue #57: Peter could not tell whether he was still changing a speaker, because every label
  // looked the same. The open speaker must say so, ask the question, and be closable without saving.
  it('changing a speaker is clearly open, names who is being changed, and Cancel leaves it as it was', () => {
    wrap(<RecordedNoteDetails note={note} patientId="pt1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Transcript' }))
    const speaker = screen.getByRole('button', { name: 'Speaker 2 ✎' })
    expect(speaker).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    fireEvent.click(speaker)
    expect(screen.getByRole('group', { name: 'Who is Speaker 2?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Speaker 2 ▴' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(notes.updateSessionNote).not.toHaveBeenCalled()
  })

  // Issue #57: the speaker's current name is marked, so it is clear what it is now; choosing it again
  // just closes rather than saving the same thing.
  it('marks the current name, and choosing it again closes without saving', () => {
    wrap(<RecordedNoteDetails note={note} patientId="pt1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Transcript' }))
    fireEvent.click(screen.getByRole('button', { name: 'Clinician ✎' }))
    const current = screen.getByRole('button', { name: 'Clinician ✓' })
    expect(current).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Child' })).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(current)
    expect(screen.queryByRole('group')).not.toBeInTheDocument()
    expect(notes.updateSessionNote).not.toHaveBeenCalled()
  })

  // Issue #57: the transcript lines take the speaker's color, so a rename visibly changes whose lines
  // are whose. A child and an unnamed speaker must not look the same.
  it('colors transcript names by who is speaking', () => {
    wrap(<RecordedNoteDetails note={{ ...note, speaker_names: { '1:1': 'Child', '1:2': 'Speaker 2' } }} patientId="pt1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Transcript' }))
    expect(screen.getByText('Child:').style.color).toBe('var(--float-accent-purple-text)')
    expect(screen.getByText('Speaker 2:').style.color).toBe('var(--float-text-secondary)')
  })

  it('a draft can be approved', async () => {
    wrap(<RecordedNoteDetails note={note} patientId="pt1" />)
    fireEvent.click(screen.getByRole('button', { name: 'Approve note' }))
    await waitFor(() => expect(notes.updateSessionNote).toHaveBeenCalledWith('n1', { is_draft: false }))
  })

  it('a typed note shows nothing extra', () => {
    wrap(<RecordedNoteDetails note={{ ...note, source: 'typed', transcript: null, is_draft: false }} patientId="pt1" />)
    expect(screen.queryByRole('button', { name: 'Transcript' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Approve note' })).not.toBeInTheDocument()
  })
})

describe('recordings being written up', () => {
  it('shows one that failed, with Try again', async () => {
    wrap(<RecordingsInProgress patientId="pt1" />, qc => qc.setQueryData(['recordings', 'pt1'], [
      { id: 'r1', patient_id: 'pt1', status: 'failed', participants: ['patient'], segments: 1, error: "Google couldn't process the recording. Try again.", session_note_id: null, started_at: '2026-09-15T10:00:00Z', stopped_at: null },
    ]))
    expect(screen.getByText(/Google couldn't process the recording/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(recs.retryRecording).toHaveBeenCalledWith('r1'))
  })
})
