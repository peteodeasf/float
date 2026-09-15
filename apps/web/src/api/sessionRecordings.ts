import { apiClient } from './client'

/** Recording a session on the clinician's phone. docs/plans/session-recording.md */
export type RecordingStatus = 'recording' | 'stopped' | 'transcribing' | 'done' | 'failed'

export interface SessionRecording {
  id: string
  patient_id: string
  status: RecordingStatus
  participants: ('patient' | 'parent')[]
  segments: number
  error: string | null
  session_note_id: string | null
  started_at: string | null
  stopped_at: string | null
}

export const confirmRecordingConsent = async (patientId: string, agreedBy: string) =>
  (await apiClient.post(`/patients/${patientId}/recording-consent`, { agreed_by: agreedBy })).data

export const listRecordings = async (patientId: string): Promise<SessionRecording[]> =>
  (await apiClient.get(`/patients/${patientId}/recordings`)).data

export const startRecording = async (
  patientId: string, participants: ('patient' | 'parent')[], contentType: string,
): Promise<SessionRecording> =>
  (await apiClient.post(`/patients/${patientId}/recordings`, { participants, content_type: contentType })).data

export const uploadPiece = async (recordingId: string, segment: number, seq: number, audio: Blob, contentType: string) => {
  await apiClient.put(`/recordings/${recordingId}/segments/${segment}/pieces/${seq}`, audio, {
    headers: { 'Content-Type': contentType },
  })
}

export const stopRecording = async (recordingId: string): Promise<SessionRecording> =>
  (await apiClient.post(`/recordings/${recordingId}/stop`)).data

export const retryRecording = async (recordingId: string): Promise<SessionRecording> =>
  (await apiClient.post(`/recordings/${recordingId}/retry`)).data

export const discardRecording = async (recordingId: string) => {
  await apiClient.delete(`/recordings/${recordingId}`)
}
