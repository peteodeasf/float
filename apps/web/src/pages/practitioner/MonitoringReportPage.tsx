import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getMonitoringReport } from '../../api/monitoring'
import PractitionerNav from '../../components/ui/PractitionerNav'

export default function MonitoringReportPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()

  const { data: report, isLoading } = useQuery({
    queryKey: ['monitoring-report', patientId],
    queryFn: () => getMonitoringReport(patientId!),
    enabled: !!patientId
  })

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-slate-400">Loading report...</p>
      </div>
    )
  }

  if (!report || report.total_entries === 0) {
    return (
      <div className="min-h-screen bg-white">
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
          <p className="text-slate-400">No observations recorded yet.</p>
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
    <div className="min-h-screen bg-white">
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
              <button
                onClick={() => window.print()}
                className="bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-slate-900 transition-colors border-none cursor-pointer"
              >
                Print / Save PDF
              </button>
            )
          }}
        />
      </div>

      <main className="max-w-5xl mx-auto px-8 py-8 print:px-0 print:py-4">
        {/* Header */}
        <div className="mb-6 print:mb-4">
          <h1 className="text-xl font-bold text-slate-800 mb-1">
            {report.patient_name}
          </h1>
          <h2 className="text-base text-slate-500 font-medium mb-2">
            Monitoring report
          </h2>
          <div className="text-sm text-slate-400">
            <span>Dates: {dateFrom} &mdash; {dateTo}</span>
            <span style={{ margin: '0 8px' }}>&middot;</span>
            <span>Entries: {report.total_entries}</span>
          </div>
        </div>

        {/* Observation matrix table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th className="text-left py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider" style={{ whiteSpace: 'nowrap' }}>Date</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">Situation</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">What I observed about my child</th>
                <th className="text-left py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider">How I responded</th>
                <th className="text-center py-3 px-3 text-xs font-medium text-slate-500 uppercase tracking-wider" style={{ whiteSpace: 'nowrap' }}>Fear thermometer</th>
              </tr>
            </thead>
            <tbody>
              {report.entries.map((entry) => (
                <tr key={entry.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td className="py-3 px-3 text-slate-500" style={{ whiteSpace: 'nowrap' }}>
                    {new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="py-3 px-3 text-slate-700">
                    {entry.situation || '--'}
                  </td>
                  <td className="py-3 px-3 text-slate-600">
                    {entry.child_behavior_observed || '--'}
                  </td>
                  <td className="py-3 px-3 text-slate-600">
                    {entry.parent_response || '--'}
                  </td>
                  <td className="py-3 px-3 text-center text-slate-700 font-medium">
                    {entry.fear_thermometer ?? '--'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Print footer */}
        <div className="hidden print:block border-t border-slate-200 pt-4 mt-8">
          <p className="text-xs text-slate-400">
            Generated by Float &middot; {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>
        </div>
      </main>
    </div>
  )
}
