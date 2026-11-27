// Action plans. docs/plans/action-plans-build.md
import { apiClient, teenApiClient, parentApiClient } from './client'

export type ItemKind = 'exposure' | 'tool' | 'accommodation' | 'parent_instruction' | 'reward'
/** draft: not shared with the family yet. docs/plans/action-plan-drafts.md */
export type PlanState = 'draft' | 'current' | 'upcoming' | 'closed'

/** One time the child (or the clinician, in session) recorded how an exposure went. */
export interface Recording {
  id: string
  completed_date: string | null
  recorded_by: 'child' | 'clinician' | null
  fear_expected: number | null
  fear_felt: number | null
  belief_before: number | null
  belief_after: number | null
  feared_outcome_occurred: boolean | null
}

export interface ActionPlanItem {
  id: string
  kind: ItemKind
  /** What to print: this plan's wording, or the rung's, tool's or accommodation's name. */
  label: string
  note: string | null
  reward_for: string | null
  tool_id?: string | null
  /** The page a line comes from when it is one of its examples ("Mottos"). */
  tool_name?: string | null
  tool_summary?: string | null
  /** How the picked example is used. */
  example_how_used?: string | null
  /** Ticked, or for an exposure, recorded at least once during the plan. */
  done: boolean
  done_by: 'clinician' | 'child' | 'parent' | null
  done_at: string | null
  // The clinician's and parent's view only.
  position?: number
  text?: string | null
  avoidance_behavior_id?: string | null
  rung_name?: string | null
  fear_level?: number | null
  accommodation_behavior_id?: string | null
  tool_example_id?: string | null
  parent_only?: boolean
  share_with_child?: boolean
  // The clinician's only.
  check_note?: string | null
  recordings?: Recording[]
}

export interface ActionPlan {
  id: string
  patient_id: string
  session_number: number
  starts_on: string
  ends_on: string
  state: PlanState
  done_count: number
  items: ActionPlanItem[]
}

/** A line as the edit view saves it. `id` keeps an existing line's ticks and notes. */
export interface ItemIn {
  id?: string
  kind: ItemKind
  avoidance_behavior_id?: string | null
  accommodation_behavior_id?: string | null
  tool_id?: string | null
  tool_example_id?: string | null
  text?: string | null
  reward_for?: string | null
  note?: string | null
  share_with_child?: boolean
  parent_only?: boolean
}

export interface PlanIn {
  starts_on?: string
  ends_on?: string
  items: ItemIn[]
  /** Save draft: the family does not see it yet. Ignored on a plan already shared. */
  draft?: boolean
}

export interface ExposureAfter {
  feared_outcome_occurred: boolean
  what_happened: string
  was_surprised?: boolean | null
  distress_thermometer_actual: number
  bip_after: number
  what_learned: string
}

// Clinician
export const getActionPlans = async (patientId: string): Promise<ActionPlan[]> =>
  (await apiClient.get(`/patients/${patientId}/action-plans`)).data

/** Saved whole; the family sees it straight away unless it is a draft. */
export const createActionPlan = async (patientId: string, body: PlanIn): Promise<ActionPlan> =>
  (await apiClient.post(`/patients/${patientId}/action-plans`, body)).data

export const saveActionPlan = async (planId: string, body: PlanIn): Promise<ActionPlan> =>
  (await apiClient.put(`/action-plans/${planId}`, body)).data

/** A draft's Share with family. Refused until every line is complete. */
export const shareActionPlan = async (planId: string): Promise<ActionPlan> =>
  (await apiClient.post(`/action-plans/${planId}/share`)).data

export const tickItem = async (itemId: string, done: boolean): Promise<ActionPlan> =>
  (await apiClient.put(`/action-plan-items/${itemId}/tick`, { done })).data

/** A check-in note: the clinician's alone. */
export const setCheckNote = async (itemId: string, note: string): Promise<ActionPlan> =>
  (await apiClient.put(`/action-plan-items/${itemId}/check-note`, { note })).data

export const recordExposure = async (patientId: string, rungId: string, after: ExposureAfter) =>
  (await apiClient.post(`/patients/${patientId}/exposures/${rungId}/record`, after)).data

// Child
export const getMyActionPlan = async (): Promise<ActionPlan | null> =>
  (await teenApiClient.get('/patient/action-plan')).data

export const childTick = async (itemId: string, done: boolean): Promise<ActionPlan> =>
  (await teenApiClient.put(`/patient/action-plan-items/${itemId}/tick`, { done })).data

// Parent
export const getParentActionPlan = async (): Promise<ActionPlan | null> =>
  (await parentApiClient.get('/parent/action-plan')).data

/** A tool, strategy or reward. On a reward: it was given. */
export const parentTick = async (itemId: string, done: boolean): Promise<ActionPlan> =>
  (await parentApiClient.put(`/parent/action-plan-items/${itemId}/tick`, { done })).data
