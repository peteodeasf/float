export function calculateStreak(experiments: any[]): number {
  const completed = experiments
    .filter(e => e.status === 'completed' && e.completed_date)
    .map(e => {
      const d = new Date(e.completed_date)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    })

  if (completed.length === 0) return 0

  const uniqueDays = [...new Set(completed)].sort().reverse()
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`

  // Streak must include today or yesterday
  if (uniqueDays[0] !== todayStr && uniqueDays[0] !== yesterdayStr) return 0

  let streak = 0
  let checkDate = new Date(uniqueDays[0])

  for (const day of uniqueDays) {
    const expected = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`
    if (day === expected) {
      streak++
      checkDate.setDate(checkDate.getDate() - 1)
    } else if (day < expected) {
      break
    }
  }

  return streak
}
