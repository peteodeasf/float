import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { useTeenAuth } from '../../context/TeenAuthContext'
import { teenApiClient } from '../../api/client'
import TeenScreen from '../../components/teen/TeenScreen'
import FloatLogo from '../../components/ui/FloatLogo'
import {
  deriveEffort,
  deriveFearedOutcomes,
  type LadderSituation,
} from '../../lib/teenProgress'
import teen from '../../styles/teenTokens'

/**
 * What a child sees once their clinician has closed treatment.
 *
 * "All done for now" rather than "your treatment has finished" — a closed patient can be reopened,
 * so nothing here should read like a door shutting.
 *
 * It ends on what they did, not on a notice. Every number comes off `/patient/ladder`, which the
 * app already reads and which stays readable after closing.
 */
export default function TeenClosedPage() {
  const { patientId, logout } = useTeenAuth()
  const navigate = useNavigate()

  const { data: ladderData, isLoading } = useQuery({
    queryKey: ['teen-ladder', patientId],
    queryFn: async () => (await teenApiClient.get('/patient/ladder')).data,
    enabled: !!patientId,
  })

  const situations: LadderSituation[] = useMemo(
    () => ladderData?.situations ?? [],
    [ladderData]
  )
  const effort = useMemo(() => deriveEffort(situations), [situations])
  const feared = useMemo(() => deriveFearedOutcomes(situations), [situations])

  const didAnything = effort.faced > 0

  // A zero belongs on a progress screen, not on the one that closes their treatment. "0
  // reflections" is a poor last thing to read, and leaving it out hides nothing they did.
  const tiles = useMemo(
    () =>
      [
        { value: effort.faced, label: 'experiments faced' },
        { value: effort.committed, label: 'times committed' },
        { value: effort.situationsWorked, label: 'situations worked' },
        effort.hasReflectionData
          ? { value: effort.reflections, label: 'reflections' }
          : { value: effort.stepsMastered, label: 'steps mastered' },
      ].filter(t => t.value > 0),
    [effort]
  )

  return (
    <TeenScreen bubbles>
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
        <FloatLogo size="md" />
        <button
          onClick={() => { logout(); navigate('/teen/login') }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
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
                ? 'You worked through some hard things. Here is what you did.'
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
          <>
            {/* The strongest number they have, so it gets its own card. */}
            {feared.checked > 0 && (
              <div
                className="teen-card"
                style={{ marginTop: 16, padding: '22px', textAlign: 'center' }}
              >
                <div
                  style={{
                    fontFamily: teen.font.sans,
                    fontSize: 40,
                    fontWeight: 700,
                    color: teen.color.teal,
                    lineHeight: 1.1,
                  }}
                >
                  {feared.didNotHappen} of {feared.checked}
                </div>
                <p style={{ ...teen.type.body, margin: '10px 0 0' }}>
                  {feared.didNotHappen === feared.checked
                    ? 'Every time you checked, the thing you were afraid of did not happen.'
                    : 'times the thing you were afraid of did not happen.'}
                </p>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <div style={teen.type.eyebrow}>What you did</div>
              <div
                style={{
                  marginTop: 12,
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 10,
                }}
              >
                {tiles.map(t => (
                  <ClosedTile key={t.label} value={t.value} label={t.label} />
                ))}
              </div>
            </div>
          </>
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

function ClosedTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="teen-card" style={{ padding: '16px 14px' }}>
      <div
        style={{
          fontFamily: teen.font.sans,
          fontSize: 26,
          fontWeight: 700,
          color: teen.color.ink,
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: teen.font.sans,
          fontSize: 12,
          color: teen.color.textSecondary,
          marginTop: 4,
        }}
      >
        {label}
      </div>
    </div>
  )
}
