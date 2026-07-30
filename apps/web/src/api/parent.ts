import { parentApiClient } from './client'

export interface UpcomingExposure {
  id: string
  situation_id: string | null
  situation_name: string | null
  behavior_name: string | null
  scheduled_date: string | null
  scheduled_time_bucket: string | null
  status: string
}

export interface ParentAccommodation {
  id: string
  name: string
  description: string | null
  trigger_situation_id: string | null
  distress_min: number | null
  distress_max: number | null
  display_order: number | null
  is_weekly_focus: boolean
}

export interface ParentTip {
  id: string
  title: string
  body: string
}

export interface ParentMoment {
  id: string
  accommodation_id: string | null
  held: boolean
  note: string | null
  created_at: string | null
}

export interface ParentMessage {
  id: string
  content: string
  message_type: string
  sender_user_id: string
  created_at: string | null
  read_at: string | null
}

export const getUpcomingExposures = async (): Promise<UpcomingExposure[]> =>
  (await parentApiClient.get('/parent/child/experiments/upcoming')).data

export const getParentAccommodations = async (): Promise<ParentAccommodation[]> =>
  (await parentApiClient.get('/parent/accommodations')).data

export const getSituationTips = async (situationId: string): Promise<ParentTip[]> =>
  (await parentApiClient.get(`/parent/situations/${situationId}/tips`)).data

export const logMoment = async (data: {
  accommodation_id?: string | null
  held: boolean
  note?: string | null
}): Promise<ParentMoment> => (await parentApiClient.post('/parent/moments', data)).data

export const getParentMessages = async (): Promise<ParentMessage[]> =>
  (await parentApiClient.get('/parent/messages')).data

export const sendParentMessage = async (content: string): Promise<ParentMessage> =>
  (await parentApiClient.post('/parent/messages', { content, message_type: 'general' })).data

export const markParentMessageRead = async (id: string): Promise<void> => {
  await parentApiClient.put(`/parent/messages/${id}/read`)
}
