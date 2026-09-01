import { teenApiClient, parentApiClient } from './client'

/**
 * The signed-in user, read live.
 *
 * The teen and parent apps read `/auth/me` once at login and keep the answer in localStorage. That
 * is fine for a patient id, which never changes, but not for `treatment_closed` — a clinician can
 * close a family who is already signed in, and they would not find out until their next login.
 * So the route wrappers fetch this instead of trusting storage.
 */
export interface Me {
  user_id: string
  patient_id: string | null
  patient_name: string | null
  /** The clinician has closed this patient's treatment. Both apps show "All done for now". */
  treatment_closed: boolean
}

export const getTeenMe = async (): Promise<Me> =>
  (await teenApiClient.get('/auth/me')).data

export const getParentMe = async (): Promise<Me> =>
  (await parentApiClient.get('/auth/me')).data
