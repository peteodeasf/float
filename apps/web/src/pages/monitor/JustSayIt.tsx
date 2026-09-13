/**
 * Just say it: a monitoring observation said out loud, or typed as a quick note.
 *
 * Peter, 2026-09-11: a faster way in than the four-box form, alongside it.
 * Peter, 2026-09-12: the parent just talks, and it goes. They are not shown a form to check. They
 * are told "Got it", asked one thing (how upset their child was), and that's all. Float writes it
 * up afterwards, and the clinician sees it with the parent's words. The recording is not kept.
 * docs/plans/monitoring-just-say-it.md
 */
import { Fragment, useEffect, useRef, useState } from 'react'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
export const MAX_SECONDS = 60
const BAR_COUNT = 24

/** What the parent said or typed, in their words. */
export interface CapturedNote {
  id: string
  words: string
  captured_by: 'voice' | 'note'
  entry_date: string
  fear_level: number | null
  created_at: string | null
}

/** The monitoring routes this uses, so the preview page and the tests can stand in for them. */
export interface CaptureApi {
  sayIt: (audio: Blob) => Promise<CapturedNote>
  writeIt: (text: string) => Promise<CapturedNote>
  setFear: (noteId: string, level: number) => Promise<void>
  deleteNote: (noteId: string) => Promise<void>
}

/** YYYY-MM-DD in the parent's own time, so "this morning" is their morning. */
export function localToday(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function captureApi(token: string): CaptureApi {
  const base = `${API_URL}/monitor/${token}`
  return {
    async sayIt(audio) {
      const fd = new FormData()
      fd.append('audio', audio, audio.type.includes('mp4') ? 'note.m4a' : 'note.webm')
      fd.append('today', localToday())
      return (await axios.post(`${base}/notes/voice`, fd)).data.note
    },
    async writeIt(text) {
      return (await axios.post(`${base}/notes/text`, { text, today: localToday() })).data.note
    },
    async setFear(noteId, level) {
      await axios.put(`${base}/notes/${noteId}/fear`, { fear_level: level })
    },
    async deleteNote(noteId) {
      await axios.delete(`${base}/notes/${noteId}`)
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

type Step = 'talk' | 'sending' | 'note' | 'done'

export default function JustSayIt({
  mode,
  childName,
  api,
  onClose,
  startDone,
}: {
  mode: 'talk' | 'note'
  childName: string
  api: CaptureApi
  /** Back to their list. */
  onClose: () => void
  /** Dev preview only: open on "Got it" with this note. */
  startDone?: CapturedNote
}) {
  const recordable = canRecord()
  const [step, setStep] = useState<Step>(startDone ? 'done' : mode === 'talk' && recordable ? 'talk' : 'note')
  const [problem, setProblem] = useState<string | null>(
    mode === 'talk' && !recordable ? "Recording doesn't work in this browser. You can type it instead." : null,
  )
  const [note, setNote] = useState('')
  const [sent, setSent] = useState<CapturedNote | null>(startDone ?? null)
  // Which screen a send came from, so "Sending" shows on that one.
  const [typing, setTyping] = useState(mode === 'note' || !recordable)

  const send = async (go: () => Promise<CapturedNote>, back: Step, fallback: string) => {
    setProblem(null)
    setStep('sending')
    try {
      setSent(await go())
      setStep('done')
    } catch (e) {
      setProblem(errorText(e, fallback))
      setStep(back)
    }
  }

  const rec = useRecorder(blob =>
    send(() => api.sayIt(blob), 'talk', "We couldn't send that. Try again, or type it."))

  const toTyping = () => {
    rec.cancel()
    setProblem(null)
    setTyping(true)
    setStep('note')
  }

  // ── Got it ──
  if (step === 'done' && sent) {
    return <GotIt note={sent} childName={childName} api={api} onClose={onClose} />
  }

  // ── Typing ──
  if (step === 'note' || (step === 'sending' && typing)) {
    const sending = step === 'sending'
    return (
      <Dark onBack={onClose}>
        <h1 className="jsi-title">What happened?</h1>
        <p className="jsi-sub">Write it the way you'd say it: where you were, what {childName} did, and what you did.</p>
        {problem && <div role="alert" className="jsi-alert">{problem}</div>}
        <textarea
          className="jsi-textarea"
          aria-label="What happened?"
          value={note}
          onChange={e => setNote(e.target.value)}
          maxLength={5000}
          disabled={sending}
          placeholder={`e.g. This morning ${childName} wouldn't get in the car for school. She cried and said her tummy hurt, so I let her stay home.`}
        />
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <button className="jsi-btn jsi-btn-mint" disabled={!note.trim() || sending}
            onClick={() => send(() => api.writeIt(note.trim()), 'note', "That didn't send. Please try again.")}>
            {sending ? 'Sending…' : 'Send'}
          </button>
          {recordable && !sending && (
            <button className="jsi-link" onClick={() => { setProblem(null); setTyping(false); setStep('talk') }}>Say it instead</button>
          )}
        </div>
      </Dark>
    )
  }

  // ── Talking ──
  const listening = rec.recording
  const sending = step === 'sending'
  return (
    <Dark onBack={() => { rec.cancel(); onClose() }}>
      {!listening && !sending && (
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
      {sending && <h1 className="jsi-title" role="status">Sending<Dots /></h1>}

      {(problem || rec.problem) && <div role="alert" className="jsi-alert">{problem || rec.problem}</div>}

      <div className="jsi-stage">
        <button
          className={`jsi-mic ${listening ? 'jsi-recording' : sending ? '' : 'jsi-breathe'}`}
          onClick={listening ? rec.stop : rec.start}
          disabled={sending}
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
          {listening ? 'Tap when you’re done' : sending ? '' : 'Tap to start'}
        </p>
      </div>

      {!listening && !sending && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
          <button className="jsi-link" onClick={toTyping}>Type it instead</button>
          <p className="jsi-small">Your recording is turned into text and then deleted. Only the text is kept.</p>
        </div>
      )}
    </Dark>
  )
}

/** "Got it", and the one question after it: how upset their child was. */
function GotIt({ note, childName, api, onClose }: {
  note: CapturedNote
  childName: string
  api: CaptureApi
  onClose: () => void
}) {
  const [picked, setPicked] = useState<number | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const words = note.words.split(/\s+/).filter(Boolean)

  const pick = async (level: number) => {
    setPicked(level)
    setProblem(null)
    try {
      await api.setFear(note.id, level)
      onClose()
    } catch {
      setPicked(null)
      setProblem("That didn't save. Try again, or skip it.")
    }
  }

  return (
    <Dark onBack={onClose} backLabel="Done">
      <div className="jsi-check" aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 className="jsi-title">Got it, thanks.</h1>
        <p className="jsi-sub">Your clinician will see it.</p>
      </div>
      <p className="jsi-said" aria-label={`What you ${note.captured_by === 'voice' ? 'said' : 'wrote'}`}>
        “{words.map((w, i) => (
          // The space sits outside the word: inside an inline-block it collapses and the words run together.
          <Fragment key={i}>
            <span className="jsi-word" style={{ animationDelay: `${Math.min(i * 35, 1400)}ms` }}>{w}</span>
            {i < words.length - 1 ? ' ' : ''}
          </Fragment>
        ))}”
      </p>

      <div className="jsi-ask">
        <span className="jsi-eyebrow">One more thing</span>
        <h2 className="jsi-q">How upset was {childName}?</h2>
        {problem && <div role="alert" className="jsi-alert">{problem}</div>}
        <div className="jsi-fear" role="group" aria-label={`How upset was ${childName}?`}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map(v => (
            <button key={v} aria-label={`Fear Level ${v}`} aria-pressed={picked === v}
              disabled={picked !== null} onClick={() => pick(v)}>
              {v}
            </button>
          ))}
        </div>
        <div className="jsi-scale"><span>1 · calm</span><span>10 · the most upset</span></div>
        <button className="jsi-link" style={{ alignSelf: 'center' }} disabled={picked !== null} onClick={onClose}>Skip</button>
      </div>
    </Dark>
  )
}

function Dots() {
  return <span className="jsi-dots" aria-hidden="true"><span /><span /><span /></span>
}

function Dark({ children, onBack, backLabel = 'Cancel' }: { children: React.ReactNode; onBack: () => void; backLabel?: string }) {
  return (
    <div className="jsi jsi-dark">
      <style>{CSS}</style>
      <div className="jsi-top">
        <button className="jsi-quiet" onClick={onBack}>{backLabel}</button>
        <span className="jsi-mark">float</span>
      </div>
      <div className="jsi-body">{children}</div>
    </div>
  )
}

// ── In their list, on the monitoring page ────────────────────────────────────

/** One thing they said or typed, in their words, with a way to delete it if they didn't mean to
 *  send it. Not the form: what Float wrote up from it is for the clinician. */
export function NoteRow({ note, onDelete }: { note: CapturedNote; onDelete: () => Promise<void> }) {
  const [asking, setAsking] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [problem, setProblem] = useState(false)
  const fear = note.fear_level
  return (
    <div className="jsi-note">
      <style>{CSS}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="jsi-note-date">
          {new Date(note.entry_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
        <span className="jsi-note-how">
          {note.captured_by === 'voice' ? <><MicIcon size={13} /> You said</> : 'You wrote'}
        </span>
        {fear != null && (
          <span className="jsi-note-fear" style={{
            background: fear >= 7 ? '#fef2f2' : fear >= 4 ? '#fffbeb' : '#f0fdf4',
            color: fear >= 7 ? '#dc2626' : fear >= 4 ? '#d97706' : '#16a34a',
          }} title="How upset">{fear}</span>
        )}
      </div>
      <p className="jsi-note-words">“{note.words}”</p>
      {asking ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, color: '#334155' }}>Delete this one?</span>
          <button className="jsi-note-btn jsi-note-danger" disabled={deleting} onClick={async () => {
            setDeleting(true)
            setProblem(false)
            try { await onDelete() } catch { setProblem(true); setDeleting(false) }
          }}>{deleting ? 'Deleting…' : 'Delete'}</button>
          <button className="jsi-note-btn" disabled={deleting} onClick={() => setAsking(false)}>Keep</button>
          {problem && <span role="alert" style={{ fontSize: 13, color: '#b91c1c' }}>That didn't delete. Try again.</span>}
        </div>
      ) : (
        <button className="jsi-note-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setAsking(true)}>Delete</button>
      )}
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
            {voice ? 'Talk for up to a minute.' : 'A few sentences is enough.'} That's it: it goes straight to your clinician.
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
.jsi-word { display: inline-block; opacity: 0; animation: jsi-word .45s ease-out forwards; }
.jsi-dots span { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #9af6e4; margin-left: 5px; vertical-align: middle; animation: jsi-dot 1.2s ease-in-out infinite; }
.jsi-dots span:nth-child(2) { animation-delay: .15s } .jsi-dots span:nth-child(3) { animation-delay: .3s }
.jsi-textarea { width: 100%; min-height: 190px; border-radius: 18px; border: 0; padding: 16px; font: inherit; font-size: 17px; line-height: 1.5; color: #16322f; background: #fff; resize: vertical; }
.jsi-textarea:focus { outline: 3px solid #9af6e4; }
.jsi-start { color: #fff; background: radial-gradient(120% 90% at 0% 0%, #1d746e 0%, #135450 55%, #0d3d3a 100%); border-radius: 22px; padding: 20px 20px 10px; display: flex; flex-direction: column; gap: 14px; text-align: left; box-shadow: 0 12px 30px rgba(13,61,58,.18); }
.jsi-start-icon { flex: none; width: 52px; height: 52px; border-radius: 50%; background: #9af6e4; color: #0d3d3a; display: flex; align-items: center; justify-content: center; }
.jsi-check { width: 64px; height: 64px; border-radius: 50%; background: #9af6e4; color: #0d3d3a; display: flex; align-items: center; justify-content: center; animation: jsi-pop .5s cubic-bezier(.2,1.4,.4,1) both; }
.jsi-said { font-size: 17px; line-height: 1.5; font-weight: 500; margin: 0; opacity: .9; font-style: italic; }
.jsi-ask { margin-top: auto; display: flex; flex-direction: column; gap: 10px; padding-top: 20px; border-top: 1px solid rgba(255,255,255,.14); }
.jsi-q { font-size: 22px; line-height: 1.2; font-weight: 700; margin: 0; }
.jsi-fear { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 8px; }
.jsi-fear button { height: 54px; min-width: 0; border-radius: 14px; border: 1.5px solid rgba(154,246,228,.35); background: rgba(255,255,255,.06); font: inherit; font-size: 20px; font-weight: 750; color: #fff; cursor: pointer; padding: 0; transition: transform .12s, background .15s; }
.jsi-fear button:active { transform: scale(.94); }
.jsi-fear button:focus-visible { outline: 3px solid #9af6e4; outline-offset: 2px; }
.jsi-fear button[aria-pressed="true"] { background: #9af6e4; border-color: #9af6e4; color: #0d3d3a; }
.jsi-fear button:disabled:not([aria-pressed="true"]) { opacity: .45; cursor: default; }
.jsi-scale { display: flex; justify-content: space-between; font-size: 12.5px; opacity: .7; }
.jsi-note { width: 100%; background: #fff; border-radius: 14px; padding: 14px 16px; border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 8px; text-align: left; }
.jsi-note-date { font-size: 13px; font-weight: 600; color: #64748b; }
.jsi-note-how { font-size: 12px; font-weight: 600; color: #135450; display: inline-flex; align-items: center; gap: 3px; }
.jsi-note-fear { margin-left: auto; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; flex: none; }
.jsi-note-words { margin: 0; font-size: 15px; line-height: 1.5; color: #1e293b; display: -webkit-box; -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; }
.jsi-note-btn { background: none; border: 0; padding: 6px 0; font: inherit; font-size: 14px; font-weight: 600; color: #64748b; cursor: pointer; min-height: 36px; }
.jsi-note-danger { color: #b91c1c; }
@keyframes jsi-pop { from { transform: scale(.4); opacity: 0 } to { transform: none; opacity: 1 } }
@keyframes jsi-breathe { 0%,100% { transform: scale(1); opacity: .95 } 50% { transform: scale(1.12); opacity: .55 } }
@keyframes jsi-word { from { opacity: 0; transform: translateY(6px); filter: blur(3px) } to { opacity: 1; transform: none; filter: none } }
@keyframes jsi-dot { 0%,80%,100% { opacity: .25; transform: translateY(0) } 40% { opacity: 1; transform: translateY(-4px) } }
@keyframes jsi-rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: none } }
@media (prefers-reduced-motion: reduce) {
  .jsi-word, .jsi-check { animation: none; opacity: 1; }
  .jsi-breathe .jsi-ring, .jsi-dots span { animation: none; }
}
`
