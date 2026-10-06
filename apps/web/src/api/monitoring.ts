import { apiClient } from './client'

/** One parent/guardian the monitoring form is sent to. A child can have two. */
export interface MonitoringRecipientInput {
  label?: string
  email?: string
}

export interface SendMonitoringFormParams {
  /** One or two recipients (two-parent monitoring). The preferred shape. */
  recipients?: MonitoringRecipientInput[]
  /** Back-compat single-parent fields. The server still accepts them; the UI sends `recipients`. */
  parent_email?: string
  parent_name?: string
  parent_phone?: string
}

/** A recipient as returned by the send/get form endpoints. `email_sent` is only on the send response. */
export interface MonitoringFormRecipient {
  id: string
  label: string
  email: string | null
  link: string
  full_link: string
  opened_at: string | null
  email_sent?: boolean
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
  sms_sent?: boolean
  /** One per parent/guardian the form was sent to. */
  recipients?: MonitoringFormRecipient[]
}

export interface MonitoringEntryData {
  id: string
  entry_date: string
  situation: string | null
  child_behavior_observed: string | null
  parent_response: string | null
  fear_thermometer: number | null
  is_draft: boolean
  parent_words?: string | null
  captured_by?: string
  created_at: string
}

export interface ReportEntry {
  id: string
  entry_date: string
  situation: string | null
  child_behavior_observed: string | null
  parent_response: string | null
  fear_thermometer: number | null
  /** What the parent said or typed, when Float wrote it up. docs/plans/monitoring-just-say-it.md */
  parent_words?: string | null
  captured_by?: string
  /** Which parent/guardian logged this entry, when two are monitoring. */
  recipient_label: string | null
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

// Preliminary, editable extraction output (tuned Stage-1 extractor). The clinician
// reviews/edits/overwrites this before committing it into the treatment plan.
export type ExtractedBehaviorType = 'avoidance' | 'safety' | 'escape' | 'unclear'

export interface ExtractedBehavior {
  order?: number
  type: ExtractedBehaviorType
  description: string
}

export interface ExtractedAccommodation {
  description: string
}

export interface ExtractedSituation {
  name: string
  fear_rating: number | null
  fear_rating_max?: number | null
  behaviors: ExtractedBehavior[]
  accommodations: ExtractedAccommodation[]
}

export interface MonitoringExtraction {
  situations: ExtractedSituation[]
  review_flag?: boolean
}


export interface ReportSituation {
  name: string
  fear_thermometer: number
}

export interface PreliminaryReport {
  situations: ReportSituation[]
  parental_responses: string[]
  safety_behaviors: string[]
  safety_section_label: string
  treatment_targets: string[]
  generated_at?: string
}

export const generatePreliminaryReport = async (patientId: string): Promise<PreliminaryReport> => {
  const response = await apiClient.post(`/patients/${patientId}/monitoring/preliminary-report`)
  return response.data
}

export const getMonitoringSituations = async (patientId: string): Promise<{
  situations: { text: string; mention_count: number }[]
  total_entries: number
}> => {
  const response = await apiClient.get(`/patients/${patientId}/monitoring-form/situations`)
  return response.data
}
