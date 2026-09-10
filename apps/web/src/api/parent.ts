import { parentApiClient } from './client'
import type { CheckinAnswer } from '../lib/checkin'

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

export interface ParentMessage {
  id: string
  content: string
  message_type: string
  sender_user_id: string
  created_at: string | null
  read_at: string | null
}

/** What the parent may see of the child's exposures, once the clinician switches it on.
 *  Never the child's own words or their ratings of each exposure. */
export type ChildProgress =
  | { shared: false }
  | {
      shared: true
      steps: {
        id: string
        name: string
        fear_level: number | null
        situation_name: string | null
        status: 'mastered' | 'in_progress' | 'not_started'
        times_done: number
      }[]
      planned: {
        id: string
        step_name: string
        scheduled_date: string | null
        scheduled_time_bucket: string | null
        status: string
      }[]
      done: { id: string; step_name: string; done_on: string | null; outcome: 'did_it' | 'too_hard' }[]
    }

export const getChildProgress = async (): Promise<ChildProgress> =>
  (await parentApiClient.get('/parent/child/progress')).data

export const getUpcomingExposures = async (): Promise<UpcomingExposure[]> =>
  (await parentApiClient.get('/parent/child/experiments/upcoming')).data

export const getParentAccommodations = async (): Promise<ParentAccommodation[]> =>
  (await parentApiClient.get('/parent/accommodations')).data

export const getSituationTips = async (situationId: string): Promise<ParentTip[]> =>
  (await parentApiClient.get(`/parent/situations/${situationId}/tips`)).data

/** The parent's weekly check-in. docs/plans/weekly-checkin.md */
export interface ParentCheckin {
  id: string
  accommodation_id: string
  accommodation_name: string | null
  week_start: string
  answer: CheckinAnswer
  updated_at: string | null
}

export const getMyCheckins = async (): Promise<ParentCheckin[]> =>
  (await parentApiClient.get('/parent/checkins')).data

export const saveCheckin = async (data: {
  accommodation_id: string
  answer: CheckinAnswer
  week_start: string
}): Promise<ParentCheckin> => (await parentApiClient.post('/parent/checkins', data)).data

export const getParentMessages = async (): Promise<ParentMessage[]> =>
  (await parentApiClient.get('/parent/messages')).data

export const sendParentMessage = async (content: string): Promise<ParentMessage> =>
  (await parentApiClient.post('/parent/messages', { content, message_type: 'general' })).data

export const markParentMessageRead = async (id: string): Promise<void> => {
  await parentApiClient.put(`/parent/messages/${id}/read`)
}
