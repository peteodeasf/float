import { btn } from '../../components/ui/buttons'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listAccommodations, listAccommodationCheckins } from '../../api/accommodations'
import { DID_IT_LABEL, experimentWhen, listParentExperiments, type ParentExperiment } from '../../api/parentExperiments'
import { answerInfo, weekLabel } from '../../lib/checkin'
import ParentExperimentSheet from './ParentExperimentSheet'

/**
 * The parent's progress, on the Experiments tab: their accommodation experiments and their weekly
 * check-ins. Peter, 2026-09-13: tracking belongs here, not on the plan.
 * docs/plans/parent-accommodations-like-the-ladder.md
 */
export default function ParentProgressSection({ planId }: { planId: string }) {
  const [planning, setPlanning] = useState(false)
  const { data: accommodations = [] } = useQuery({
    queryKey: ['accommodations', planId],
    queryFn: () => listAccommodations(planId),
    enabled: !!planId,
  })
  const { data: experiments = [] } = useQuery({
    queryKey: ['parent-experiments', planId],
    queryFn: () => listParentExperiments(planId),
    enabled: !!planId,
  })
  const { data: checkins = [] } = useQuery({
    queryKey: ['accommodation-checkins', planId],
    queryFn: () => listAccommodationCheckins(planId),
    enabled: !!planId,
  })
  // Who answered only matters when more than one parent does.
  const manyParents = new Set(checkins.map(c => c.parent_email)).size > 1

  if (accommodations.length === 0 && experiments.length === 0 && checkins.length === 0) return null

  const card: React.CSSProperties = {
    background: 'var(--float-surface)', borderRadius: 'var(--float-radius-card)', border: '1px solid var(--float-border-strong)',
    boxShadow: '0 2px 6px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', padding: '16px 20px',
    display: 'flex', flexDirection: 'column', gap: '16px',
  }
  const heading: React.CSSProperties = { fontSize: '13px', fontWeight: 600, color: 'var(--float-text)' }
  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px',
    background: 'var(--float-surface)', border: '1px solid var(--float-border)',
    borderRadius: 'var(--float-radius-sm)', padding: '8px 12px',
  }

  return (
    <div style={card}>
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Parent</div>
      {planning && (
        <ParentExperimentSheet planId={planId} accommodations={accommodations} onClose={() => setPlanning(false)} />
      )}

      {/* The parent's accommodation experiments, and how each went: what they feared against what
          happened. docs/plans/parent-accommodation-experiments.md */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
          <span style={heading}>The parent's experiments</span>
          {accommodations.length > 0 && (
            <button
              onClick={() => setPlanning(true)}
              style={btn('secondary', 'sm')}
            >
              Set one up with the parent
            </button>
          )}
        </div>
        {experiments.length === 0 ? (
          <div style={{ fontSize: '12.5px', color: 'var(--float-text-hint)' }}>None yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {experiments.map(e => <ExperimentLine key={e.id} e={e} />)}
          </div>
        )}
      </div>

      {/* The parent's weekly answer about each accommodation they are working on. Whether they are
          ready to move on is the clinician's call, and this is what it rests on.
          docs/plans/weekly-checkin.md */}
      <div>
        <div style={{ ...heading, marginBottom: '8px' }}>Weekly check-ins</div>
        {checkins.length === 0 ? (
          <div style={{ fontSize: '12.5px', color: 'var(--float-text-hint)' }}>None yet.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {checkins.slice(0, 12).map(c => {
              const info = answerInfo(c.answer)
              return (
                <div key={c.id} style={row}>
                  <span style={{ flex: 'none', width: '104px', textAlign: 'center', fontSize: '11px', fontWeight: 700, borderRadius: 'var(--float-radius-pill)', padding: '2px 8px', background: info?.bg, color: info?.color }}>
                    {info?.clinicianLabel ?? c.answer}
                  </span>
                  <span style={{ flex: 1, minWidth: 0, color: 'var(--float-text)' }}>
                    {c.accommodation_name}
                    {manyParents && c.parent_email && (
                      <span style={{ color: 'var(--float-text-hint)' }}> · {c.parent_email}</span>
                    )}
                  </span>
                  <span style={{ flex: 'none', fontSize: '12px', color: 'var(--float-text-hint)' }}>
                    {weekLabel(c.week_start)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/** One of the parent's experiments: what, when, how it went, and what they feared against what
 *  happened. */
function ExperimentLine({ e }: { e: ParentExperiment }) {
  const planned = e.status === 'planned'
  const outcome = planned ? 'Planned' : e.did_it ? DID_IT_LABEL[e.did_it] : 'Recorded'
  const tone = planned
    ? { bg: 'var(--float-surface-sunken)', fg: '#475569' }
    : e.did_it === 'not_this_time' ? { bg: '#fef2f2', fg: '#b91c1c' } : { bg: '#f0fdf4', fg: '#166534' }
  const numbers = !planned && e.did_it !== 'not_this_time'
    ? `Upset: expected ${Math.round(e.expected_fear)}, was ${e.actual_fear != null ? Math.round(e.actual_fear) : '—'} · belief ${Math.round(e.belief_before)}% → ${e.belief_after != null ? `${Math.round(e.belief_after)}%` : '—'}`
    : null
  return (
    <div style={{ background: 'var(--float-surface)', border: '1px solid var(--float-border)', borderRadius: 'var(--float-radius-sm)', padding: '8px 12px', fontSize: '13px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ flex: 'none', width: '96px', textAlign: 'center', fontSize: '11px', fontWeight: 700, borderRadius: 'var(--float-radius-pill)', padding: '2px 8px', background: tone.bg, color: tone.fg }}>
          {outcome}
        </span>
        <span style={{ flex: 1, minWidth: 0, color: 'var(--float-text)' }}>{e.accommodation_name}</span>
        <span style={{ flex: 'none', fontSize: '12px', color: 'var(--float-text-hint)' }}>{experimentWhen(e)}</span>
      </div>
      <div style={{ fontSize: '12px', color: 'var(--float-text-secondary)', marginTop: '4px', paddingLeft: '106px', lineHeight: 1.5 }}>
        Feared: &ldquo;{e.prediction}&rdquo;
        {numbers && <> · {numbers}</>}
        {e.what_happened && <> · What happened: {e.what_happened}</>}
        {e.what_learned && <> · Learned: {e.what_learned}</>}
        {e.too_hard_reason && <> · Why not: {e.too_hard_reason}</>}
        {e.set_up_in_session && <> · set up in session</>}
      </div>
    </div>
  )
}
