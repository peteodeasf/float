import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTeenAuth } from '../../context/TeenAuthContext'
import { getTreatmentPlan, getTriggers, getLadder } from '../../api/treatment'
import { apiClient } from '../../api/client'

export default function TeenHomePage() {
  const { patientId, logout } = useTeenAuth()
  const navigate = useNavigate()

  const { data: plan } = useQuery({
    queryKey: ['teen-plan', patientId],
    queryFn: async () => {
      const response = await apiClient.get(`/patients/${patientId}/plan`)
      return response.data
    },
    enabled: !!patientId
  })

  const { data: triggers } = useQuery({
    queryKey: ['teen-triggers', plan?.id],
    queryFn: () => getTriggers(plan!.id),
    enabled: !!plan?.id
  })

  const firstTrigger = triggers?.[0]

  const { data: ladder } = useQuery({
    queryKey: ['teen-ladder', firstTrigger?.id],
    queryFn: () => getLadder(firstTrigger!.id),
    enabled: !!firstTrigger?.id
  })

  const currentRung = ladder?.rungs
    .sort((a, b) => a.rung_order - b.rung_order)
    .find(r => r.status !== 'complete')

  const handleLogout = () => {
    logout()
    navigate('/teen/login')
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f0f9ff',
      maxWidth: '480px',
      margin: '0 auto',
      padding: '0 0 80px'
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
          <span style={{ fontSize: '20px' }}>🌊</span>
          <span style={{ fontSize: '18px', fontWeight: '600', color: '#1e293b' }}>Float</span>
        </div>
        <button
          onClick={handleLogout}
          style={{ fontSize: '13px', color: '#94a3b8', background: 'none', border: 'none', cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>

      <div style={{ padding: '24px' }}>

        {/* Greeting */}
        <h2 style={{ fontSize: '22px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
          Hey 👋
        </h2>
        <p style={{ fontSize: '15px', color: '#64748b', marginBottom: '28px' }}>
          Here's where things stand today.
        </p>

        {/* Current situation card */}
        {firstTrigger && (
          <div style={{
            background: '#fff',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '16px',
            border: '1px solid #e2e8f0'
          }}>
            <p style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              Working on
            </p>
            <p style={{ fontSize: '17px', fontWeight: '600', color: '#1e293b', marginBottom: '4px' }}>
              {firstTrigger.name}
            </p>
            {firstTrigger.distress_thermometer_rating && (
              <p style={{ fontSize: '13px', color: '#64748b' }}>
                Distress level {firstTrigger.distress_thermometer_rating}/10
              </p>
            )}
          </div>
        )}

        {/* Current rung */}
        {currentRung && (
          <div style={{
            background: '#eff6ff',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '24px',
            border: '1px solid #bfdbfe'
          }}>
            <p style={{ fontSize: '12px', fontWeight: '600', color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              Current step
            </p>
            <p style={{ fontSize: '16px', fontWeight: '500', color: '#1e3a5f', marginBottom: '4px' }}>
              Step {currentRung.rung_order + 1}
            </p>
            {currentRung.distress_thermometer_rating && (
              <p style={{ fontSize: '13px', color: '#3b82f6' }}>
                Distress level {currentRung.distress_thermometer_rating}/10
              </p>
            )}
          </div>
        )}

        {/* Action button */}
        {currentRung ? (
          <button
            onClick={() => navigate(`/teen/experiment/${currentRung.id}`)}
            style={{
              width: '100%',
              padding: '16px',
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: '14px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              marginBottom: '12px'
            }}
          >
            Start my experiment →
          </button>
        ) : (
          <div style={{
            background: '#f0fdf4',
            borderRadius: '16px',
            padding: '20px',
            border: '1px solid #bbf7d0',
            textAlign: 'center'
          }}>
            <p style={{ fontSize: '16px', color: '#166534', fontWeight: '500' }}>
              🎉 All steps complete!
            </p>
            <p style={{ fontSize: '14px', color: '#4ade80', marginTop: '4px' }}>
              Talk to your practitioner about what's next.
            </p>
          </div>
        )}

        {/* Ladder progress */}
        {ladder && ladder.rungs.length > 0 && (
          <div style={{
            background: '#fff',
            borderRadius: '16px',
            padding: '20px',
            border: '1px solid #e2e8f0'
          }}>
            <p style={{ fontSize: '12px', fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>
              Your ladder
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[...ladder.rungs]
                .sort((a, b) => b.rung_order - a.rung_order)
                .map((rung, i) => (
                  <div key={rung.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: rung.status === 'complete' ? '#f0fdf4' :
                      rung.id === currentRung?.id ? '#eff6ff' : '#f8fafc',
                    border: rung.id === currentRung?.id ? '1.5px solid #bfdbfe' : '1px solid #e2e8f0'
                  }}>
                    <div style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: rung.status === 'complete' ? '#22c55e' :
                        rung.id === currentRung?.id ? '#2563eb' : '#e2e8f0',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px',
                      color: rung.status === 'complete' || rung.id === currentRung?.id ? '#fff' : '#94a3b8',
                      fontWeight: '600',
                      flexShrink: 0
                    }}>
                      {rung.status === 'complete' ? '✓' : ladder.rungs.length - i}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: '14px', fontWeight: '500', color: '#1e293b', margin: 0 }}>
                        Step {ladder.rungs.length - i}
                      </p>
                    </div>
                    {rung.distress_thermometer_rating && (
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                        DT {rung.distress_thermometer_rating}
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
