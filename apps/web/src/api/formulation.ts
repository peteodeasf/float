import { apiClient } from './client'

export interface ClinicalFormulation {
  id: string
  patient_id: string
  organization_id: string
  practitioner_id: string
  situations?: string[] | null
  behaviors?: string[] | null
  maintaining_mechanisms?: string | null
  accommodation_patterns?: string[] | null
  parent_feared_outcomes?: string[] | null
  patient_feared_outcomes?: string[] | null
  treatment_targets?: string[] | null
  last_updated_step?: number | null
  ai_suggested: boolean
  created_at: string
  updated_at: string
}

export interface FormulationInput {
  situations?: string[] | null
  behaviors?: string[] | null
  maintaining_mechanisms?: string | null
  accommodation_patterns?: string[] | null
  parent_feared_outcomes?: string[] | null
  patient_feared_outcomes?: string[] | null
  treatment_targets?: string[] | null
  last_updated_step?: number | null
  ai_suggested?: boolean
}

export const fetchFormulation = async (patientId: string): Promise<ClinicalFormulation | null> => {
  try {
    const response = await apiClient.get(`/patients/${patientId}/formulation`)
    return response.data
  } catch (err: any) {
    if (err?.response?.status === 404) return null
    throw err
  }
}

export const getFormulation = async (patientId: string): Promise<ClinicalFormulation | null> => {
  try {
    const response = await apiClient.get(`/patients/${patientId}/formulation`)
    return response.data
  } catch (err: any) {
    if (err?.response?.status === 404) return null
    throw err
  }
}

export const createFormulation = async (
  patientId: string,
  data: FormulationInput
): Promise<ClinicalFormulation> => {
  const response = await apiClient.post(`/patients/${patientId}/formulation`, data)
  return response.data
}

export const updateFormulation = async (
  patientId: string,
  data: FormulationInput
): Promise<ClinicalFormulation> => {
  const response = await apiClient.put(`/patients/${patientId}/formulation`, data)
  return response.data
}
