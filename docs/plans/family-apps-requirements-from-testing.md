# Child and parent apps — requirements from testing

**Status:** requirements for the redesigned child and parent apps (see
[`mobile-app-strategy.md`](mobile-app-strategy.md)). The current web versions of these apps
are not being fixed. Each item below says what the new design must do, not how.

**Source:** Sally's Jams, recorded 2026-10-26 to 2026-11-04 on the web apps. One tester, one
set of test patients (a fear of dogs, a fear of bugs). These are one person's reactions, not a
pattern across users. All items were checked against main on 2026-11-22 and were still true
unless noted.

## Child app

### Choosing a rung

- **Suggest the next rung the child has not done.** When the child picks a rung further down
  the ladder, the app suggests a rung to do first. Today it suggests the first rung that is not
  "mastered" (2 completions, the latest at Fear Level 2 or below), so a rung the child has
  already done once gets suggested again. Sally read this as the app ignoring her work.
  ([Jam](https://jam.dev/c/e7a70c9e-0e31-49bf-a7f0-913faa6fbb66))
  - Open question: should a rung done once at a high Fear Level count as done for this
    suggestion? That is a clinical question for Peter.
- **Only say "your clinician suggested" when the clinician did.** Today the message says this
  even when no rung was recommended.
- **Show the "start lower" message where the child is looking.** Today it appears at the top
  of the page while the child has scrolled down to the rung, so tapping the rung looks like it
  did nothing. ([Jam](https://jam.dev/c/09fe6478-5d0f-43d8-ba4b-2a72129b117a))

### Before an exposure

- **Name the rung on every screen of the setup.** Today the rung's name only shows on the
  summary at the end, so the child goes back to check what they are setting up.
  ([Jam](https://jam.dev/c/c6705f1c-d806-4f72-aaa7-29c17c8323db))

### During an exposure

- **Tips should fit the exposure.** "Anxiety comes down on its own — it rises, peaks, then
  fades" read as generic and AI-written. Sally wanted something specific to the exposure, e.g.
  for a recording of dogs barking: keep your eyes open so you can see there are no dogs, and
  breathe. Today tips are matched only by the situation's tags, and the three tips that show
  for everyone are picked most often. ([Jam](https://jam.dev/c/e0b50fd7-1eeb-4ab0-9f0c-4650d0b20f8a))
- **Plain tip wording.** "Skip the safety moves — Let yourself be in it without the little
  things you'd do to feel safer" was confusing. This is the July placeholder text; it is
  editable in admin. ([Jam](https://jam.dev/c/158a2fd8-d3df-4264-8e76-13707c3b568a))

### After an exposure

- **Let the child pick more than one answer to "What did you learn?"**, and type their own
  answer as well as picking. Today it is one chip or the typed text, not both.
  ([Jam](https://jam.dev/c/6add600c-5c1c-4dac-92b7-dd06b4fe0046))

### Messages

- **"Too much" must not look like failure.** When the child says an exposure was too much,
  the chat shows an amber "⚠ Too hard" message. Sally thought it could make the child feel they
  failed. The new design should treat this as a normal request to adjust the step.
  ([Jam](https://jam.dev/c/e054159a-5274-4807-a642-80d8d5a482fa))
- **Don't show clinician numbers to the child.** The "Experiment completed" message in the
  child's chat shows "BIP: 75% → 35%. Fear level: 5.0/10. Feared outcome occurred: No." That
  is written for the clinician. (Found while checking the Jam above.)

### Look

- **Logo on the first screen.** Sally expected the Float logo on the child's home. Main has
  it on the home screen; the first-visit welcome screen has only the text "Welcome to float".
  ([Jam](https://jam.dev/c/2735e5d5-efe3-4aa8-818b-8768fa8e1cc0))

## Shared wording that also reaches the child or parent

These were reported from the clinician app, but the same words or numbers reach the child or
parent, so the new apps should settle them too.

- **"What fear level do you expect?"** made Sally stop. The child app uses the same question
  on purpose (Peter, 2026-09-10). Settle one wording for both.
  ([Jam](https://jam.dev/c/6d8f819b-6a34-42c3-83a1-f0944469ff8d))
- **Accommodation Fear Level as a range.** Sally did not understand why an accommodation has
  a Fear Level or what the range means. It is how upset the child would be if the parent
  stopped, and a range because it depends on the situation (Peter, 2026-09-21). The parent app
  shows this range, so it needs to say what it means in plain words.
  ([Jam](https://jam.dev/c/5cfd7509-e167-4c0a-b941-75db0d2602b5),
  [Jam](https://jam.dev/c/b1ede1a2-dbce-48c2-9280-01a03c11e66f))

## Parent app

No Jams were filed against the parent app itself in this round.
