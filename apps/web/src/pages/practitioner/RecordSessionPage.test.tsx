import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

// No clinician can be signed in here: the patient is seeded and the recording routes are recorded.
const api = vi.hoisted(() => ({
  confirmRecordingConsent: vi.fn(), startRecording: vi.fn(), uploadPiece: vi.fn(), stopRecording: vi.fn(),
}))
vi.mock('../../api/sessionRecordings', async importOriginal => ({
  ...(await importOriginal<typeof import('../../api/sessionRecordings')>()),
  ...api,
}))

import RecordSessionPage from './RecordSessionPage'

// A pretend microphone and recorder.
let recorder: FakeRecorder | null = null
class FakeRecorder {
  state: 'inactive' | 'recording' | 'paused' = 'inactive'
  mimeType: string
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  listeners: Record<string, (() => void)[]> = {}
  constructor(_stream: unknown, opts?: { mimeType?: string }) { this.mimeType = opts?.mimeType ?? ''; recorder = this }
  static isTypeSupported(t: string) { return t === 'audio/mp4' }
  start() { this.state = 'recording' }
  pause() { this.state = 'paused' }
  resume() { this.state = 'recording' }
  stop() {
    this.ondataavailable?.({ data: new Blob(['last'], { type: 'audio/mp4' }) })
    this.state = 'inactive'
    this.onstop?.()
    this.listeners.stop?.forEach(f => f())
  }
  addEventListener(name: string, f: () => void) { (this.listeners[name] ??= []).push(f) }
}

function open(patient: Record<string, unknown>) {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  qc.setQueryData(['patient', 'pt1'], { id: 'pt1', name: 'Sam Rivera', closed_at: null, ...patient })
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/patients/pt1/record']}>
        <Routes><Route path="/patients/:patientId/record" element={<RecordSessionPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  Object.values(api).forEach(f => f.mockReset().mockResolvedValue(undefined))
  api.startRecording.mockResolvedValue({ id: 'rec1', status: 'recording' })
  api.stopRecording.mockResolvedValue({ id: 'rec1', status: 'stopped' })
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  const track = { stop: vi.fn(), addEventListener: vi.fn() }
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: vi.fn(async () => ({ getTracks: () => [track], getAudioTracks: () => [track] })) },
  })
})
afterEach(() => { vi.unstubAllGlobals(); recorder = null })

describe('recording a session', () => {
  it('asks for consent first, the first time for a patient', async () => {
    open({ recording_consent_at: null })
    expect(await screen.findByRole('heading', { name: 'Before you record' })).toBeInTheDocument()
    const go = screen.getByRole('button', { name: 'Continue' })
    expect(go).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Who agreed'), { target: { value: 'Sam and her mother, verbally' } })
    expect(go).toBeDisabled()
    fireEvent.click(screen.getByLabelText('Everyone in the session has agreed to it being recorded'))
    fireEvent.click(go)
    await waitFor(() => expect(api.confirmRecordingConsent).toHaveBeenCalledWith('pt1', 'Sam and her mother, verbally'))
    expect(await screen.findByRole('heading', { name: "Who's in the session?" })).toBeInTheDocument()
  })

  it('records, uploads each piece as it goes, and saves', async () => {
    open({ recording_consent_at: '2026-09-15T10:00:00Z' })
    fireEvent.click(await screen.findByRole('button', { name: 'Parent' }))
    fireEvent.click(screen.getByRole('button', { name: /Start recording/ }))

    await waitFor(() => expect(api.startRecording).toHaveBeenCalledWith('pt1', ['patient', 'parent'], 'audio/mp4'))
    expect(await screen.findByText('Recording')).toBeInTheDocument()

    await act(async () => { recorder!.ondataavailable!({ data: new Blob(['first'], { type: 'audio/mp4' }) }) })
    await waitFor(() => expect(api.uploadPiece).toHaveBeenCalledWith('rec1', 1, 0, expect.any(Blob), 'audio/mp4'))

    fireEvent.click(screen.getByRole('button', { name: 'Pause' }))
    expect(recorder!.state).toBe('paused')
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))

    fireEvent.click(screen.getByRole('button', { name: 'Stop and save' }))
    await waitFor(() => expect(api.stopRecording).toHaveBeenCalledWith('rec1'))
    // The last piece, handed over when it stopped, was uploaded before saving.
    expect(api.uploadPiece).toHaveBeenCalledWith('rec1', 1, 1, expect.any(Blob), 'audio/mp4')
    expect(await screen.findByRole('heading', { name: 'Saved' })).toBeInTheDocument()
  })

  it('when the phone stops it, carrying on adds to the same session', async () => {
    open({ recording_consent_at: '2026-09-15T10:00:00Z' })
    fireEvent.click(await screen.findByRole('button', { name: /Start recording/ }))
    await screen.findByText('Recording')
    const first = recorder!
    await act(async () => { first.state = 'inactive'; first.onstop!() })
    expect(await screen.findByRole('heading', { name: 'Recording stopped' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Tap to carry on' }))
    await screen.findByText('Recording')
    await act(async () => { recorder!.ondataavailable!({ data: new Blob(['more'], { type: 'audio/mp4' }) }) })
    await waitFor(() => expect(api.uploadPiece).toHaveBeenCalledWith('rec1', 2, 0, expect.any(Blob), 'audio/mp4'))
    expect(api.startRecording).toHaveBeenCalledTimes(1)
  })

  it('says so where the browser cannot record', async () => {
    vi.stubGlobal('MediaRecorder', undefined)
    open({ recording_consent_at: '2026-09-15T10:00:00Z' })
    expect(await screen.findByRole('heading', { name: "Can't record here" })).toBeInTheDocument()
  })
})
