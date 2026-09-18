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
}: {
  when: string
  name: string
  situation?: string | null
  onDoItNow: () => void
}) {
  return (
    <div
      style={{
        background: teen.color.ink,
        color: '#fff',
        borderRadius: 20,
        padding: '16px 18px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        boxShadow: teen.shadow.cardDark,
      }}
    >
      <span style={{ ...teen.type.eyebrow, color: teen.color.onDark }}>{when}</span>
      {/* Clamp to two lines so a card stays compact — the full step reads on the exposure
          screen, and the ladder rung below clamps the same way. */}
      <h2
        style={{
          ...teen.type.headline,
          fontSize: teen.headSize.md,
          color: '#fff',
          margin: 0,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {name}
      </h2>
      {/* Situation and the action share one row, so the button adds no vertical height. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 }}>
        {situation ? (
          <span
            style={{
              fontFamily: teen.font.sans,
              fontSize: 13,
              color: teen.color.onDark,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {situation}
          </span>
        ) : (
          <span />
        )}
        <button
          className="teen-btn teen-btn--mint"
          style={{ width: 'auto', flex: 'none', padding: '9px 18px', fontSize: 14 }}
          onClick={onDoItNow}
        >
          Do it now
        </button>
      </div>
    </div>
  )
}
