// The current action plan in the parent's app, with "was it given?" on each reward.
// docs/plans/action-plans-build.md
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getParentActionPlan, parentMarksReward, type ActionPlan, type ActionPlanItem } from '../../api/action_plans'
import teen from '../../styles/teenTokens'

const GROUPS: { kinds: ActionPlanItem['kind'][]; title: (child: string) => string }[] = [
  { kinds: ['exposure', 'tool'], title: c => `For ${c}` },
  { kinds: ['accommodation', 'parent_instruction'], title: () => 'For you' },
  { kinds: ['reward'], title: () => 'Rewards' },
]

const small = { ...teen.type.body, fontSize: 13.5, color: teen.color.inkSoft, marginTop: 3 }

function choice(on: boolean): React.CSSProperties {
  return {
    minHeight: 36, padding: '6px 16px', borderRadius: 999, cursor: 'pointer',
    fontFamily: teen.font.sans, fontSize: 13.5, fontWeight: 700,
    border: `1.5px solid ${on ? teen.color.teal : teen.color.lineCard}`,
    background: on ? teen.color.teal : '#fff', color: on ? '#fff' : teen.color.ink,
  }
}

function RewardAnswer({ item }: { item: ActionPlanItem }) {
  const qc = useQueryClient()
  const mut = useMutation({
    mutationFn: (given: boolean) => parentMarksReward(item.id, given),
    onSuccess: p => qc.setQueryData<ActionPlan | null>(['parent-action-plan'], p),
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
      <span style={{ ...teen.type.body, fontSize: 13.5, color: teen.color.inkSoft }}>Did you give it?</span>
      <button aria-pressed={item.reward_given === true} onClick={() => mut.mutate(true)} style={choice(item.reward_given === true)}>Yes</button>
      <button aria-pressed={item.reward_given === false} onClick={() => mut.mutate(false)} style={choice(item.reward_given === false)}>Not yet</button>
      {mut.isError && <span role="alert" style={{ fontSize: 13, color: '#b91c1c' }}>That didn't save.</span>}
    </div>
  )
}

export default function ParentActionPlanCard({ childName }: { childName: string }) {
  const { data: plan } = useQuery({ queryKey: ['parent-action-plan'], queryFn: getParentActionPlan })
  if (!plan) return null

  return (
    <div className="teen-card" style={{ marginTop: 16, padding: '18px 18px 8px' }}>
      <div style={teen.type.eyebrow}>Action plan</div>
      <div style={{ ...small, marginTop: 4 }}>
        Until the next session · from{' '}
        {new Date(plan.session_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
      </div>
      {GROUPS.map(g => {
        const items = plan.items.filter(i => g.kinds.includes(i.kind))
        if (items.length === 0) return null
        return (
          <div key={g.title(childName)} style={{ marginTop: 14 }}>
            <div style={{ fontFamily: teen.font.sans, fontSize: 14, fontWeight: 800, color: teen.color.ink }}>{g.title(childName)}</div>
            <ul style={{ listStyle: 'none', margin: '4px 0 0', padding: 0 }}>
              {items.map(i => (
                <li key={i.id} style={{ padding: '10px 0', borderTop: `1px solid ${teen.color.lineCard}` }}>
                  <div style={{ fontFamily: teen.font.sans, fontSize: 14.5, fontWeight: 600, color: teen.color.ink, lineHeight: 1.4 }}>{i.label}</div>
                  {i.reward_for && <div style={small}>For: {i.reward_for}</div>}
                  {(i.example_how_used || (!i.tool_name && i.tool_summary)) && <div style={small}>{i.example_how_used || i.tool_summary}</div>}
                  {i.note && <div style={small}>{i.note}</div>}
                  {i.kind === 'reward' && <RewardAnswer item={i} />}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}
