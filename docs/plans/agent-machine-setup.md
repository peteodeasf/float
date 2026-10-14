# Agent machine setup — plan

## Goal

Claude Code agents run unattended on a Mac mini (macOS user `agent`, tmux, one worktree per
task, auto mode). They should work and merge on their own, except that changes to deploy,
migration, CI and agent-rule files wait for Peter's approval. They must never be able to write
to production data.

## How it works

- **GitHub account.** Agents use their own account, `odea-agent`, a collaborator on
  peteodeasf/float with write access. Its token is a classic token with `repo` scope only, held
  by `gh` in the `agent` user's Keychain. A fine-grained token can't be used: those don't work on
  another user's personal repo where the account is only a collaborator.
- **Ruleset on main.** No direct or force pushes. Every change goes through a PR. The CI jobs
  `Backend tests` and `Frontend typecheck and build` must pass. Required approvals are 0, and
  "Require review from Code Owners" is on, so only PRs touching a path in `.github/CODEOWNERS`
  need Peter. Stale approvals are dismissed on new commits. Peter (repository admin) is on the
  bypass list, because he cannot approve his own PRs.
- **CODEOWNERS.** Migrations, `backend/railway.toml`, `backend/nixpacks.toml`, `netlify.toml`,
  all of `.github/`, `CLAUDE.md`, `.claude/`, `backend/tests/conftest.py`. GitHub reads this file
  from main, so a PR can't remove its own requirement.
- **Railway.** Agents use a separate Railway account with the Viewer role on the Float project.
  Viewers have read-only access and cannot deploy or read variables, so they cannot see
  the production database URL.
- **Database.** No production `.env` on the mini. Homebrew Postgres 18 with `float_dev`
  (`backend/.env`) and `float_test` (`TEST_DATABASE_URL`), the same version CI uses.
- **Merging.** Auto mode blocks merging a PR no human approved. An `autoMode` allow rule in the
  `agent` user's settings permits `gh pr merge` on float. GitHub still enforces the ruleset, and
  `odea-agent` cannot bypass it.

## Risks

- Whether a change needs Peter is decided by file path only. A change to clinical logic or an
  access check in a file not listed in CODEOWNERS merges and deploys without review.
- An agent can weaken a test to get CI to pass. `CLAUDE.md` forbids it; nothing enforces it.
- The repo is public. Strangers can write issues and PR comments that an agent may read and act on.
- If the repo is made private on GitHub's free plan, the ruleset stops being enforced.

## Before real patients

- Decide whether agents keep read access to production through `claude_ro` and Railway logs.
  Both could then show patient data.

## Verification

From the mini, as `agent`, each of these should be refused: push to main; merge a PR touching
a migration without Peter's approval; read a Railway variable; redeploy on Railway. A PR touching
only app code should merge once CI passes.
