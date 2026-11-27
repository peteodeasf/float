// Action plans. docs/plans/action-plans-build.md
import { apiClient, teenApiClient, parentApiClient } from './client'

export type ItemKind = 'exposure' | 'tool' | 'accommodation' | 'parent_instruction' | 'reward'
export type Confidence = 'low' | 'medium' | 'high'

export interface ActionPlanItem {
  id: string
  kind: ItemKind
  /** What to print: this plan's wording, or the rung's, tool's or accommodation's name. */
  label: string
  note: string | null
  reward_for: string | null
  tool_description: string | null
  tool_link: string | null
  // The clinician's and parent's view only.
  position?: number
  text?: string | null
  avoidance_behavior_id?: string | null
  rung_name?: string | null
  fear_level?: number | null
  accommodation_behavior_id?: string | null
  tool_id?: string | null
  share_with_child?: boolean
  reward_given?: boolean | null
  reward_given_by?: 'parent' | 'clinician' | null
  outcome?: 'keep' | 'done' | null
}

export interface ActionPlan {
  id: string
  patient_id: string
  session_number: number
  session_date: string
  confidence: Confidence | null
  published_at: string | null
  items: ActionPlanItem[]
}

export interface Tool {
  id: string
  name: string
  description: string | null
  link: string | null
}

export interface NewItem {
  kind: ItemKind
  avoidance_behavior_id?: string
  accommodation_behavior_id?: string
  tool_id?: string
  text?: string
  reward_for?: string
  note?: string
  share_with_child?: boolean
}

// Clinician
export const getActionPlans = async (patientId: string): Promise<ActionPlan[]> =>
  (await apiClient.get(`/patients/${patientId}/action-plans`)).data

export const createActionPlan = async (patientId: string, keepItemIds: string[]): Promise<ActionPlan> =>
  (await apiClient.post(`/patients/${patientId}/action-plans`, { keep_item_ids: keepItemIds })).data

export const updateActionPlan = async (
  planId: string, data: { session_date?: string; confidence?: Confidence },
): Promise<ActionPlan> => (await apiClient.patch(`/action-plans/${planId}`, data)).data

export const publishActionPlan = async (planId: string): Promise<ActionPlan> =>
  (await apiClient.post(`/action-plans/${planId}/publish`)).data

export const deleteActionPlan = async (planId: string): Promise<void> => {
  await apiClient.delete(`/action-plans/${planId}`)
}

export const addActionPlanItem = async (planId: string, item: NewItem): Promise<ActionPlan> =>
  (await apiClient.post(`/action-plans/${planId}/items`, item)).data

export const updateActionPlanItem = async (
  itemId: string, data: { text?: string; reward_for?: string; note?: string; share_with_child?: boolean },
): Promise<ActionPlan> => (await apiClient.patch(`/action-plan-items/${itemId}`, data)).data

export const deleteActionPlanItem = async (itemId: string): Promise<void> => {
  await apiClient.delete(`/action-plan-items/${itemId}`)
}

export const clinicianMarksReward = async (itemId: string, given: boolean): Promise<ActionPlan> =>
  (await apiClient.put(`/action-plan-items/${itemId}/reward-given`, { given })).data

export const getTools = async (): Promise<Tool[]> => (await apiClient.get('/tools')).data

// Child
export const getMyActionPlan = async (): Promise<ActionPlan | null> =>
  (await teenApiClient.get('/patient/action-plan')).data

// Parent
export const getParentActionPlan = async (): Promise<ActionPlan | null> =>
  (await parentApiClient.get('/parent/action-plan')).data

export const parentMarksReward = async (itemId: string, given: boolean): Promise<ActionPlan> =>
  (await parentApiClient.put(`/parent/action-plan-items/${itemId}/reward-given`, { given })).data
