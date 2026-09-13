import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import JustSayIt, { CaptureChoices, NoteRow, type CaptureApi, type CapturedNote } from './JustSayIt'

// The monitoring routes are stood in for: nothing is sent, and what would have been is recorded.
const note = (over: Partial<CapturedNote> = {}): CapturedNote => ({
  id: 'n1', words: 'This morning she cried in the car.', captured_by: 'note', entry_date: '2026-09-12',
  fear_level: null, created_at: null, ...over,
})

function fakeApi() {
  return {
    sayIt: vi.fn(async () => note({ captured_by: 'voice' })),
    writeIt: vi.fn(async (text: string) => note({ words: text })),
    setFear: vi.fn(async () => {}),
    deleteNote: vi.fn(async () => {}),
  } satisfies CaptureApi
}

function open(api: CaptureApi, mode: 'talk' | 'note' = 'note') {
  const onClose = vi.fn()
  render(<JustSayIt mode={mode} childName="Sam" api={api} onClose={onClose} />)
  return { onClose }
}

async function send(text = 'This morning she cried in the car.') {
  fireEvent.change(screen.getByLabelText('What happened?'), { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: 'Send' }))
}

describe('just say it', () => {
  it('sends it straight away, with no form to check, then asks one thing', async () => {
    const api = fakeApi()
    const { onClose } = open(api)
    await send()

    expect(await screen.findByRole('heading', { name: 'Got it, thanks.' })).toBeInTheDocument()
    expect(api.writeIt).toHaveBeenCalledWith('This morning she cried in the car.')
    // Nothing to review: none of the form's boxes.
    expect(screen.queryByLabelText('The situation')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'How upset was Sam?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Fear Level 6' }))
    await waitFor(() => expect(api.setFear).toHaveBeenCalledWith('n1', 6))
    expect(onClose).toHaveBeenCalled()
  })

  it('the question can be skipped', async () => {
    const api = fakeApi()
    const { onClose } = open(api)
    await send()
    fireEvent.click(await screen.findByRole('button', { name: 'Skip' }))
    expect(api.setFear).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it('when the Fear Level does not save, it says so and can be tried again', async () => {
    const api = fakeApi()
    api.setFear.mockRejectedValueOnce(new Error('offline'))
    const { onClose } = open(api)
    await send()
    fireEvent.click(await screen.findByRole('button', { name: 'Fear Level 4' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("That didn't save.")
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Fear Level 4' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('when sending fails it says why and keeps what they typed', async () => {
    const api = fakeApi()
    api.writeIt.mockRejectedValueOnce({ response: { data: { detail: "That's the most for one day. You can still use the form." } } })
    open(api)
    await send()
    expect(await screen.findByRole('alert')).toHaveTextContent("That's the most for one day.")
    expect(screen.getByLabelText('What happened?')).toHaveValue('This morning she cried in the car.')
  })

  it('where the browser cannot record, it offers typing', () => {
    open(fakeApi(), 'talk')
    expect(screen.getByRole('alert')).toHaveTextContent("Recording doesn't work in this browser.")
    expect(screen.getByLabelText('What happened?')).toBeInTheDocument()
  })
})

describe('in their list', () => {
  it('shows their words, not the form, and deletes one only after asking', async () => {
    const onDelete = vi.fn(async () => {})
    render(<NoteRow note={note({ captured_by: 'voice', fear_level: 7 })} onDelete={onDelete} />)
    expect(screen.getByText('“This morning she cried in the car.”')).toBeInTheDocument()
    expect(screen.getByText('You said')).toBeInTheDocument()
    expect(screen.getByTitle('How upset')).toHaveTextContent('7')

    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByText('Delete this one?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(onDelete).toHaveBeenCalled())
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
