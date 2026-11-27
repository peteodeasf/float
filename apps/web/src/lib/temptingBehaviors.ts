/**
 * `experiments.tempting_behaviors` is a clinical field: the safety behaviours a
 * teen is tempted to use during an exposure.
 *
 * It used to double as storage for "times per day", encoded as `times:N`,
 * because the schema had nowhere else to put it. `experiments.times_per_day`
 * now exists, so new writes keep this column purely clinical.
 *
 * The readers below still understand the old encodings so historical rows —
 * and rows written before the backend deploy — keep working.
 */

export type TemptingBehaviors = {
  /** Repeats per scheduled day (1 when unknown). */
  times: number
  /** Safety behaviours the teen selected. */
  safety: string[]
}

type ExperimentLike = {
  times_per_day?: number | null
  tempting_behaviors?: string | null
}

const LEGACY_TIMES = /times:(\d+)/

export const EMPTY: TemptingBehaviors = { times: 1, safety: [] }

export function decodeTemptingBehaviors(
  raw: string | null | undefined
): TemptingBehaviors {
  if (!raw) return { ...EMPTY }
  const trimmed = raw.trim()

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<TemptingBehaviors>
      const times =
        typeof parsed.times === 'number' && parsed.times > 0 ? parsed.times : 1
      const safety = Array.isArray(parsed.safety)
        ? parsed.safety.filter((s): s is string => typeof s === 'string')
        : []
      return { times, safety }
    } catch {
      // Malformed JSON — fall through to the legacy reader.
    }
  }

  const match = LEGACY_TIMES.exec(trimmed)
  return { times: match ? parseInt(match[1], 10) : 1, safety: [] }
}

/**
 * Safety behaviours only — times per day has its own column now. An empty list is still stored: it
 * is the answer "none" to the setup question, which is different from never having been asked.
 */
export function encodeSafetyBehaviors(safety: string[]): string {
  return JSON.stringify({ safety })
}

/**
 * The answer to the setup question, or null when it was never asked (older rows, including the
 * legacy `times:N` value). An empty list is the answer "none".
 */
export function readSafetyAnswer(raw: string | null | undefined): string[] | null {
  if (!raw || !raw.trim().startsWith('{')) return null
  try {
    const safety = (JSON.parse(raw) as { safety?: unknown }).safety
    return Array.isArray(safety) ? safety.filter((s): s is string => typeof s === 'string') : null
  } catch {
    return null
  }
}

/** How an answer reads on a summary: the behaviors, or "None". */
export const safetyLabel = (picked: string[]) => picked.join(', ') || 'None'

/**
 * Repeats per scheduled day. Prefers the dedicated column and falls back to the
 * legacy in-string encoding for rows written before it existed.
 */
export function readTimesPerDay(experiment: ExperimentLike): number {
  if (typeof experiment.times_per_day === 'number' && experiment.times_per_day > 0) {
    return experiment.times_per_day
  }
  return decodeTemptingBehaviors(experiment.tempting_behaviors).times
}
