import { apiClient } from './client'

export interface TreatmentPlan {
  id: string
  patient_id: string
  practitioner_id: string
  clinical_track: string
  parent_visibility_level: string
  status: string
  created_at: string
  updated_at: string
}

export interface TriggerSituation {
  id: string
  treatment_plan_id: string
  name: string
  description: string | null
  distress_thermometer_rating: number | null
  display_order: number
  created_at: string
}

export interface AvoidanceBehavior {
  id: string
  trigger_situation_id: string
  name: string
  description: string | null
  behavior_type: string
  distress_thermometer_when_refraining: number | null
  created_at: string
}

export interface LadderRung {
  id: string
  ladder_id: string
  avoidance_behavior_id: string | null
  distress_thermometer_rating: number | null
  rung_order: number
  status: string
  created_at: string
}

export interface Ladder {
  id: string
  trigger_situation_id: string
  status: string
  review_status: string | null
  created_at: string
  updated_at: string
  rungs: LadderRung[]
}

export interface LadderFlag {
  id: string
  ladder_id: string
  flag_type: string
  flag_data: string
  description: string | null
  status: string
  created_at: string
}

export const getTreatmentPlan = async (patientId: string): Promise<TreatmentPlan | null> => {
  const response = await apiClient.get(`/patients/${patientId}/plan`)
  return response.data
}

export const getTriggers = async (planId: string): Promise<TriggerSituation[]> => {
  const response = await apiClient.get(`/plans/${planId}/triggers`)
  return response.data
}

export const getBehaviors = async (triggerId: string): Promise<AvoidanceBehavior[]> => {
  const response = await apiClient.get(`/triggers/${triggerId}/behaviors`)
  return response.data
}

export const getLadder = async (triggerId: string): Promise<Ladder> => {
  const response = await apiClient.get(`/triggers/${triggerId}/ladder`)
  return response.data
}

export const getLadderFlags = async (ladderId: string): Promise<LadderFlag[]> => {
  const response = await apiClient.get(`/ladders/${ladderId}/flags`)
  return response.data
}

export const reviewLadder = async (ladderId: string) => {
  const response = await apiClient.post(`/ladders/${ladderId}/review`)
  return response.data
}

export interface CreatePlanData {
  clinical_track: string
  parent_visibility_level: string
}

export const createTreatmentPlan = async (
  patientId: string,
  data: CreatePlanData
): Promise<TreatmentPlan> => {
  const response = await apiClient.post(`/patients/${patientId}/plan`, data)
  return response.data
}
