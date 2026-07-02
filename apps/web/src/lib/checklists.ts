// Shared consultation checklist definitions (Steps 3 & 4).
// Imported by the patient page (checklist panel) and the patient list page (next-action line).

export type ChecklistNav = { label: string; action: 'treatmentPlan' | 'scrollDA' }
export type ChecklistItemDef = { key: string; text: string; link?: { icon: string; label: string }; nav?: ChecklistNav }
export type ChecklistGroup = { header: string; items: ChecklistItemDef[] }

export const PARENT_CHECKLIST: ChecklistGroup[] = [
  {
    header: '',
    items: [
      { key: 'parent_review_monitoring', text: 'Review monitoring data with parent — validate their observations' },
      { key: 'parent_trigger_list', text: 'Compile trigger situation list with initial DT ratings' },
      { key: 'parent_behaviors', text: "Identify the child's safety behaviors, avoidance behaviors, and rituals per situation" },
      { key: 'parent_responses', text: 'Identify parental responses and accommodation behaviors' },
      { key: 'parent_feared_outcome', text: 'Ask: "Do you have a sense of what the child fears would happen in that situation?"' },
      { key: 'parent_explain_cbt', text: 'Explain what CBT is and why it works', link: { icon: '📖', label: 'View guide' } },
      { key: 'parent_explain_exposures', text: 'Explain what exposures are and how they work', link: { icon: '📖', label: 'View guide' } },
      { key: 'parent_worry_hill', text: "Explain the Worry Hill using the child's examples", link: { icon: '📖', label: 'View Worry Hill' } },
      { key: 'parent_nickname', text: 'Introduce the anxiety nickname concept' },
      { key: 'parent_dt', text: 'Introduce the Distress Thermometer' },
      { key: 'parent_accommodation', text: 'Introduce parental accommodation and its impact' },
      { key: 'parent_next_steps', text: 'Agree next steps — does the family want to proceed?' },
    ],
  },
]

export const PATIENT_CHECKLIST: ChecklistGroup[] = [
  {
    header: 'Meeting 1 — Discovery & Education',
    items: [
      { key: 'patient_what_help', text: 'Ask what the child wants help with — use discovery questions', link: { icon: '📖', label: 'Discovery questions' } },
      { key: 'patient_triggers', text: 'Identify triggers and generate trigger situation list with the child' },
      { key: 'patient_behaviors', text: 'Identify safety/avoidance behaviors and rituals per situation' },
      { key: 'patient_nickname', text: 'Confirm anxiety nickname with the child' },
      { key: 'patient_dt_practice', text: 'Practice the Distress Thermometer together' },
    ],
  },
  {
    header: 'Meeting 2 — Discovery & Education',
    items: [
      { key: 'patient_checkin', text: 'Check in — nickname use, DT use since last session' },
      { key: 'patient_worry_hill_video', text: 'Teach the Worry Hill — watch video together', link: { icon: '🎬', label: 'Worry Hill video' } },
      { key: 'patient_worry_hill_draw', text: "Draw the Worry Hill with the child's own situation", link: { icon: '📖', label: 'Worry Hill guide' } },
      { key: 'patient_candy_jar', text: 'Teach the Candy Jar analogy', link: { icon: '📖', label: 'Candy Jar guide' } },
      { key: 'patient_da', text: 'Complete Downward Arrows for primary situations', nav: { label: '→ Patient Downward Arrows below', action: 'scrollDA' } },
    ],
  },
  {
    header: 'Meeting 3 — First exposure',
    items: [
      { key: 'patient_checkin_3', text: 'Check in — nickname and DT use' },
      { key: 'patient_ladder', text: 'Build the exposure ladder from the trigger list', nav: { label: '→ Go to Build Treatment Plan', action: 'treatmentPlan' } },
      { key: 'patient_first_rung', text: 'Choose the first exposure with the child — lowest DT rung' },
      { key: 'patient_first_exposure', text: 'Practice the first exposure in session 3-6 times, record DT each time' },
      { key: 'patient_confidence', text: 'Confirm child confidence is High before first home experiment' },
      { key: 'patient_home_experiments', text: 'Set the first home experiments with the child' },
    ],
  },
]
