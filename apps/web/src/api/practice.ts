import { apiClient } from './client'

/** The practice screens. All scoped to the signed-in person's own practice.
 *  docs/plans/clinician-practice-onboarding.md, steps 5 and 6. */

export interface Practice {
  name: string
  me: { name: string; email: string; is_admin: boolean; is_manager: boolean }
}

export interface Member {
  user_id: string
  name: string
  email: string
  role: 'clinician' | 'practice_manager'
  is_admin: boolean
  status: 'active' | 'invited' | 'removed'
  can_resend_link: boolean
}

export interface PracticePatient {
  patient_id: string
  name: string
  closed: boolean
  clinician: { practitioner_id: string; name: string } | null
  others_with_access: { practitioner_id: string; name: string }[]
}

export const getPractice = async (): Promise<Practice> => (await apiClient.get('/practice')).data
export const getMembers = async (): Promise<Member[]> => (await apiClient.get('/practice/members')).data
export const inviteMember = async (data: { name: string; email: string; role: Member['role'] }) =>
  (await apiClient.post('/practice/members', data)).data
export const resendMemberLink = async (userId: string) =>
  (await apiClient.post(`/practice/members/${userId}/setup-link`)).data
export const setMemberAdmin = async (userId: string, isAdmin: boolean) =>
  (await apiClient.put(`/practice/members/${userId}/admin`, { is_admin: isAdmin })).data
export const removeMember = async (userId: string) =>
  (await apiClient.delete(`/practice/members/${userId}`)).data

export const getPracticePatients = async (): Promise<PracticePatient[]> =>
  (await apiClient.get('/practice/patients')).data
export const getPracticeClinicians = async (): Promise<{ practitioner_id: string; name: string }[]> =>
  (await apiClient.get('/practice/clinicians')).data
export const setPatientClinician = async (patientId: string, practitionerId: string) =>
  (await apiClient.put(`/practice/patients/${patientId}/clinician`, { practitioner_id: practitionerId })).data
