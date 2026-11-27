/**
 * The questions for setting up an exposure — one set of words, asked in two places.
 *
 * The child answers them one screen at a time in their app. In session the clinician shows them
 * all on one sheet and types what the child says (Peter, 2026-09-10). The wording and the stored
 * values are the same in both; only the screens differ.
 *
 * Plan: docs/plans/teen-home-ladder-and-session-setup.md
 */
import { readSafetyAnswer } from './temptingBehaviors'

export type SetupKey = 'fear' | 'know' | 'believe' | 'level' | 'safety' | 'confident' | 'when'

/**
 * The order the child meets them: Dr. Walker's exposure worksheet, in her words with "you" for "I",
 * then when. "Fear Level" stays our name for her Fear Thermometer/SUDS. The confidence question is
 * shortened because the one before it has just listed the behaviors (Peter, 2026-11-24).
 * docs/plans/exposure-worksheet-questions.md
 */
export const SETUP_ORDER: SetupKey[] = ['fear', 'know', 'believe', 'level', 'safety', 'confident', 'when']

export const QUESTION: Record<SetupKey, string> = {
  fear: 'What are you most worried will happen?',
  know: 'How will you know if this happens?',
  believe: 'How strongly do you believe your prediction is correct?',
  level: 'What will your Fear Level be?',
  safety: 'Which safety or avoidance behaviors or rituals might you want to do?',
  confident: 'How confident do you feel that you can do the exposure without doing them?',
  when: 'When will you do it?',
}

/** How each answer is named once it's been given — on the partly set up summary. */
export const ANSWERED_AS: Record<SetupKey, string> = {
  fear: "What you're most worried will happen",
  know: "How you'll know",
  believe: 'How strongly you believe it',
  level: 'Expected Fear Level',
  safety: 'Safety behaviors you might want to do',
  confident: 'How confident you feel',
  when: "When you'll do it",
}

/** Keys are the backend's confidence_level values; only the words are shown. High first, as on her worksheet. */
export const CONFIDENCE = [
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
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
  how_will_i_know?: string | null
  tempting_behaviors?: string | null
}

/**
 * What was already answered on an exposure the clinician started.
 *
 * The answers count only when the fear is there too. They are saved together in session, and the
 * older date-only plan wrote a confidence of "medium" that nobody gave — so a confidence on its own
 * is not an answer. "How will you know" is optional for the clinician, so it counts only when typed.
 * The safety answer counts once it was asked, even when nothing was picked; exposures set up before
 * the question existed have nothing stored and ask it.
 */
export function whatsDone(exp: SetupSoFar): Record<SetupKey, boolean> {
  const inSession = !!exp.prediction && exp.prediction.trim().length > 0
  return {
    fear: inSession,
    know: inSession && !!exp.how_will_i_know && exp.how_will_i_know.trim().length > 0,
    believe: inSession && exp.bip_before != null,
    level: inSession && exp.distress_thermometer_expected != null,
    safety: inSession && readSafetyAnswer(exp.tempting_behaviors) !== null,
    confident: inSession && !!exp.confidence_level,
    when: !!exp.scheduled_date && !!exp.scheduled_time_bucket,
  }
}

export const confidenceLabel = (key: string | null | undefined) =>
  CONFIDENCE.find(c => c.key === key)?.label ?? null
export const bucketLabel = (key: string | null | undefined) =>
  TIME_BUCKETS.find(b => b.key === key)?.label ?? null
