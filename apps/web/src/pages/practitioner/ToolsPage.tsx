/**
 * Tools — clinician utilities that stand apart from a single patient's plan.
 *
 * First (and for now only) tool: the ad-hoc downward arrow. A therapist runs a downward arrow on its
 * own — starting by typing a situation — without it being part of building the ladder. The result
 * lives in the patient's record but is not attached to the exposure plan.
 *
 * The page opens on the history of every ad-hoc arrow across the clinician's patients (each tagged
 * with who it's for, newest first), with a patient picker to start a new one. The chain itself reuses
 * `ChainPhase` from the ladder's ArrowPage, so the interview is identical.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPatients, type Patient } from '../../api/patients'
import {
  listAdHocDownwardArrows,
  createPatientAdHocDownwardArrow,
  type DownwardArrow,
} from '../../api/treatment'
import { Chrome, screenSurface, primaryBtn, ghostBtn, bigQ, lead } from './sessionKit'
import { ChainPhase } from './ArrowPage'
import { Banner } from '../../components/ui/primitives'

type Phase = 'home' | 'situation' | 'chain'

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return '' }
}

export default function ToolsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [phase, setPhase] = useState<Phase>('home')
  const [patient, setPatient] = useState<Patient | null>(null)
  const [filter, setFilter] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [situation, setSituation] = useState('')
  const [arrow, setArrow] = useState<DownwardArrow | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const exit = () => navigate('/dashboard')

  const { data: patients } = useQuery({ queryKey: ['patients'], queryFn: getPatients })
  // Every ad-hoc arrow across the clinician's patients, newest first — the history the page opens on.
  const { data: adHocArrows } = useQuery({ queryKey: ['adhoc-arrows'], queryFn: listAdHocDownwardArrows })

  const startNewFor = (p: Patient) => { setPatient(p); setSituation(''); setErr(null); setPhase('situation') }

  const startNew = async () => {
    if (!patient || !situation.trim()) return
    setBusy(true); setErr(null)
    try {
      const created = await createPatientAdHocDownwardArrow(patient.id, situation.trim())
      qc.invalidateQueries({ queryKey: ['adhoc-arrows'] })
      setArrow(created)
      setSituation('')
      setPhase('chain')
    } catch { setErr('Could not start the arrow. Try again.') }
    finally { setBusy(false) }
  }

  const backToHome = () => {
    setArrow(null)
    setPatient(null)
    setPhase('home')
    qc.invalidateQueries({ queryKey: ['adhoc-arrows'] })
  }

  // ── Home: history of all ad-hoc arrows + pick a patient to start a new one ──
  if (phase === 'home') {
    const list = (patients ?? []).filter(p =>
      p.name.toLowerCase().includes(filter.trim().toLowerCase())
    )
    return (
      <Chrome onExit={exit} exitLabel="← Exit">
        <div style={screenSurface}>
          <div style={bigQ}>Downward arrow</div>
          <p style={lead}>Run a downward arrow on its own. Pick a patient to start a new one.</p>
          {/* A collapsed dropdown that filters as you type, rather than the whole roster on screen. */}
          <div style={{ position: 'relative', marginTop: 16 }}>
            <input
              value={filter}
              onChange={e => { setFilter(e.target.value); setPickerOpen(true) }}
              onFocus={() => setPickerOpen(true)}
              onBlur={() => setTimeout(() => setPickerOpen(false), 120)}
              placeholder="Search patients to start a new arrow…"
              style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-control)' }}
            />
            {pickerOpen && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20, marginTop: 4, maxHeight: 280, overflowY: 'auto', background: 'var(--float-surface)', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-card)', boxShadow: '0 8px 24px rgba(13,61,58,.12)' }}>
                {list.map(p => (
                  <button key={p.id} onMouseDown={() => startNewFor(p)}
                    style={{ display: 'block', textAlign: 'left', width: '100%', background: 'none', border: 'none', borderBottom: '1px solid #eef2f1', padding: '10px 13px', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: 'var(--float-text)' }}>
                    {p.name}
                  </button>
                ))}
                {list.length === 0 && (
                  <div style={{ padding: '10px 13px', fontSize: 13, color: 'var(--float-text-hint)' }}>No patients match.</div>
                )}
              </div>
            )}
          </div>

          <div style={{ marginTop: 26 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--float-text-hint)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Recent downward arrows</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {(adHocArrows ?? []).map(a => (
                <button key={a.id} onClick={() => { setArrow(a); setPhase('chain') }}
                  style={{ display: 'block', textAlign: 'left', width: '100%', background: 'var(--float-surface)', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-card)', padding: '11px 13px', cursor: 'pointer' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--float-text)', minWidth: 0 }}>{a.situation_text}</span>
                    <span style={{ fontSize: 12, color: 'var(--float-text-hint)', flexShrink: 0 }}>{fmtDate(a.updated_at)}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--float-text-secondary)', marginTop: 3 }}>{a.patient_name}</div>
                  {a.feared_outcome
                    ? <div style={{ fontSize: 12.5, color: '#3f8a78', fontWeight: 600, marginTop: 5 }}>♡ &ldquo;{a.feared_outcome}&rdquo;</div>
                    : <div style={{ fontSize: 12, color: 'var(--float-text-hint)', marginTop: 5 }}>In progress</div>}
                </button>
              ))}
              {(adHocArrows ?? []).length === 0 && (
                <div style={{ fontSize: 13, color: 'var(--float-text-hint)' }}>None yet — pick a patient above to start one.</div>
              )}
            </div>
          </div>
        </div>
      </Chrome>
    )
  }

  // ── Type the situation ─────────────────────────────────────────
  if (phase === 'situation' && patient) {
    return (
      <Chrome onExit={exit} exitLabel="← Exit">
        <div style={screenSurface}>
          <div style={bigQ}>What situation are we looking at?</div>
          <p style={lead}>{patient.name} — the situation the child finds hard, e.g. &ldquo;Ordering food at a restaurant&rdquo;.</p>
          {err && <Banner tone="danger" style={{ marginTop: 12 }}>{err}</Banner>}
          <input
            value={situation}
            onChange={e => setSituation(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') void startNew() }}
            placeholder="Type the situation…"
            autoFocus
            style={{ width: '100%', marginTop: 16, padding: '10px 12px', fontSize: 15, border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-control)' }}
          />
          <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
            <button onClick={backToHome} style={{ ...ghostBtn, marginTop: 0 }}>← Back</button>
            <button onClick={() => void startNew()} disabled={!situation.trim() || busy} style={{ ...primaryBtn, marginTop: 0, opacity: !situation.trim() ? 0.4 : 1 }}>
              {busy ? 'Starting…' : 'Start →'}
            </button>
          </div>
        </div>
      </Chrome>
    )
  }

  // ── The chain (reused from the ladder arrow) ───────────────────
  if (phase === 'chain' && arrow) {
    return (
      <Chrome onExit={exit} exitLabel="← Exit">
        <ChainPhase
          key={arrow.id}
          name={arrow.situation_text ?? 'This situation'}
          openArrow={() => Promise.resolve(arrow)}
          onSaved={() => qc.invalidateQueries({ queryKey: ['adhoc-arrows'] })}
          onBack={backToHome}
          onDone={backToHome}
          backLabel="← Back to Tools"
        />
      </Chrome>
    )
  }

  return null
}
