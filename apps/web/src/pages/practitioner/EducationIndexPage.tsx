import { useNavigate } from 'react-router-dom'
import { clinicianModules } from '../../data/education'
import PractitionerNav from '../../components/ui/PractitionerNav'

function getProgress(moduleId: string): 'not_started' | 'in_progress' | 'complete' {
  if (localStorage.getItem(`education_complete_${moduleId}`)) return 'complete'
  if (localStorage.getItem(`education_started_${moduleId}`)) return 'in_progress'
  return 'not_started'
}

const statusStyles = {
  not_started: { bg: 'bg-slate-100', text: 'text-slate-500', label: 'Not started' },
  in_progress: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'In progress' },
  complete: { bg: 'bg-green-100', text: 'text-green-700', label: 'Complete' },
}

export default function EducationIndexPage() {
  const navigate = useNavigate()
  const completedCount = clinicianModules.filter(m => getProgress(m.id) === 'complete').length

  return (
    <div className="min-h-screen" style={{ background: 'var(--float-bg)' }}>
      <PractitionerNav activePage="education" />

      <main className="max-w-4xl mx-auto px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--float-text)' }}>
            Clinician Education
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--float-text-secondary)' }}>
            Based on Dr. Walker's CBT model for anxiety
          </p>
        </div>

        {/* Progress bar */}
        <div className="mb-8 bg-white rounded-xl p-5" style={{ border: '1px solid var(--float-border)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" style={{ color: 'var(--float-text)' }}>
              {completedCount} of {clinicianModules.length} modules complete
            </span>
            <span className="text-xs" style={{ color: 'var(--float-text-hint)' }}>
              {Math.round((completedCount / clinicianModules.length) * 100)}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full" style={{ background: 'var(--float-border)' }}>
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{
                width: `${(completedCount / clinicianModules.length) * 100}%`,
                background: 'var(--float-primary)'
              }}
            />
          </div>
        </div>

        {/* Module grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {clinicianModules.map(mod => {
            const progress = getProgress(mod.id)
            const styles = statusStyles[progress]
            return (
              <button
                key={mod.id}
                onClick={() => navigate(`/education/${mod.id}`)}
                className="bg-white rounded-xl p-5 text-left transition-all hover:shadow-md cursor-pointer"
                style={{ border: '1px solid var(--float-border)' }}
              >
                <div className="flex items-start justify-between mb-3">
                  <span
                    className="text-xs font-bold px-2 py-1 rounded"
                    style={{ background: 'var(--float-primary-light)', color: 'var(--float-primary-text)' }}
                  >
                    {String(mod.number).padStart(2, '0')}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles.bg} ${styles.text}`}>
                    {styles.label}
                  </span>
                </div>
                <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--float-text)' }}>
                  {mod.title}
                </h3>
                <p className="text-sm mb-3" style={{ color: 'var(--float-text-secondary)' }}>
                  {mod.description}
                </p>
                <span className="text-xs" style={{ color: 'var(--float-text-hint)' }}>
                  {mod.estimatedMinutes} min
                </span>
              </button>
            )
          })}
        </div>
      </main>
    </div>
  )
}
