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

/** An accommodation as the parent app gets it. Not the child's rating of it — the clinician
 *  chooses whether a parent sees that (docs/plans/accommodation-conversation.md). */
export interface ParentAccommodation {
  id: string
  name: string
  description: string | null
  trigger_situation_id: string | null
  display_order: number | null
  status: string
  is_weekly_focus: boolean
  /** The child's own rating — sent only when the clinician has chosen to show it. */
  child_rating_min?: number | null
  child_rating_max?: number | null
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

/** The parent's half of the accommodation conversation. What they say becomes suggestions for the
 *  clinician, never plan rows. docs/plans/accommodation-conversation.md */
export interface ConversationItem {
  id: string
  name: string
  /** It came from their monitoring log, rather than being named here. */
  from_record: boolean
  still_does: boolean | null
  estimate_min: number | null
  estimate_max: number | null
}
export interface ConversationSituation {
  id: string
  name: string
  items: ConversationItem[]
}
export interface AccommodationConversation {
  child_name: string | null
  situations: ConversationSituation[]
}

export const getAccommodationConversation = async (): Promise<AccommodationConversation> =>
  (await parentApiClient.get('/parent/accommodation-conversation')).data

export const answerSuggestion = async (
  id: string,
  data: { still_does?: boolean; estimate_min?: number | null; estimate_max?: number | null },
): Promise<ConversationItem> => (await parentApiClient.put(`/parent/accommodation-suggestions/${id}`, data)).data

export const nameAccommodation = async (data: {
  trigger_situation_id: string
  name: string
  estimate_min?: number | null
  estimate_max?: number | null
}): Promise<ConversationItem> => (await parentApiClient.post('/parent/accommodation-suggestions', data)).data

export const getParentMessages = async (): Promise<ParentMessage[]> =>
  (await parentApiClient.get('/parent/messages')).data

export const sendParentMessage = async (content: string): Promise<ParentMessage> =>
  (await parentApiClient.post('/parent/messages', { content, message_type: 'general' })).data

export const markParentMessageRead = async (id: string): Promise<void> => {
  await parentApiClient.put(`/parent/messages/${id}/read`)
}
