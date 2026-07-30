import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import teen from '../../styles/teenTokens'

/**
 * Persistent bottom navigation for the parent app. Reuses the consumer design
 * system (teen tokens) with parent-specific routes. Two tabs for the MVP.
 */
type Tab = 'home' | 'chat'

const iconProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

const ICONS: Record<Tab, ReactNode> = {
  home: (
    <svg {...iconProps}>
      <path d="M3.5 10.5 12 3.5l8.5 7" />
      <path d="M5.5 9.5V20h13V9.5" />
    </svg>
  ),
  chat: (
    <svg {...iconProps}>
      <path d="M20 12a7.5 7.5 0 0 1-10.9 6.7L4 20l1.3-4.2A7.5 7.5 0 1 1 20 12Z" />
    </svg>
  ),
}

const ITEMS: { key: Tab; label: string; path: string }[] = [
  { key: 'home', label: 'Home', path: '/parent/home' },
  { key: 'chat', label: 'Chat', path: '/parent/messages' },
]

export default function ParentTabBar({ active, unread = 0 }: { active: Tab; unread?: number }) {
  const navigate = useNavigate()

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
        padding: '8px 6px calc(10px + env(safe-area-inset-bottom, 0px))',
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
              minHeight: 44,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              background: 'none',
              border: 0,
              cursor: 'pointer',
              padding: '6px 2px',
              fontFamily: teen.font.sans,
              fontSize: 13,
              fontWeight: isActive ? 700 : 600,
              color: isActive ? teen.color.teal : teen.color.textSecondary,
            }}
          >
            <span
              aria-hidden="true"
              style={{ position: 'relative', display: 'inline-flex', lineHeight: 0 }}
            >
              {ICONS[it.key]}
              {it.key === 'chat' && unread > 0 && (
                <span
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -8,
                    minWidth: 15,
                    height: 15,
                    padding: '0 4px',
                    background: teen.color.ink,
                    color: '#fff',
                    borderRadius: 999,
                    fontFamily: teen.font.sans,
                    fontSize: 10,
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
            </span>
            {it.label}
          </button>
        )
      })}
    </nav>
  )
}
