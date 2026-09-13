import { useNavigate } from 'react-router-dom'
import { clinicianModules, type EducationModule } from '../../data/education'
import PractitionerNav from '../../components/ui/PractitionerNav'
import { ModuleIcon } from '../../components/education/figures'
import { EDU_CSS } from '../../components/education/educationStyles'
import { getProgress, lastOpened } from '../../components/education/progress'

/** The modules in treatment order. docs/plans/education-redesign.md */
const GROUPS: { title: string; note: string; ids: string[] }[] = [
  { title: 'Foundations', note: 'Why anxiety lasts, and what families do', ids: ['understanding-anxiety', 'family-accommodation'] },
  { title: 'Assessment', note: 'Finding what to work on', ids: ['assessment-tools', 'downward-arrow'] },
  { title: 'Treatment', note: 'Ladders and exposures', ids: ['exposure-ladder', 'planning-exposures'] },
  { title: 'Working with parents', note: 'Reducing accommodation', ids: ['parent-module'] },
  { title: 'The app', note: 'Float day to day', ids: ['using-float'] },
]

const STATUS = { not_started: 'Not started', in_progress: 'In progress', complete: 'Done' } as const

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 50, c = 2 * Math.PI * r
  return (
    <div className="edu-ring" role="img" aria-label={`${done} of ${total} modules done`}>
      <svg width={116} height={116} viewBox="0 0 116 116">
        <circle cx={58} cy={58} r={r} fill="none" stroke="rgba(154,246,228,.18)" strokeWidth={10} />
        <circle cx={58} cy={58} r={r} fill="none" stroke="#9af6e4" strokeWidth={10} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - done / total)} />
      </svg>
      <div className="edu-ring-label"><b>{done}/{total}</b><span>modules done</span></div>
    </div>
  )
}

export default function EducationIndexPage({ basePath = '/education' }: { basePath?: string }) {
  const navigate = useNavigate()
  const byId = new Map(clinicianModules.map(m => [m.id, m]))
  const done = clinicianModules.filter(m => getProgress(m.id) === 'complete').length

  // Back to the module they were last in, or the first one they have not finished.
  const last = lastOpened()
  const resume: EducationModule | undefined =
    (last && byId.get(last) && getProgress(last) !== 'complete' ? byId.get(last) : undefined)
    ?? clinicianModules.find(m => getProgress(m.id) !== 'complete')
  const started = resume ? getProgress(resume.id) === 'in_progress' : false

  return (
    <div className="edu">
      <style>{EDU_CSS}</style>
      <PractitionerNav activePage="education" />

      <header className="edu-hero">
        <div className="edu-hero-in">
          <div style={{ flex: 1 }}>
            <div className="edu-eyebrow">Clinician guide</div>
            <h1>Using Exposure-based CBT and Float</h1>
          </div>
          <ProgressRing done={done} total={clinicianModules.length} />
        </div>
      </header>

      <main className="edu-body">
        {resume && (
          <button className="edu-continue" onClick={() => navigate(`${basePath}/${resume.id}`)}>
            <span className="edu-continue-icon"><ModuleIcon id={resume.id} size={32} /></span>
            <span>
              <span className="edu-eyebrow" style={{ color: '#135450' }}>{started ? 'Continue where you left off' : 'Start here'}</span>
              <span style={{ display: 'block', fontSize: 17, fontWeight: 750, color: '#0d3d3a', marginTop: 2 }}>
                {resume.number}. {resume.title}
              </span>
            </span>
            <span className="edu-continue-go">{started ? 'Continue' : 'Start'} →</span>
          </button>
        )}

        {GROUPS.map(g => (
          <section key={g.title} className="edu-group" aria-labelledby={`g-${g.title}`}>
            <div className="edu-group-head">
              <h2 id={`g-${g.title}`}>{g.title}</h2>
              <span>{g.note}</span>
            </div>
            <div className="edu-cards">
              {g.ids.map(id => byId.get(id)).filter((m): m is EducationModule => !!m).map(m => {
                const p = getProgress(m.id)
                return (
                  <button key={m.id} className={`edu-card ${p === 'complete' ? 'edu-card-done' : ''}`} onClick={() => navigate(`${basePath}/${m.id}`)}>
                    <span className="edu-card-icon"><ModuleIcon id={m.id} size={34} /></span>
                    <span style={{ minWidth: 0 }}>
                      <span className="edu-card-meta">
                        <span>Module {m.number}</span><span aria-hidden="true">·</span><span>{m.estimatedMinutes} min</span>
                        <span className={`edu-pill edu-pill-${p}`}>{STATUS[p]}</span>
                      </span>
                      <h3>{m.title}</h3>
                      <p>{m.description}</p>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  )
}
