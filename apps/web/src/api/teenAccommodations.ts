import { teenApiClient } from './client'

/**
 * The accommodations the child's clinician sent them to rate: if their parent stopped doing this,
 * how hard would it be? Never the parent's estimate. docs/plans/accommodation-conversation.md
 */
export interface AccommodationToRate {
  id: string
  name: string
  situation_name: string | null
  rated: boolean
  /** Their own answer, once they've given it. */
  rating_min: number | null
  rating_max: number | null
}

export const getAccommodationsToRate = async (): Promise<AccommodationToRate[]> =>
  (await teenApiClient.get('/patient/accommodations-to-rate')).data

export const rateAccommodation = async (id: string, lo: number, hi: number): Promise<AccommodationToRate> =>
  (await teenApiClient.put(`/patient/accommodations/${id}/rating`, { rating_min: lo, rating_max: hi })).data
