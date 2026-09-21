import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { useParentAuth } from '../../context/ParentAuthContext'
import { parentApiClient } from '../../api/client'
import TeenScreen from '../../components/teen/TeenScreen'
import ParentTabBar from '../../components/parent/ParentTabBar'
import teen from '../../styles/teenTokens'
import {
  getUpcomingExposures,
  getChildProgress,
  getParentAccommodations,
  createAccommodationNote,
  type UpcomingExposure,
  type ParentAccommodation,
} from '../../api/parent'

function whenLabel(e: UpcomingExposure): string {
  // No day set means the child picks it at home; the parent just knows it's coming this week.
  if (!e.scheduled_date) return 'This week'
  const day = new Date(e.scheduled_date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
  const b = e.scheduled_time_bucket
  return b ? `${day} · ${b.charAt(0).toUpperCase()}${b.slice(1)}` : day
}

/** "6", "6–8", or null. */
function fearLabel(lo: number | null | undefined, hi: number | null | undefined): string | null {
  if (lo == null && hi == null) return null
  if (lo != null && hi != null) return lo === hi ? `${lo}` : `${lo}–${hi}`
  return `${lo ?? hi}`
}

/** Highest fear range first (hardest to stop), so the parent sees the biggest thing first. */
function byFearDesc(a: ParentAccommodation, b: ParentAccommodation): number {
  const mid = (x: ParentAccommodation) => {
    const lo = x.fear_min, hi = x.fear_max
    if (lo == null && hi == null) return -1
    return ((lo ?? hi)! + (hi ?? lo)!) / 2
  }
  return mid(b) - mid(a)
}

const chipColor = (mid: number) =>
  mid >= 7 ? { bg: '#fef3c7', fg: '#b45309' } : mid >= 4 ? { bg: '#eafaf6', fg: '#0f6e56' } : { bg: '#ecfdf5', fg: '#047857' }

/** "How did it go?" on one accommodation — a free note the clinician reads. */
function AccommodationNoteField({ accommodationId }: { accommodationId: string }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [saved, setSaved] = useState(false)
  const mut = useMutation({
    mutationFn: () => createAccommodationNote(accommodationId, text.trim()),
    onSuccess: () => { setSaved(true); setOpen(false); setText('') },
  })

  const link: React.CSSProperties = {
    background: 'none', border: 0, padding: 0, cursor: 'pointer',
    fontFamily: teen.font.sans, fontSize: 13, fontWeight: 700, color: teen.color.tealMid,
  }

  if (!open) {
    return (
      <button style={link} onClick={() => { setSaved(false); setOpen(true) }}>
        {saved ? 'Saved ✓ · add another' : 'How did it go? ›'}
      </button>
    )
  }
  return (
    <div style={{ marginTop: 4 }}>
      <textarea
        value={text}
        autoFocus
        onChange={e => setText(e.target.value)}
        placeholder="How did it go this time?"
        rows={3}
        style={{
          width: '100%', boxSizing: 'border-box', resize: 'vertical',
          fontFamily: teen.font.sans, fontSize: 14, color: teen.color.ink,
          padding: '10px 12px', border: `1px solid ${teen.color.lineCard}`, borderRadius: teen.radius.btn, background: '#fff',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="teen-btn teen-btn--outline" style={{ flex: 'none', width: 'auto', padding: '8px 16px' }}
          disabled={!text.trim() || mut.isPending} onClick={() => mut.mutate()}>
          {mut.isPending ? 'Saving…' : 'Save'}
        </button>
        <button style={{ ...link, color: teen.color.textSecondary, alignSelf: 'center' }}
          onClick={() => { setOpen(false); setText('') }}>Cancel</button>
      </div>
      {mut.isError && (
        <p role="alert" style={{ ...teen.type.body, fontSize: 13, color: '#b91c1c', margin: '6px 0 0' }}>
          That didn't save. Please try again.
        </p>
      )}
    </div>
  )
}

export default function ParentHomePage() {
  const { logout } = useParentAuth()
  const navigate = useNavigate()

  const { data: me } = useQuery({
    queryKey: ['parent-me'],
    queryFn: async () => (await parentApiClient.get('/auth/me')).data,
  })
  const childName: string = me?.patient_name?.split(' ')[0] ?? 'your child'

  const { data: exposures = [] } = useQuery({ queryKey: ['parent-upcoming'], queryFn: getUpcomingExposures })
  const { data: progress } = useQuery({ queryKey: ['parent-progress'], queryFn: getChildProgress })
  const { data: accommodations = [] } = useQuery({ queryKey: ['parent-accommodations'], queryFn: getParentAccommodations })

  const accsForSituation = (situationId: string | null) =>
    (situationId ? accommodations.filter(a => a.trigger_situation_id === situationId) : []).sort(byFearDesc)

  const notShared = progress && !progress.shared

  return (
    <TeenScreen bubbles>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: `24px ${teen.space.pad} 0`, flex: 'none' }}>
        <span style={teen.type.wordmark}>float</span>
        <button
          onClick={() => { logout(); navigate('/parent/login') }}
          style={{ minHeight: 44, padding: '8px 4px', margin: '-8px -4px', background: 'none', border: 0, cursor: 'pointer', fontFamily: teen.font.sans, fontSize: 13, fontWeight: 600, color: teen.color.textSecondary }}
        >
          Sign out
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: `0 ${teen.space.pad}` }}>
        <h1 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: '14px 0 4px' }}>What {childName}'s working on</h1>
        <p style={{ ...teen.type.body, fontSize: 14, color: teen.color.inkSoft, margin: 0 }}>
          When {childName} works on a situation, here's your part in it.
        </p>

        {notShared ? (
          <div className="teen-card" style={{ marginTop: 16, padding: 22 }}>
            <p style={{ ...teen.type.body, margin: 0 }}>
              Your clinician hasn't shared {childName}'s plan with you yet. You'll see what's coming up here when they do.
            </p>
          </div>
        ) : exposures.length === 0 ? (
          <div className="teen-card" style={{ marginTop: 16, padding: 22 }}>
            <p style={{ ...teen.type.body, margin: 0 }}>Nothing scheduled in the next little while.</p>
          </div>
        ) : (
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {exposures.map(e => {
              const accs = accsForSituation(e.situation_id)
              return (
                <div key={e.id} className="teen-card" style={{ padding: 0, overflow: 'hidden' }}>
                  <div style={{ padding: '16px 18px 14px' }}>
                    {e.situation_name && <div style={teen.type.eyebrow}>{e.situation_name}</div>}
                    <div style={{ fontFamily: teen.font.sans, fontSize: 16, fontWeight: 700, color: teen.color.ink, marginTop: 6, lineHeight: 1.35 }}>
                      {e.behavior_name ?? e.situation_name ?? 'Exposure'}
                    </div>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, fontFamily: teen.font.sans, fontSize: 13, fontWeight: 700, color: teen.color.teal, background: '#eafaf6', borderRadius: 999, padding: '3px 11px' }}>
                      {whenLabel(e)}
                    </span>
                  </div>

                  <div style={{ background: '#f4faf8', borderTop: `1px solid ${teen.color.lineCard}`, padding: '14px 18px 16px' }}>
                    <div style={{ ...teen.type.eyebrow, marginBottom: 12 }}>Your accommodation behaviors</div>
                    {accs.length === 0 ? (
                      <p style={{ ...teen.type.body, fontSize: 13.5, color: teen.color.textSecondary, margin: 0 }}>
                        Nothing recorded for this situation yet.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {accs.map(a => {
                          const label = fearLabel(a.fear_min, a.fear_max)
                          const mid = ((a.fear_min ?? a.fear_max ?? 0) + (a.fear_max ?? a.fear_min ?? 0)) / 2
                          const c = chipColor(mid)
                          return (
                            <div key={a.id}>
                              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                                {label && (
                                  <span style={{ flexShrink: 0, marginTop: 1, fontFamily: teen.font.sans, fontSize: 12, fontWeight: 800, color: c.fg, background: c.bg, borderRadius: 999, padding: '2px 9px' }}>
                                    {label}
                                  </span>
                                )}
                                <span style={{ flex: 1, fontFamily: teen.font.sans, fontSize: 14.5, color: teen.color.ink, lineHeight: 1.4 }}>{a.name}</span>
                              </div>
                              <div style={{ marginLeft: label ? 44 : 0, marginTop: 5 }}>
                                <AccommodationNoteField accommodationId={a.id} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* The parent's half of the accommodation conversation — reachable, off the main flow. */}
        <button
          onClick={() => navigate('/parent/accommodations')}
          style={{ width: '100%', marginTop: 20, background: 'none', border: 0, cursor: 'pointer', textAlign: 'left', padding: '4px 0', fontFamily: teen.font.sans, fontSize: 13.5, fontWeight: 700, color: teen.color.tealMid }}
        >
          What do you do when {childName} is anxious? ›
        </button>

        <div style={{ height: 24 }} />
      </div>

      <ParentTabBar active="home" />
    </TeenScreen>
  )
}
