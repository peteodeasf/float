// The clinician patient page's flat tabs, in bar order. Also the `?tab=` vocabulary other screens
// navigate with.
export const TAB_IDS = ['monitoring', 'sessions', 'plan', 'progress', 'chat'] as const
export type TabId = typeof TAB_IDS[number]

// Old `?tab=` values that still open a tab. The Progress tab was `experiments` (labelled
// Exposures) until Peter renamed it, 2026-10-21 — bookmarks and shared links still use it.
const OLD_TAB_IDS: Record<string, TabId> = { experiments: 'progress' }

/** The tab a `?tab=` value opens, or null when it names none. */
export function tabFromParam(param: string | null): TabId | null {
  if (param == null) return null
  if ((TAB_IDS as readonly string[]).includes(param)) return param as TabId
  return OLD_TAB_IDS[param] ?? null
}
