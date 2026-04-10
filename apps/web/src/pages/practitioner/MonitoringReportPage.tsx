import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getMonitoringReport } from '../../api/monitoring'
import PractitionerNav from '../../components/ui/PractitionerNav'

function DTBadge({ value }: { value: number | null }) {
  if (value == null) return <span className="text-slate-300">--</span>
  const color = value >= 7 ? 'bg-red-100 text-red-700'
    : value >= 4 ? 'bg-amber-100 text-amber-700'
    : 'bg-green-100 text-green-700'
  return (
    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold ${color}`}>
      {value}
    </span>
  )
}

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
              title: 'Pre-consultation report',
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
            subtitle: 'Pre-consultation report',
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

      <main className="max-w-4xl mx-auto px-8 py-8 print:px-0 print:py-4">
        {/* Header */}
        <div className="mb-8 print:mb-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 mb-1">
                {report.patient_name}
              </h1>
              <h2 className="text-lg text-slate-500 font-medium">
                Pre-consultation report
              </h2>
            </div>
            <div className="text-right">
              <p className="text-sm text-slate-400">
                {dateFrom} &mdash; {dateTo}
              </p>
              <p className="text-sm text-slate-400">
                {report.total_entries} observations
              </p>
            </div>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4 mb-8 print:mb-6">
          <div className="bg-slate-50 rounded-xl p-4 print:border print:border-slate-200">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
              Observations
            </p>
            <p className="text-3xl font-bold text-slate-800">
              {report.total_entries}
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 print:border print:border-slate-200">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
              Average distress
            </p>
            <p className="text-3xl font-bold text-slate-800">
              {report.average_dt ?? '--'}
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 print:border print:border-slate-200">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
              Highest DT
            </p>
            <p className="text-3xl font-bold text-red-600">
              {report.dt_range?.max ?? '--'}
            </p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 print:border print:border-slate-200">
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
              Days monitored
            </p>
            <p className="text-3xl font-bold text-slate-800">
              {report.date_range?.days ?? '--'}
            </p>
          </div>
        </div>

        {/* Highest distress situations */}
        {report.top_situations_by_distress.length > 0 && (
          <div className="mb-8 print:mb-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">
              Highest distress situations
            </h3>
            <div className="space-y-3">
              {report.top_situations_by_distress.map((entry) => (
                <div
                  key={entry.id}
                  className="border border-slate-200 rounded-xl p-5"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <p className="text-xs text-slate-400 mb-1">
                        {new Date(entry.entry_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </p>
                      <p className="text-base font-medium text-slate-800">
                        {entry.situation || 'No situation recorded'}
                      </p>
                    </div>
                    <DTBadge value={entry.fear_thermometer} />
                  </div>
                  {entry.child_behavior_observed && (
                    <div className="mb-2">
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-0.5">
                        What was observed
                      </p>
                      <p className="text-sm text-slate-600">{entry.child_behavior_observed}</p>
                    </div>
                  )}
                  {entry.parent_response && (
                    <div>
                      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-0.5">
                        How parent responded
                      </p>
                      <p className="text-sm text-slate-600">{entry.parent_response}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Most frequent situations */}
        {report.top_situations_by_frequency.length > 0 && (
          <div className="mb-8 print:mb-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-4">
              Most frequent situations
            </h3>
            <div className="space-y-2">
              {report.top_situations_by_frequency.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-3 px-4 bg-slate-50 rounded-lg print:border print:border-slate-200"
                >
                  <span className="text-sm text-slate-700">{item.situation}</span>
                  <span className="text-sm font-medium text-slate-500">{item.count}x</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Parent response themes */}
        {report.parent_response_themes.length > 0 && (
          <div className="mb-8 print:mb-6">
            <h3 className="text-lg font-semibold text-slate-800 mb-2">
              Parent responses at highest distress
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              How the parent responded during the 3 most distressing observations
            </p>
            <div className="space-y-3">
              {report.parent_response_themes.map((theme, i) => (
                <div
                  key={i}
                  className="border-l-4 border-amber-400 pl-4 py-2"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-slate-400">
                      {new Date(theme.entry_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    {theme.fear_thermometer != null && (
                      <span className="text-xs font-medium text-red-600">DT {theme.fear_thermometer}</span>
                    )}
                    {theme.situation && (
                      <span className="text-xs text-slate-400">| {theme.situation}</span>
                    )}
                  </div>
                  <p className="text-sm text-slate-700 italic">
                    "{theme.parent_response}"
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* All observations table */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">
            All observations
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="text-left py-3 px-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Date</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Situation</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-slate-400 uppercase tracking-wider">What observed</th>
                  <th className="text-left py-3 px-3 text-xs font-medium text-slate-400 uppercase tracking-wider">How responded</th>
                  <th className="text-center py-3 px-3 text-xs font-medium text-slate-400 uppercase tracking-wider">DT</th>
                </tr>
              </thead>
              <tbody>
                {report.entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100">
                    <td className="py-3 px-3 text-slate-500 whitespace-nowrap">
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
                    <td className="py-3 px-3 text-center">
                      <DTBadge value={entry.fear_thermometer} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
