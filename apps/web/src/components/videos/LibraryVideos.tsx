import { useEffect, useState } from 'react'
import { AUDIENCE_LABEL, formatDuration, listVideos, type Video } from '../../api/videos'
import VideoPlayerDialog from './VideoPlayerDialog'

/**
 * The Videos section of the Library: every published video, for watching or for showing a family
 * in session. Nothing is shown when there are none, or when videos are not set up.
 * docs/plans/videos.md
 */
export default function LibraryVideos() {
  const [videos, setVideos] = useState<Video[]>([])
  const [playing, setPlaying] = useState<Video | null>(null)

  useEffect(() => {
    let live = true
    listVideos().then(v => { if (live) setVideos(v) }).catch(() => { /* none shown */ })
    return () => { live = false }
  }, [])

  if (videos.length === 0) return null
  return (
    <section className="edu-group" aria-labelledby="g-videos">
      <div className="edu-group-head">
        <h2 id="g-videos">Videos</h2>
        <span>To watch, or to show a family in session</span>
      </div>
      <div className="edu-cards">
        {videos.map(v => (
          <button key={v.id} className="edu-card" onClick={() => setPlaying(v)}>
            <span className="edu-card-icon" aria-hidden="true" style={{ fontSize: 22 }}>▶</span>
            <span style={{ minWidth: 0 }}>
              <span className="edu-card-meta">
                <span>{AUDIENCE_LABEL[v.audience]}</span>
                {v.duration_seconds != null && <><span aria-hidden="true">·</span><span>{formatDuration(v.duration_seconds)}</span></>}
              </span>
              <h3>{v.title}</h3>
              {v.description && <p>{v.description}</p>}
            </span>
          </button>
        ))}
      </div>
      {playing && <VideoPlayerDialog video={playing} onClose={() => setPlaying(null)} />}
    </section>
  )
}
