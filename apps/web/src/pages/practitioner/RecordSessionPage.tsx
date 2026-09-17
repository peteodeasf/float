/**
 * Recording a session on the clinician's phone.
 *
 * Peter, 2026-09-13: the clinician hits record, and the whole session is recorded, transcribed with
 * the speakers named, and saved on the patient's record as a draft session note.
 *
 * The recording is uploaded in 30-second pieces as it goes, so nothing already recorded is lost if
 * the phone stops it. An iPhone stops a web page recording when the screen locks or another app
 * opens; the screen is kept on, and "Tap to carry on" adds to the same session.
 * docs/plans/session-recording.md
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPatient } from '../../api/patients'
import {
  confirmRecordingConsent, startRecording, stopRecording, uploadPiece, type SessionRecording,
} from '../../api/sessionRecordings'

const PIECE_MS = 30_000
const BAR_COUNT = 28
type Who = 'patient' | 'parent'
type Step = 'consent' | 'who' | 'recording' | 'interrupted' | 'saving' | 'saved' | 'error'

export function pickMime(): string {
  const options = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']
  const found = typeof MediaRecorder !== 'undefined' ? options.find(t => MediaRecorder.isTypeSupported?.(t)) : undefined
  return found ?? ''
}

export function canRecord(): boolean {
  return typeof window !== 'undefined' && typeof window.MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

export default function RecordSessionPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: patient, isLoading } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => getPatient(patientId!),
    enabled: !!patientId,
  })
  const firstName = patient?.name?.split(' ')[0] ?? 'the child'

  const [step, setStep] = useState<Step | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [agreedBy, setAgreedBy] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [who, setWho] = useState<Who[]>(['patient'])
  const [paused, setPaused] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [waiting, setWaiting] = useState(0)     // pieces not yet uploaded
  const [failing, setFailing] = useState(false) // the last upload attempt failed

  const live = useRef<{
    recording?: SessionRecording; mime?: string; rec?: MediaRecorder; stream?: MediaStream
    ctx?: AudioContext; raf?: number; timer?: number; lock?: { release: () => Promise<void> } | null
    segment: number; seq: number; queue: { segment: number; seq: number; blob: Blob }[]; pumping: boolean
    stopping: boolean; accumulated: number; since: number | null
  }>({ segment: 0, seq: 0, queue: [], pumping: false, stopping: false, accumulated: 0, since: null })
  const bars = useRef<(HTMLSpanElement | null)[]>([])

  useEffect(() => {
    if (!patient || step) return
    if (!canRecord()) { setProblem("This browser can't record. Open Float in Safari on an iPhone, or Chrome on Android."); setStep('error'); return }
    if (patient.closed_at) { setProblem("This patient's treatment is closed."); setStep('error'); return }
    setStep(patient.recording_consent_at ? 'who' : 'consent')
  }, [patient, step])

  // Warn before leaving while something is recording or still uploading.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (step === 'recording' || step === 'saving' || live.current.queue.length > 0) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [step])

  // Coming back to the page: a recording the phone stopped is shown as stopped, and the screen is
  // kept on again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      const l = live.current
      if (step === 'recording' && !l.stopping && (!l.rec || l.rec.state === 'inactive')) interrupt()
      if (step === 'recording') keepScreenOn()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  })

  useEffect(() => () => release(), [])

  const keepScreenOn = async () => {
    try {
      const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
      live.current.lock = wl ? await wl.request('screen') : null
    } catch { /* not offered: the screen may lock, and "Tap to carry on" covers it */ }
  }

  const release = () => {
    const l = live.current
    if (l.raf) cancelAnimationFrame(l.raf)
    if (l.timer) clearInterval(l.timer)
    l.stream?.getTracks().forEach(t => t.stop())
    l.ctx?.close().catch(() => {})
    l.lock?.release().catch(() => {})
    l.raf = undefined; l.timer = undefined; l.stream = undefined; l.ctx = undefined; l.lock = null
  }

  const pump = async () => {
    const l = live.current
    if (l.pumping || !l.recording) return
    l.pumping = true
    try {
      while (l.queue.length > 0) {
        const piece = l.queue[0]
        try {
          await uploadPiece(l.recording.id, piece.segment, piece.seq, piece.blob, (l.mime || 'audio/webm').split(';')[0])
          l.queue.shift()
          setFailing(false)
        } catch {
          setFailing(true)
          await new Promise(r => setTimeout(r, 3000))
        }
        setWaiting(l.queue.length)
      }
    } finally {
      l.pumping = false
    }
  }

  const tick = () => {
    const l = live.current
    setElapsed(l.accumulated + (l.since ? Date.now() - l.since : 0))
  }

  const interrupt = () => {
    const l = live.current
    if (l.since) { l.accumulated += Date.now() - l.since; l.since = null }
    release()
    setStep('interrupted')
  }

  /** A stretch of recording: the first, or the next after "Tap to carry on". */
  const beginSegment = async () => {
    const l = live.current
    setProblem(null)
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setProblem("Float can't use the microphone. Allow it for this browser in your phone's settings, then try again.")
      return false
    }
    l.segment += 1
    l.seq = 0
    l.stream = stream
    const rec = new MediaRecorder(stream, l.mime ? { mimeType: l.mime, audioBitsPerSecond: 32000 } : undefined)
    const segment = l.segment
    rec.ondataavailable = ev => {
      if (ev.data.size > 0) {
        l.queue.push({ segment, seq: l.seq++, blob: ev.data })
        setWaiting(l.queue.length)
        pump()
      }
    }
    rec.onstop = () => { if (!l.stopping && l.rec === rec) interrupt() }
    stream.getAudioTracks()[0]?.addEventListener('ended', () => { if (!l.stopping && l.rec === rec) interrupt() })
    l.rec = rec

    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new Ctx()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 64
      ctx.createMediaStreamSource(stream).connect(analyser)
      l.ctx = ctx
      const data = new Uint8Array(analyser.frequencyBinCount)
      const draw = () => {
        analyser.getByteFrequencyData(data)
        bars.current.forEach((el, i) => { if (el) el.style.transform = `scaleY(${0.1 + ((data[i + 1] ?? 0) / 255) * 0.9})` })
        l.raf = requestAnimationFrame(draw)
      }
      l.raf = requestAnimationFrame(draw)
    } catch { /* the bars stay still; the recording still works */ }

    rec.start(PIECE_MS)
    l.since = Date.now()
    l.timer = window.setInterval(tick, 500)
    await keepScreenOn()
    setPaused(false)
    setStep('recording')
    return true
  }

  const start = async () => {
    const l = live.current
    setProblem(null)
    l.mime = pickMime()
    try {
      l.recording = await startRecording(patientId!, who, (l.mime || 'audio/webm').split(';')[0])
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setProblem(detail ?? "The recording couldn't start. Check your connection and try again.")
      return
    }
    if (!(await beginSegment())) l.segment = 0
  }

  const togglePause = () => {
    const l = live.current
    if (!l.rec) return
    if (paused) {
      l.rec.resume()
      l.since = Date.now()
      setPaused(false)
    } else {
      l.rec.pause()
      if (l.since) { l.accumulated += Date.now() - l.since; l.since = null }
      tick()
      setPaused(true)
    }
  }

  const stopAndSave = async () => {
    const l = live.current
    l.stopping = true
    if (l.since) { l.accumulated += Date.now() - l.since; l.since = null }
    setStep('saving')
    // Stopping hands over the last piece before it ends.
    if (l.rec && l.rec.state !== 'inactive') {
      await new Promise<void>(resolve => {
        const rec = l.rec!
        rec.addEventListener('stop', () => resolve(), { once: true })
        rec.stop()
      })
    }
    release()
    while (l.queue.length > 0 || l.pumping) {
      pump()
      await new Promise(r => setTimeout(r, 500))
    }
    try {
      if (l.recording) await stopRecording(l.recording.id)
      qc.invalidateQueries({ queryKey: ['recordings', patientId] })
      setStep('saved')
    } catch {
      setProblem("The recording is uploaded, but it couldn't be sent for writing up. Try again.")
      l.stopping = false
    }
  }

  const saveConsent = async () => {
    setProblem(null)
    try {
      await confirmRecordingConsent(patientId!, agreedBy.trim())
      qc.invalidateQueries({ queryKey: ['patient', patientId] })
      setStep('who')
    } catch {
      setProblem("That didn't save. Please try again.")
    }
  }

  const back = () => navigate(`/patients/${patientId}?tab=sessions`)

  return (
    <div className="rs">
      <style>{CSS}</style>
      <div className="rs-top">
        {step === 'recording' || step === 'saving' || step === 'interrupted'
          ? <span className="rs-top-note">{patient?.name}</span>
          : <button className="rs-quiet" onClick={back}>← Back</button>}
        <span className="rs-mark">float</span>
      </div>

      <main className="rs-body">
        {(isLoading || !step) && <p className="rs-sub">Loading…</p>}

        {step === 'error' && (
          <>
            <h1 className="rs-title">Can't record here</h1>
            <p className="rs-sub">{problem}</p>
            <button className="rs-btn rs-btn-mint" onClick={back}>Back to {firstName}</button>
          </>
        )}

        {step === 'consent' && (
          <>
            <h1 className="rs-title">Before you record</h1>
            <p className="rs-sub">Everyone in the session needs to agree to it being recorded. Float turns the recording into a transcript and a draft note, then deletes the recording.</p>
            <label className="rs-label" htmlFor="rs-agreed-by">Who agreed</label>
            <input id="rs-agreed-by" className="rs-input" value={agreedBy} onChange={e => setAgreedBy(e.target.value)}
              placeholder={`e.g. ${firstName} and their mother, verbally`} maxLength={300} />
            <label className="rs-check">
              <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)} />
              <span>Everyone in the session has agreed to it being recorded</span>
            </label>
            {problem && <div role="alert" className="rs-alert">{problem}</div>}
            <button className="rs-btn rs-btn-mint" disabled={!agreed || !agreedBy.trim()} onClick={saveConsent}>Continue</button>
          </>
        )}

        {step === 'who' && (
          <>
            <h1 className="rs-title">Who's in the session?</h1>
            <p className="rs-sub">With you and {patient?.name}.</p>
            <div className="rs-who">
              {([['patient', firstName], ['parent', 'Parent']] as [Who, string][]).map(([key, label]) => (
                <button key={key} className="rs-pill" aria-pressed={who.includes(key)}
                  onClick={() => setWho(w => (w.includes(key) ? w.filter(x => x !== key) : [...w, key]))}>
                  {label}
                </button>
              ))}
            </div>
            <p className="rs-small">Keep the phone between you, face up, with Float open. The screen stays on while it records.</p>
            {problem && <div role="alert" className="rs-alert">{problem}</div>}
            <button className="rs-btn rs-btn-mint rs-btn-big" disabled={who.length === 0} onClick={start}>
              <span className="rs-dot" aria-hidden="true" /> Start recording
            </button>
          </>
        )}

        {step === 'recording' && (
          <>
            <div className="rs-status" role="status">
              <span className={`rs-live ${paused ? 'rs-live-paused' : ''}`} aria-hidden="true" />
              {paused ? 'Paused' : 'Recording'}
            </div>
            <div className="rs-time" aria-label={`Recorded ${clock(elapsed)}`}>{clock(elapsed)}</div>
            <div className="rs-bars" aria-hidden="true" style={{ opacity: paused ? 0.3 : 1 }}>
              {Array.from({ length: BAR_COUNT }, (_, i) => <span key={i} className="rs-bar" ref={el => { bars.current[i] = el }} />)}
            </div>
            <p className="rs-small">
              {failing ? `Saving is behind (${waiting} to upload). It keeps trying; keep this screen open.` : 'Keep this screen open. What is recorded is saved as you go.'}
            </p>
            <div className="rs-controls">
              <button className="rs-btn rs-btn-ghost" onClick={togglePause}>{paused ? 'Resume' : 'Pause'}</button>
              <button className="rs-btn rs-btn-mint" onClick={stopAndSave}>Stop and save</button>
            </div>
          </>
        )}

        {step === 'interrupted' && (
          <>
            <h1 className="rs-title">Recording stopped</h1>
            <p className="rs-sub">Your phone stopped the recording, probably because the screen locked or another app opened. Everything up to {clock(elapsed)} is saved.</p>
            {problem && <div role="alert" className="rs-alert">{problem}</div>}
            <button className="rs-btn rs-btn-mint rs-btn-big" onClick={() => beginSegment()}>Tap to carry on</button>
            <button className="rs-link" onClick={stopAndSave}>Stop and save</button>
          </>
        )}

        {step === 'saving' && (
          <>
            <h1 className="rs-title">Saving the recording…</h1>
            <p className="rs-sub">{waiting > 0 ? `${waiting} ${waiting === 1 ? 'piece' : 'pieces'} left to upload. Keep this screen open.` : 'Almost there.'}</p>
            {problem && (
              <>
                <div role="alert" className="rs-alert">{problem}</div>
                <button className="rs-btn rs-btn-mint" onClick={stopAndSave}>Try again</button>
              </>
            )}
          </>
        )}

        {step === 'saved' && (
          <>
            <div className="rs-check-big" aria-hidden="true">✓</div>
            <h1 className="rs-title">Saved</h1>
            <p className="rs-sub">Float is writing up the session. The note will be in {firstName}'s Session Notes as a draft in a few minutes, with the transcript. You can close this.</p>
            <button className="rs-btn rs-btn-mint" onClick={back}>Back to {firstName}</button>
          </>
        )}
      </main>
    </div>
  )
}

const CSS = `
.rs { min-height: 100vh; max-width: 520px; margin: 0 auto; display: flex; flex-direction: column; color: #fff; background: radial-gradient(130% 70% at 50% 0%, #1d746e 0%, var(--float-primary) 45%, var(--float-primary-dark) 100%); box-sizing: border-box; }
.rs *, .rs *::before, .rs *::after { box-sizing: border-box; }
.rs-top { display: flex; align-items: center; justify-content: space-between; padding: 14px 22px 0; min-height: 52px; }
.rs-mark { font-weight: 800; letter-spacing: -0.02em; font-size: 19px; opacity: .92; }
.rs-top-note { font-size: 14px; font-weight: 600; opacity: .8; }
.rs-quiet { background: none; border: 0; color: inherit; opacity: .85; font: inherit; font-size: 15px; padding: 8px 0; cursor: pointer; min-height: 44px; }
.rs-body { flex: 1; display: flex; flex-direction: column; gap: 16px; padding: 24px 22px 32px; }
.rs-title { font-size: 30px; line-height: 1.15; font-weight: 750; margin: 0; letter-spacing: -0.01em; text-wrap: balance; }
.rs-sub { margin: 0; font-size: 16px; line-height: 1.55; opacity: .85; }
.rs-small { margin: 0; font-size: 13.5px; line-height: 1.5; opacity: .75; }
.rs-label { font-size: 13px; font-weight: 700; opacity: .85; margin-bottom: -8px; }
.rs-input { width: 100%; border: 0; border-radius: 14px; padding: 14px; font: inherit; font-size: 16px; color: var(--float-primary-dark); background: #fff; }
.rs-input:focus { outline: 3px solid var(--float-primary-mid); }
.rs-check { display: flex; gap: 12px; align-items: flex-start; font-size: 15.5px; line-height: 1.45; cursor: pointer; }
.rs-check input { width: 22px; height: 22px; margin-top: 1px; accent-color: var(--float-primary-mid); flex: none; }
.rs-who { display: flex; gap: 10px; flex-wrap: wrap; }
.rs-pill { font: inherit; font-size: 17px; font-weight: 700; border-radius: 999px; padding: 12px 22px; cursor: pointer; color: #fff; background: rgba(255,255,255,.08); border: 1.5px solid rgba(154,246,228,.4); min-height: 48px; }
.rs-pill[aria-pressed="true"] { background: var(--float-primary-mid); color: var(--float-primary-dark); border-color: var(--float-primary-mid); }
.rs-btn { width: 100%; min-height: 54px; border-radius: 16px; border: 0; font: inherit; font-size: 17px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; }
.rs-btn:disabled { opacity: .45; cursor: default; }
.rs-btn:focus-visible, .rs-pill:focus-visible, .rs-link:focus-visible, .rs-quiet:focus-visible { outline: 3px solid var(--float-primary-mid); outline-offset: 3px; }
.rs-btn-mint { background: var(--float-primary-mid); color: var(--float-primary-dark); }
.rs-btn-ghost { background: rgba(255,255,255,.1); color: #fff; border: 1.5px solid rgba(255,255,255,.3); }
.rs-btn-big { min-height: 64px; font-size: 19px; margin-top: auto; }
.rs-dot { width: 14px; height: 14px; border-radius: 50%; background: #d64545; }
.rs-link { background: none; border: 0; color: inherit; font: inherit; font-size: 15.5px; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; cursor: pointer; padding: 10px; min-height: 44px; }
.rs-alert { background: rgba(255,255,255,.12); border: 1px solid rgba(255,255,255,.28); border-radius: 14px; padding: 12px 14px; font-size: 14.5px; line-height: 1.45; }
.rs-status { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; margin-top: 12px; }
.rs-live { width: 12px; height: 12px; border-radius: 50%; background: #ff6b6b; box-shadow: 0 0 0 0 rgba(255,107,107,.6); animation: rs-pulse 1.6s infinite; }
.rs-live-paused { background: #f2c14e; animation: none; }
.rs-time { font-size: 64px; font-weight: 750; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; line-height: 1; }
.rs-bars { display: flex; align-items: center; gap: 4px; height: 64px; transition: opacity .3s; }
.rs-bar { flex: 1; height: 64px; border-radius: 3px; background: var(--float-primary-mid); transform: scaleY(.1); transform-origin: center; transition: transform 80ms linear; }
.rs-controls { margin-top: auto; display: grid; grid-template-columns: 1fr 1.4fr; gap: 10px; }
.rs-check-big { width: 72px; height: 72px; border-radius: 50%; background: var(--float-primary-mid); color: var(--float-primary-dark); font-size: 38px; font-weight: 800; display: flex; align-items: center; justify-content: center; margin-top: 20px; }
@keyframes rs-pulse { 0% { box-shadow: 0 0 0 0 rgba(255,107,107,.6) } 70% { box-shadow: 0 0 0 12px rgba(255,107,107,0) } 100% { box-shadow: 0 0 0 0 rgba(255,107,107,0) } }
@media (prefers-reduced-motion: reduce) { .rs-live { animation: none; } .rs-bar { transition: none; } }
`
