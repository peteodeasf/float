/**
 * Just say it: a monitoring observation said out loud, or typed as a quick note.
 *
 * Peter, 2026-09-11: a faster way in than the four-box form, alongside it. The parent talks for up
 * to a minute or types a note; Float writes it up as observations in their words; they check and
 * save. The Fear Level is never guessed. The recording is not kept, only the text.
 * docs/plans/monitoring-just-say-it.md
 */
import { useEffect, useRef, useState } from 'react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
export const MAX_SECONDS = 60
const BAR_COUNT = 24

export interface CapturedEntry {
  id: string
  entry_date: string
  situation: string | null
  child_behavior_observed: string | null
  parent_response: string | null
  fear_thermometer: number | null
  is_draft: boolean
  parent_words?: string | null
  captured_by?: string
}

/** The monitoring routes this uses, so the preview page and the tests can stand in for them. */
export interface CaptureApi {
  transcribe: (audio: Blob) => Promise<string>
  writeUp: (text: string, capturedBy: 'voice' | 'note') => Promise<CapturedEntry[]>
  save: (entry: CapturedEntry) => Promise<void>
  remove: (id: string) => Promise<void>
}

/** YYYY-MM-DD in the parent's own time, so "this morning" is their morning. */
export function localToday(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function captureApi(token: string): CaptureApi {
  const base = `${API_URL}/monitor/${token}`
  return {
    async transcribe(audio) {
      const fd = new FormData()
      fd.append('audio', audio, audio.type.includes('mp4') ? 'note.m4a' : 'note.webm')
      return (await axios.post(`${base}/transcribe`, fd)).data.text ?? ''
    },
    async writeUp(text, capturedBy) {
      return (await axios.post(`${base}/write-up`, { text, today: localToday(), captured_by: capturedBy })).data.entries
    },
    async save(e) {
      await axios.put(`${base}/entries/${e.id}`, {
        entry_date: e.entry_date,
        situation: e.situation ?? '',
        child_behavior_observed: e.child_behavior_observed ?? '',
        parent_response: e.parent_response ?? '',
        fear_thermometer: e.fear_thermometer,
        is_draft: false,
      })
    },
    async remove(id) {
      await axios.delete(`${base}/entries/${id}`)
    },
  }
}

function errorText(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  return typeof detail === 'string' ? detail : fallback
}

export function canRecord(): boolean {
  return typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

/** Chrome and Android record Opus in WebM, iPhones AAC in MP4. Google takes either as it is. */
function pickMime(): string | undefined {
  return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(t => MediaRecorder.isTypeSupported?.(t))
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

export function MicIcon({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="2.5" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3.5" />
    </svg>
  )
}

// ── Recording ────────────────────────────────────────────────────────────────

function useRecorder(onRecorded: (blob: Blob) => void) {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const [problem, setProblem] = useState<string | null>(null)
  const bars = useRef<(HTMLSpanElement | null)[]>([])
  const ring = useRef<HTMLSpanElement | null>(null)
  const live = useRef<{
    rec?: MediaRecorder; stream?: MediaStream; ctx?: AudioContext; raf?: number; timer?: number; cancelled?: boolean
  }>({})

  const release = () => {
    const l = live.current
    if (l.raf) cancelAnimationFrame(l.raf)
    if (l.timer) clearInterval(l.timer)
    l.stream?.getTracks().forEach(t => t.stop())
    l.ctx?.close().catch(() => {})
  }

  // Leaving the screen stops the microphone and throws the recording away.
  useEffect(() => () => {
    live.current.cancelled = true
    if (live.current.rec?.state === 'recording') live.current.rec.stop()
    release()
  }, [])

  const start = async () => {
    setProblem(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setProblem("Float can't use your microphone. You can allow it in your phone's settings for this browser, or type it instead.")
      return
    }
    const mime = pickMime()
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    const chunks: Blob[] = []
    rec.ondataavailable = ev => { if (ev.data.size > 0) chunks.push(ev.data) }
    rec.onstop = () => {
      const cancelled = live.current.cancelled
      release()
      setRecording(false)
      if (!cancelled) onRecorded(new Blob(chunks, { type: rec.mimeType || mime || 'audio/webm' }))
    }

    // How loud it is, for the ring and the bars. Drawn straight onto the elements, not through
    // React, sixty times a second.
    let analyser: AnalyserNode | undefined
    let ctx: AudioContext | undefined
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      ctx = new Ctx()
      analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      ctx.createMediaStreamSource(stream).connect(analyser)
    } catch {
      // The bars stay still; the recording still works.
    }
    const data = new Uint8Array(analyser?.frequencyBinCount ?? 0)
    const draw = () => {
      if (analyser) {
        analyser.getByteFrequencyData(data)
        let sum = 0
        bars.current.forEach((el, i) => {
          const v = (data[i + 1] ?? 0) / 255
          sum += v
          if (el) el.style.transform = `scaleY(${0.12 + v * 0.88})`
        })
        if (ring.current) ring.current.style.transform = `scale(${1 + (sum / BAR_COUNT) * 0.9})`
      }
      live.current.raf = requestAnimationFrame(draw)
    }

    const began = Date.now()
    live.current = { rec, stream, ctx, cancelled: false }
    live.current.timer = window.setInterval(() => {
      const s = Math.min(MAX_SECONDS, Math.floor((Date.now() - began) / 1000))
      setSeconds(s)
      if (s >= MAX_SECONDS && rec.state === 'recording') rec.stop()
    }, 200)
    live.current.raf = requestAnimationFrame(draw)
    setSeconds(0)
    rec.start()
    setRecording(true)
  }

  const stop = () => { if (live.current.rec?.state === 'recording') live.current.rec.stop() }
  const cancel = () => { live.current.cancelled = true; stop() }
  return { recording, seconds, problem, start, stop, cancel, bars, ring }
}

// ── The whole thing ──────────────────────────────────────────────────────────

type Step = 'talk' | 'hearing' | 'note' | 'writing' | 'review' | 'nothing'

export default function JustSayIt({
  mode,
  childName,
  api,
  onClose,
  onUseForm,
}: {
  mode: 'talk' | 'note'
  childName: string
  api: CaptureApi
  /** Back to their list. `saved` is how many observations they saved. */
  onClose: (saved: number) => void
  onUseForm: () => void
}) {
  const recordable = canRecord()
  const [step, setStep] = useState<Step>(mode === 'talk' && recordable ? 'talk' : 'note')
  const [problem, setProblem] = useState<string | null>(
    mode === 'talk' && !recordable ? "Recording doesn't work in this browser. You can type it instead." : null,
  )
  const [note, setNote] = useState('')
  const [words, setWords] = useState('')
  const [entries, setEntries] = useState<CapturedEntry[]>([])
  const [saving, setSaving] = useState(false)

  const writeUp = async (text: string, by: 'voice' | 'note') => {
    setWords(text)
    setProblem(null)
    setStep('writing')
    try {
      const found = await api.writeUp(text, by)
      if (found.length === 0) {
        setStep('nothing')
        return
      }
      setEntries(found)
      setStep('review')
    } catch (e) {
      setProblem(errorText(e, "We couldn't write that up. Try again, or use the form."))
      setStep(by === 'voice' ? 'talk' : 'note')
    }
  }

  const rec = useRecorder(async blob => {
    setStep('hearing')
    setProblem(null)
    try {
      const text = (await api.transcribe(blob)).trim()
      if (!text) {
        setProblem("We couldn't hear that. Try again, or type it.")
        setStep('talk')
        return
      }
      await writeUp(text, 'voice')
    } catch (e) {
      setProblem(errorText(e, "We couldn't turn that into text. Try again, or type it."))
      setStep('talk')
    }
  })

  const update = (id: string, patch: Partial<CapturedEntry>) =>
    setEntries(es => es.map(e => (e.id === id ? { ...e, ...patch } : e)))

  const removeOne = async (id: string) => {
    try {
      await api.remove(id)
    } catch {
      // Left behind, it stays in their list as a draft they can finish or ignore.
    }
    const left = entries.filter(e => e.id !== id)
    setEntries(left)
    if (left.length === 0) onClose(0)
  }

  const saveAll = async () => {
    setSaving(true)
    setProblem(null)
    try {
      for (const e of entries) await api.save(e)
      onClose(entries.length)
    } catch (e) {
      setProblem(errorText(e, "That didn't save. Please try again."))
    } finally {
      setSaving(false)
    }
  }

  const toTyping = () => {
    rec.cancel()
    setProblem(null)
    setStep('note')
  }

  // ── Talking ──
  if (step === 'talk' || step === 'hearing') {
    const listening = rec.recording
    const hearing = step === 'hearing'
    return (
      <Dark onBack={() => { rec.cancel(); onClose(0) }}>
        {!listening && !hearing && (
          <>
            <h1 className="jsi-title">Tell us what happened</h1>
            <p className="jsi-sub">Up to a minute, in your own words.</p>
            <div className="jsi-hints">
              <span className="jsi-hint">Where you were</span>
              <span className="jsi-hint">What {childName} did or said</span>
              <span className="jsi-hint">What you did</span>
            </div>
          </>
        )}
        {listening && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="jsi-time" aria-live="off">{clock(rec.seconds)} <small>/ {clock(MAX_SECONDS)}</small></div>
            <div className="jsi-track"><span style={{ width: `${(rec.seconds / MAX_SECONDS) * 100}%` }} /></div>
          </div>
        )}
        {hearing && <h1 className="jsi-title">Listening back<Dots /></h1>}

        {(problem || rec.problem) && <div role="alert" className="jsi-alert">{problem || rec.problem}</div>}

        <div className="jsi-stage">
          <button
            className={`jsi-mic ${listening ? 'jsi-recording' : hearing ? '' : 'jsi-breathe'}`}
            onClick={listening ? rec.stop : rec.start}
            disabled={hearing}
            aria-label={listening ? 'Stop recording' : 'Start recording'}
          >
            <span className="jsi-ring2" />
            <span className="jsi-ring" ref={rec.ring} />
            <span className="jsi-core">
              {listening ? <span className="jsi-stopsq" /> : <MicIcon />}
            </span>
          </button>
          <div className="jsi-bars" aria-hidden="true" style={{ opacity: listening ? 1 : 0.35 }}>
            {Array.from({ length: BAR_COUNT }, (_, i) => (
              <span key={i} className="jsi-bar" ref={el => { rec.bars.current[i] = el }} />
            ))}
          </div>
          <p className="jsi-sub" style={{ textAlign: 'center' }}>
            {listening ? 'Tap when you’re done' : hearing ? 'Turning it into text' : 'Tap to start'}
          </p>
        </div>

        {!listening && !hearing && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <button className="jsi-link" onClick={toTyping}>Type it instead</button>
            <p className="jsi-small">Your recording is turned into text and then deleted. Only the text is kept.</p>
          </div>
        )}
      </Dark>
    )
  }

  // ── Typing ──
  if (step === 'note') {
    return (
      <Dark onBack={() => onClose(0)}>
        <h1 className="jsi-title">What happened?</h1>
        <p className="jsi-sub">Write it the way you'd say it. Float will sort it into the form for you.</p>
        {problem && <div role="alert" className="jsi-alert">{problem}</div>}
        <textarea
          className="jsi-textarea"
          aria-label="What happened?"
          value={note}
          onChange={e => setNote(e.target.value)}
          maxLength={5000}
          placeholder={`e.g. This morning ${childName} wouldn't get in the car for school. She cried and said her tummy hurt, so I let her stay home.`}
        />
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <button className="jsi-btn jsi-btn-mint" disabled={!note.trim()} onClick={() => writeUp(note.trim(), 'note')}>
            Write it up
          </button>
          {recordable && (
            <button className="jsi-link" onClick={() => { setProblem(null); setStep('talk') }}>Say it instead</button>
          )}
        </div>
      </Dark>
    )
  }

  // ── Writing it up ──
  if (step === 'writing') {
    const list = words.split(/\s+/).filter(Boolean)
    return (
      <Dark onBack={() => onClose(0)}>
        <span className="jsi-eyebrow">You said</span>
        <p className="jsi-said">
          {list.map((w, i) => (
            <span key={i} className="jsi-word" style={{ animationDelay: `${Math.min(i * 45, 1800)}ms` }}>{w}&nbsp;</span>
          ))}
        </p>
        <p className="jsi-sub" style={{ marginTop: 'auto' }} role="status">Writing it up for you<Dots /></p>
      </Dark>
    )
  }

  // ── Nothing in it ──
  if (step === 'nothing') {
    return (
      <Dark onBack={() => onClose(0)}>
        <h1 className="jsi-title">We didn't find a moment to record in that.</h1>
        <p className="jsi-sub">Tell us about a time {childName} was anxious: where you were, what they did, and what you did.</p>
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <button className="jsi-btn jsi-btn-mint" onClick={() => setStep(mode === 'talk' && recordable ? 'talk' : 'note')}>
            Try again
          </button>
          <button className="jsi-link" onClick={onUseForm}>Use the form</button>
        </div>
      </Dark>
    )
  }

  // ── Here's what we heard ──
  const n = entries.length
  return (
    <div className="jsi jsi-light">
      <style>{CSS}</style>
      <div className="jsi-head">
        <h1>Here's what we heard</h1>
        <p className="jsi-sub" style={{ color: '#58716d', opacity: 1 }}>
          {n === 1 ? 'One moment' : `${n} moments`} from what you {entries[0]?.captured_by === 'voice' ? 'said' : 'wrote'}. Check {n === 1 ? 'it' : 'them'}, then save.
        </p>
        <details className="jsi-quote">
          <summary>What you {entries[0]?.captured_by === 'voice' ? 'said' : 'wrote'}</summary>
          <p>“{words}”</p>
        </details>
      </div>
      <div className="jsi-body" style={{ gap: 14 }}>
        {entries.map((e, i) => (
          <ReviewCard key={e.id} entry={e} index={i} childName={childName}
            onChange={patch => update(e.id, patch)} onRemove={() => removeOne(e.id)} />
        ))}
      </div>
      <div className="jsi-foot">
        {problem && <div role="alert" className="jsi-alert" style={{ marginBottom: 10 }}>{problem}</div>}
        <button className="jsi-btn jsi-btn-teal" disabled={saving} onClick={saveAll}>
          {saving ? 'Saving…' : n === 1 ? 'Save' : n === 2 ? 'Save both' : `Save all ${n}`}
        </button>
      </div>
    </div>
  )
}

function ReviewCard({ entry, index, childName, onChange, onRemove }: {
  entry: CapturedEntry
  index: number
  childName: string
  onChange: (patch: Partial<CapturedEntry>) => void
  onRemove: () => void
}) {
  const rows = (v: string | null) => Math.max(2, Math.ceil((v?.length ?? 0) / 36))
  const field = (label: string, key: 'situation' | 'child_behavior_observed' | 'parent_response') => (
    <label>
      <span className="jsi-label">{label}</span>
      <textarea className="jsi-field" aria-label={label} rows={rows(entry[key])} value={entry[key] ?? ''}
        onChange={e => onChange({ [key]: e.target.value })} />
    </label>
  )
  const fear = entry.fear_thermometer
  return (
    <div className="jsi-card" style={{ animationDelay: `${index * 140}ms` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <input type="date" className="jsi-date" aria-label="Date" value={entry.entry_date} max={localToday()}
          onChange={e => e.target.value && onChange({ entry_date: e.target.value })} />
        <button className="jsi-remove" onClick={onRemove}>Remove</button>
      </div>
      {field('The situation', 'situation')}
      {field(`What ${childName} did or said`, 'child_behavior_observed')}
      {field('What you did', 'parent_response')}
      <div>
        <span className="jsi-label">
          {fear == null ? <span className="jsi-ask">How upset was {childName}? Tap one.</span> : `Fear Level ${fear}`}
        </span>
        <div className="jsi-fear">
          {Array.from({ length: 10 }, (_, i) => i + 1).map(v => (
            <button key={v} aria-label={`Fear Level ${v}`} aria-pressed={fear === v} onClick={() => onChange({ fear_thermometer: v })}>
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function Dots() {
  return <span className="jsi-dots" aria-hidden="true"><span /><span /><span /></span>
}

function Dark({ children, onBack }: { children: React.ReactNode; onBack: () => void }) {
  return (
    <div className="jsi jsi-dark">
      <style>{CSS}</style>
      <div className="jsi-top">
        <button className="jsi-quiet" onClick={onBack}>Cancel</button>
        <span className="jsi-mark">float</span>
      </div>
      <div className="jsi-body">{children}</div>
    </div>
  )
}

// ── The way in, on the monitoring page ───────────────────────────────────────

/** The first thing on the monitoring page: say it, type it, or the form. `compact` drops the
 *  explanation, for the bar at the bottom of their list. */
export function CaptureChoices({ voice, onTalk, onNote, onForm, compact = false }: {
  voice: boolean
  onTalk: () => void
  onNote: () => void
  onForm: () => void
  compact?: boolean
}) {
  return (
    <div className="jsi-start" style={compact ? { paddingTop: 14, gap: 6 } : undefined}>
      <style>{CSS}</style>
      {!compact && <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
        <span className="jsi-start-icon"><MicIcon size={26} /></span>
        <div>
          <strong style={{ display: 'block', fontSize: 18 }}>{voice ? 'Just say what happened' : 'Just write what happened'}</strong>
          <span style={{ fontSize: 14.5, opacity: 0.85, lineHeight: 1.45 }}>
            {voice ? 'Talk for up to a minute.' : 'A few sentences is enough.'} Float writes it up in your words, and you check it.
          </span>
        </div>
      </div>}
      {voice ? (
        <>
          <button className="jsi-btn jsi-btn-mint" onClick={onTalk}>Tap and talk</button>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button className="jsi-link" onClick={onNote}>Type a quick note</button>
            <button className="jsi-link" onClick={onForm}>Use the form</button>
          </div>
        </>
      ) : (
        <>
          <button className="jsi-btn jsi-btn-mint" onClick={onNote}>Type a quick note</button>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button className="jsi-link" onClick={onForm}>Use the form</button>
          </div>
        </>
      )}
    </div>
  )
}

const CSS = `
.jsi { min-height: 100vh; max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; box-sizing: border-box; }
.jsi *, .jsi *::before, .jsi *::after, .jsi-start, .jsi-start * { box-sizing: border-box; }
.jsi-dark { color: #fff; background: radial-gradient(130% 70% at 50% 0%, #1d746e 0%, #135450 45%, #0d3d3a 100%); }
.jsi-light { color: #16322f; background: #f4faf8; }
.jsi-top { display: flex; align-items: center; justify-content: space-between; padding: 14px 24px 0; }
.jsi-mark { font-weight: 800; letter-spacing: -0.02em; font-size: 19px; opacity: .92; }
.jsi-quiet { background: none; border: 0; color: inherit; opacity: .85; font: inherit; font-size: 15px; padding: 8px 0; cursor: pointer; min-height: 44px; }
.jsi-body { flex: 1; display: flex; flex-direction: column; padding: 16px 24px 28px; gap: 18px; }
.jsi-title { font-size: 28px; line-height: 1.15; font-weight: 750; margin: 0; letter-spacing: -0.01em; text-wrap: balance; }
.jsi-sub { margin: 0; font-size: 16px; line-height: 1.5; opacity: .82; }
.jsi-eyebrow { font-size: 12px; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; color: #9af6e4; }
.jsi-hints { display: flex; flex-wrap: wrap; gap: 8px; }
.jsi-hint { font-size: 13.5px; font-weight: 600; color: #9af6e4; background: rgba(154,246,228,.1); border: 1px solid rgba(154,246,228,.3); border-radius: 999px; padding: 6px 12px; }
.jsi-stage { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; min-height: 300px; }
.jsi-mic { position: relative; width: 168px; height: 168px; border-radius: 50%; border: 0; cursor: pointer; background: transparent; padding: 0; color: #0d3d3a; }
.jsi-mic:disabled { cursor: default; }
.jsi-mic:focus-visible { outline: 3px solid #9af6e4; outline-offset: 10px; }
.jsi-ring { position: absolute; inset: 0; border-radius: 50%; background: rgba(154,246,228,.2); transition: transform 90ms linear; }
.jsi-ring2 { position: absolute; inset: -20px; border-radius: 50%; border: 1.5px solid rgba(154,246,228,.22); }
.jsi-breathe .jsi-ring { animation: jsi-breathe 2.8s ease-in-out infinite; }
.jsi-core { position: absolute; inset: 24px; border-radius: 50%; background: #9af6e4; display: flex; align-items: center; justify-content: center; box-shadow: 0 12px 40px rgba(0,0,0,.28); transition: background .2s; }
.jsi-recording .jsi-core { background: #fff; }
.jsi-stopsq { width: 34px; height: 34px; border-radius: 9px; background: #135450; }
.jsi-bars { display: flex; align-items: center; gap: 4px; height: 44px; transition: opacity .3s; }
.jsi-bar { width: 5px; height: 44px; border-radius: 3px; background: #9af6e4; transform: scaleY(.12); transform-origin: center; transition: transform 70ms linear; }
.jsi-time { font-size: 44px; font-weight: 750; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; line-height: 1; }
.jsi-time small { font-size: 18px; opacity: .55; font-weight: 600; letter-spacing: 0; }
.jsi-track { width: 100%; height: 4px; background: rgba(255,255,255,.14); border-radius: 2px; overflow: hidden; }
.jsi-track span { display: block; height: 100%; background: #9af6e4; transition: width .2s linear; }
.jsi-btn { width: 100%; min-height: 54px; border-radius: 16px; border: 0; font: inherit; font-size: 17px; font-weight: 700; cursor: pointer; }
.jsi-btn:disabled { opacity: .5; cursor: default; }
.jsi-btn:focus-visible, .jsi-link:focus-visible, .jsi-quiet:focus-visible { outline: 3px solid #9af6e4; outline-offset: 3px; }
.jsi-btn-mint { background: #9af6e4; color: #0d3d3a; }
.jsi-btn-teal { background: #135450; color: #fff; }
.jsi-link { background: none; border: 0; color: inherit; font: inherit; font-size: 15px; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; padding: 10px; min-height: 44px; }
.jsi-small { font-size: 12.5px; opacity: .7; text-align: center; margin: 0; line-height: 1.5; max-width: 32ch; }
.jsi-alert { background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.28); border-radius: 14px; padding: 12px 14px; font-size: 14.5px; line-height: 1.45; }
.jsi-light .jsi-alert { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
.jsi-said { font-size: 22px; line-height: 1.45; font-weight: 500; margin: 0; }
.jsi-word { display: inline-block; opacity: 0; animation: jsi-word .45s ease-out forwards; }
.jsi-dots span { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #9af6e4; margin-left: 5px; vertical-align: middle; animation: jsi-dot 1.2s ease-in-out infinite; }
.jsi-dots span:nth-child(2) { animation-delay: .15s } .jsi-dots span:nth-child(3) { animation-delay: .3s }
.jsi-textarea { width: 100%; min-height: 190px; border-radius: 18px; border: 0; padding: 16px; font: inherit; font-size: 17px; line-height: 1.5; color: #16322f; background: #fff; resize: vertical; }
.jsi-textarea:focus { outline: 3px solid #9af6e4; }
.jsi-head { background: #eafaf6; border-bottom: 1px solid #d8e9e4; padding: 26px 24px 18px; display: flex; flex-direction: column; gap: 8px; }
.jsi-head h1 { font-size: 27px; margin: 0; color: #0d3d3a; letter-spacing: -0.01em; }
.jsi-card { background: #fff; border: 1px solid #d8e9e4; border-radius: 20px; padding: 14px 16px 16px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 1px 2px rgba(13,61,58,.04), 0 10px 28px rgba(13,61,58,.07); opacity: 0; animation: jsi-rise .55s cubic-bezier(.2,.8,.2,1) forwards; }
.jsi-label { font-size: 11.5px; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: #58716d; margin-bottom: 5px; display: block; }
.jsi-field { width: 100%; border: 1px solid transparent; background: #f4faf8; border-radius: 12px; padding: 10px 12px; font: inherit; font-size: 16px; line-height: 1.45; color: #16322f; resize: none; display: block; }
.jsi-field:focus { outline: none; border-color: #135450; background: #fff; }
.jsi-date { border: 1px solid #d8e9e4; background: #fff; border-radius: 999px; padding: 6px 12px; font: inherit; font-size: 14px; font-weight: 600; color: #135450; }
.jsi-fear { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 4px; }
.jsi-fear button { height: 36px; min-width: 0; border-radius: 9px; border: 1px solid #d8e9e4; background: #fff; font: inherit; font-size: 14px; font-weight: 700; color: #135450; cursor: pointer; padding: 0; }
.jsi-fear button[aria-pressed="true"] { background: #135450; border-color: #135450; color: #fff; }
.jsi-ask { color: #b45309; letter-spacing: .02em; text-transform: none; font-size: 13.5px; }
.jsi-remove { background: none; border: 0; color: #58716d; font: inherit; font-size: 14px; cursor: pointer; padding: 8px 4px; }
.jsi-foot { position: sticky; bottom: 0; padding: 14px 24px 22px; background: linear-gradient(to top, #f4faf8 72%, rgba(244,250,248,0)); }
.jsi-quote summary { cursor: pointer; font-size: 14px; font-weight: 700; color: #135450; }
.jsi-quote p { margin: 8px 0 0; font-size: 15px; line-height: 1.5; color: #58716d; font-style: italic; }
.jsi-start { color: #fff; background: radial-gradient(120% 90% at 0% 0%, #1d746e 0%, #135450 55%, #0d3d3a 100%); border-radius: 22px; padding: 20px 20px 10px; display: flex; flex-direction: column; gap: 14px; text-align: left; box-shadow: 0 12px 30px rgba(13,61,58,.18); }
.jsi-start-icon { flex: none; width: 52px; height: 52px; border-radius: 50%; background: #9af6e4; color: #0d3d3a; display: flex; align-items: center; justify-content: center; }
@keyframes jsi-breathe { 0%,100% { transform: scale(1); opacity: .95 } 50% { transform: scale(1.12); opacity: .55 } }
@keyframes jsi-word { from { opacity: 0; transform: translateY(6px); filter: blur(3px) } to { opacity: 1; transform: none; filter: none } }
@keyframes jsi-dot { 0%,80%,100% { opacity: .25; transform: translateY(0) } 40% { opacity: 1; transform: translateY(-4px) } }
@keyframes jsi-rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) {
  .jsi-word, .jsi-card { animation: none; opacity: 1; }
  .jsi-breathe .jsi-ring, .jsi-dots span { animation: none; }
}
`
