import { apiClient } from './client'

export interface SessionNote {
  id: string
  patient_id: string
  organization_id: string
  practitioner_id: string
  session_type: string
  session_date: string
  content: string
  created_at: string
  updated_at: string
}

export interface CreateSessionNote {
  session_type: string
  session_date?: string
  content: string
}

export interface UpdateSessionNote {
  session_type?: string
  session_date?: string
  content?: string
}

export const getSessionNotes = async (patientId: string): Promise<SessionNote[]> => {
  const response = await apiClient.get(`/patients/${patientId}/notes`)
  return response.data
}

export const createSessionNote = async (patientId: string, data: CreateSessionNote): Promise<SessionNote> => {
  const response = await apiClient.post(`/patients/${patientId}/notes`, data)
  return response.data
}

export const updateSessionNote = async (noteId: string, data: UpdateSessionNote): Promise<SessionNote> => {
  const response = await apiClient.put(`/notes/${noteId}`, data)
  return response.data
}

export const deleteSessionNote = async (noteId: string): Promise<void> => {
  await apiClient.delete(`/notes/${noteId}`)
}
