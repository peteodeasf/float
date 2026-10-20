# Scoring a pull request overnight: what to run, and with whose code

**2026-10-20.** `AI-dev/evals/nightly.py`, `score-prs` job. Plan: `docs/plans/ai-quality-testing.md`, item 5.

## Problem

The 4am job scores any open pull request that changes a tested prompt. The first attempts failed on
real pull requests for reasons that had nothing to do with the prompt.

## What was worked out

- **Running the pull request's own commit fails when it is behind main.** Main's runner imports
  `WRITE_UP_MODEL` from `monitoring_capture.py`. A pull request branched before that existed cannot
  be read. So the job tests the pull request merged into main.
- **GitHub's trial merge (`pull/N/merge`) is stale.** GitHub only remakes it when someone looks at
  the pull request. On 2026-10-20 the one for #37 was made against main from two merges earlier.
  The job merges locally instead: a worktree at main, then `git merge --no-commit --no-ff <head>`.
- **Nearly every pull request conflicts with main in `docs/backlog.md`.** Every agent PR edits it.
  A conflict outside `backend/` is settled by taking main's copy, since only the app code is being
  tested. A conflict in `backend/` stops the scoring and says so.
- **The scoring code and cases come from main.** After the merge the job deletes `AI-dev/evals/`
  in the worktree and checks out main's copy. Deleting first matters: a file the pull request added
  there (a `json.py` beside the runner, say) would otherwise survive and be imported.
- **Which pull requests change a prompt is worked out, not labelled.** `nightly.py fingerprint`
  hashes each feature's model and prompt as the app builds them. It runs in the merged worktree and
  in main; a difference means score it. No label to forget.
- **A crashed step counts its whole allowance.** It may have spent money before it died, and how
  much is not known. Counting all it was allowed stops the rest of the night rather than risk going
  over the limit. A missing API key (exit code 2) spent nothing and counts nothing.
