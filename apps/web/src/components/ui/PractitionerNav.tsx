import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import FloatLogo from './FloatLogo'

type ActivePage = 'patients' | 'education' | 'reports' | 'settings'

interface SubHeaderProps {
  backTo: string
  backLabel: string
  title: string
  subtitle?: string
  rightAction?: React.ReactNode
}

interface PractitionerNavProps {
  activePage: ActivePage
  subHeader?: SubHeaderProps
}

const navLinks: { label: string; page: ActivePage; path: string; enabled: boolean; tooltip?: string }[] = [
  { label: 'My Patients', page: 'patients', path: '/dashboard', enabled: true },
  { label: 'Education', page: 'education', path: '/education', enabled: true },
  { label: 'Reports', page: 'reports', path: '/reports', enabled: false, tooltip: 'Coming soon' },
  { label: 'Settings', page: 'settings', path: '/settings', enabled: false, tooltip: 'Coming soon' },
]

export default function PractitionerNav({ activePage, subHeader }: PractitionerNavProps) {
  const navigate = useNavigate()
  const { logout } = useAuth()

  return (
    <>
      {/* Primary nav — identical on every page */}
      <nav
        className="bg-white px-8 flex items-center justify-between"
        style={{ height: '56px', borderBottom: '1px solid var(--float-border)' }}
      >
        <div className="flex items-center">
          <button onClick={() => navigate('/dashboard')} className="flex items-center bg-transparent border-none cursor-pointer p-0">
            <FloatLogo size="md" />
          </button>
          <span className="mx-4 h-5 w-px" style={{ background: 'var(--float-border)' }} />
          <div className="flex items-center gap-1">
            {navLinks.map(link => {
              const isActive = link.page === activePage
              return (
                <div key={link.page} className="relative group">
                  <button
                    onClick={() => link.enabled && navigate(link.path)}
                    className="px-3 text-sm font-medium bg-transparent border-none flex items-center gap-1.5"
                    style={{
                      color: !link.enabled ? 'var(--float-text-hint)' :
                        isActive ? 'var(--float-primary)' : 'var(--float-text-secondary)',
                      cursor: link.enabled ? 'pointer' : 'default',
                      borderBottom: isActive ? '2px solid var(--float-primary)' : '2px solid transparent',
                      borderRadius: 0,
                      paddingBottom: '16px',
                      paddingTop: '16px',
                      marginBottom: '-1px',
                    }}
                  >
                    {link.page === 'education' && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginTop: '-1px' }}>
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

      {/* Sub-header — page context, shown on detail pages */}
      {subHeader && (
        <div
          className="px-8 flex items-center justify-between"
          style={{
            height: '44px',
            background: 'var(--float-bg)',
            borderBottom: '1px solid var(--float-border)',
          }}
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(subHeader.backTo)}
              className="text-xs bg-transparent border-none cursor-pointer"
              style={{ color: 'var(--float-text-hint)' }}
              onMouseOver={(e) => { e.currentTarget.style.color = 'var(--float-text-secondary)' }}
              onMouseOut={(e) => { e.currentTarget.style.color = 'var(--float-text-hint)' }}
            >
              &larr; {subHeader.backLabel}
            </button>
            <span className="h-4 w-px" style={{ background: 'var(--float-border)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--float-text)' }}>
              {subHeader.title}
            </span>
            {subHeader.subtitle && (
              <span className="text-xs" style={{ color: 'var(--float-text-hint)' }}>
                {subHeader.subtitle}
              </span>
            )}
          </div>
          {subHeader.rightAction && (
            <div>{subHeader.rightAction}</div>
          )}
        </div>
      )}
    </>
  )
}

// Re-export for backward compat during transition
export { default as DashboardNav } from './PractitionerNav'
export const DetailNav = PractitionerNav
