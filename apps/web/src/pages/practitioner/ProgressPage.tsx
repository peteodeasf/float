import { useParams } from 'react-router-dom'
import PractitionerNav from '../../components/ui/PractitionerNav'
import { Card } from '../../components/ui/primitives'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { CHART } from '../../styles/chartColors'
import { getPatient } from '../../api/patients'
import { getPatientProgress } from '../../api/patients'

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card style={{ padding: '20px' }}>
      <p className="text-xs font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--float-text-hint)' }}>{label}</p>
      <p className="text-2xl font-semibold" style={{ color: 'var(--float-text)' }}>{value}</p>
      {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--float-text-hint)' }}>{sub}</p>}
    </Card>
  )
}

export default function ProgressPage() {
  const { patientId } = useParams<{ patientId: string }>()

  const { data: patient } = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => getPatient(patientId!),
    enabled: !!patientId
  })

  const { data: progress, isLoading } = useQuery({
    queryKey: ['progress', patientId],
    queryFn: () => getPatientProgress(patientId!),
    enabled: !!patientId
  })

  // Build chart data from recent experiments
  const chartData = progress?.recent_experiments
    .filter(e => e.completed_date)
    .map((e, i) => ({
      name: `Exp ${i + 1}`,
      date: e.completed_date
        ? new Date(e.completed_date).toLocaleDateString()
        : '',
      bip_before: e.bip_before,
      bip_after: e.bip_after,
      dt_expected: e.distress_thermometer_expected,
      dt_actual: e.distress_thermometer_actual,
    })) ?? []

  const summary = progress?.summary

  return (
    <div className="min-h-screen" style={{ background: 'var(--float-bg)' }}>
      <PractitionerNav
        activePage="patients"
        subHeader={{
          backTo: `/patients/${patientId}`,
          backLabel: 'Back to patient',
          title: 'Progress',
          subtitle: patient?.name,
        }}
      />

      <main className="px-8 py-8 max-w-5xl mx-auto space-y-6">

        {isLoading && (
          <p style={{ color: 'var(--float-text-hint)' }}>Loading progress data...</p>
        )}

        {summary && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="Experiments completed"
              value={summary.total_experiments_completed}
            />
            <StatCard
              label="Avg BIP reduction"
              value={summary.average_bip_reduction !== null
                ? `${summary.average_bip_reduction}%`
                : '—'}
              sub="belief in prediction drop"
            />
            <StatCard
              label="Avg distress reduction"
              value={summary.average_distress_thermometer_reduction !== null
                ? summary.average_distress_thermometer_reduction
                : '—'}
              sub="expected vs actual"
            />
            <StatCard
              label="Feared outcome occurred"
              value={summary.experiments_where_feared_outcome_occurred}
              sub={`of ${summary.total_experiments_completed} experiments`}
            />
          </div>
        )}

        {/* BIP chart */}
        {chartData.length > 0 && (
          <Card style={{ padding: '24px' }}>
            <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--float-text)' }}>
              Belief in Prediction
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--float-text-hint)' }}>
              How strongly the patient believed their feared outcome would occur — before and after each experiment
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: CHART.axis }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fill: CHART.axis }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={v => `${v}%`}
                />
                <Tooltip
                  formatter={(value, name) => [
                    `${value}%`,
                    name === 'bip_before' ? 'BIP before' : 'BIP after'
                  ]}
                  contentStyle={{
                    border: '1px solid var(--float-border)',
                    borderRadius: 'var(--float-radius-control)',
                    fontSize: '12px'
                  }}
                />
                <Legend
                  formatter={(value) => value === 'bip_before' ? 'Before' : 'After'}
                  wrapperStyle={{ fontSize: '12px' }}
                />
                <ReferenceLine y={50} stroke={CHART.grid} strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="bip_before"
                  stroke={CHART.axis}
                  strokeWidth={2}
                  dot={{ r: 4, fill: CHART.axis }}
                  strokeDasharray="4 4"
                />
                <Line
                  type="monotone"
                  dataKey="bip_after"
                  stroke={CHART.primary}
                  strokeWidth={2}
                  dot={{ r: 4, fill: CHART.primary }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Distress thermometer chart */}
        {chartData.length > 0 && (
          <Card style={{ padding: '24px' }}>
            <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--float-text)' }}>
              Fear Level
            </h2>
            <p className="text-sm mb-6" style={{ color: 'var(--float-text-hint)' }}>
              Expected distress vs actual distress during each experiment
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: CHART.axis }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 10]}
                  tick={{ fontSize: 12, fill: CHART.axis }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value, name) => [
                    value,
                    name === 'dt_expected' ? 'Expected' : 'Actual'
                  ]}
                  contentStyle={{
                    border: '1px solid var(--float-border)',
                    borderRadius: 'var(--float-radius-control)',
                    fontSize: '12px'
                  }}
                />
                <Legend
                  formatter={(value) => value === 'dt_expected' ? 'Expected' : 'Actual'}
                  wrapperStyle={{ fontSize: '12px' }}
                />
                <Line
                  type="monotone"
                  dataKey="dt_expected"
                  stroke={CHART.axis}
                  strokeWidth={2}
                  dot={{ r: 4, fill: CHART.axis }}
                  strokeDasharray="4 4"
                />
                <Line
                  type="monotone"
                  dataKey="dt_actual"
                  stroke={CHART.positive}
                  strokeWidth={2}
                  dot={{ r: 4, fill: CHART.positive }}
                />
              </LineChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* No data yet */}
        {!isLoading && chartData.length === 0 && (
          <Card style={{ padding: '48px' }} className="text-center">
            <p style={{ color: 'var(--float-text-hint)' }}>
              No completed experiments yet — progress charts will appear here
            </p>
          </Card>
        )}

        {/* Rung breakdown */}
        {progress && progress.rung_progress.length > 0 && (
          <Card style={{ padding: '24px' }}>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--float-text)' }}>
              Progress by rung
            </h2>
            <div className="space-y-3">
              {progress.rung_progress.map((rung, i) => (
                <div key={rung.rung_id} className="flex items-center gap-4 py-3 px-4" style={{ background: 'var(--float-surface-muted)', borderRadius: 'var(--float-radius-control)' }}>
                  <span className="text-xs font-medium w-5" style={{ color: 'var(--float-text-hint)' }}>{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm" style={{ color: 'var(--float-text-secondary)' }}>
                      {rung.experiments_completed} experiment{rung.experiments_completed !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {rung.latest_bip_before !== null && rung.latest_bip_after !== null && (
                    <div className="text-right">
                      <p className="text-xs" style={{ color: 'var(--float-text-hint)' }}>BIP</p>
                      <p className="text-sm font-medium" style={{ color: 'var(--float-text)' }}>
                        {rung.latest_bip_before}% → {rung.latest_bip_after}%
                      </p>
                    </div>
                  )}
                  {rung.distress_thermometer_rating && (
                    <span className="text-xs font-medium" style={{ color: 'var(--float-text-secondary)' }}>
                      Fear Level {rung.distress_thermometer_rating}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}

      </main>
    </div>
  )
}
