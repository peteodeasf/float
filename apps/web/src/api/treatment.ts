import { apiClient } from './client'

export interface TreatmentPlan {
  id: string
  patient_id: string
  practitioner_id: string
  clinical_track: string
  parent_visibility_level: string
  status: string
  nickname?: string | null
  last_extracted_at?: string | null
  has_new_monitoring_entries?: boolean
  created_at: string
  updated_at: string
}

export const updatePlanNickname = async (patientId: string, planId: string, nickname: string): Promise<TreatmentPlan> => {
  const response = await apiClient.put(`/patients/${patientId}/plan/${planId}`, { nickname })
  return response.data
}

export interface TriggerSituation {
  id: string
  treatment_plan_id: string
  name: string
  description: string | null
  distress_thermometer_rating: number | null
  distress_thermometer_max: number | null
  situation_library_id: string | null
  display_order: number
  is_active: boolean
  is_placeholder?: boolean
  created_at: string
}

export const updateTrigger = async (
  planId: string,
  triggerId: string,
  data: Partial<CreateTriggerData & { is_active: boolean }>
): Promise<TriggerSituation> => {
  const response = await apiClient.put(`/plans/${planId}/triggers/${triggerId}`, data)
  return response.data
}

export const deleteTrigger = async (planId: string, triggerId: string): Promise<void> => {
  await apiClient.delete(`/plans/${planId}/triggers/${triggerId}`)
}

// ── Content tags (situation targeting for JIT tips) ──
export interface ContentTag {
  id: string
  slug: string
  label: string
}

export const getActiveTags = async (): Promise<ContentTag[]> => {
  const res = await apiClient.get('/tags')
  return res.data
}

export const getSituationTags = async (situationId: string): Promise<string[]> => {
  const res = await apiClient.get(`/situations/${situationId}/tags`)
  return res.data.tag_ids as string[]
}

export const setSituationTags = async (situationId: string, tagIds: string[]): Promise<void> => {
  await apiClient.put(`/situations/${situationId}/tags`, { tag_ids: tagIds })
}

export interface AvoidanceBehavior {
  id: string
  // Optional: the situation is a grouping applied to a rung, possibly after it was written.
  trigger_situation_id: string | null
  treatment_plan_id?: string | null
  name: string
  description: string | null
  behavior_type: string
  distress_thermometer_when_refraining: number | null
  behavior_library_id: string | null
  parent_behavior_id: string | null
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
  distress_thermometer_max?: number
  situation_library_id?: string
  is_active?: boolean
  is_placeholder?: boolean
}

export interface CreateBehaviorData {
  name: string
  description?: string
  behavior_type: string
  distress_thermometer_when_refraining?: number
  behavior_library_id?: string
  parent_behavior_id?: string
}

// ── Library (select-from-list reuse) ──
export interface SituationLibraryItem { id: string; name: string }
export interface BehaviorLibraryItem { id: string; name: string; behavior_type: string | null }

export const searchSituationLibrary = async (q: string): Promise<SituationLibraryItem[]> => {
  const res = await apiClient.get('/situation-library', { params: q ? { q } : {} })
  return res.data
}

export const searchBehaviorLibrary = async (q: string): Promise<BehaviorLibraryItem[]> => {
  const res = await apiClient.get('/behavior-library', { params: q ? { q } : {} })
  return res.data
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

export const updateBehavior = async (triggerId: string, behaviorId: string, data: Partial<CreateBehaviorData>): Promise<AvoidanceBehavior> => {
  const response = await apiClient.put(`/triggers/${triggerId}/behaviors/${behaviorId}`, data)
  return response.data
}

export const deleteBehavior = async (triggerId: string, behaviorId: string): Promise<void> => {
  await apiClient.delete(`/triggers/${triggerId}/behaviors/${behaviorId}`)
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
  trigger_situation_id: string
  arrow_steps: ArrowStep[]
  feared_outcome: string | null
  feared_outcome_approved: boolean
  bip_derived: number | null
  facilitated_by: string | null
  created_at: string
  updated_at: string
}

export const getSituationDownwardArrow = async (situationId: string): Promise<DownwardArrow | null> => {
  const response = await apiClient.get(`/trigger-situations/${situationId}/downward-arrow`)
  return response.data
}

export const listPatientDownwardArrows = async (patientId: string, facilitatedBy?: string): Promise<DownwardArrow[]> => {
  const response = await apiClient.get(`/patients/${patientId}/downward-arrows`, {
    params: facilitatedBy ? { facilitated_by: facilitatedBy } : undefined,
  })
  return response.data
}

export const createSituationDownwardArrow = async (situationId: string, firstAnswer?: string, facilitatedBy: string = 'practitioner'): Promise<DownwardArrow> => {
  const response = await apiClient.post(`/trigger-situations/${situationId}/downward-arrow`, {
    facilitated_by: facilitatedBy,
    first_answer: firstAnswer
  })
  return response.data
}

export const updateDownwardArrow = async (
  arrowId: string,
  data: { arrow_steps?: ArrowStep[]; feared_outcome?: string; bip_derived?: number; is_approved?: boolean }
): Promise<DownwardArrow> => {
  const response = await apiClient.put(`/downward-arrows/${arrowId}`, data)
  return response.data
}

// Patient-level (situation-agnostic) arrow — the pre-ladder downward arrow whose
// feared_outcome anchors the ladder. Get-or-create per (patient, facilitated_by).
export const createPatientDownwardArrow = async (patientId: string, firstAnswer?: string, facilitatedBy: string = 'practitioner'): Promise<DownwardArrow> => {
  const response = await apiClient.post(`/patients/${patientId}/downward-arrows`, {
    facilitated_by: facilitatedBy,
    first_answer: firstAnswer,
  })
  return response.data
}

// Phrase the next downward-arrow probe (AI, confirm-first — clinician edits before asking aloud).
export const getNextProbe = async (startingThought: string, steps: ArrowStep[]): Promise<string> => {
  const response = await apiClient.post('/downward-arrows/next-probe', { starting_thought: startingThought, steps })
  return response.data.probe as string
}

export interface PlannedExperiment {
  id: string
  ladder_rung_id: string | null
  avoidance_behavior_id: string | null
  status: string
  scheduled_date: string | null
  completed_date: string | null
  plan_description: string | null
  confidence_level: string | null
  bip_before: number | null
  bip_after: number | null
  distress_thermometer_expected: number | null
  distress_thermometer_actual: number | null
  feared_outcome_occurred: boolean | null
  what_learned: string | null
  behavior_name: string | null
  situation_name: string | null
  trigger_situation_id: string | null
  created_at: string
}

export const getPatientExperiments = async (patientId: string): Promise<PlannedExperiment[]> => {
  const response = await apiClient.get(`/patients/${patientId}/experiments`)
  return response.data
}

export interface PlanExperimentData {
  confidence_level: string
  plan_description: string
  scheduled_date?: string
}

export const planExperimentForBehavior = async (
  behaviorId: string,
  data: PlanExperimentData
): Promise<PlannedExperiment> => {
  const response = await apiClient.post(`/behaviors/${behaviorId}/experiments`, data)
  return response.data
}

// ── The ladder, flat ──
// Every rung on a plan, grouped or not, ordered by score. `trigger_situation_id` is the grouping
// and may be null — a rung can be captured now and grouped later.
export const getPlanRungs = async (planId: string): Promise<AvoidanceBehavior[]> => {
  const response = await apiClient.get(`/plans/${planId}/rungs`)
  return response.data
}

export const createPlanRung = async (
  planId: string,
  data: { name: string; behavior_type: string; distress_thermometer_when_refraining?: number; trigger_situation_id?: string | null },
): Promise<AvoidanceBehavior> => {
  const response = await apiClient.post(`/plans/${planId}/rungs`, data)
  return response.data
}

export const updatePlanRung = async (
  planId: string,
  rungId: string,
  data: Partial<{ name: string; behavior_type: string; distress_thermometer_when_refraining: number; trigger_situation_id: string | null }>,
): Promise<AvoidanceBehavior> => {
  const response = await apiClient.put(`/plans/${planId}/rungs/${rungId}`, data)
  return response.data
}

export const deletePlanRung = async (planId: string, rungId: string): Promise<void> => {
  await apiClient.delete(`/plans/${planId}/rungs/${rungId}`)
}
