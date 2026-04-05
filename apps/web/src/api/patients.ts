import { apiClient } from './client'

export type Patient = {
  id: string
  name: string
  email: string
  created_at: string
}

export interface PatientDetail {
  id: string
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
