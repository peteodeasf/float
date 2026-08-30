import axios from 'axios'

import { attachSession, startIdleWatchdog, type TokenKeys } from './session'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

const make = () =>
  axios.create({ baseURL: API_URL, headers: { 'Content-Type': 'application/json' } })

// Each app keeps its own tokens, so a clinician and a teen signed in on the same browser do not
// share a session. `clear` is everything to remove on sign-out — not just the token, or the app
// comes back thinking it knows who you are.
export const PRACTITIONER_KEYS: TokenKeys = {
  access: 'access_token',
  refresh: 'refresh_token',
  clear: ['access_token', 'refresh_token'],
}

export const TEEN_KEYS: TokenKeys = {
  access: 'teen_access_token',
  refresh: 'teen_refresh_token',
  clear: ['teen_access_token', 'teen_refresh_token', 'teen_patient_id',
          'teen_must_change_password'],
}

export const PARENT_KEYS: TokenKeys = {
  access: 'parent_access_token',
  refresh: 'parent_refresh_token',
  clear: ['parent_access_token', 'parent_refresh_token', 'parent_patient_id',
          'parent_must_change_password'],
}

export const ADMIN_KEYS: TokenKeys = {
  access: 'admin_token',
  refresh: 'admin_refresh_token',
  clear: ['admin_token', 'admin_refresh_token'],
}

export const apiClient = make()
export const teenApiClient = make()
export const parentApiClient = make()

attachSession(apiClient, 'practitioner', PRACTITIONER_KEYS, '/login')
attachSession(teenApiClient, 'teen', TEEN_KEYS, '/teen/login')
attachSession(parentApiClient, 'parent', PARENT_KEYS, '/parent/login')

// Signs out a clinician or admin who walks away, even if nothing is being requested — what is on
// the screen is the thing that matters. The teen and parent apps have no idle limit, so these are
// no-ops there.
startIdleWatchdog('practitioner', PRACTITIONER_KEYS, '/login')
startIdleWatchdog('admin', ADMIN_KEYS, '/admin/login')
