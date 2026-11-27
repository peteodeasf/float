// Tools and strategies: pages in the Library. docs/plans/tools-and-strategies.md
import { apiClient } from './client'

export type ToolKind = 'tool' | 'strategy'
export type ToolAudience = 'child' | 'parent' | 'both'

export type ToolBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; image_id: string }
  | { type: 'video'; video_id: string }

export interface ToolExample {
  id: string
  name: string
  how_used: string | null
}

export interface ToolPage {
  id: string
  name: string
  kind: ToolKind
  audience: ToolAudience
  summary: string | null
  blocks: ToolBlock[]
  examples: ToolExample[]
  // Admin only.
  display_order?: number
  is_published?: boolean
}

export interface ToolHighlight {
  patient_id: string
  patient_name: string
  for_child: boolean
  for_parent: boolean
  highlighted_at: string | null
  child_opened: boolean
  parent_opened: boolean
}

export const KIND_LABEL: Record<ToolKind, string> = { tool: 'Tool', strategy: 'Strategy' }
export const AUDIENCE_LABEL: Record<ToolAudience, string> = {
  child: 'child', parent: 'parent', both: 'child and parent',
}

export const listTools = async (): Promise<ToolPage[]> => (await apiClient.get('/tools')).data
export const getTool = async (id: string): Promise<ToolPage> => (await apiClient.get(`/tools/${id}`)).data
export const listHighlights = async (toolId: string): Promise<ToolHighlight[]> =>
  (await apiClient.get(`/tools/${toolId}/highlights`)).data
export const setHighlight = async (patientId: string, toolId: string, forChild: boolean, forParent: boolean) =>
  (await apiClient.put(`/patients/${patientId}/tool-highlights/${toolId}`, { for_child: forChild, for_parent: forParent })).data
