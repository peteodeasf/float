import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AUDIENCE_LABEL, KIND_LABEL, listTools, type ToolPage } from '../../api/tools'

/**
 * Tools and strategies in the Library: one heading, the same cards as the modules. Nothing shows
 * until a page is published. docs/plans/tools-and-strategies.md
 */
export default function LibraryTools() {
  const navigate = useNavigate()
  const [tools, setTools] = useState<ToolPage[]>([])
  // Fetched directly, like LibraryVideos, so the Library page needs nothing around it.
  useEffect(() => {
    let live = true
    listTools().then(t => { if (live) setTools(t) }).catch(() => { /* none shown */ })
    return () => { live = false }
  }, [])
  if (tools.length === 0) return null
  return (
    <section className="edu-group" aria-labelledby="g-tools">
      <div className="edu-group-head">
        <h2 id="g-tools">Tools and strategies</h2>
        <span>For families to learn and use, and to put on action plans</span>
      </div>
      <div className="edu-cards">
        {tools.map(t => (
          <button key={t.id} className="edu-card" onClick={() => navigate(`/education/tools/${t.id}`)}>
            <span className="edu-card-icon" aria-hidden="true" style={{ fontSize: 22, fontWeight: 800 }}>
              {t.name.charAt(0)}
            </span>
            <span style={{ minWidth: 0 }}>
              <span className="edu-card-meta">
                <span>{KIND_LABEL[t.kind]}</span><span aria-hidden="true">·</span><span>{AUDIENCE_LABEL[t.audience]}</span>
              </span>
              <h3>{t.name}</h3>
              {t.summary && <p>{t.summary}</p>}
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
