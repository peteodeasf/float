import { apiClient } from './client'

export interface Accommodation {
  id: string
  treatment_plan_id: string
  trigger_situation_id: string | null
  parent_user_id: string | null
  name: string
  description: string | null
  distress_min: number | null
  distress_max: number | null
  display_order: number | null
  status: string
  accommodator: string
  created_at: string
}

export interface CreateAccommodationData {
  name: string
  description?: string | null
  trigger_situation_id?: string | null
  distress_min?: number | null
  distress_max?: number | null
}

export type UpdateAccommodationData = Partial<CreateAccommodationData & { status: string }>

export const listAccommodations = async (planId: string): Promise<Accommodation[]> => {
  const res = await apiClient.get(`/plans/${planId}/accommodations`)
  return res.data
}

export const createAccommodation = async (
  planId: string,
  data: CreateAccommodationData
): Promise<Accommodation> => {
  const res = await apiClient.post(`/plans/${planId}/accommodations`, data)
  return res.data
}

export const updateAccommodation = async (
  planId: string,
  accommodationId: string,
  data: UpdateAccommodationData
): Promise<Accommodation> => {
  const res = await apiClient.put(`/plans/${planId}/accommodations/${accommodationId}`, data)
  return res.data
}

export const deleteAccommodation = async (
  planId: string,
  accommodationId: string
): Promise<void> => {
  await apiClient.delete(`/plans/${planId}/accommodations/${accommodationId}`)
}

export const reorderAccommodations = async (
  planId: string,
  orderedIds: string[]
): Promise<Accommodation[]> => {
  const res = await apiClient.put(`/plans/${planId}/accommodations/reorder`, {
    ordered_ids: orderedIds,
  })
  return res.data
}

/** Reset the ladder order from the distress ratings (midpoint ascending). */
export const reseedAccommodations = async (planId: string): Promise<Accommodation[]> => {
  const res = await apiClient.post(`/plans/${planId}/accommodations/reseed`)
  return res.data
}
