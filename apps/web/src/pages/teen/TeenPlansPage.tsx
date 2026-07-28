import { useQuery } from '@tanstack/react-query'
import { useTeenAuth } from '../../context/TeenAuthContext'
import { getMyActionPlans, ActionPlan } from '../../api/action_plans'
import TeenScreen from '../../components/teen/TeenScreen'
import TeenTabBar from '../../components/teen/TeenTabBar'
import teen from '../../styles/teenTokens'

export default function TeenPlansPage() {
  const { patientId } = useTeenAuth()

  const { data: plans, isLoading } = useQuery({
    queryKey: ['teen-action-plans', patientId],
    queryFn: () => getMyActionPlans(),
    enabled: !!patientId,
  })

  return (
    <TeenScreen>
      <div style={{ flex: 'none', padding: `24px ${teen.space.pad} 6px` }}>
        <h1 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: 0 }}>My plan</h1>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: `14px ${teen.space.pad} 0`,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {isLoading && (
          <p
            style={{
              ...teen.type.body,
              color: teen.color.muted,
              textAlign: 'center',
              marginTop: 40,
            }}
          >
            Loading…
          </p>
        )}

        {plans && plans.length === 0 && (
          <div className="teen-card" style={{ padding: '24px 22px' }}>
            <div style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>Nothing yet</div>
            <p style={{ ...teen.type.body, margin: '12px 0 0' }}>
              No plan yet. Your clinician will publish one after each session.
            </p>
          </div>
        )}

        {plans &&
          plans.map((plan: ActionPlan) => (
            <div key={plan.id} className="teen-card" style={{ padding: '22px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>
                    Session {plan.session_number}
                  </div>
                  <div
                    style={{
                      ...teen.type.body,
                      fontSize: 13,
                      color: teen.color.muted,
                      marginTop: 5,
                    }}
                  >
                    {new Date(plan.session_date + 'T00:00:00').toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </div>
                </div>
                {plan.nickname && (
                  <span
                    style={{
                      fontFamily: teen.font.mono,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.04em',
                      padding: '4px 10px',
                      borderRadius: teen.radius.pill,
                      background: teen.color.mintSoft,
                      color: teen.color.teal,
                      flex: 'none',
                    }}
                  >
                    {plan.nickname}
                  </span>
                )}
              </div>

              {plan.content && (
                <div
                  className="teen-plan-content"
                  dangerouslySetInnerHTML={{ __html: plan.content }}
                />
              )}

              {plan.next_appointment && (
                <div
                  style={{
                    background: teen.color.mintSoft,
                    borderRadius: 12,
                    padding: '12px 14px',
                    marginTop: 14,
                  }}
                >
                  <div style={{ ...teen.type.eyebrow, color: teen.color.teal, fontSize: 10 }}>
                    Next appointment
                  </div>
                  <div
                    style={{
                      ...teen.type.body,
                      fontSize: 14,
                      fontWeight: 600,
                      color: teen.color.ink,
                      marginTop: 4,
                    }}
                  >
                    {plan.next_appointment}
                  </div>
                </div>
              )}
            </div>
          ))}

        <div style={{ height: 20, flex: 'none' }} />
      </div>

      {/* Teen-system styling for the clinician's rich-text plan content */}
      <style>{`
        .teen-plan-content {
          margin-top: 14px;
          font-family: ${teen.font.sans};
          font-size: 15px;
          color: ${teen.color.inkSoft};
          line-height: 1.6;
        }
        .teen-plan-content h2 {
          font-family: ${teen.font.sans};
          font-size: 15px;
          font-weight: 600;
          color: ${teen.color.ink};
          margin: 16px 0 6px;
        }
        .teen-plan-content h2:first-child { margin-top: 0; }
        .teen-plan-content ul { margin: 0 0 8px; padding-left: 18px; }
        .teen-plan-content li { margin-bottom: 4px; }
        .teen-plan-content p { margin: 0 0 8px; }
        .teen-plan-content strong { font-weight: 600; color: ${teen.color.ink}; }
        .teen-plan-content a { color: ${teen.color.teal}; }
      `}</style>

      <TeenTabBar active="plan" />
    </TeenScreen>
  )
}
