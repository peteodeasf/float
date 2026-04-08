import { apiClient, teenApiClient } from './client'

export interface ActionPlan {
  id: string
  patient_id: string
  organization_id: string
  practitioner_id: string
  session_number: number
  session_date: string
  nickname: string | null
  exposures: string[]
  behaviors_to_resist: string[]
  parent_instructions: string[]
  coping_tools: string[]
  cognitive_strategies: string[]
  additional_notes: string | null
  next_appointment: string | null
  visible_to_patient: boolean
  visible_to_parent: boolean
  created_at: string
  updated_at: string
}

export interface CreateActionPlan {
  session_date?: string
  nickname?: string
  exposures?: string[]
  behaviors_to_resist?: string[]
  parent_instructions?: string[]
  coping_tools?: string[]
  cognitive_strategies?: string[]
  additional_notes?: string
  next_appointment?: string
}

export interface UpdateActionPlan {
  session_date?: string
  nickname?: string
  exposures?: string[]
  behaviors_to_resist?: string[]
  parent_instructions?: string[]
  coping_tools?: string[]
  cognitive_strategies?: string[]
  additional_notes?: string
  next_appointment?: string
}

// Practitioner endpoints
export const getActionPlans = async (patientId: string): Promise<ActionPlan[]> => {
  const response = await apiClient.get(`/patients/${patientId}/action-plans`)
  return response.data
}

export const createActionPlan = async (patientId: string, data: CreateActionPlan): Promise<ActionPlan> => {
  const response = await apiClient.post(`/patients/${patientId}/action-plans`, data)
  return response.data
}

export const updateActionPlan = async (planId: string, data: UpdateActionPlan): Promise<ActionPlan> => {
  const response = await apiClient.put(`/action-plans/${planId}`, data)
  return response.data
}

export const publishActionPlan = async (planId: string): Promise<ActionPlan> => {
  const response = await apiClient.put(`/action-plans/${planId}/publish`)
  return response.data
}

export const deleteActionPlan = async (planId: string): Promise<void> => {
  await apiClient.delete(`/action-plans/${planId}`)
}

// Patient-facing endpoint
export const getMyActionPlans = async (): Promise<ActionPlan[]> => {
  const response = await teenApiClient.get('/patient/action-plans')
  return response.data
}
