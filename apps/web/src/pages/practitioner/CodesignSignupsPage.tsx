import { useQuery } from '@tanstack/react-query'

import PractitionerNav from '../../components/ui/PractitionerNav'
import CodesignSection from '../admin/CodesignSection'
import { apiClient } from '../../api/client'
import { getMyProfile } from '../../api/me_practitioner'

/**
 * Who signed up for which co-design session, for the people who run them without being Float
 * admins. Read-only, the same list as the admin dashboard's.
 *
 * Only for clinician logins on the CODESIGN_VIEWERS setting; the server refuses everyone else.
 * The clinician menu does not link here: people open it by its address. docs/plans/codesign-viewer.md
 */
const loadSignups = async () => (await apiClient.get('/codesign/viewer/signups')).data.sessions

export default function CodesignSignupsPage() {
  const { data: profile, isLoading, isError } = useQuery({
    queryKey: ['my-profile'],
    queryFn: getMyProfile,
  })

  return (
    <div className="min-h-screen" style={{ background: 'var(--float-bg)' }}>
      <PractitionerNav />

      <main className="max-w-6xl mx-auto px-8 py-8">
        {isLoading ? (
          <p className="text-sm" style={{ color: 'var(--float-text-hint)' }}>Loading…</p>
        ) : isError || !profile?.can_view_codesign ? (
          <p className="text-sm" style={{ color: 'var(--float-text)' }}>
            You don&rsquo;t have access to this list.
          </p>
        ) : (
          <CodesignSection load={loadSignups} />
        )}
      </main>
    </div>
  )
}
