/**
 * The questions for setting up an exposure — one set of words, asked in two places.
 *
 * The child answers them one screen at a time in their app. In session the clinician shows them
 * all on one sheet and types what the child says (Peter, 2026-09-10). The wording and the stored
 * values are the same in both; only the screens differ.
 *
 * Plan: docs/plans/teen-home-ladder-and-session-setup.md
 */

export type SetupKey = 'fear' | 'believe' | 'level' | 'when' | 'ready'

/** The order the child meets them. */
export const SETUP_ORDER: SetupKey[] = ['fear', 'believe', 'level', 'when', 'ready']

export const QUESTION: Record<SetupKey, string> = {
  fear: 'What are you afraid will happen?',
  believe: 'How strongly do you believe that will happen?',
  level: 'Expected Fear Level?',
  when: 'When will you do it?',
  ready: 'How ready do you feel?',
}

/** How each answer is named once it's been given — on the partly set up summary. */
export const ANSWERED_AS: Record<SetupKey, string> = {
  fear: "What you're afraid will happen",
  believe: 'How strongly you believe it',
  level: 'Expected Fear Level',
  when: "When you'll do it",
  ready: 'How ready you feel',
}

/** Keys are the backend's confidence_level values; only the words are shown. */
export const CONFIDENCE = [
  { key: 'low', label: 'Not really' },
  { key: 'medium', label: 'Kind of' },
  { key: 'high', label: 'Ready' },
] as const
export type ConfidenceKey = (typeof CONFIDENCE)[number]['key']

/** Coarse times of day. `hour` is stamped onto the scheduled date so it is a real moment. */
export const TIME_BUCKETS = [
  { key: 'morning', label: 'Morning', hour: 9 },
  { key: 'afternoon', label: 'Afternoon', hour: 14 },
  { key: 'evening', label: 'Evening', hour: 19 },
] as const
export type BucketKey = (typeof TIME_BUCKETS)[number]['key']

export type SetupSoFar = {
  scheduled_date: string | null
  scheduled_time_bucket?: string | null
  prediction?: string | null
  bip_before?: number | null
  distress_thermometer_expected?: number | null
  confidence_level?: string | null
}

/**
 * What was already answered on an exposure the clinician started.
 *
 * The four answers count only when the fear is there too. They are saved together in session, and
 * the older date-only plan wrote a readiness of "Kind of" that nobody gave — so a readiness on its
 * own is not an answer.
 */
export function whatsDone(exp: SetupSoFar): Record<SetupKey, boolean> {
  const inSession = !!exp.prediction && exp.prediction.trim().length > 0
  return {
    fear: inSession,
    believe: inSession && exp.bip_before != null,
    level: inSession && exp.distress_thermometer_expected != null,
    ready: inSession && !!exp.confidence_level,
    when: !!exp.scheduled_date && !!exp.scheduled_time_bucket,
  }
}

export const confidenceLabel = (key: string | null | undefined) =>
  CONFIDENCE.find(c => c.key === key)?.label ?? null
export const bucketLabel = (key: string | null | undefined) =>
  TIME_BUCKETS.find(b => b.key === key)?.label ?? null
