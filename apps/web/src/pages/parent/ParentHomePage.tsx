import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useParentAuth } from '../../context/ParentAuthContext'
import { parentApiClient } from '../../api/client'
import teen from '../../styles/teenTokens'

// Placeholder landing for the parent surface. The accommodation ladder and the
// parent experience proper are later steps in the plan; this exists so the auth
// loop (invite → login → set password → land) is complete and testable.
export default function ParentHomePage() {
  const { logout } = useParentAuth()
  const navigate = useNavigate()

  const { data: me } = useQuery({
    queryKey: ['parent-me'],
    queryFn: async () => (await parentApiClient.get('/auth/me')).data,
  })

  const childName: string | null = me?.patient_name ?? null

  return (
    <div className="teen-screen">
      <div
        style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: `24px ${teen.space.pad} 0`,
          flex: 'none',
        }}
      >
        <span style={teen.type.wordmark}>float</span>
        <button
          onClick={() => {
            logout()
            navigate('/parent/login')
          }}
          style={{
            background: 'none',
            border: 0,
            cursor: 'pointer',
            fontFamily: teen.font.sans,
            fontSize: 13,
            color: teen.color.muted,
          }}
        >
          Sign out
        </button>
      </div>

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: `0 ${teen.space.padLg}`,
        }}
      >
        <span style={{ ...teen.type.eyebrow, color: teen.color.tealMid }}>You're signed in</span>
        <h1 style={{ ...teen.type.headline, fontSize: teen.headSize.lg, margin: '14px 0 0' }}>
          {childName ? `Supporting ${childName}` : "Your family's plan"}
        </h1>
        <p style={{ ...teen.type.body, color: teen.color.mutedQuiet, marginTop: 16 }}>
          Your clinician is setting up the work you'll do together. Your accommodation
          ladder will appear here soon.
        </p>
      </div>
    </div>
  )
}
