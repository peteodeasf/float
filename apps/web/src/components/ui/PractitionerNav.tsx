import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import FloatLogo from './FloatLogo'

interface NavLink {
  label: string
  path: string
  enabled?: boolean
  tooltip?: string
}

const navLinks: NavLink[] = [
  { label: 'My Patients', path: '/dashboard', enabled: true },
  { label: 'Education', path: '/education', enabled: true },
  { label: 'Reports', path: '/reports', enabled: false, tooltip: 'Coming soon' },
  { label: 'Settings', path: '/settings', enabled: false, tooltip: 'Coming soon' },
]

export function DashboardNav() {
  const navigate = useNavigate()
  const location = useLocation()
  const { logout } = useAuth()

  return (
    <nav
      className="bg-white px-8 flex items-center justify-between"
      style={{ height: '56px', borderBottom: '1px solid var(--float-border)' }}
    >
      <div className="flex items-center gap-0">
        <button onClick={() => navigate('/dashboard')} className="flex items-center bg-transparent border-none cursor-pointer">
          <FloatLogo size="md" />
        </button>
        <span className="mx-4 h-5 w-px" style={{ background: 'var(--float-border)' }} />
        <div className="flex items-center gap-1">
          {navLinks.map(link => {
            const isActive = link.path === '/dashboard'
              ? location.pathname === '/dashboard'
              : location.pathname.startsWith(link.path)
            return (
              <div key={link.path} className="relative group">
                <button
                  onClick={() => link.enabled !== false && navigate(link.path)}
                  className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors bg-transparent border-none cursor-pointer"
                  style={{
                    color: !link.enabled ? 'var(--float-text-hint)' :
                      isActive ? 'var(--float-primary)' : 'var(--float-text-secondary)',
                    cursor: link.enabled === false ? 'default' : 'pointer',
                    borderBottom: isActive ? '2px solid var(--float-primary)' : '2px solid transparent',
                    borderRadius: 0,
                    paddingBottom: '14px',
                    marginBottom: '-1px',
                  }}
                >
                  {link.label === 'Education' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block mr-1.5 -mt-0.5">
                      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
                      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                    </svg>
                  )}
                  {link.label}
                </button>
                {link.tooltip && (
                  <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 text-xs text-white rounded bg-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                    {link.tooltip}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
      <button
        onClick={() => { logout(); navigate('/login') }}
        className="text-sm transition-colors cursor-pointer bg-transparent border-none"
        style={{ color: 'var(--float-text-secondary)' }}
        onMouseOver={(e) => { e.currentTarget.style.color = 'var(--float-primary)' }}
        onMouseOut={(e) => { e.currentTarget.style.color = 'var(--float-text-secondary)' }}
      >
        Sign out
      </button>
    </nav>
  )
}

export function DetailNav({ backPath, backLabel, title, subtitle, rightAction }: {
  backPath: string
  backLabel?: string
  title: string
  subtitle?: string
  rightAction?: React.ReactNode
}) {
  const navigate = useNavigate()
  const { logout } = useAuth()

  return (
    <nav
      className="bg-white px-8 flex items-center justify-between"
      style={{ height: '56px', borderBottom: '1px solid var(--float-border)' }}
    >
      <div className="flex items-center gap-0">
        <button onClick={() => navigate('/dashboard')} className="flex items-center bg-transparent border-none cursor-pointer">
          <FloatLogo size="md" />
        </button>
        <span className="mx-4 h-5 w-px" style={{ background: 'var(--float-border)' }} />
        <button
          onClick={() => navigate(backPath)}
          className="text-sm bg-transparent border-none cursor-pointer mr-3"
          style={{ color: 'var(--float-text-hint)' }}
        >
          &larr; {backLabel || 'Back'}
        </button>
        <div>
          <h1 className="text-base font-semibold" style={{ color: 'var(--float-text)', lineHeight: subtitle ? '1.2' : '1.5' }}>
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs" style={{ color: 'var(--float-text-hint)' }}>{subtitle}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        {rightAction}
        <button
          onClick={() => { logout(); navigate('/login') }}
          className="text-sm transition-colors cursor-pointer bg-transparent border-none"
          style={{ color: 'var(--float-text-secondary)' }}
          onMouseOver={(e) => { e.currentTarget.style.color = 'var(--float-primary)' }}
          onMouseOut={(e) => { e.currentTarget.style.color = 'var(--float-text-secondary)' }}
        >
          Sign out
        </button>
      </div>
    </nav>
  )
}
