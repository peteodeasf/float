/**
 * Tools — clinician utilities that stand apart from a single patient's plan. You enter the tool
 * first, then pick a patient.
 *
 * First (and for now only) tool: the ad-hoc downward arrow. A therapist runs a downward arrow on
 * its own — starting by typing a situation — without it being part of building the ladder. The
 * result lives in the patient's record but is not attached to the exposure plan.
 *
 * The chain itself reuses `ChainPhase` from the ladder's ArrowPage, so the interview is identical.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getPatients, type Patient } from '../../api/patients'
import {
  listPatientDownwardArrows,
  createPatientAdHocDownwardArrow,
  type DownwardArrow,
} from '../../api/treatment'
import { Chrome, screenSurface, primaryBtn, ghostBtn, bigQ, lead } from './sessionKit'
import { ChainPhase } from './ArrowPage'
import { Banner } from '../../components/ui/primitives'

type Phase = 'pick-patient' | 'patient' | 'situation' | 'chain'

// Only the arrows this tool makes: patient-level (no trigger situation) with a typed situation.
const isAdHoc = (a: DownwardArrow) => !a.trigger_situation_id && !!a.situation_text

export default function ToolsPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [phase, setPhase] = useState<Phase>('pick-patient')
  const [patient, setPatient] = useState<Patient | null>(null)
  const [filter, setFilter] = useState('')
  const [situation, setSituation] = useState('')
  const [arrow, setArrow] = useState<DownwardArrow | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const exit = () => navigate('/dashboard')

  const { data: patients } = useQuery({ queryKey: ['patients'], queryFn: getPatients })
  const { data: arrows } = useQuery({
    queryKey: ['patient-arrows', patient?.id],
    queryFn: () => listPatientDownwardArrows(patient!.id),
    enabled: !!patient,
  })
  const adHocArrows = (arrows ?? []).filter(isAdHoc)

  const pickPatient = (p: Patient) => { setPatient(p); setPhase('patient') }

  const startNew = async () => {
    if (!patient || !situation.trim()) return
    setBusy(true); setErr(null)
    try {
      const created = await createPatientAdHocDownwardArrow(patient.id, situation.trim())
      qc.invalidateQueries({ queryKey: ['patient-arrows', patient.id] })
      setArrow(created)
      setSituation('')
      setPhase('chain')
    } catch { setErr('Could not start the arrow. Try again.') }
    finally { setBusy(false) }
  }

  const backToPatient = () => {
    setArrow(null)
    setPhase('patient')
    if (patient) qc.invalidateQueries({ queryKey: ['patient-arrows', patient.id] })
  }

  // ── Pick a patient ─────────────────────────────────────────────
  if (phase === 'pick-patient') {
    const list = (patients ?? []).filter(p =>
      p.name.toLowerCase().includes(filter.trim().toLowerCase())
    )
    return (
      <Chrome onExit={exit} exitLabel="← Exit">
        <div style={screenSurface}>
          <div style={bigQ}>Downward arrow</div>
          <p style={lead}>Run a downward arrow on its own. Pick a patient to start.</p>
          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Search patients…"
            style={{ width: '100%', marginTop: 16, padding: '10px 12px', fontSize: 14, border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-control)' }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 14 }}>
            {list.map(p => (
              <button key={p.id} onClick={() => pickPatient(p)}
                style={{ display: 'block', textAlign: 'left', width: '100%', background: 'var(--float-surface)', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-card)', padding: '11px 13px', cursor: 'pointer', fontSize: 14, fontWeight: 700, color: 'var(--float-text)' }}>
                {p.name}
              </button>
            ))}
            {list.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--float-text-hint)' }}>No patients match.</div>
            )}
          </div>
        </div>
      </Chrome>
    )
  }

  // ── A patient's ad-hoc arrows + start a new one ────────────────
  if (phase === 'patient' && patient) {
    return (
      <Chrome onExit={exit} exitLabel="← Exit">
        <div style={screenSurface}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <div style={bigQ}>{patient.name} — downward arrows</div>
            <button onClick={() => { setPatient(null); setPhase('pick-patient') }} style={{ background: 'none', border: 'none', color: 'var(--float-text-hint)', fontSize: 13, cursor: 'pointer' }}>← Change patient</button>
          </div>
          <p style={lead}>Standalone arrows for this patient. They stay in the record and aren&rsquo;t on the exposure plan.</p>

          <button onClick={() => setPhase('situation')} style={primaryBtn}>+ New downward arrow</button>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 18 }}>
            {adHocArrows.map(a => (
              <button key={a.id} onClick={() => { setArrow(a); setPhase('chain') }}
                style={{ display: 'block', textAlign: 'left', width: '100%', background: 'var(--float-surface)', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-card)', padding: '11px 13px', cursor: 'pointer' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--float-text)' }}>{a.situation_text}</div>
                {a.feared_outcome && (
                  <div style={{ fontSize: 12.5, color: '#3f8a78', fontWeight: 600, marginTop: 5 }}>♡ &ldquo;{a.feared_outcome}&rdquo;</div>
                )}
              </button>
            ))}
            {adHocArrows.length === 0 && (
              <div style={{ fontSize: 13, color: 'var(--float-text-hint)' }}>None yet.</div>
            )}
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
          <p style={lead}>The situation the child finds hard — e.g. &ldquo;Ordering food at a restaurant&rdquo;.</p>
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
            <button onClick={() => { setSituation(''); setErr(null); setPhase('patient') }} style={{ ...ghostBtn, marginTop: 0 }}>← Back</button>
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
          onSaved={() => { if (patient) qc.invalidateQueries({ queryKey: ['patient-arrows', patient.id] }) }}
          onBack={backToPatient}
          onDone={backToPatient}
          backLabel="← Back to this patient"
        />
      </Chrome>
    )
  }

  return null
}
