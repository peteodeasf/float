import { useState } from 'react'
import JustSayIt, { CaptureChoices, localToday, type CaptureApi, type CapturedEntry } from './JustSayIt'

/**
 * Dev only: the Just say it screens with the monitoring routes stood in for, so they can be seen
 * without Google, Claude or a family's link. ?start=1 opens straight in; ?mode=note for typing.
 */
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return localToday(d) }

const WORDS = "This morning Maya froze at the front door when it was time to go to school. She was crying and said her tummy hurt, I'd say about an eight. I told her she could stay home. And last night at bedtime she asked me to stay until she fell asleep, so I lay down with her."

const found = (text: string, by: 'voice' | 'note'): CapturedEntry[] => [
  { id: 'p1', entry_date: localToday(), situation: 'Leaving for school in the morning',
    child_behavior_observed: 'Froze at the front door, cried and said her tummy hurt',
    parent_response: 'I told her she could stay home', fear_thermometer: 8, is_draft: true, parent_words: text, captured_by: by },
  { id: 'p2', entry_date: yesterday(), situation: 'Bedtime',
    child_behavior_observed: 'Asked me to stay until she fell asleep',
    parent_response: 'I lay down with her', fear_thermometer: null, is_draft: true, parent_words: text, captured_by: by },
]

const api: CaptureApi = {
  transcribe: async () => { await wait(900); return WORDS },
  writeUp: async (text, by) => { await wait(2600); return found(text, by) },
  save: async () => { await wait(300) },
  remove: async () => {},
}

export default function JustSayItPreview() {
  const params = new URLSearchParams(window.location.search)
  const [open, setOpen] = useState(params.get('start') === '1')
  const [mode, setMode] = useState<'talk' | 'note'>(params.get('mode') === 'note' ? 'note' : 'talk')
  const [saved, setSaved] = useState(0)

  if (open) {
    return <JustSayIt mode={mode} childName="Maya" api={api} onClose={n => { setSaved(n); setOpen(false) }} onUseForm={() => setOpen(false)} />
  }
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24, background: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {saved > 0 && <p role="status">Saved {saved}.</p>}
      <CaptureChoices voice onTalk={() => { setMode('talk'); setOpen(true) }} onNote={() => { setMode('note'); setOpen(true) }} onForm={() => {}} />
      <CaptureChoices compact voice onTalk={() => { setMode('talk'); setOpen(true) }} onNote={() => { setMode('note'); setOpen(true) }} onForm={() => {}} />
    </div>
  )
}
