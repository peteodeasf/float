// Shared consultation checklist definitions — the OFFLINE FALLBACK for the process checklist.
//
// The real list is the organization's rows in `organization_checklist_items`, fetched from
// /checklist-items; this is only used if that request fails or returns empty. Keep it in step with
// backend/app/data/default_checklist.py.
//
// Peter, 2026-09-21: replaced the long list with this shorter draft (to be reviewed/edited later).

export type ChecklistNav = { label: string; action: 'treatmentPlan' | 'openArrow' }
export type ChecklistItemDef = { key: string; text: string; link?: { icon: string; label: string }; nav?: ChecklistNav }

export const PROCESS_CHECKLIST: ChecklistItemDef[] = [
  { key: 'send_monitoring_links', text: 'Send monitoring links to parents' },
  { key: 'analyze_monitoring_data', text: 'Analyze monitoring data' },
  { key: 'prep_parent_consultation', text: 'Prepare for parent consultation meeting' },
  { key: 'parent_first_meeting', text: 'Parent first meeting' },
  { key: 'prep_parent_child_meeting', text: 'Prepare for parent-child meeting' },
  { key: 'parent_child_first_meeting', text: 'Parent-child first meeting' },
  { key: 'child_first_meeting', text: 'Child first meeting' },
  { key: 'review_cbt_exposure_concepts', text: 'Review key CBT and exposure concepts' },
  { key: 'setup_exposure_ladder', text: 'Set up exposure ladder for child' },
  { key: 'setup_accommodation_ladder', text: 'Set up accommodation ladder for parents' },
  { key: 'child_first_exposure', text: "Child's first exposure" },
  { key: 'monitor_progress_exposure_data', text: 'Monitoring of progress and exposure data' },
]
