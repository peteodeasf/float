import { apiClient, PRACTITIONER_KEYS } from './client'

/**
 * A clinician's own details.
 *
 * Neither route takes an id: they can only ever act on whoever is signed in. Name, credentials and
 * phone live on the practitioner profile and, until the settings page, could not be edited at all.
 */

export interface MyProfile {
  id: string
  name: string
  credentials: string | null
  phone_number: string | null
  /** How they sign in. Read-only for now — see SettingsPage. */
  email: string
  is_org_admin: boolean
}

export const getMyProfile = async (): Promise<MyProfile> =>
  (await apiClient.get('/practitioners/me')).data

export const updateMyProfile = async (data: {
  name: string
  credentials: string | null
  phone_number: string | null
}): Promise<MyProfile> => (await apiClient.put('/practitioners/me', data)).data

/**
 * Changing it while signed in needs the password you already have.
 *
 * Changing a password now refuses every token issued before it, so any other session — the one
 * you are changing it because of — stops working. That includes the token this browser is holding,
 * so the server hands back a fresh pair and they are stored here. Without this the clinician would
 * be signed out of the browser they just did it in.
 */
export const changeMyPassword = async (
  currentPassword: string,
  newPassword: string
): Promise<void> => {
  const { data } = await apiClient.put('/auth/change-password', {
    current_password: currentPassword,
    new_password: newPassword,
  })
  if (data?.access_token) {
    localStorage.setItem(PRACTITIONER_KEYS.access, data.access_token)
    apiClient.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
  }
  if (data?.refresh_token) {
    localStorage.setItem(PRACTITIONER_KEYS.refresh, data.refresh_token)
  }
}

/** The getting-started checklist on the home screen. Each item's `done` comes from real data.
 *  docs/plans/clinician-practice-onboarding.md */
export interface GettingStarted {
  items: { key: 'education' | 'invite' | 'patient' | 'monitoring'; done: boolean }[]
  can_hide: boolean
  hidden: boolean
}

export const getGettingStarted = async (): Promise<GettingStarted> =>
  (await apiClient.get('/practitioners/me/getting-started')).data

export const markGettingStarted = async (action: 'read_education' | 'hide_getting_started') =>
  apiClient.post(`/practitioners/me/getting-started/${action}`)
