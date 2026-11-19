import { lazy, Suspense, useEffect, useState } from 'react'
import { getVideoPlayback, type Video, type VideoPlayback } from '../../api/videos'

// The player is large; it loads only when a video is opened.
const MuxPlayer = lazy(() => import('@mux/mux-player-react'))

/**
 * One video, full screen, for watching alone or showing a family in session. It asks the backend
 * for a short-lived pass first; the video cannot play without one. docs/plans/videos.md
 */
export default function VideoPlayerDialog({ video, onClose }: { video: Video; onClose: () => void }) {
  const [playback, setPlayback] = useState<VideoPlayback | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    getVideoPlayback(video.id).then(p => { if (live) setPlayback(p) }).catch(() => { if (live) setFailed(true) })
    return () => { live = false }
  }, [video.id])

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  return (
    <div role="dialog" aria-modal="true" aria-label={video.title}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', color: '#fff' }}>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 600 }}>{video.title}</span>
        <button type="button" onClick={onClose} aria-label="Close the video"
          style={{ border: 0, background: 'rgba(255,255,255,0.15)', color: '#fff', borderRadius: 'var(--float-radius-control)', width: 36, height: 36, fontSize: 20, cursor: 'pointer' }}>×</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px 16px' }}>
        {failed ? (
          <p style={{ color: '#fff', fontSize: 14 }}>This video can't be played just now. Try again in a minute.</p>
        ) : playback ? (
          <Suspense fallback={null}>
            <MuxPlayer
              playbackId={playback.playback_id}
              tokens={{ playback: playback.token, thumbnail: playback.thumbnail_token }}
              streamType="on-demand"
              // Mux's viewing analytics send the page address and the device to Mux. Off: nothing
              // about the viewer goes to Mux (docs/plans/videos.md, HIPAA).
              disableTracking
              disableCookies
              autoPlay
              title={video.title}
              style={{ width: '100%', height: '100%', maxHeight: '100%', aspectRatio: '16 / 9' }}
            />
          </Suspense>
        ) : null}
      </div>
    </div>
  )
}
