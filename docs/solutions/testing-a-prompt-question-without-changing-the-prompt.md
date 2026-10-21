# Testing a prompt question without changing the app's prompt

Found 2026-10-20 while building the step-sentence test (`AI-dev/evals/runner/step_sentences.py`).

## The problem

The step-sentence plan had an open question: should the sentence say what the child does, or what
they stop doing? The runner's rule is that it never changes a prompt and never keeps a copy of one
(a drifted copy gave the old 0.926 score). But the question can only be answered by running both
wordings.

## What worked

- **Build the variant from the app's prompt on every run.** `does_prompt()` takes
  `combination_wording.SYSTEM_PROMPT` and swaps exactly one line (`APP_LINE` for `DOES_LINE`). No
  copy is kept, so it cannot drift.
- **Refuse when the line is gone.** If someone rewords the app's line, a plain `str.replace` would
  quietly do nothing and both modes would run the same prompt. The report would then show "no
  difference" as a finding. `does_prompt()` raises instead, and a test checks it.
- **Run the two modes side by side, pair by pair.** Cases go app, does, app, does, and the kinds of
  anxiety take turns. A run stopped by the spending limit still has both modes for every pair it
  reached.

## Other things that were not obvious

- **The app's wording call made its own client.** `draft_sentence` built `AsyncAnthropic` inside
  itself, so the runner could not count its cost. It was split into `ask_claude(situation,
  behavior, client=None, system=SYSTEM_PROMPT)`, the same shape as `step_suggestion_service` and
  `monitoring_capture`. The app never passes `client` or `system`.
- **The runner's `FakeClient` returns blocks with no `type`.** The wording call keeps only blocks
  whose `type` is `"text"`, so every fake reply read as empty. The step-sentence tests use a
  `TextClient` that sets `type="text"` and a `stop_reason`.
- **"Added words" must ignore the form.** Counting words in the sentence that are in neither the
  situation nor the behavior penalized the app's own "without". `FORM_WORDS` leaves out "without",
  "instead" and "yourself", so the two modes are compared on content.
- **A reviewer answer that cannot be read has no item count.** The report counted items from the
  verdict lists, so a run where every reviewer failed vanished from the totals. It now counts as one
  unanswered item.
