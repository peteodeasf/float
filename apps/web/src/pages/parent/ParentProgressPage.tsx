import type { CSSProperties } from 'react'
import { useQuery } from '@tanstack/react-query'
import { parentApiClient } from '../../api/client'
import { getChildProgress, type ChildProgress } from '../../api/parent'
import TeenScreen from '../../components/teen/TeenScreen'
import ParentTabBar from '../../components/parent/ParentTabBar'
import teen from '../../styles/teenTokens'

/**
 * What the child is doing: their ladder, what's planned and what they've done.
 *
 * Peter, 2026-09-10: the parent sees what they need to support, once the clinician switches it on
 * after asking the child. Not the child's own words or their ratings of each exposure — the server
 * never sends those. Plan: docs/plans/parent-sees-child-progress.md
 */

const BUCKET: Record<string, string> = { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening' }

function whenLabel(date: string | null, bucket: string | null): string {
  if (!date) return 'Day not picked yet'
  const day = new Date(date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  return bucket && BUCKET[bucket] ? `${day} · ${BUCKET[bucket]}` : day
}

const STATUS: Record<string, string> = { mastered: 'Done', in_progress: 'Started', not_started: 'Not started yet' }

export default function ParentProgressPage() {
  const { data: me } = useQuery({
    queryKey: ['parent-me'],
    queryFn: async () => (await parentApiClient.get('/auth/me')).data,
  })
  const childName: string = me?.patient_name?.split(' ')[0] ?? 'your child'
  const { data: progress, isLoading } = useQuery<ChildProgress>({
    queryKey: ['parent-progress'],
    queryFn: getChildProgress,
  })

  const eyebrow: CSSProperties = { ...teen.type.eyebrow, marginTop: 26 }
  const quiet: CSSProperties = { ...teen.type.body, fontSize: 14, color: teen.color.textSecondary, marginTop: 8 }
  const row: CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
    background: teen.color.card, border: `1px solid ${teen.color.lineCard}`, borderRadius: teen.radius.btn,
  }
  const name: CSSProperties = { fontFamily: teen.font.sans, fontSize: 15, fontWeight: 600, color: teen.color.ink }
  const sub: CSSProperties = { fontFamily: teen.font.sans, fontSize: 13, fontWeight: 600, color: teen.color.tealMid, marginTop: 3 }

  return (
    <TeenScreen>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: `24px ${teen.space.pad} 24px` }}>
        <h1 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: 0 }}>{childName}'s progress</h1>

        {isLoading ? (
          <p style={quiet}>Loading…</p>
        ) : !progress?.shared ? (
          <div className="teen-card" style={{ marginTop: 16, padding: 20 }}>
            <p style={{ ...teen.type.body, margin: 0 }}>
              Your clinician hasn't shared {childName}'s progress with you yet. They'll do that once {childName} agrees.
            </p>
          </div>
        ) : (
          <>
            <div style={eyebrow}>{childName}'s ladder</div>
            {progress.steps.length === 0 ? (
              <p style={quiet}>The ladder isn't ready yet.</p>
            ) : (
              <ol style={{ listStyle: 'none', margin: '12px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {progress.steps.map(s => (
                  <li key={s.id} style={row}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ ...name, display: 'block' }}>{s.name}</span>
                      <span style={{ ...sub, display: 'block', color: s.status === 'mastered' ? teen.color.teal : teen.color.textSecondary }}>
                        {s.status === 'mastered' ? '✓ ' : ''}{STATUS[s.status]}
                        {s.status === 'in_progress' && s.times_done > 0 ? ` · done ${s.times_done === 1 ? 'once' : `${s.times_done} times`}` : ''}
                      </span>
                    </span>
                    {s.fear_level != null && (
                      <span title="Fear Level" style={{ fontFamily: teen.font.sans, fontSize: 13, fontWeight: 700, color: teen.color.ink, whiteSpace: 'nowrap' }}>
                        {Math.round(s.fear_level)}<span style={{ color: teen.color.textSecondary, fontWeight: 600 }}>/10</span>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}

            <div style={eyebrow}>Planned</div>
            {progress.planned.length === 0 ? (
              <p style={quiet}>Nothing planned right now.</p>
            ) : (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {progress.planned.map(p => (
                  <div key={p.id} style={row}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ ...name, display: 'block' }}>{p.step_name}</span>
                      <span style={{ ...sub, display: 'block' }}>{whenLabel(p.scheduled_date, p.scheduled_time_bucket)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={eyebrow}>Done</div>
            {progress.done.length === 0 ? (
              <p style={quiet}>Nothing done yet.</p>
            ) : (
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {progress.done.map(d => (
                  <div key={d.id} style={row}>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ ...name, display: 'block' }}>{d.step_name}</span>
                      <span style={{ ...sub, display: 'block', color: teen.color.textSecondary }}>
                        {d.done_on ? new Date(d.done_on).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''}
                        {' · '}{d.outcome === 'did_it' ? 'Did it' : 'Felt too hard'}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
      <ParentTabBar active="progress" />
    </TeenScreen>
  )
}
