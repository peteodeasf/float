import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import JustSayIt, { CaptureChoices, type CaptureApi, type CapturedEntry } from './JustSayIt'

// The monitoring routes are stood in for: nothing is sent, and what would have been is recorded.
const entry = (over: Partial<CapturedEntry> = {}): CapturedEntry => ({
  id: 'e1', entry_date: '2026-09-11', situation: 'Getting in the car for school',
  child_behavior_observed: 'Cried and said her tummy hurt', parent_response: 'I let her stay home',
  fear_thermometer: null, is_draft: true, parent_words: 'This morning she cried in the car.', captured_by: 'note',
  ...over,
})

function fakeApi(found: CapturedEntry[] = [entry()]) {
  return {
    transcribe: vi.fn(async () => 'She cried.'),
    writeUp: vi.fn(async () => found),
    save: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  } satisfies CaptureApi
}

function open(api: CaptureApi, mode: 'talk' | 'note' = 'note') {
  const onClose = vi.fn()
  const onUseForm = vi.fn()
  render(<JustSayIt mode={mode} childName="Sam" api={api} onClose={onClose} onUseForm={onUseForm} />)
  return { onClose, onUseForm }
}

async function writeNote(text = 'This morning she cried in the car.') {
  fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Write it up' }))
}

describe('just say it', () => {
  it('writes a note up for the parent to check, asks for the Fear Level rather than guessing, and saves', async () => {
    const api = fakeApi()
    const { onClose } = open(api)
    await writeNote()

    expect(await screen.findByRole('heading', { name: "Here's what we heard" })).toBeInTheDocument()
    expect(api.writeUp).toHaveBeenCalledWith('This morning she cried in the car.', 'note')
    expect(screen.getByLabelText('The situation')).toHaveValue('Getting in the car for school')
    expect(screen.getByLabelText('What Sam did or said')).toHaveValue('Cried and said her tummy hurt')
    expect(screen.getByText('How upset was Sam? Tap one.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Fear Level 6' }))
    fireEvent.change(screen.getByLabelText('What you did'), { target: { value: 'I drove her in late' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(api.save).toHaveBeenCalledWith(expect.objectContaining({
      id: 'e1', fear_thermometer: 6, parent_response: 'I drove her in late',
    })))
    expect(onClose).toHaveBeenCalledWith(1)
  })

  it('two moments are two cards, and one can be removed', async () => {
    const api = fakeApi([entry(), entry({ id: 'e2', situation: 'Bedtime' })])
    const { onClose } = open(api)
    await writeNote()

    expect(await screen.findAllByLabelText('The situation')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Save both' })).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1])
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('e2'))
    expect(screen.getAllByLabelText('The situation')).toHaveLength(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('says so when there was no moment to record in it', async () => {
    const { onUseForm } = open(fakeApi([]))
    await writeNote('We had pizza.')
    expect(await screen.findByRole('heading', { name: "We didn't find a moment to record in that." })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Use the form' }))
    expect(onUseForm).toHaveBeenCalled()
  })

  it('when writing up fails it says why and keeps what they typed', async () => {
    const api = fakeApi()
    api.writeUp.mockRejectedValueOnce({ response: { data: { detail: "We couldn't write that up. Try again, or use the form." } } })
    open(api)
    await writeNote()
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't write that up.")
    expect(screen.getByLabelText('What happened?')).toHaveValue('This morning she cried in the car.')
  })

  it('where the browser cannot record, it offers typing', () => {
    open(fakeApi(), 'talk')
    expect(screen.getByRole('alert')).toHaveTextContent("Recording doesn't work in this browser.")
    expect(screen.getByLabelText('What happened?')).toBeInTheDocument()
  })
})

describe('the way in', () => {
  it('offers talking first once recording is set up', () => {
    const onTalk = vi.fn()
    render(<CaptureChoices voice onTalk={onTalk} onNote={vi.fn()} onForm={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tap and talk' }))
    expect(onTalk).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Type a quick note' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use the form' })).toBeInTheDocument()
  })

  it('offers a typed note when it is not', () => {
    render(<CaptureChoices voice={false} onTalk={vi.fn()} onNote={vi.fn()} onForm={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'Tap and talk' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Type a quick note' })).toBeInTheDocument()
  })
})
