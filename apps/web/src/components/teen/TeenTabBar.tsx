import { useNavigate } from 'react-router-dom'
import { useTeenAuth } from '../../context/TeenAuthContext'
import teen from '../../styles/teenTokens'

/**
 * The persistent bottom navigation for the teen hub screens (home, chat,
 * progress, plan). Rendered as a non-scrolling flex child at the bottom of the
 * screen column so it stays visible without position:fixed (which would escape
 * the centered mobile column). Focused task flows — schedule, exposure, report —
 * deliberately don't show it; they keep their own back button + primary CTA.
 */
type Tab = 'home' | 'chat' | 'progress' | 'plan'

const ITEMS: { key: Tab; label: string; path: string }[] = [
  { key: 'home', label: 'Home', path: '/teen/home' },
  { key: 'chat', label: 'Chat', path: '/teen/messages' },
  { key: 'progress', label: 'Progress', path: '/teen/progress' },
  { key: 'plan', label: 'Plan', path: '/teen/plans' },
]

export default function TeenTabBar({ active, unread = 0 }: { active: Tab; unread?: number }) {
  const navigate = useNavigate()
  const { logout } = useTeenAuth()

  return (
    <nav
      aria-label="Main"
      style={{
        flex: 'none',
        display: 'flex',
        alignItems: 'stretch',
        justifyContent: 'space-around',
        gap: 4,
        borderTop: `1px solid ${teen.color.lineSoft}`,
        background: teen.color.cardPure,
        padding: '10px 6px calc(12px + env(safe-area-inset-bottom, 0px))',
      }}
    >
      {ITEMS.map(it => {
        const isActive = it.key === active
        return (
          <button
            key={it.key}
            onClick={() => navigate(it.path)}
            aria-current={isActive ? 'page' : undefined}
            style={{
              position: 'relative',
              flex: 1,
              background: 'none',
              border: 0,
              cursor: 'pointer',
              padding: '4px 2px',
              fontFamily: teen.font.sans,
              fontSize: 13,
              fontWeight: isActive ? 700 : 600,
              color: isActive ? teen.color.teal : teen.color.muted,
            }}
          >
            {it.label}
            {it.key === 'chat' && unread > 0 && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: -2,
                  marginLeft: 4,
                  minWidth: 15,
                  height: 15,
                  padding: '0 4px',
                  background: teen.color.ink,
                  color: '#fff',
                  borderRadius: 999,
                  fontFamily: teen.font.mono,
                  fontSize: 9,
                  fontWeight: 700,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: 1,
                }}
              >
                {unread}
              </span>
            )}
          </button>
        )
      })}
      <button
        onClick={() => {
          logout()
          navigate('/teen/login')
        }}
        style={{
          flex: 1,
          background: 'none',
          border: 0,
          cursor: 'pointer',
          padding: '4px 2px',
          fontFamily: teen.font.sans,
          fontSize: 13,
          color: teen.color.muted,
          opacity: 0.75,
        }}
      >
        Sign out
      </button>
    </nav>
  )
}
