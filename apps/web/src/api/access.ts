import { apiClient } from './client'

/**
 * Who can open a patient's record.
 *
 * Access has been enforced since 2026-08-28 but could only be changed in the database, because
 * nothing returned a clinician id to grant to. `getColleagues` is that list.
 */

export interface AccessGrant {
  practitioner_id: string
  practitioner_name: string
  granted_at: string
  /** Created when grants were first introduced, not by anyone clicking Add. */
  granted_by_backfill: boolean
  /** The patient's own clinician. Their access cannot be taken away. */
  is_owner: boolean
}

export interface PatientAccess {
  /** Whether I am the owner or a clinic admin. A covering colleague sees the same names and can
   *  change none of them. */
  can_manage: boolean
  grants: AccessGrant[]
}

export interface Colleague {
  id: string
  name: string
  credentials: string | null
  /** Admins can open every patient in the institution, grant or no grant. */
  is_org_admin: boolean
  is_me: boolean
}

export const getPatientAccess = async (patientId: string): Promise<PatientAccess> =>
  (await apiClient.get(`/patients/${patientId}/access`)).data

export const getColleagues = async (): Promise<Colleague[]> =>
  (await apiClient.get('/practitioners')).data

export const grantPatientAccess = async (
  patientId: string,
  practitionerId: string
): Promise<AccessGrant> =>
  (await apiClient.post(`/patients/${patientId}/access`, { practitioner_id: practitionerId })).data

export const revokePatientAccess = async (
  patientId: string,
  practitionerId: string
): Promise<void> => {
  await apiClient.delete(`/patients/${patientId}/access/${practitionerId}`)
}

/** Hand the patient to another clinician. They must already have access. */
export const setPatientOwner = async (
  patientId: string,
  practitionerId: string
): Promise<void> => {
  await apiClient.put(`/patients/${patientId}/owner`, { practitioner_id: practitionerId })
}
