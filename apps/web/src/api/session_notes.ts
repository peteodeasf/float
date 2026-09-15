import { apiClient } from './client'

export type SessionParticipant = 'parent' | 'patient'

export interface SessionNote {
  id: string
  patient_id: string
  organization_id: string
  practitioner_id: string
  session_type: string | null
  participants: SessionParticipant[]
  tags: string[]
  session_date: string
  content: string
  /** Written by Float from a recorded session, until the clinician approves it. */
  is_draft?: boolean
  source?: 'typed' | 'recording'
  /** Who said what, in order. Speaker keys like "1:2". */
  transcript?: { speaker: string; text: string }[] | null
  speaker_names?: Record<string, string> | null
  created_at: string
  updated_at: string
}

export interface CreateSessionNote {
  participants: SessionParticipant[]
  tags: string[]
  session_date?: string
  content: string
}

export interface UpdateSessionNote {
  participants?: SessionParticipant[]
  tags?: string[]
  session_date?: string
  content?: string
  speaker_names?: Record<string, string>
  /** false approves a draft. */
  is_draft?: false
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
