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

export interface CreateTriggerData {
  name: string
  description?: string
  distress_thermometer_rating?: number
}

export interface CreateBehaviorData {
  name: string
  description?: string
  behavior_type: string
  distress_thermometer_when_refraining?: number
}

export interface CreateRungData {
  avoidance_behavior_id?: string
  distress_thermometer_rating?: number
  rung_order: number
}

export const createTrigger = async (
  planId: string,
  data: CreateTriggerData
): Promise<TriggerSituation> => {
  const response = await apiClient.post(`/plans/${planId}/triggers`, data)
  return response.data
}

export const createBehavior = async (
  triggerId: string,
  data: CreateBehaviorData
): Promise<AvoidanceBehavior> => {
  const response = await apiClient.post(`/triggers/${triggerId}/behaviors`, data)
  return response.data
}

export const createRung = async (
  ladderId: string,
  data: CreateRungData
): Promise<LadderRung> => {
  const response = await apiClient.post(`/ladders/${ladderId}/rungs`, data)
  return response.data
}

export const updatePlanStatus = async (
  patientId: string,
  planId: string,
  status: string
): Promise<TreatmentPlan> => {
  const response = await apiClient.put(`/patients/${patientId}/plan/${planId}`, { status })
  return response.data
}

export interface ArrowStep {
  question: string
  response: string
}

export interface DownwardArrow {
  id: string
  ladder_rung_id: string
  arrow_steps: ArrowStep[]
  feared_outcome: string | null
  feared_outcome_approved: boolean
  bip_derived: number | null
  facilitated_by: string | null
  created_at: string
  updated_at: string
}

export const getDownwardArrow = async (rungId: string): Promise<DownwardArrow | null> => {
  const response = await apiClient.get(`/rungs/${rungId}/downward-arrow`)
  return response.data
}

export const createDownwardArrow = async (rungId: string): Promise<DownwardArrow> => {
  const response = await apiClient.post(`/rungs/${rungId}/downward-arrow`, {
    facilitated_by: 'practitioner'
  })
  return response.data
}

export const updateDownwardArrow = async (
  arrowId: string,
  data: { arrow_steps?: ArrowStep[]; feared_outcome?: string; bip_derived?: number }
): Promise<DownwardArrow> => {
  const response = await apiClient.put(`/downward-arrows/${arrowId}`, data)
  return response.data
}

export const approveDownwardArrow = async (
  arrowId: string,
  data: { feared_outcome: string; bip_derived: number }
): Promise<DownwardArrow> => {
  const response = await apiClient.put(`/downward-arrows/${arrowId}/approve`, data)
  return response.data
}
