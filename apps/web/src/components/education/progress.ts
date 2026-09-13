/** Where a clinician has got to in the Education modules. Kept in this browser only, as before;
 *  saving it to their account is a separate piece of work. Storage can throw in some browsers, so
 *  every read and write is guarded. */
export type ModuleProgress = 'not_started' | 'in_progress' | 'complete'

function get(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function set(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* kept for this visit only */ }
}

export function getProgress(moduleId: string): ModuleProgress {
  if (get(`education_complete_${moduleId}`)) return 'complete'
  if (get(`education_started_${moduleId}`)) return 'in_progress'
  return 'not_started'
}

export function markStarted(moduleId: string) {
  set(`education_started_${moduleId}`, 'true')
  set('education_last_opened', moduleId)
}

export function markComplete(moduleId: string) {
  set(`education_complete_${moduleId}`, 'true')
}

export function saveQuizScore(moduleId: string, score: number) {
  set(`education_quiz_score_${moduleId}`, String(score))
}

export function lastOpened(): string | null {
  return get('education_last_opened')
}
