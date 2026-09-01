// Things that are built and working but switched off while a product question is open.
// One switch each, read from every place the feature shows up, so turning it back on is one edit.

/**
 * Action plans: a clinician writes a session summary and publishes it to the child's app.
 *
 * Switched off 2026-09-01. Peter wants to see how the rest of the app flows before deciding
 * whether an action plan adds anything on top of the treatment plan, the exposure ladder and the
 * child's own app. Nothing was deleted — the endpoints, the editor and the child's page all still
 * work. Setting this to true brings back the clinician's Action plans section on the Sessions tab
 * and the child's Plan tab together.
 *
 * Open item in docs/backlog.md.
 */
export const SHOW_ACTION_PLANS = false
