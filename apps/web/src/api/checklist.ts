import { apiClient } from './client'

export type ChecklistItems = Record<string, boolean>

export const getChecklist = async (patientId: string): Promise<ChecklistItems> => {
  const response = await apiClient.get(`/patients/${patientId}/checklist`)
  return response.data.checked_items ?? {}
}

export const updateChecklist = async (patientId: string, items: ChecklistItems): Promise<ChecklistItems> => {
  const response = await apiClient.put(`/patients/${patientId}/checklist`, { checked_items: items })
  return response.data.checked_items ?? {}
}
