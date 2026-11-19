import { apiClient } from './client'

/** Float's own videos, hosted on Mux. docs/plans/videos.md */
export type VideoAudience = 'clinician' | 'family' | 'both'

export interface Video {
  id: string
  title: string
  description: string | null
  audience: VideoAudience
  duration_seconds: number | null
  display_order: number
}

/** What the player needs: the video's id on Mux and short-lived passes to play it. */
export interface VideoPlayback {
  playback_id: string
  token: string
  thumbnail_token: string
}

export const listVideos = async (): Promise<Video[]> => (await apiClient.get('/videos')).data

export const getVideoPlayback = async (id: string): Promise<VideoPlayback> =>
  (await apiClient.get(`/videos/${id}/playback`)).data

export const AUDIENCE_LABEL: Record<VideoAudience, string> = {
  clinician: 'For clinicians',
  family: 'For families',
  both: 'For clinicians and families',
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null) return ''
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
