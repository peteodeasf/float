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
