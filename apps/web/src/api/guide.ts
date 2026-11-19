import { apiClient } from './client'

/** The clinician guide's ticks for one patient: a goal ticked, or a stage moved on from.
 *  docs/plans/clinician-guide.md */
export type GuideTicks = Record<string, boolean>

export const getGuideTicks = async (patientId: string): Promise<GuideTicks> =>
  (await apiClient.get(`/patients/${patientId}/guide-ticks`)).data.ticks ?? {}

/** Saves the keys sent; the rest are left as they are. */
export const updateGuideTicks = async (patientId: string, ticks: GuideTicks): Promise<GuideTicks> =>
  (await apiClient.put(`/patients/${patientId}/guide-ticks`, { ticks })).data.ticks ?? {}
