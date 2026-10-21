/**
 * One color per person in a session, so the child is the same purple and the parent the same teal
 * everywhere in the session notes: the "who was there" chips on a note, and the speakers in a
 * recorded note's transcript. Anyone not named yet (a transcript's "Speaker 2") is plain grey.
 */
export type ParticipantColors = { text: string; bg: string; avatar: string }

const COLORS: Record<'child' | 'parent' | 'clinician', ParticipantColors> = {
  child: { text: 'var(--float-accent-purple-text)', bg: 'var(--float-accent-purple-bg)', avatar: 'var(--float-accent-purple)' },
  parent: { text: 'var(--float-primary-dark)', bg: 'var(--float-primary-light)', avatar: 'var(--float-primary)' },
  clinician: { text: 'var(--float-text-strong)', bg: 'var(--float-surface-sunken)', avatar: 'var(--float-text-secondary)' },
}
const UNNAMED: ParticipantColors = { text: 'var(--float-text-secondary)', bg: 'transparent', avatar: 'var(--float-text-hint)' }

export function participantColors(who: 'child' | 'parent' | 'clinician' | null | undefined): ParticipantColors {
  return (who && COLORS[who]) || UNNAMED
}
