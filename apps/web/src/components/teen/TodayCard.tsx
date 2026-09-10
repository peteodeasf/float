import teen from '../../styles/teenTokens'

/**
 * The exposure that's due today — shown at the top of the home and of Progress, and only on the
 * day it's due, so today's step never has to be found in the list.
 */
export default function TodayCard({
  when,
  name,
  situation,
  onDoItNow,
  onTellMe,
}: {
  when: string
  name: string
  situation?: string | null
  onDoItNow: () => void
  onTellMe: () => void
}) {
  return (
    <div
      style={{
        background: teen.color.ink,
        color: '#fff',
        borderRadius: 22,
        padding: '20px 20px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        boxShadow: teen.shadow.cardDark,
      }}
    >
      <span style={{ ...teen.type.eyebrow, color: teen.color.onDark }}>{when}</span>
      <h2 style={{ ...teen.type.headline, fontSize: teen.headSize.md, color: '#fff', margin: 0 }}>
        {name}
      </h2>
      {situation && (
        <span style={{ fontFamily: teen.font.sans, fontSize: 13, color: teen.color.onDark }}>
          {situation}
        </span>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="teen-btn teen-btn--mint" style={{ flex: 1 }} onClick={onDoItNow}>
          Do it now
        </button>
        <button
          className="teen-btn"
          style={{
            flex: 1,
            background: 'transparent',
            border: '1px solid rgba(154, 198, 191, 0.45)',
            color: '#e6f3f0',
          }}
          onClick={onTellMe}
        >
          Tell me how it went
        </button>
      </div>
    </div>
  )
}
