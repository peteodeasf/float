import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import { useParentAuth } from '../../context/ParentAuthContext'
import { parentApiClient } from '../../api/client'
import TeenScreen from '../../components/teen/TeenScreen'
import teen from '../../styles/teenTokens'
import type { ParentMoment } from '../../api/parent'

/**
 * What a parent sees once their child's clinician has closed treatment.
 *
 * Same message as the child's screen — "All done for now", because a closed patient can be
 * reopened — and the same idea of ending on what they did rather than on a notice. A parent's work
 * is the moments they logged, and how often they held rather than stepping in.
 */
export default function ParentClosedPage() {
  const { logout } = useParentAuth()
  const navigate = useNavigate()

  const { data: moments = [], isLoading } = useQuery<ParentMoment[]>({
    queryKey: ['parent-moments'],
    queryFn: async () => (await parentApiClient.get('/parent/moments')).data,
  })

  const held = useMemo(() => moments.filter(m => m.held).length, [moments])
  const didAnything = moments.length > 0

  return (
    <TeenScreen bubbles>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: `24px ${teen.space.pad} 0`,
          flex: 'none',
        }}
      >
        <span style={teen.type.wordmark}>float</span>
        <button
          onClick={() => { logout(); navigate('/parent/login') }}
          style={{
            minHeight: 44,
            padding: '8px 4px',
            margin: '-8px -4px',
            background: 'none',
            border: 0,
            cursor: 'pointer',
            fontFamily: teen.font.sans,
            fontSize: 13,
            fontWeight: 600,
            color: teen.color.textSecondary,
          }}
        >
          Sign out
        </button>
      </div>

      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: `0 ${teen.space.pad} 32px`,
        }}
      >
        <div style={{ marginTop: 30 }}>
          <div style={teen.type.eyebrow}>You and your clinician</div>
          <div className="teen-card" style={{ marginTop: 16, padding: '24px 22px' }}>
            <h1 style={{ ...teen.type.headline, fontSize: teen.headSize.md, margin: 0 }}>
              All done for now.
            </h1>
            <p style={{ ...teen.type.body, margin: '12px 0 0' }}>
              {didAnything
                ? 'Holding back when your child is anxious is hard. Here is what you did.'
                : 'Your clinician has wrapped things up here. If you start again, everything will be waiting.'}
            </p>
          </div>
        </div>

        {isLoading && (
          <p style={{ ...teen.type.body, color: teen.color.textSecondary, marginTop: 20 }}>
            Loading what you did…
          </p>
        )}

        {!isLoading && didAnything && (
          <div style={{ marginTop: 16 }}>
            <div className="teen-card" style={{ padding: '22px', textAlign: 'center' }}>
              <div
                style={{
                  fontFamily: teen.font.sans,
                  fontSize: 40,
                  fontWeight: 700,
                  color: teen.color.teal,
                  lineHeight: 1.1,
                }}
              >
                {held} of {moments.length}
              </div>
              <p style={{ ...teen.type.body, margin: '10px 0 0' }}>
                moments you logged where you held rather than stepping in.
              </p>
            </div>
          </div>
        )}

        <p
          style={{
            ...teen.type.body,
            color: teen.color.textSecondary,
            marginTop: 24,
            fontSize: 13,
          }}
        >
          Your clinician can open this back up any time.
        </p>
      </div>
    </TeenScreen>
  )
}
