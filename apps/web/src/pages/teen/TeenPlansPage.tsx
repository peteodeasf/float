import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTeenAuth } from '../../context/TeenAuthContext'
import { getMyActionPlans, ActionPlan } from '../../api/action_plans'

const contentStyles: React.CSSProperties = {
  fontSize: '14px',
  color: '#334155',
  lineHeight: '1.6',
}

export default function TeenPlansPage() {
  const { patientId, logout } = useTeenAuth()
  const navigate = useNavigate()

  const { data: plans, isLoading } = useQuery({
    queryKey: ['teen-action-plans', patientId],
    queryFn: () => getMyActionPlans(),
    enabled: !!patientId
  })

  const handleLogout = () => {
    logout()
    navigate('/teen/login')
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f8fafc',
      maxWidth: '480px',
      margin: '0 auto'
    }}>
      {/* Header */}
      <div style={{
        background: '#fff',
        padding: '20px 24px 16px',
        borderBottom: '1px solid #e2e8f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => navigate('/teen/home')}
            style={{ fontSize: '14px', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ← Back
          </button>
          <span style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>My Plans</span>
        </div>
        <button
          onClick={handleLogout}
          style={{ fontSize: '13px', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>

      <div style={{ padding: '24px' }}>
        {isLoading && (
          <p style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center', marginTop: '40px' }}>
            Loading...
          </p>
        )}

        {plans && plans.length === 0 && (
          <p style={{ fontSize: '14px', color: '#94a3b8', textAlign: 'center', marginTop: '40px' }}>
            No action plans yet. Your practitioner will publish them after each session.
          </p>
        )}

        {plans && plans.map((plan: ActionPlan) => (
          <div
            key={plan.id}
            style={{
              background: '#fff',
              borderRadius: '16px',
              padding: '20px',
              marginBottom: '16px',
              border: '1px solid #e2e8f0'
            }}
          >
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px'
            }}>
              <div>
                <p style={{ fontSize: '17px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                  Session #{plan.session_number}
                </p>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '2px 0 0' }}>
                  {new Date(plan.session_date + 'T00:00:00').toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric'
                  })}
                </p>
              </div>
              {plan.nickname && (
                <span style={{
                  fontSize: '12px',
                  background: '#ede9fe',
                  color: '#7c3aed',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontWeight: '500'
                }}>
                  {plan.nickname}
                </span>
              )}
            </div>

            {/* Rich text content */}
            {plan.content && (
              <div
                className="teen-plan-content"
                style={contentStyles}
                dangerouslySetInnerHTML={{ __html: plan.content }}
              />
            )}

            {plan.next_appointment && (
              <div style={{
                background: '#eff6ff',
                borderRadius: '10px',
                padding: '12px 14px',
                marginTop: '12px'
              }}>
                <p style={{ fontSize: '12px', fontWeight: '600', color: '#3b82f6', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Next appointment
                </p>
                <p style={{ fontSize: '14px', color: '#1e40af', fontWeight: '500', margin: 0 }}>
                  {plan.next_appointment}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Inline styles for rendered HTML content */}
      <style>{`
        .teen-plan-content h2 {
          font-size: 15px;
          font-weight: 600;
          color: #1e293b;
          margin: 16px 0 6px;
        }
        .teen-plan-content h2:first-child {
          margin-top: 0;
        }
        .teen-plan-content ul {
          margin: 0 0 8px;
          padding-left: 18px;
        }
        .teen-plan-content li {
          margin-bottom: 4px;
        }
        .teen-plan-content p {
          margin: 0 0 8px;
        }
        .teen-plan-content strong {
          font-weight: 600;
        }
      `}</style>
    </div>
  )
}
