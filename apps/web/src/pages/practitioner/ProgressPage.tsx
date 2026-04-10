import { useParams, useNavigate } from 'react-router-dom'
import { DetailNav } from '../../components/ui/PractitionerNav'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine
} from 'recharts'
import { getPatient } from '../../api/patients'
import { getPatientProgress } from '../../api/patients'

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-semibold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function ProgressPage() {
  const { patientId } = useParams<{ patientId: string }>()
  const navigate = useNavigate()

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
    <div className="min-h-screen bg-slate-50">
      <DetailNav
        backPath={`/patients/${patientId}`}
        backLabel="Patient"
        title="Progress"
        subtitle={patient?.name}
      />

      <main className="px-8 py-8 max-w-5xl mx-auto space-y-6">

        {isLoading && (
          <p className="text-slate-400">Loading progress data...</p>
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
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-1">
              Belief in Prediction
            </h2>
            <p className="text-sm text-slate-400 mb-6">
              How strongly the patient believed their feared outcome would occur — before and after each experiment
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
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
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
                    fontSize: '12px'
                  }}
                />
                <Legend
                  formatter={(value) => value === 'bip_before' ? 'Before' : 'After'}
                  wrapperStyle={{ fontSize: '12px' }}
                />
                <ReferenceLine y={50} stroke="#e2e8f0" strokeDasharray="4 4" />
                <Line
                  type="monotone"
                  dataKey="bip_before"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#94a3b8' }}
                  strokeDasharray="4 4"
                />
                <Line
                  type="monotone"
                  dataKey="bip_after"
                  stroke="#0d9488"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#0d9488' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Distress thermometer chart */}
        {chartData.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-1">
              Distress Thermometer
            </h2>
            <p className="text-sm text-slate-400 mb-6">
              Expected distress vs actual distress during each experiment
            </p>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 10]}
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value, name) => [
                    value,
                    name === 'dt_expected' ? 'Expected' : 'Actual'
                  ]}
                  contentStyle={{
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px',
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
                  stroke="#94a3b8"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#94a3b8' }}
                  strokeDasharray="4 4"
                />
                <Line
                  type="monotone"
                  dataKey="dt_actual"
                  stroke="#16a34a"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#16a34a' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* No data yet */}
        {!isLoading && chartData.length === 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
            <p className="text-slate-400">
              No completed experiments yet — progress charts will appear here
            </p>
          </div>
        )}

        {/* Rung breakdown */}
        {progress && progress.rung_progress.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h2 className="text-lg font-semibold text-slate-800 mb-4">
              Progress by rung
            </h2>
            <div className="space-y-3">
              {progress.rung_progress.map((rung, i) => (
                <div key={rung.rung_id} className="flex items-center gap-4 py-3 px-4 bg-slate-50 rounded-lg">
                  <span className="text-xs font-medium text-slate-400 w-5">{i + 1}</span>
                  <div className="flex-1">
                    <p className="text-sm text-slate-600">
                      {rung.experiments_completed} experiment{rung.experiments_completed !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {rung.latest_bip_before !== null && rung.latest_bip_after !== null && (
                    <div className="text-right">
                      <p className="text-xs text-slate-400">BIP</p>
                      <p className="text-sm font-medium text-slate-700">
                        {rung.latest_bip_before}% → {rung.latest_bip_after}%
                      </p>
                    </div>
                  )}
                  {rung.distress_thermometer_rating && (
                    <span className="text-xs font-medium text-slate-500">
                      DT {rung.distress_thermometer_rating}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
