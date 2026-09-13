import { useState } from 'react'
import JustSayIt, { CaptureChoices, NoteRow, localToday, type CaptureApi, type CapturedNote } from './JustSayIt'

/**
 * Dev only: the Just say it screens with the monitoring routes stood in for, so they can be seen
 * without Google, Claude or a family's link. ?start=1 opens straight in; ?mode=note for typing;
 * ?done=1 for "Got it".
 */
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))

const WORDS = "This morning Maya froze at the front door when it was time to go to school. She was crying and said her tummy hurt. I told her she could stay home. And last night at bedtime she asked me to stay until she fell asleep, so I lay down with her."

const note = (words: string, by: 'voice' | 'note'): CapturedNote => ({
  id: 'n1', words, captured_by: by, entry_date: localToday(), fear_level: null, created_at: new Date().toISOString(),
})

const api: CaptureApi = {
  sayIt: async () => { await wait(1400); return note(WORDS, 'voice') },
  writeIt: async text => { await wait(700); return note(text, 'note') },
  setFear: async () => { await wait(300) },
  deleteNote: async () => { await wait(300) },
}

export default function JustSayItPreview() {
  const params = new URLSearchParams(window.location.search)
  const [open, setOpen] = useState(params.get('start') === '1' || params.get('done') === '1')
  const [mode, setMode] = useState<'talk' | 'note'>(params.get('mode') === 'note' ? 'note' : 'talk')

  if (open) {
    return <JustSayIt mode={mode} childName="Maya" api={api} onClose={() => setOpen(false)}
      startDone={params.get('done') === '1' ? note(WORDS, 'voice') : undefined} />
  }
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24, background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <CaptureChoices voice onTalk={() => { setMode('talk'); setOpen(true) }} onNote={() => { setMode('note'); setOpen(true) }} onForm={() => {}} />
      <NoteRow note={{ ...note(WORDS, 'voice'), fear_level: 8 }} onDelete={async () => {}} />
      <CaptureChoices compact voice onTalk={() => { setMode('talk'); setOpen(true) }} onNote={() => { setMode('note'); setOpen(true) }} onForm={() => {}} />
    </div>
  )
}
