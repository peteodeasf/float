import { apiClient } from './client'

/** Feedback from the link at the top right of every clinician page. Saved, then sent on to
 *  GitHub as an issue. docs/plans/clinician-feedback-link.md */
export const sendFeedback = async (body: string, page: string): Promise<{ id: string }> =>
  (await apiClient.post('/feedback', { body, page })).data
