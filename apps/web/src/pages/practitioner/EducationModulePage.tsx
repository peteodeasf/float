import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { clinicianModules, type QuizQuestion, type Exercise } from '../../data/education'
import PractitionerNav from '../../components/ui/PractitionerNav'

function getProgress(moduleId: string): 'not_started' | 'in_progress' | 'complete' {
  if (localStorage.getItem(`education_complete_${moduleId}`)) return 'complete'
  if (localStorage.getItem(`education_started_${moduleId}`)) return 'in_progress'
  return 'not_started'
}

// ── Quiz Component ──
function QuizSection({ questions, moduleId, onComplete }: {
  questions: QuizQuestion[]
  moduleId: string
  onComplete: () => void
}) {
  const [currentQ, setCurrentQ] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [correctCount, setCorrectCount] = useState(0)
  const [finished, setFinished] = useState(false)

  const q = questions[currentQ]

  const handleSelect = (idx: number) => {
    if (revealed) return
    setSelected(idx)
    setRevealed(true)
    if (idx === q.correctIndex) setCorrectCount(c => c + 1)
  }

  const handleNext = () => {
    if (currentQ < questions.length - 1) {
      setCurrentQ(c => c + 1)
      setSelected(null)
      setRevealed(false)
    } else {
      setFinished(true)
      const score = correctCount + (selected === q.correctIndex ? 0 : 0)
      localStorage.setItem(`education_quiz_score_${moduleId}`, String(score))
    }
  }

  if (finished) {
    const finalScore = correctCount
    return (
      <div className="bg-white rounded-xl p-8 text-center" style={{ border: '1px solid var(--float-border)' }}>
        <div className="text-4xl mb-4">
          {finalScore === questions.length ? '🎉' : finalScore >= questions.length * 0.6 ? '👍' : '📚'}
        </div>
        <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--float-text)' }}>
          Quiz complete
        </h3>
        <p className="text-lg mb-6" style={{ color: 'var(--float-text-secondary)' }}>
          {finalScore} of {questions.length} correct
        </p>
        <button
          onClick={onComplete}
          className="text-white px-6 py-3 rounded-lg text-sm font-medium cursor-pointer border-none"
          style={{ background: 'var(--float-primary)' }}
        >
          Mark module complete
        </button>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl p-6" style={{ border: '1px solid var(--float-border)' }}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold" style={{ color: 'var(--float-text)' }}>Quiz</h3>
        <span className="text-xs" style={{ color: 'var(--float-text-hint)' }}>
          Question {currentQ + 1} of {questions.length}
        </span>
      </div>

      <p className="text-base font-medium mb-5" style={{ color: 'var(--float-text)' }}>
        {q.question}
      </p>

      <div className="space-y-3 mb-5">
        {q.options.map((opt, idx) => {
          let borderColor = 'var(--float-border)'
          let bg = 'transparent'
          if (revealed) {
            if (idx === q.correctIndex) { borderColor = '#22c55e'; bg = '#f0fdf4' }
            else if (idx === selected) { borderColor = '#ef4444'; bg = '#fef2f2' }
          } else if (idx === selected) {
            borderColor = 'var(--float-primary)'
            bg = 'var(--float-primary-light)'
          }
          return (
            <button
              key={idx}
              onClick={() => handleSelect(idx)}
              className="w-full text-left p-4 rounded-lg text-sm transition-colors cursor-pointer"
              style={{ border: `2px solid ${borderColor}`, background: bg, color: 'var(--float-text)' }}
            >
              {opt}
            </button>
          )
        })}
      </div>

      {revealed && (
        <div className="p-4 rounded-lg mb-4" style={{ background: '#f0fdfa', border: '1px solid #99f6e4' }}>
          <p className="text-sm" style={{ color: '#134e4a' }}>
            {q.explanation}
          </p>
        </div>
      )}

      {revealed && (
        <button
          onClick={handleNext}
          className="text-white px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer border-none"
          style={{ background: 'var(--float-primary)' }}
        >
          {currentQ < questions.length - 1 ? 'Next question' : 'See results'}
        </button>
      )}
    </div>
  )
}

// ── Exercise Component ──
function ExerciseSection({ exercise, moduleId, onComplete }: {
  exercise: Exercise
  moduleId: string
  onComplete: () => void
}) {
  const [responses, setResponses] = useState<string[]>(exercise.tasks.map(() => ''))
  const [showAnswer, setShowAnswer] = useState(false)

  const allAttempted = responses.every(r => r.trim().length > 0)

  const handleReveal = () => {
    setShowAnswer(true)
    localStorage.setItem(`education_complete_${moduleId}`, 'true')
  }

  return (
    <div className="bg-white rounded-xl p-6" style={{ border: '1px solid var(--float-border)' }}>
      <h3 className="text-lg font-semibold mb-4" style={{ color: 'var(--float-text)' }}>
        Exercise: {exercise.title}
      </h3>

      {/* Vignette */}
      <div className="p-5 rounded-lg mb-6" style={{ background: '#f8fafc', border: '1px solid var(--float-border)' }}>
        <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--float-text-secondary)' }}>
          {exercise.vignette}
        </p>
      </div>

      {/* Tasks */}
      <div className="space-y-5 mb-6">
        {exercise.tasks.map((task, i) => (
          <div key={i}>
            <p className="text-sm font-medium mb-2" style={{ color: 'var(--float-text)' }}>
              {i + 1}. {task}
            </p>
            <textarea
              value={responses[i]}
              onChange={e => {
                const next = [...responses]
                next[i] = e.target.value
                setResponses(next)
              }}
              rows={3}
              placeholder="Type your response..."
              className="w-full p-3 rounded-lg text-sm resize-vertical"
              style={{
                border: '1px solid var(--float-border)',
                fontFamily: 'inherit',
                color: 'var(--float-text)'
              }}
            />
          </div>
        ))}
      </div>

      {/* Reveal */}
      {!showAnswer ? (
        <button
          onClick={handleReveal}
          disabled={!allAttempted}
          className="text-white px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer border-none disabled:opacity-40"
          style={{ background: 'var(--float-primary)' }}
        >
          View model answer
        </button>
      ) : (
        <div>
          <div className="p-5 rounded-lg mb-4" style={{ background: '#f0fdfa', border: '1px solid #99f6e4' }}>
            <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: '#0d9488' }}>
              Model answer
            </p>
            <div
              className="text-sm leading-relaxed prose prose-sm max-w-none"
              style={{ color: '#134e4a' }}
              dangerouslySetInnerHTML={{
                __html: exercise.modelAnswer
                  .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                  .replace(/\n/g, '<br />')
              }}
            />
          </div>
          <button
            onClick={onComplete}
            className="text-white px-5 py-2.5 rounded-lg text-sm font-medium cursor-pointer border-none"
            style={{ background: 'var(--float-primary)' }}
          >
            Mark module complete
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main Module Page ──
export default function EducationModulePage() {
  const { moduleId } = useParams<{ moduleId: string }>()
  const navigate = useNavigate()
  const mod = clinicianModules.find(m => m.id === moduleId)

  useEffect(() => {
    if (moduleId) {
      localStorage.setItem(`education_started_${moduleId}`, 'true')
    }
  }, [moduleId])

  if (!mod) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Module not found.</p>
      </div>
    )
  }

  const currentIndex = clinicianModules.findIndex(m => m.id === moduleId)
  const prevModule = currentIndex > 0 ? clinicianModules[currentIndex - 1] : null
  const nextModule = currentIndex < clinicianModules.length - 1 ? clinicianModules[currentIndex + 1] : null

  const handleComplete = () => {
    localStorage.setItem(`education_complete_${mod.id}`, 'true')
    if (nextModule) {
      navigate(`/education/${nextModule.id}`)
    } else {
      navigate('/education')
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--float-bg)' }}>
      <PractitionerNav
        activePage="education"
        subHeader={{
          backTo: '/education',
          backLabel: 'Back to modules',
          title: `Module ${mod.number}: ${mod.title}`,
        }}
      />

      <div className="max-w-6xl mx-auto px-8 py-8 flex gap-8">
        {/* Sidebar */}
        <aside className="hidden lg:block w-56 flex-shrink-0">
          <div className="sticky top-8 space-y-1">
            {clinicianModules.map(m => {
              const progress = getProgress(m.id)
              const isCurrent = m.id === moduleId
              return (
                <button
                  key={m.id}
                  onClick={() => navigate(`/education/${m.id}`)}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm cursor-pointer border-none flex items-center gap-2.5 transition-colors"
                  style={{
                    background: isCurrent ? 'var(--float-primary-light)' : 'transparent',
                    color: isCurrent ? 'var(--float-primary-text)' : 'var(--float-text-secondary)'
                  }}
                >
                  <span className="flex-shrink-0 w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold"
                    style={{
                      background: progress === 'complete' ? '#22c55e' : isCurrent ? 'var(--float-primary)' : 'var(--float-border)',
                      color: progress === 'complete' || isCurrent ? '#fff' : 'var(--float-text-hint)'
                    }}
                  >
                    {progress === 'complete' ? '\u2713' : m.number}
                  </span>
                  <span className="truncate">{m.title}</span>
                </button>
              )
            })}
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 max-w-3xl">
          {/* Module header */}
          <div className="mb-8">
            <span className="text-xs font-bold px-2 py-1 rounded mb-3 inline-block"
              style={{ background: 'var(--float-primary-light)', color: 'var(--float-primary-text)' }}
            >
              Module {mod.number}
            </span>
            <h1 className="text-2xl font-bold mb-1" style={{ color: 'var(--float-text)' }}>
              {mod.title}
            </h1>
            <p className="text-sm" style={{ color: 'var(--float-text-hint)' }}>
              {mod.estimatedMinutes} minute read
            </p>
          </div>

          {/* Sections */}
          <div className="space-y-8 mb-12">
            {mod.sections.map((section, i) => (
              <div key={i}>
                <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--float-text)' }}>
                  {section.heading}
                </h2>
                <div
                  className="text-sm leading-relaxed prose prose-sm max-w-none"
                  style={{ color: 'var(--float-text-secondary)' }}
                  dangerouslySetInnerHTML={{
                    __html: section.content
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/^> (.+)$/gm, '<blockquote class="border-l-4 border-slate-200 pl-4 italic my-2">$1</blockquote>')
                      .replace(/^(\d+)\. /gm, '<br/><strong>$1.</strong> ')
                      .replace(/^- (.+)$/gm, '<br/>• $1')
                      .replace(/\n\n/g, '</p><p class="mt-3">')
                      .replace(/\|(.+)\|/g, (match) => {
                        if (match.includes('---')) return ''
                        const cells = match.split('|').filter(Boolean).map(c => c.trim())
                        return `<div class="flex gap-4 py-1 text-sm">${cells.map(c => `<span class="flex-1">${c}</span>`).join('')}</div>`
                      })
                  }}
                />
              </div>
            ))}
          </div>

          {/* Quiz or Exercise */}
          {mod.quiz && (
            <div className="mb-12">
              <QuizSection
                questions={mod.quiz}
                moduleId={mod.id}
                onComplete={handleComplete}
              />
            </div>
          )}

          {mod.exercise && (
            <div className="mb-12">
              <ExerciseSection
                exercise={mod.exercise}
                moduleId={mod.id}
                onComplete={handleComplete}
              />
            </div>
          )}

          {/* Mark complete if no quiz/exercise */}
          {!mod.quiz && !mod.exercise && getProgress(mod.id) !== 'complete' && (
            <div className="mb-12 text-center">
              <button
                onClick={handleComplete}
                className="text-white px-6 py-3 rounded-lg text-sm font-medium cursor-pointer border-none"
                style={{ background: 'var(--float-primary)' }}
              >
                Mark module complete
              </button>
            </div>
          )}

          {/* Navigation */}
          <div className="flex items-center justify-between pt-6" style={{ borderTop: '1px solid var(--float-border)' }}>
            {prevModule ? (
              <button
                onClick={() => navigate(`/education/${prevModule.id}`)}
                className="text-sm cursor-pointer bg-transparent border-none"
                style={{ color: 'var(--float-primary)' }}
              >
                &larr; {prevModule.title}
              </button>
            ) : <div />}
            {nextModule ? (
              <button
                onClick={() => navigate(`/education/${nextModule.id}`)}
                className="text-sm cursor-pointer bg-transparent border-none"
                style={{ color: 'var(--float-primary)' }}
              >
                {nextModule.title} &rarr;
              </button>
            ) : (
              <button
                onClick={() => navigate('/education')}
                className="text-sm cursor-pointer bg-transparent border-none"
                style={{ color: 'var(--float-primary)' }}
              >
                Back to all modules
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}
