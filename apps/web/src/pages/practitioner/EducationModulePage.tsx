import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { clinicianModules, type QuizQuestion, type Exercise } from '../../data/education'
import PractitionerNav from '../../components/ui/PractitionerNav'
import Prose from '../../components/education/Prose'
import { Figure, ModuleIcon } from '../../components/education/figures'
import { EDU_CSS } from '../../components/education/educationStyles'
import { getProgress, markComplete, markStarted, saveQuizScore } from '../../components/education/progress'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

// ── Quiz: one question at a time, with the answer straight away ──
function QuizSection({ questions, moduleId, onComplete }: {
  questions: QuizQuestion[]
  moduleId: string
  onComplete: () => void
}) {
  const [current, setCurrent] = useState(0)
  const [answers, setAnswers] = useState<(number | null)[]>(questions.map(() => null))
  const [finished, setFinished] = useState(false)

  const q = questions[current]
  const picked = answers[current]
  const correct = answers.filter((a, i) => a === questions[i].correctIndex).length

  const pick = (idx: number) => {
    if (picked !== null) return
    setAnswers(a => a.map((v, i) => (i === current ? idx : v)))
  }
  const next = () => {
    if (current < questions.length - 1) setCurrent(c => c + 1)
    else { setFinished(true); saveQuizScore(moduleId, correct) }
  }
  const retake = () => { setAnswers(questions.map(() => null)); setCurrent(0); setFinished(false) }

  return (
    <section className="edu-panel" aria-labelledby="quiz-title">
      <div className="edu-panel-head">
        <h2 id="quiz-title">Check your understanding</h2>
        <div className="edu-dots" aria-hidden="true">
          {questions.map((qq, i) => {
            const a = answers[i]
            const cls = a === null ? (i === current && !finished ? 'on' : '') : a === qq.correctIndex ? 'right' : 'wrong'
            return <span key={qq.id} className={cls} />
          })}
        </div>
      </div>

      {finished ? (
        <div className="edu-score">
          <b>{correct} / {questions.length}</b>
          <span>{correct === questions.length ? 'Every one right.' : 'Go back over the explanations for the ones you missed.'}</span>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button className="edu-btn" onClick={onComplete}>Mark module complete</button>
            <button className="edu-btn edu-btn-quiet" onClick={retake}>Try again</button>
          </div>
        </div>
      ) : (
        <>
          <p style={{ fontSize: 12.5, fontWeight: 700, color: '#5b6b72', margin: '0 0 6px' }}>Question {current + 1} of {questions.length}</p>
          <p className="edu-q">{q.question}</p>
          <div className="edu-options">
            {q.options.map((opt, idx) => {
              const state = picked === null ? '' : idx === q.correctIndex ? 'edu-option-right' : idx === picked ? 'edu-option-wrong' : ''
              return (
                <button key={idx} className={`edu-option ${state}`} onClick={() => pick(idx)} disabled={picked !== null}>
                  <span className="edu-option-letter">{LETTERS[idx]}</span>
                  <span>{opt}</span>
                </button>
              )
            })}
          </div>
          {picked !== null && (
            <>
              <div className={`edu-feedback ${picked === q.correctIndex ? 'edu-feedback-right' : 'edu-feedback-wrong'}`} role="status">
                <b>{picked === q.correctIndex ? 'Right.' : 'Not quite.'}</b>
                {q.explanation}
              </div>
              <button className="edu-btn" style={{ marginTop: 14 }} onClick={next}>
                {current < questions.length - 1 ? 'Next question' : 'See my score'}
              </button>
            </>
          )}
        </>
      )}
    </section>
  )
}

// ── Exercise: the case, a box per task, then the model answer ──
function ExerciseSection({ exercise, moduleId, onComplete }: {
  exercise: Exercise
  moduleId: string
  onComplete: () => void
}) {
  const [responses, setResponses] = useState<string[]>(exercise.tasks.map(() => ''))
  const [showAnswer, setShowAnswer] = useState(false)
  const allAttempted = responses.every(r => r.trim().length > 0)

  return (
    <section className="edu-panel" aria-labelledby="exercise-title">
      <div className="edu-panel-head">
        <h2 id="exercise-title">Practice: {exercise.title}</h2>
      </div>
      <div className="edu-case">
        <div className="edu-case-label">The case</div>
        <Prose content={exercise.vignette} />
      </div>
      {exercise.tasks.map((task, i) => (
        <div key={i} className="edu-task">
          <label htmlFor={`task-${i}`}><span className="edu-ol-n">{i + 1}</span><span>{task}</span></label>
          <textarea id={`task-${i}`} rows={3} placeholder="Your answer" value={responses[i]}
            onChange={e => setResponses(r => r.map((v, j) => (j === i ? e.target.value : v)))} />
        </div>
      ))}
      {!showAnswer ? (
        <button className="edu-btn" disabled={!allAttempted}
          onClick={() => { setShowAnswer(true); markComplete(moduleId) }}>
          Show the model answer
        </button>
      ) : (
        <>
          <div className="edu-answer">
            <div className="edu-case-label">Model answer</div>
            <Prose content={exercise.modelAnswer} />
          </div>
          <button className="edu-btn" onClick={onComplete}>Mark module complete</button>
        </>
      )}
      {!showAnswer && !allAttempted && (
        <p style={{ fontSize: 13, color: '#5b6b72', margin: '10px 0 0' }}>Answer each task to see the model answer.</p>
      )}
    </section>
  )
}

// ── A module ──
export default function EducationModulePage({ basePath = '/education' }: { basePath?: string }) {
  const { moduleId } = useParams<{ moduleId: string }>()
  const navigate = useNavigate()
  const mod = clinicianModules.find(m => m.id === moduleId)
  const [activeSection, setActiveSection] = useState(0)
  const [read, setRead] = useState(0)

  useEffect(() => {
    if (moduleId) markStarted(moduleId)
    window.scrollTo?.(0, 0)
    setActiveSection(0)
  }, [moduleId])

  // The thin bar under the header, and which section "On this page" marks.
  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight
      setRead(max > 0 ? Math.min(1, window.scrollY / max) : 0)
      const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-edu-section]'))
      let current = 0
      sections.forEach((el, i) => { if (el.getBoundingClientRect().top < 140) current = i })
      setActiveSection(current)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [moduleId])

  if (!mod) {
    return (
      <div className="edu">
        <style>{EDU_CSS}</style>
        <PractitionerNav activePage="education" subHeader={{ backTo: basePath, backLabel: 'All modules', title: 'Not found' }} />
        <p style={{ padding: 40, textAlign: 'center' }}>Module not found.</p>
      </div>
    )
  }

  const index = clinicianModules.findIndex(m => m.id === mod.id)
  const prev = index > 0 ? clinicianModules[index - 1] : null
  const next = index < clinicianModules.length - 1 ? clinicianModules[index + 1] : null
  const complete = () => {
    markComplete(mod.id)
    navigate(next ? `${basePath}/${next.id}` : basePath)
  }

  return (
    <div className="edu">
      <style>{EDU_CSS}</style>
      <PractitionerNav activePage="education" subHeader={{ backTo: basePath, backLabel: 'All modules', title: `Module ${mod.number}: ${mod.title}` }} />

      <header className="edu-mhero">
        <div className="edu-mhero-in">
          <div>
            <div className="edu-eyebrow">Module {mod.number} of {clinicianModules.length} · {mod.estimatedMinutes} min read</div>
            <h1>{mod.title}</h1>
            <p>{mod.description}</p>
            <div className="edu-learn" aria-label="What you'll learn">
              {mod.sections.filter(s => s.heading !== 'Key takeaway').map(s => <span key={s.heading}>{s.heading}</span>)}
            </div>
          </div>
          <div className="edu-mhero-art"><ModuleIcon id={mod.id} size={76} /></div>
        </div>
      </header>
      <div className="edu-readbar" aria-hidden="true"><span style={{ width: `${read * 100}%` }} /></div>

      <div className="edu-layout">
        <nav className="edu-toc" aria-label="On this page">
          <div className="edu-toc-label">On this page</div>
          <ol>
            {mod.sections.map((s, i) => (
              <li key={s.heading}>
                <a href={`#s-${i}`} aria-current={activeSection === i ? 'true' : undefined}
                  onClick={e => { e.preventDefault(); document.getElementById(`s-${i}`)?.scrollIntoView({ behavior: 'smooth' }) }}>
                  {s.heading}
                </a>
              </li>
            ))}
            {(mod.quiz || mod.exercise) && (
              <li>
                <a href="#practice" onClick={e => { e.preventDefault(); document.getElementById('practice')?.scrollIntoView({ behavior: 'smooth' }) }}>
                  {mod.quiz ? 'Quiz' : 'Practice'}
                </a>
              </li>
            )}
          </ol>
          <div className="edu-toc-extra">
            <a href={basePath} onClick={e => { e.preventDefault(); navigate(basePath) }}>← All modules</a>
          </div>
        </nav>

        <main className="edu-main">
          {mod.sections.map((s, i) => (
            <section key={s.heading} id={`s-${i}`} data-edu-section
              className={`edu-section ${s.heading === 'Key takeaway' ? 'edu-takeaway' : ''}`}>
              <h2>{s.heading}</h2>
              <Prose content={s.content} figure={s.figure ? <Figure id={s.figure} /> : undefined} />
            </section>
          ))}

          <div id="practice" style={{ scrollMarginTop: 24 }}>
            {mod.quiz && <QuizSection questions={mod.quiz} moduleId={mod.id} onComplete={complete} />}
            {mod.exercise && <ExerciseSection exercise={mod.exercise} moduleId={mod.id} onComplete={complete} />}
          </div>
          {!mod.quiz && !mod.exercise && getProgress(mod.id) !== 'complete' && (
            <button className="edu-btn" style={{ marginBottom: 28 }} onClick={complete}>Mark module complete</button>
          )}

          {next ? (
            <button className="edu-next" onClick={() => navigate(`${basePath}/${next.id}`)}>
              <span className="edu-next-icon"><ModuleIcon id={next.id} size={34} /></span>
              <span><small>Next · Module {next.number}</small><strong>{next.title}</strong></span>
              <span style={{ marginLeft: 'auto', fontSize: 22 }} aria-hidden="true">→</span>
            </button>
          ) : (
            <button className="edu-next" onClick={() => navigate(basePath)}>
              <span className="edu-next-icon"><ModuleIcon id="understanding-anxiety" size={34} /></span>
              <span><small>That's every module</small><strong>Back to all modules</strong></span>
            </button>
          )}
          {prev && <button className="edu-prev" onClick={() => navigate(`${basePath}/${prev.id}`)}>← Module {prev.number}: {prev.title}</button>}
        </main>
      </div>
    </div>
  )
}
