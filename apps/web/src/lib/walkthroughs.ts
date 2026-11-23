/**
 * "How this works": a short walkthrough for each screen of the patient page. The text is a draft
 * (docs/clinician-walkthroughs.md); Peter edits it. docs/plans/how-this-works.md
 *
 * A step's `show` names the control "Show me" points at: the control carries
 * data-walkthrough="<that name>". A step whose control is not on the screen gets no Show me.
 */

export type Step = { title: string; body: string; show?: string }

export type Walkthrough = {
  title: string
  for: string
  before: string
  steps: Step[]
  /** Heading for who sees what: "What the family sees", "What the parent sees", ... */
  seesLabel: string
  sees: string
  know: string[]
}

export type WalkthroughId =
  | 'monitoring' | 'sessions' | 'ladder' | 'accommodations' | 'progress' | 'chat' | 'summary' | 'access'


export const WALKTHROUGHS: Record<WalkthroughId, Walkthrough> = {
  monitoring: {
    title: 'How monitoring works',
    for: 'You send the parents a monitoring form, and what they observe comes back here. Each observation has the situation, what the child did, how the parent responded, and a Fear Level.',
    before: "The parents' names and emails from the patient record fill in the form for you. An email is optional.",
    steps: [
      { title: 'Check the parents', body: 'Each parent has a row with a label and an email. If a parent will get the link by text or in person, leave their email blank.', show: 'parent-email' },
      { title: 'Create the form', body: 'Click Create monitoring form. Float emails each parent who has an email.', show: 'create-form' },
      { title: "Share each parent's link", body: 'Each parent has their own link. Click Copy link and paste it into a text or email.', show: 'copy-link' },
      { title: 'See who has opened it', body: "Each parent's row says Opened or Not opened yet. It also says how many days ago the form was sent.", show: 'opened' },
      { title: 'Read the observations', body: 'Under Observations, each entry shows which parent added it. If the parent recorded or typed a quick note, click it to read their own words.', show: 'observations' },
    ],
    seesLabel: 'What the parent sees',
    sees: 'An email asking them to keep a short monitoring diary for about a week, about 5 minutes a day, with an Open monitoring form button. The link needs no login. For seven days they get an evening email at 7pm asking "Anything come up with [child] today?". It is skipped on days they already added something.',
    know: [
      'You can create the form only once per patient. Check both parents before you click Create monitoring form.',
      'Float does not send texts. To send the link by text, copy it yourself.',
      'Parents cannot edit an observation once it is saved.',
    ],
  },

  sessions: {
    title: 'How session notes work',
    for: "This patient's session notes. Type a note after a session, or record the session on your phone and get a draft note with a transcript.",
    before: 'Nothing, to type a note. To record, a phone browser that can record, such as Safari on an iPhone or Chrome on Android.',
    steps: [
      { title: 'Type a note', body: 'Click + Add note. Choose who the session was with, add tags, set the date, write the note and click Save.', show: 'add-note' },
      { title: 'Record a session', body: 'Click Record session. The first time, record who agreed to the recording and click Continue. Then choose who is in the session and click Start recording.', show: 'record-session' },
      { title: 'Stop the recording', body: 'Use Pause and Resume as needed. When the session ends, click Stop and save.' },
      { title: 'Check the draft', body: 'While Float writes up the session, a Recording row shows here. The note then appears marked "Draft · from a recording". Click Transcript to read it. Click a speaker\'s name to change who they are.', show: 'transcript' },
      { title: 'Approve the draft', body: 'Click Approve note. Or click …, then Edit, change the note, and click Update and approve.', show: 'approve-note' },
    ],
    seesLabel: 'What the family sees',
    sees: 'Nothing. Notes, recordings and transcripts are only in the clinician app.',
    know: [
      'Agreement to record is asked once per patient. Later recordings do not ask again.',
      'Float deletes the audio once the transcript is saved. The transcript is kept with the note.',
      'An approved note is added to the Case Summary. A draft is not, until you approve it.',
    ],
  },

  ladder: {
    title: 'How the ladder works',
    for: "The child's steps toward the situations they avoid, easiest first, each with a Fear Level. Exposures are set up from here.",
    before: 'Situations from monitoring. You can write rungs before you meet the child.',
    steps: [
      { title: 'Build the ladder', body: 'Edit ladder opens a conversation that works through the rungs with the child. ⛶ Full screen opens the same conversation as session mode.', show: 'edit-ladder' },
      { title: 'Check each Fear Level', body: '1 to 10. Click the number to change it. The ladder sorts easiest first.', show: 'fear-level' },
      { title: 'Do the downward arrow on a rung', body: "Do it with the child. The button shows a tick when it's done.", show: 'downward-arrow' },
      { title: 'Set up an exposure', body: 'Set it up opens full screen so the child can see it. The child answers, you type. You can leave the day for the child to pick at home.', show: 'set-it-up' },
      { title: 'Make the ladder visible to the child', body: "The switch puts the whole ladder in the child's app. It needs at least one rung.", show: 'visible-to-patient' },
    ],
    seesLabel: 'What the child sees',
    sees: "Nothing until the switch is on. An exposure you set up shows in the child's app, waiting for a day if you left it open.",
    know: [
      'A downward arrow is saved as yours, even when the child did it with you.',
      'The situation buttons only change what you see. The switch and Edit ladder still apply to the whole ladder.',
    ],
  },

  accommodations: {
    title: 'How accommodations work',
    for: "What the parents do to ease the child's anxiety, under each situation, easiest to stop first. Each has a Fear Level for how hard it would be for the child if the parent stopped. You also set where the parent is with stopping each one.",
    before: 'A treatment plan, made on the Ladder tab. The situations on the ladder appear here.',
    steps: [
      { title: 'Open the builder', body: 'Build plan shows each situation as a card, where you add, edit or remove accommodations.', show: 'build-plan' },
      { title: 'Add an accommodation', body: 'Type what the parent does, enter a Fear Level and click Add.', show: 'add-accommodation' },
      { title: 'Add from monitoring', body: 'Under "From monitoring — tap to add", tap a suggestion to add it. Some show the parent\'s own estimate.', show: 'from-monitoring' },
      { title: 'Rate with the child', body: 'Child ratings opens a full-screen sheet. Ask the child how hard it would be if the parent stopped each one, and type what they say.', show: 'child-ratings' },
      { title: 'Save', body: 'Save plan closes the builder.', show: 'save-plan' },
      { title: 'Set the status', body: 'Plan it lets you choose Not started, Working on it or Stopped.', show: 'plan-it' },
    ],
    seesLabel: 'What the parent sees',
    sees: 'Each accommodation marked Working on it gets a weekly check-in: "This week, did you hold the line?", with Every time, Mostly and I gave in. On the parent\'s home screen, accommodations show under the child\'s upcoming exposures, and the parent can write "How did it go?" notes. The latest note shows on your list as "Parent: …".',
    know: [
      'Only you set the status. The parent cannot change it.',
      "The child never sees the parent's estimate. You see it as ≈ next to the Fear Level.",
      "A Fear Level you type in Build plan counts as your guess. One entered on the Child ratings sheet counts as the child's rating.",
    ],
  },

  progress: {
    title: 'How progress works',
    for: "How the child's exposures are going, and the parent's weekly check-ins.",
    before: 'At least one completed exposure, for the graph and averages.',
    steps: [
      { title: 'Read the numbers across the top', body: "Total exposures, this week's completed, longest streak, and the average change in belief and Fear Level." },
      { title: 'Switch the graph', body: 'Progress over time has one line per situation. Choose Belief in Prediction or Fear Level.', show: 'graph-metric' },
      { title: 'Pick a week and a day', body: 'Use the arrows to change week. Click a day to see its exposures, each with Predicted and Actual.', show: 'previous-week' },
      { title: "Check the parent's work", body: 'Under Parent, Weekly check-ins shows each answer.', show: 'weekly-checkins' },
    ],
    seesLabel: 'What the family sees',
    sees: 'This tab is only in the clinician app. The parent sees the child\'s ladder, what is planned and what is done, only if you tick "Parents can see the child\'s progress" under Access → Parent. The parent never sees the child\'s ratings or what the child writes.',
    know: [
      'A missed exposure has an amber dot. Green is done, red is too hard, and teal is scheduled.',
      'Exposures set up in session and ones the child set up in their app both count.',
    ],
  },

  chat: {
    title: 'How chat works',
    for: 'Messages between sessions with the child and with each parent. Each person has their own thread with you.',
    before: 'Invite the child and each parent under Access first.',
    steps: [
      { title: 'Pick a thread', body: 'The child is first, then each parent by email.', show: 'teen-thread' },
      { title: 'Check who you are writing to', body: 'A parent\'s thread shows "THIS PARENT ONLY".', show: 'this-parent-only' },
      { title: 'Write and send', body: 'Type a message and click Send, or press Enter.', show: 'send-message' },
    ],
    seesLabel: 'What the family sees',
    sees: 'The child replies in the child app, and each parent in the parent app.',
    know: [
      "The parent never sees the child's messages. The child never sees a parent's. Two parents do not see each other's threads.",
      'No email or text goes out when you send a message. The family sees it when they open the app.',
      "The number on the Chat tab counts only the child's unread messages.",
    ],
  },

  summary: {
    title: 'How the case summary works',
    for: "A summary of the case, written by AI from the parents' monitoring and your approved session notes.",
    before: 'At least 3 monitoring entries or one approved session note.',
    steps: [
      { title: 'Let it update', body: 'It updates by itself when a parent adds an observation, or when you approve a session note. While it runs, the current summary stays on screen.' },
      { title: 'Update it yourself', body: 'Click AI Refresh to update it now. Last updated shows when it was last written.', show: 'ai-refresh' },
      { title: 'Read the situations', body: 'Situations lists each situation with its Fear Level, lowest first.' },
      { title: 'Read the other sections', body: 'Parental responses, safety and avoidance behaviors, treatment targets and notes from sessions. A section only shows when it has items.' },
      { title: 'See where an item came from', body: 'Items added from a session say which session, for example "from session, Oct 15".' },
    ],
    seesLabel: 'What the family sees',
    sees: 'Nothing. The parent and child apps cannot show the case summary.',
    know: [
      'You cannot edit the summary here. It changes when session notes or monitoring change.',
      'Nothing is added to the plan by itself. You add situations to the ladder yourself.',
      'Draft session notes are left out until you approve them.',
    ],
  },

  access: {
    title: 'How access works',
    for: 'Who can sign in for this patient. Teen and Parent invite the family to their apps. Clinician sets which clinicians at your practice can open the record.',
    before: "The parent's permission to invite the child. An email for each person.",
    steps: [
      { title: 'Invite the child', body: 'Click Teen. If it says "Awaiting parent consent", click "Record consent (obtained offline)" once you have it. Enter the child\'s email and click Send invite.', show: 'teen-access' },
      { title: 'Invite a parent', body: 'Click Parent, enter an email under "Invite another parent" and click Invite parent. Repeat for a second parent.', show: 'invite-parent' },
      { title: 'Check the parents', body: 'Each parent shows "Has signed in" or "Has not signed in yet". Remove takes a parent off this child.', show: 'remove-parent' },
      { title: 'Choose what parents can see', body: 'Tick "Parents can see the child\'s progress". The child\'s ratings of the accommodations are a separate tick.', show: 'share-progress' },
      { title: 'Manage clinicians', body: 'Click Clinician to see who can open this patient, and to add or remove a colleague.', show: 'clinician-access' },
    ],
    seesLabel: 'What the family sees',
    sees: 'An invitation email with a login link and a temporary password. The child sets their own password on first sign-in. A parent who already uses Float for another child keeps their password.',
    know: [
      'Resend invite gives the child a new temporary password. The old one stops working.',
      "The ⋯ menu has Edit profile, Move to maintenance and Close treatment. Close treatment turns off the child's app and the parent's app.",
    ],
  },
}

/** The control a step points at, if it is on the screen now. */
export function findTarget(id: string): HTMLElement | null {
  const el = document.querySelector<HTMLElement>(`[data-walkthrough="${id}"]`)
  return el && el.getClientRects().length > 0 ? el : null
}
