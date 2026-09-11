import { apiClient, parentApiClient } from './client'
import { whenLabel } from '../lib/teenWork'

/**
 * A parent's accommodation experiment: one planned attempt at not doing an accommodation, with a
 * prediction before and how it went after. Shared by every parent linked to the child; the child
 * sees none of it. docs/plans/parent-accommodation-experiments.md
 */
export type Bucket = 'morning' | 'afternoon' | 'evening'
export type Readiness = 'low' | 'medium' | 'high'
export type DidIt = 'yes' | 'partly' | 'not_this_time'
export type Happened = 'yes' | 'partly' | 'no'

export interface ParentExperiment {
  id: string
  accommodation_id: string
  accommodation_name: string | null
  status: 'planned' | 'recorded'
  set_up_in_session: boolean
  scheduled_date: string | null
  scheduled_time_bucket: Bucket | null
  instead: string | null
  prediction: string
  belief_before: number
  expected_fear: number
  readiness: Readiness | null
  did_it: DidIt | null
  what_happened: string | null
  actual_fear: number | null
  prediction_happened: Happened | null
  belief_after: number | null
  what_learned: string | null
  too_hard_reason: string | null
  recorded_at: string | null
  created_at: string | null
}

export interface ExperimentBefore {
  accommodation_id: string
  scheduled_date: string
  scheduled_time_bucket: Bucket
  instead?: string | null
  prediction: string
  belief_before: number
  expected_fear: number
  readiness?: Readiness | null
}

export interface ExperimentAfter {
  did_it: DidIt
  what_happened?: string | null
  actual_fear?: number | null
  prediction_happened?: Happened | null
  belief_after?: number | null
  what_learned?: string | null
  too_hard_reason?: string | null
}

// ── The parent app ──
export const getFamilyExperiments = async (): Promise<ParentExperiment[]> =>
  (await parentApiClient.get('/parent/experiments')).data

export const setUpExperiment = async (data: ExperimentBefore): Promise<ParentExperiment> =>
  (await parentApiClient.post('/parent/experiments', data)).data

export const recordExperiment = async (id: string, data: ExperimentAfter): Promise<ParentExperiment> =>
  (await parentApiClient.put(`/parent/experiments/${id}/after`, data)).data

// ── The clinician app ──
export const listParentExperiments = async (planId: string): Promise<ParentExperiment[]> =>
  (await apiClient.get(`/plans/${planId}/accommodations/experiments`)).data

export const setUpParentExperimentInSession = async (planId: string, data: ExperimentBefore): Promise<ParentExperiment> =>
  (await apiClient.post(`/plans/${planId}/accommodations/experiments`, data)).data

/** "Today · Evening", "Fri 12 · Evening". */
export const experimentWhen = (e: ParentExperiment, now: Date = new Date()): string =>
  whenLabel({ id: e.id, status: e.status, scheduled_date: e.scheduled_date, scheduled_time_bucket: e.scheduled_time_bucket }, now)

export const DID_IT_LABEL: Record<DidIt, string> = { yes: 'Did it', partly: 'Partly', not_this_time: 'Not this time' }

