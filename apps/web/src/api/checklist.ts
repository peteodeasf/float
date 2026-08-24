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

// ── The organization's checklist definition (Float-team managed) ──
export interface ChecklistItemDef {
  id: string
  key: string
  text: string
  link_icon?: string | null
  link_label?: string | null
  nav_label?: string | null
  nav_action?: string | null
  display_order: number
  is_active: boolean
}

export const getChecklistItems = async (): Promise<ChecklistItemDef[]> => {
  const response = await apiClient.get('/checklist-items')
  return response.data
}
