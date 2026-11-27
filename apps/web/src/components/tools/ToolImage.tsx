import { useEffect, useState } from 'react'
import type { AxiosInstance } from 'axios'

/**
 * An image on a tool page. Images need the signed-in person's pass, which an <img> cannot send, so
 * it is fetched and shown from memory. docs/plans/tools-and-strategies.md
 */
export default function ToolImage({ id, client, alt = '', style }: {
  id: string; client: AxiosInstance; alt?: string; style?: React.CSSProperties
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let url: string | null = null
    let live = true
    client.get(`/tool-images/${id}`, { responseType: 'blob' })
      .then(r => { if (!live) return; url = URL.createObjectURL(r.data); setSrc(url) })
      .catch(() => { if (live) setFailed(true) })
    return () => { live = false; if (url) URL.revokeObjectURL(url) }
  }, [id, client])

  if (failed) return <div style={{ ...style, fontSize: 12, color: 'var(--float-text-hint)' }}>The image didn't load.</div>
  if (!src) return <div style={{ ...style, background: 'var(--float-surface-sunken)' }} />
  return <img src={src} alt={alt} style={{ maxWidth: '100%', borderRadius: 'var(--float-radius-card)', ...style }} />
}
