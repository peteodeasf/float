import { useQuery } from '@tanstack/react-query'

import FloatLogo from '../../components/ui/FloatLogo'
import { btn } from '../../components/ui/buttons'
import PracticeMembersPanel from '../../components/practice/PracticeMembersPanel'
import PracticePatientsPanel from '../../components/practice/PracticePatientsPanel'
import { useAuth } from '../../context/AuthContext'
import { getPractice } from '../../api/practice'

/**
 * The office manager's page: the people in the practice and who has which patient. An office
 * manager never reaches a patient record; the server refuses them on every clinician route.
 * docs/plans/clinician-practice-onboarding.md, step 6.
 */
export default function PracticePage() {
  const { logout } = useAuth()
  const { data: practice } = useQuery({ queryKey: ['practice'], queryFn: getPractice })

  return (
    <div className="min-h-screen" style={{ background: 'var(--float-bg)' }}>
      <nav className="bg-white px-8 flex items-center justify-between"
        style={{ height: '56px', borderBottom: '1px solid var(--float-border)' }}>
        <div className="flex items-center gap-4">
          <FloatLogo size="md" />
          <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--float-text)' }}>{practice?.name}</span>
        </div>
        <button onClick={logout} style={btn('quiet', 'sm')}>Sign out</button>
      </nav>
      <main className="max-w-3xl mx-auto px-8 py-8" style={{ display: 'grid', gap: '16px' }}>
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--float-text)' }}>Your practice</h1>
          {practice?.me.name && (
            <p className="text-sm mt-1" style={{ color: 'var(--float-text-secondary)' }}>Signed in as {practice.me.name}</p>
          )}
        </div>
        <PracticeMembersPanel myEmail={practice?.me.email} />
        <PracticePatientsPanel />
      </main>
    </div>
  )
}
