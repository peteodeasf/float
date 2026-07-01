// Single source of truth for the treatment-journey structure.
//
// The journey has two modes:
//  - SETUP: a numbered sequence worked through once, ending at "Build Treatment Plan".
//  - TREATMENT: the ongoing week-to-week workspace, unlocked once the plan is built.
// Completion of the treatment plan is what moves a patient from setup into treatment;
// this is derived from live treatment-plan state, NOT a stored step counter.

export const SETUP_STEPS: readonly string[] = [
  'Parent Monitoring Form',
  'Analyze Monitoring Data',
  'Parent Consultation',
  'Patient Consultation',
  'Build Treatment Plan',
]

export type TreatmentMode = 'setup' | 'treatment'
