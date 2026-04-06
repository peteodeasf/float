import { apiClient } from './client'

export type Patient = {
  id: string
  name: string
  email: string
  created_at: string
}

export interface PatientDetail {
  id: string
  user_id: string          // add this
  name: string
  email: string
  date_of_birth: string | null
  primary_practitioner_id: string
  created_at: string
}

export interface PreSessionBrief {
  patient_id: string
  patient_name: string
  experiments_since_last_session: number
  bip_trend: string
  distress_thermometer_trend: string
  last_experiment_date: string | null
  current_ladder_status: string
  open_flag_count: number
  recent_learnings: string[]
  recommended_focus: string
}

export const getPatients = async (): Promise<Patient[]> => {
  const response = await apiClient.get('/patients')
  return response.data
}

export const getPatient = async (id: string): Promise<PatientDetail> => {
  const response = await apiClient.get(`/patients/${id}`)
  return response.data
}

export const getPreSessionBrief = async (id: string): Promise<PreSessionBrief> => {
  const response = await apiClient.get(`/patients/${id}/summary`)
  return response.data
}
export const TEST = "hello"

export interface CreatePatientData {
  name: string
  email: string
  date_of_birth?: string
}

export const createPatient = async (data: CreatePatientData): Promise<PatientDetail> => {
  const response = await apiClient.post('/patients', data)
  return response.data
}

export interface ExperimentDataPoint {
  experiment_id: string
  completed_date: string | null
  bip_before: number | null
  bip_after: number | null
  distress_thermometer_expected: number | null
  distress_thermometer_actual: number | null
  feared_outcome_occurred: boolean | null
  rung_order: number | null
}

export interface RungProgress {
  rung_id: string
  rung_order: number
  distress_thermometer_rating: number | null
  experiments_completed: number
  latest_bip_before: number | null
  latest_bip_after: number | null
  latest_distress_thermometer_actual: number | null
  data_points: ExperimentDataPoint[]
}

export interface PatientProgress {
  summary: {
    patient_id: string
    total_experiments_completed: number
    total_experiments_planned: number
    average_bip_reduction: number | null
    average_distress_thermometer_reduction: number | null
    experiments_where_feared_outcome_occurred: number
    last_experiment_date: string | null
  }
  rung_progress: RungProgress[]
  recent_experiments: ExperimentDataPoint[]
}

export const getPatientProgress = async (id: string): Promise<PatientProgress> => {
  const response = await apiClient.get(`/patients/${id}/progress`)
  return response.data
}

export interface Message {
  id: string
  sender_user_id: string
  recipient_user_id: string
  patient_id: string
  content: string
  message_type: string
  read_at: string | null
  created_at: string
}

export const getMessages = async (patientId: string): Promise<Message[]> => {
  const response = await apiClient.get(`/patients/${patientId}/messages`)
  return response.data
}

export const sendMessage = async (
  patientId: string,
  recipientUserId: string,
  content: string,
  messageType: string = 'general'
): Promise<Message> => {
  const response = await apiClient.post(`/patients/${patientId}/messages`, {
    recipient_user_id: recipientUserId,
    content,
    message_type: messageType
  })
  return response.data
}
