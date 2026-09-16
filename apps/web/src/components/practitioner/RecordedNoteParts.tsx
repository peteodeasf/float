/**
 * Session Notes, for notes from a recorded session: recordings still being written up, and on a
 * draft note the transcript with the speakers named, renaming a speaker, and Approve.
 * docs/plans/session-recording.md
 */
import { btn, chip } from '../../components/ui/buttons'
import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { updateSessionNote, type SessionNote } from '../../api/session_notes'
import { discardRecording, listRecordings, retryRecording, type SessionRecording } from '../../api/sessionRecordings'

const NAMES = ['Clinician', 'Child', 'Parent', 'Other']

/** Recordings not yet a note. Checked every 20 seconds while one is being written up. */
export function RecordingsInProgress({ patientId }: { patientId: string }) {
  const qc = useQueryClient()
  const { data: recordings = [] } = useQuery({
    queryKey: ['recordings', patientId],
    queryFn: () => listRecordings(patientId),
    enabled: !!patientId,
    refetchInterval: q => ((q.state.data ?? []).some(r => r.status !== 'failed') ? 20_000 : false),
  })
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['recordings', patientId] })
    qc.invalidateQueries({ queryKey: ['session-notes', patientId] })
  }
  const retryMut = useMutation({ mutationFn: (id: string) => retryRecording(id), onSuccess: refresh })
  const discardMut = useMutation({ mutationFn: (id: string) => discardRecording(id), onSuccess: refresh })

  // A recording that drops off this list has become a note: show it without a reload.
  const shown = useRef<string[]>([])
  const ids = recordings.map(r => r.id).join(',')
  useEffect(() => {
    const now = ids ? ids.split(',') : []
    if (shown.current.some(id => !now.includes(id))) qc.invalidateQueries({ queryKey: ['session-notes', patientId] })
    shown.current = now
  }, [ids, patientId, qc])

  if (recordings.length === 0) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
      {recordings.map(r => <RecordingRow key={r.id} r={r}
        onRetry={() => retryMut.mutate(r.id)} onDiscard={() => { if (confirm('Delete this recording?')) discardMut.mutate(r.id) }}
        busy={retryMut.isPending || discardMut.isPending} />)}
    </div>
  )
}

function RecordingRow({ r, onRetry, onDiscard, busy }: { r: SessionRecording; onRetry: () => void; onDiscard: () => void; busy: boolean }) {
  const when = r.started_at ? new Date(r.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''
  const failed = r.status === 'failed'
  const text = failed ? (r.error ?? 'Something went wrong.')
    : r.status === 'recording' ? 'Still recording, or the phone was put away without Stop.'
    : 'Being written up. The draft note will appear here.'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '6px', fontSize: '12px',
      background: failed ? '#fef2f2' : '#eafaf6', color: failed ? '#991b1b' : '#0d3d3a' }}>
      <span aria-hidden="true" style={{ width: '8px', height: '8px', borderRadius: '50%', flex: 'none', background: failed ? '#dc2626' : '#135450' }} />
      <span style={{ flex: 1, minWidth: 0 }}><strong>Recording · {when}</strong> — {text}</span>
      {failed && <button onClick={onRetry} disabled={busy} style={tryAgainBtn}>Try again</button>}
      {r.status !== 'transcribing' && <button onClick={onDiscard} disabled={busy} style={deleteBtn}>Delete</button>}
    </div>
  )
}

/** Was a bare coloured word; now the app's small buttons. */
const tryAgainBtn: React.CSSProperties = { ...btn('secondary', 'sm'), flex: 'none' }
const deleteBtn: React.CSSProperties = { ...btn('danger', 'sm'), flex: 'none' }

/** On a note written from a recording: the draft mark, the transcript, and Approve. */
export function RecordedNoteDetails({ note, patientId }: { note: SessionNote; patientId: string }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const names = note.speaker_names ?? {}
  const refresh = () => qc.invalidateQueries({ queryKey: ['session-notes', patientId] })
  const renameMut = useMutation({
    mutationFn: ({ key, name }: { key: string; name: string }) => updateSessionNote(note.id, { speaker_names: { [key]: name } }),
    onSuccess: () => { setRenaming(null); refresh() },
  })
  const approveMut = useMutation({ mutationFn: () => updateSessionNote(note.id, { is_draft: false }), onSuccess: refresh })

  if (note.source !== 'recording' && !note.transcript) return null
  const speakers = Array.from(new Set((note.transcript ?? []).map(t => t.speaker)))

  return (
    <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        {note.transcript && note.transcript.length > 0 && (
          <button onClick={() => setOpen(o => !o)} aria-expanded={open} style={btn('secondary', 'sm')}>
            {open ? 'Hide transcript' : 'Transcript'}
          </button>
        )}
        {note.is_draft && (
          <button onClick={() => approveMut.mutate()} disabled={approveMut.isPending}
            style={{ ...btn('primary', 'sm'), marginLeft: 'auto' }}>
            {approveMut.isPending ? 'Approving…' : 'Approve note'}
          </button>
        )}
      </div>

      {open && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px' }}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px', fontSize: '11.5px', color: '#64748b' }}>
            <span>Speakers:</span>
            {speakers.map(key => (
              renaming === key ? (
                <span key={key} style={{ display: 'inline-flex', gap: '4px' }}>
                  {NAMES.map(n => (
                    <button key={n} onClick={() => renameMut.mutate({ key, name: n })} disabled={renameMut.isPending}
                      aria-pressed={names[key] === n} style={chip(names[key] === n, 'sm')}>
                      {n}
                    </button>
                  ))}
                </span>
              ) : (
                <button key={key} onClick={() => setRenaming(key)} title="Change who this speaker is"
                  style={chip(false, 'sm')}>
                  {names[key] ?? key} ✎
                </button>
              )
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '420px', overflowY: 'auto' }}>
            {(note.transcript ?? []).map((t, i) => (
              <p key={i} style={{ margin: 0, fontSize: '12.5px', lineHeight: 1.5, color: '#334155' }}>
                <strong style={{ color: '#0d3d3a' }}>{names[t.speaker] ?? t.speaker}:</strong> {t.text}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
