// The child's current action plan. docs/plans/action-plans-build.md
// The server sends only the child's own items and parent instructions the clinician shared.
import { useQuery } from '@tanstack/react-query'
import { useTeenAuth } from '../../context/TeenAuthContext'
import { getMyActionPlan, type ActionPlanItem } from '../../api/action_plans'
import TeenScreen from '../../components/teen/TeenScreen'
import TeenTabBar from '../../components/teen/TeenTabBar'
import teen from '../../styles/teenTokens'

const SECTIONS: { kind: ActionPlanItem['kind']; title: string }[] = [
  { kind: 'exposure', title: 'Practice' },
  { kind: 'tool', title: 'Tools' },
  { kind: 'parent_instruction', title: 'How your parent will help' },
  { kind: 'reward', title: 'Rewards' },
]

function Line({ item }: { item: ActionPlanItem }) {
  return (
    <li style={{ padding: '10px 0', borderTop: `1px solid ${teen.color.mintSoft}` }}>
      <div style={{ ...teen.type.body, fontSize: 15, fontWeight: 600, color: teen.color.ink }}>{item.label}</div>
      {item.kind === 'reward' && item.reward_for && (
        <div style={{ ...teen.type.body, fontSize: 13.5, color: teen.color.inkSoft, marginTop: 3 }}>For: {item.reward_for}</div>
      )}
      {(item.example_how_used || (!item.tool_name && item.tool_summary)) && (
        <div style={{ ...teen.type.body, fontSize: 13.5, color: teen.color.inkSoft, marginTop: 3 }}>{item.example_how_used || item.tool_summary}</div>
      )}
      {item.note && (
        <div style={{ ...teen.type.body, fontSize: 13.5, color: teen.color.inkSoft, marginTop: 3 }}>{item.note}</div>
      )}
    </li>
  )
}

export default function TeenPlansPage() {
  const { patientId } = useTeenAuth()
  const { data: plan, isLoading } = useQuery({
    queryKey: ['teen-action-plan', patientId],
    queryFn: () => getMyActionPlan(),
    enabled: !!patientId,
  })

  return (
    <TeenScreen>
      <div style={{ flex: 'none', padding: `24px ${teen.space.pad} 6px` }}>
        <h1 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: 0 }}>My plan</h1>
        {plan && (
          <div style={{ ...teen.type.body, fontSize: 13, color: teen.color.inkSoft, marginTop: 6 }}>
            From your session on{' '}
            {new Date(plan.starts_on + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: `14px ${teen.space.pad} 0`, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {isLoading && (
          <p style={{ ...teen.type.body, color: teen.color.muted, textAlign: 'center', marginTop: 40 }}>Loading…</p>
        )}

        {!isLoading && !plan && (
          <div className="teen-card" style={{ padding: '24px 22px' }}>
            <div style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>Nothing yet</div>
            <p style={{ ...teen.type.body, margin: '12px 0 0' }}>
              No plan yet. You'll make one with your clinician at the end of your next session.
            </p>
          </div>
        )}

        {plan && SECTIONS.map(({ kind, title }) => {
          const items = plan.items.filter(i => i.kind === kind)
          if (items.length === 0) return null
          return (
            <div key={kind} className="teen-card" style={{ padding: '20px 22px 10px' }}>
              <div style={{ ...teen.type.eyebrow, color: teen.color.tealMid, marginBottom: 6 }}>{title}</div>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {items.map(i => <Line key={i.id} item={i} />)}
              </ul>
            </div>
          )
        })}

        <div style={{ height: 20, flex: 'none' }} />
      </div>

      <TeenTabBar active="plan" />
    </TeenScreen>
  )
}
