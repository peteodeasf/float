import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getMonitoringReport } from '../../api/monitoring'
import ParentWords from '../../components/practitioner/ParentWords'
import PractitionerNav from '../../components/ui/PractitionerNav'
import { Button } from '../../components/ui/primitives'

export default function MonitoringReportPage() {
  const { patientId } = useParams<{ patientId: string }>()

  const { data: report, isLoading } = useQuery({
    queryKey: ['monitoring-report', patientId],
    queryFn: () => getMonitoringReport(patientId!),
    enabled: !!patientId
  })

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--float-surface)' }}>
        <p style={{ color: 'var(--float-text-hint)' }}>Loading report...</p>
      </div>
    )
  }

  if (!report || report.total_entries === 0) {
    return (
      <div className="min-h-screen" style={{ background: 'var(--float-surface)' }}>
        <div className="print:hidden">
          <PractitionerNav
            activePage="patients"
            subHeader={{
              backTo: `/patients/${patientId}`,
              backLabel: 'Back to patient',
              title: 'Monitoring report',
            }}
          />
        </div>
        <div className="px-8 py-16 text-center">
          <p style={{ color: 'var(--float-text-hint)' }}>No observations recorded yet.</p>
        </div>
      </div>
    )
  }

  const dateFrom = report.date_range
    ? new Date(report.date_range.from + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''
  const dateTo = report.date_range
    ? new Date(report.date_range.to + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <div className="min-h-screen" style={{ background: 'var(--float-surface)' }}>
      {/* Nav — hidden when printing */}
      <div className="print:hidden">
        <PractitionerNav
          activePage="patients"
          subHeader={{
            backTo: `/patients/${patientId}`,
            backLabel: 'Back to patient',
            title: report.patient_name,
            subtitle: 'Monitoring report',
            rightAction: (
              <Button kind="primary" size="sm" onClick={() => window.print()}>
                Print / Save PDF
              </Button>
            )
          }}
        />
      </div>

      <main className="max-w-5xl mx-auto px-8 py-8 print:px-0 print:py-4">
        {/* Header */}
        <div className="mb-6 print:mb-4">
          <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--float-text-strong)' }}>
            {report.patient_name}
          </h1>
          <h2 className="text-base font-medium mb-2" style={{ color: 'var(--float-text-secondary)' }}>
            Monitoring report
          </h2>
          <div className="text-sm" style={{ color: 'var(--float-text-hint)' }}>
            <span>Dates: {dateFrom} &mdash; {dateTo}</span>
            <span style={{ margin: '0 8px' }}>&middot;</span>
            <span>Entries: {report.total_entries}</span>
          </div>
        </div>

        {/* Observation matrix table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--float-border)' }}>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider" style={{ whiteSpace: 'nowrap', color: 'var(--float-text-secondary)' }}>Date</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--float-text-secondary)' }}>Situation</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--float-text-secondary)' }}>What I observed about my child</th>
                <th className="text-left py-3 px-3 text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--float-text-secondary)' }}>How I responded</th>
                <th className="text-center py-3 px-3 text-xs font-medium uppercase tracking-wider" style={{ whiteSpace: 'nowrap', color: 'var(--float-text-secondary)' }}>Fear Level</th>
              </tr>
            </thead>
            <tbody>
              {report.entries.map((entry) => (
                <tr key={entry.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td className="py-3 px-3" style={{ whiteSpace: 'nowrap', color: 'var(--float-text-secondary)' }}>
                    {new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="py-3 px-3" style={{ color: 'var(--float-text)' }}>
                    {entry.situation || '--'}
                    <ParentWords entry={entry} />
                  </td>
                  <td className="py-3 px-3" style={{ color: 'var(--float-text-secondary)' }}>
                    {entry.child_behavior_observed || '--'}
                  </td>
                  <td className="py-3 px-3" style={{ color: 'var(--float-text-secondary)' }}>
                    {entry.parent_response || '--'}
                  </td>
                  <td className="py-3 px-3 text-center font-medium" style={{ color: 'var(--float-text)' }}>
                    {entry.fear_thermometer ?? '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Print footer */}
        <div className="hidden print:block pt-4 mt-8" style={{ borderTop: '1px solid var(--float-border)' }}>
          <p className="text-xs" style={{ color: 'var(--float-text-hint)' }}>
            Generated by Float &middot; {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      </main>
    </div>
  )
}
