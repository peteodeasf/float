import { MicIcon } from '../../pages/monitor/JustSayIt'

/**
 * What the parent said or typed, when Float wrote the monitoring observation up from it. The
 * clinician's way to check what Float made of it. docs/plans/monitoring-just-say-it.md
 */
export default function ParentWords({ entry }: { entry: { parent_words?: string | null; captured_by?: string } }) {
  if (!entry.parent_words) return null
  return (
    <details style={{ marginTop: 6 }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--float-primary)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        {entry.captured_by === 'voice' && <MicIcon size={13} />}
        {entry.captured_by === 'voice' ? 'Audio recorded' : "Typed as a note · the parent's words"}
      </summary>
      <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--float-text-secondary)', fontStyle: 'italic', whiteSpace: 'pre-wrap' }}>
        &ldquo;{entry.parent_words}&rdquo;
      </p>
    </details>
  )
}
