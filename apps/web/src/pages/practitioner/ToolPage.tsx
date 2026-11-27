/**
 * One tool or strategy, for the clinician: the page as a family reads it, and highlighting it for a
 * patient's child, parent or both. Every family can already read it; highlighting puts it first for
 * them. docs/plans/tools-and-strategies.md
 */
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import PractitionerNav from '../../components/ui/PractitionerNav'
import { EDU_CSS } from '../../components/education/educationStyles'
import ToolImage from '../../components/tools/ToolImage'
import VideoPlayerDialog from '../../components/videos/VideoPlayerDialog'
import { apiClient } from '../../api/client'
import { listVideos, type Video } from '../../api/videos'
import { getPatients } from '../../api/patients'
import { AUDIENCE_LABEL, KIND_LABEL, getTool, listHighlights, setHighlight } from '../../api/tools'
import { btn, chip } from '../../components/ui/buttons'

const panel: React.CSSProperties = { background: 'var(--float-surface)', border: '1px solid var(--float-border)', borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }
const panelTitle: React.CSSProperties = { fontSize: 16, fontWeight: 700, color: 'var(--float-primary-dark)' }

type Who = 'child' | 'parent' | 'both'

export default function ToolPage() {
  const { toolId } = useParams<{ toolId: string }>()
  const qc = useQueryClient()
  const { data: tool, isError } = useQuery({ queryKey: ['tool', toolId], queryFn: () => getTool(toolId!) })
  const { data: videos = [] } = useQuery({ queryKey: ['videos'], queryFn: listVideos })
  const { data: patients = [] } = useQuery({ queryKey: ['patients'], queryFn: getPatients })
  const { data: highlights = [] } = useQuery({ queryKey: ['tool-highlights', toolId], queryFn: () => listHighlights(toolId!) })
  const [playing, setPlaying] = useState<Video | null>(null)
  const [patientId, setPatientId] = useState('')
  const [who, setWho] = useState<Who | null>(null)

  const highlightMut = useMutation({
    mutationFn: ({ pid, child, parent }: { pid: string; child: boolean; parent: boolean }) => setHighlight(pid, toolId!, child, parent),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['tool-highlights', toolId] }); setPatientId(''); setWho(null) },
  })

  if (isError) return <div className="edu"><style>{EDU_CSS}</style><PractitionerNav activePage="education" /><p style={{ padding: 32 }}>This page isn't available.</p></div>
  if (!tool) return <div className="edu"><style>{EDU_CSS}</style><PractitionerNav activePage="education" /></div>

  // Only the people the page is written for.
  const choices: Who[] = tool.audience === 'both' ? ['child', 'parent', 'both'] : [tool.audience]
  const chosen = who ?? (choices.length === 1 ? choices[0] : null)
  const whoLabel: Record<Who, string> = { child: 'Child', parent: 'Parent', both: 'Both' }
  const videoById = new Map(videos.map(v => [v.id, v]))

  return (
    <div className="edu">
      <style>{EDU_CSS}</style>
      <PractitionerNav activePage="education" subHeader={{ backTo: '/education', backLabel: 'Library', title: tool.name }} />

      <header className="edu-mhero">
        <div className="edu-mhero-in" style={{ gridTemplateColumns: '1fr' }}>
          <div>
            <div className="edu-eyebrow">{KIND_LABEL[tool.kind]} · {AUDIENCE_LABEL[tool.audience]}</div>
            <h1>{tool.name}</h1>
            {tool.summary && <p>{tool.summary}</p>}
          </div>
        </div>
      </header>

      <div style={{ maxWidth: 1120, margin: '0 auto', padding: 32, display: 'flex', gap: 36, flexWrap: 'wrap' }}>
        <main style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tool.blocks.map((b, i) => {
            if (b.type === 'text') return (
              <div key={i} className="edu-prose">
                {b.text.split(/\n{2,}/).map((para, j) => <p key={j} className="edu-p" style={{ whiteSpace: 'pre-line' }}>{para}</p>)}
              </div>
            )
            if (b.type === 'image') return <ToolImage key={i} id={b.image_id} client={apiClient} />
            const v = videoById.get(b.video_id)
            return (
              <button key={i} onClick={() => v && setPlaying(v)} disabled={!v}
                style={{ height: 260, borderRadius: 16, background: 'var(--float-primary-dark)', border: 'none', cursor: v ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, color: '#fff', fontFamily: 'inherit' }}>
                <span aria-hidden="true" style={{ width: 60, height: 60, borderRadius: 999, background: 'var(--float-primary-mid)', color: 'var(--float-primary-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>▶</span>
                <span style={{ fontSize: 14, fontWeight: 700 }}>{v ? v.title : 'This video is not published'}</span>
              </button>
            )
          })}

          {tool.examples.length > 0 && (
            <section style={{ marginTop: 8 }}>
              <h2 style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--float-primary)', margin: '0 0 10px' }}>Examples</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tool.examples.map(ex => (
                  <div key={ex.id} style={{ background: 'var(--float-surface)', border: '1px solid var(--float-border)', borderRadius: 14, padding: '14px 16px' }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--float-primary-dark)' }}>{ex.name}</div>
                    {ex.how_used && <p className="edu-p" style={{ marginTop: 4, whiteSpace: 'pre-line' }}>{ex.how_used}</p>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>

        <aside style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={panel}>
            <div style={panelTitle}>Highlight for a family</div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--float-text-secondary)' }}>
              Every family can already find this in their app. Highlighting puts it at the top for them.
            </p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--float-text-secondary)' }}>Patient
              <select value={patientId} onChange={e => setPatientId(e.target.value)}
                style={{ fontFamily: 'inherit', fontSize: 14, color: 'var(--float-text)', border: '1px solid var(--float-border-strong)', borderRadius: 8, padding: '8px 10px', background: 'var(--float-surface)' }}>
                <option value="">Choose a patient</option>
                {patients.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            {choices.length > 1 && (
              <div style={{ display: 'flex', gap: 6 }}>
                {choices.map(c => <button key={c} aria-pressed={chosen === c} onClick={() => setWho(c)} style={chip(chosen === c, 'md')}>{whoLabel[c]}</button>)}
              </div>
            )}
            <button disabled={!patientId || !chosen || highlightMut.isPending}
              onClick={() => highlightMut.mutate({ pid: patientId, child: chosen === 'child' || chosen === 'both', parent: chosen === 'parent' || chosen === 'both' })}
              style={{ ...btn('primary', 'md'), opacity: patientId && chosen ? 1 : 0.45 }}>
              {highlightMut.isPending ? 'Highlighting…' : 'Highlight'}
            </button>
            {highlightMut.isError && <p role="alert" style={{ margin: 0, fontSize: 13, color: 'var(--float-danger)' }}>That didn't save. Try again.</p>}
          </div>

          {highlights.length > 0 && (
            <div style={panel}>
              <div style={panelTitle}>Highlighted for</div>
              {highlights.map(h => (
                <div key={h.patient_id} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '6px 0', borderTop: '1px solid var(--float-border)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: 'var(--float-text)' }}>{h.patient_name}</span>
                    <button onClick={() => highlightMut.mutate({ pid: h.patient_id, child: false, parent: false })} style={btn('quiet', 'sm')}>Remove</button>
                  </div>
                  {h.for_child && <OpenedLine who="Child" opened={h.child_opened} />}
                  {h.for_parent && <OpenedLine who="Parent" opened={h.parent_opened} />}
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
      {playing && <VideoPlayerDialog video={playing} onClose={() => setPlaying(null)} />}
    </div>
  )
}

function OpenedLine({ who, opened }: { who: string; opened: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: 'var(--float-text-secondary)' }}>{who}</span>
      <span style={{ fontWeight: opened ? 700 : 400, color: opened ? 'var(--float-success)' : 'var(--float-text-hint)' }}>{opened ? 'Opened' : 'Not opened'}</span>
    </div>
  )
}
