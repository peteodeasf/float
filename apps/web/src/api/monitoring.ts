import { apiClient } from './client'

export interface SendMonitoringFormParams {
  parent_email?: string
  parent_name?: string
}

export interface MonitoringFormData {
  id: string
  patient_id: string
  status: 'pending' | 'in_progress' | 'submitted'
  access_token: string
  link: string
  full_link?: string
  sent_at: string | null
  submitted_at: string | null
  created_at: string
  entries_count?: number
  entries?: MonitoringEntryData[]
  practitioner_name?: string
  email_sent?: boolean
}

export interface MonitoringEntryData {
  id: string
  entry_date: string
  situation: string | null
  child_behavior_observed: string | null
  parent_response: string | null
  fear_thermometer: number | null
  is_draft: boolean
  created_at: string
}

export interface ReportEntry {
  id: string
  entry_date: string
  situation: string | null
  child_behavior_observed: string | null
  parent_response: string | null
  fear_thermometer: number | null
}

export interface MonitoringReport {
  patient_id: string
  patient_name: string
  total_entries: number
  date_range: { from: string; to: string; days: number } | null
  dt_range: { min: number; max: number } | null
  average_dt: number | null
  top_situations_by_frequency: { situation: string; count: number }[]
  top_situations_by_distress: ReportEntry[]
  parent_response_themes: {
    label: string
    entry_date: string
    situation: string | null
    parent_response: string | null
    fear_thermometer: number | null
  }[]
  entries: ReportEntry[]
}

export const sendMonitoringForm = async (
  patientId: string,
  params: SendMonitoringFormParams = {}
): Promise<MonitoringFormData> => {
  const response = await apiClient.post(`/patients/${patientId}/monitoring-form/send`, params)
  return response.data
}

export const getMonitoringForm = async (patientId: string): Promise<MonitoringFormData | null> => {
  const response = await apiClient.get(`/patients/${patientId}/monitoring-form`)
  return response.data
}

export const getMonitoringReport = async (patientId: string): Promise<MonitoringReport> => {
  const response = await apiClient.get(`/patients/${patientId}/monitoring-form/report`)
  return response.data
}
