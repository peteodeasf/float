import type { AxiosInstance } from 'axios'

/**
 * Sends this phone's or browser's time zone, so reminders keep to 8am–8pm where the family lives.
 * Quiet if it fails: it is sent again the next time the app opens. docs/plans/scheduled-jobs.md
 */
export function recordTimezone(client: AxiosInstance) {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (timezone) client.put('/auth/timezone', { timezone }).catch(() => {})
  } catch {
    // A browser that cannot say its time zone: no reminders until one that can.
  }
}
