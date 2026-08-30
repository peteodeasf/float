// Staying signed in while you work, and being signed out when you stop.
//
// What this replaces: a login lasted 30 minutes and nothing ever used the refresh token, so
// everyone was signed out 30 minutes after signing in — a clinician mid-note, a teen mid-exposure.
// It met the HIPAA automatic-logoff requirement by accident, in the way most likely to annoy.
//
// Now: while you are working, the access token is renewed silently. After a stretch of doing
// nothing, you are signed out — which is what the requirement is actually for, a clinic computer
// left open on a patient's record.
//
// The clinician and admin apps are the ones that requirement is about: patient records on a shared
// machine. The teen and parent apps run on the person's own phone and show only their own family's
// data, and a child who gets signed out in the middle of an exposure is less likely to come back —
// so they stay signed in until the refresh token itself expires.

import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'

/** How long a surface may sit idle before we sign it out. null = do not sign out on idle. */
export const IDLE_LIMIT_MS: Record<string, number | null> = {
  // A shared clinic machine left open on a patient's record. 15 minutes is the healthcare norm.
  practitioner: 15 * 60 * 1000,
  admin: 15 * 60 * 1000,
  // Their own phone, their own data. Signing a child out in the middle of an exposure makes them
  // less likely to come back, and protects nothing — the refresh token still expires after seven
  // days on its own.
  teen: null,
  parent: null,
}

type Surface = keyof typeof IDLE_LIMIT_MS

const lastActive: Record<string, number> = {}

/** Any request counts as activity, and so does touching the page. */
export function markActive(surface: string) {
  lastActive[surface] = Date.now()
}

export function isIdle(surface: string): boolean {
  const limit = IDLE_LIMIT_MS[surface as Surface]
  if (limit == null) return false
  const seen = lastActive[surface]
  if (!seen) return false // never seen activity this page-load; do not sign out on a cold start
  return Date.now() - seen > limit
}

/** Watch for the person doing anything at all, so a long read is not mistaken for idleness. */
export function watchActivity(surface: string) {
  markActive(surface)
  const events = ['pointerdown', 'keydown', 'scroll', 'touchstart']
  let throttled = false
  const onAny = () => {
    if (throttled) return
    throttled = true
    markActive(surface)
    setTimeout(() => { throttled = false }, 5000)
  }
  events.forEach((e) => window.addEventListener(e, onAny, { passive: true }))
}

// One refresh at a time per surface. Without this, a screen that fires six requests at once gets
// six refreshes, five of which race and lose — and the loser's token overwrites the winner's.
const inFlight: Record<string, Promise<string | null> | undefined> = {}

async function refreshAccessToken(surface: string, keys: TokenKeys): Promise<string | null> {
  const refreshToken = localStorage.getItem(keys.refresh)
  if (!refreshToken) return null

  if (!inFlight[surface]) {
    inFlight[surface] = axios
      .post(`${API_URL}/auth/refresh`, { refresh_token: refreshToken })
      .then((r) => {
        localStorage.setItem(keys.access, r.data.access_token)
        if (r.data.refresh_token) localStorage.setItem(keys.refresh, r.data.refresh_token)
        return r.data.access_token as string
      })
      .catch(() => null)
      .finally(() => { inFlight[surface] = undefined })
  }
  return inFlight[surface]!
}

export type TokenKeys = { access: string; refresh: string; clear: string[] }

/**
 * Attach to an axios instance. On a 401 it tries once to renew and retry, unless the person has
 * been idle past this surface's limit — in which case it signs them out instead.
 */
export function attachSession(
  client: ReturnType<typeof axios.create>,
  surface: string,
  keys: TokenKeys,
  loginPath: string,
) {
  client.interceptors.request.use((config) => {
    const token = localStorage.getItem(keys.access)
    if (token) config.headers.Authorization = `Bearer ${token}`
    markActive(surface)
    return config
  })

  client.interceptors.response.use(
    (response) => response,
    async (error) => {
      const original = error.config
      const hadToken = !!localStorage.getItem(keys.access)

      if (error.response?.status !== 401 || !hadToken || original?._retried) {
        if (error.response?.status === 401 && hadToken) signOut(keys, loginPath)
        return Promise.reject(error)
      }

      // Idle past the limit: this is the automatic logoff, so do not renew.
      if (isIdle(surface)) {
        signOut(keys, loginPath)
        return Promise.reject(error)
      }

      const fresh = await refreshAccessToken(surface, keys)
      if (!fresh) {
        signOut(keys, loginPath)
        return Promise.reject(error)
      }

      original._retried = true
      original.headers = { ...original.headers, Authorization: `Bearer ${fresh}` }
      return client(original)
    },
  )
}

function signOut(keys: TokenKeys, loginPath: string) {
  keys.clear.forEach((k) => localStorage.removeItem(k))
  window.location.href = loginPath
}

/**
 * Sign out on idle even when nothing is being requested.
 *
 * Without this a screen left open still shows a patient's record until something happens to fail.
 * The requirement is about what is on the screen, not about what the server would allow.
 */
export function startIdleWatchdog(surface: string, keys: TokenKeys, loginPath: string) {
  const limit = IDLE_LIMIT_MS[surface as Surface]
  if (limit == null) return
  watchActivity(surface)
  setInterval(() => {
    if (localStorage.getItem(keys.access) && isIdle(surface)) signOut(keys, loginPath)
  }, 30 * 1000)
}
