# Agent loop — plan

## Goal

Move faster while Float is pre-launch. A script on the Mac mini runs agent sessions one after
another, each doing one backlog item and opening one PR. Backend and logic changes merge once CI
passes. Anything that changes how a screen looks waits for Peter, who looks at screenshots and the
Netlify preview before approving.

Based on the Ralph technique (https://ghuntley.com/ralph/): a loop that feeds the same prompt to a
fresh agent session each time, one item per session, with tests rejecting bad work and the agent
recording what it learns. Two changes from Ralph: the agent picks only from a list Peter has
approved, and UI changes need Peter's approval before they can merge.

Builds on `docs/plans/agent-machine-setup.md` (GitHub account, ruleset, CODEOWNERS, local Postgres).

## How the loop works

- `scripts/agent-loop.sh` runs on the mini as `agent`. Each pass starts a new, non-interactive
  session in its own worktree:
  `claude -p --permission-mode auto --worktree <name> < scripts/agent-loop-prompt.md`
- The prompt tells the agent to:
  1. Read `CLAUDE.md`, `STRATEGY.md`, and the "Ready for agents" section of `docs/backlog.md`.
  2. Skip any item that already has an open PR (`gh pr list`), so an item waiting for Peter is not
     picked up twice.
  3. Take the first remaining item. If none is left, print `NO_READY_ITEMS` and stop.
  4. Build it, with tests. Each new test gets a comment saying why it exists.
  5. Open one PR, titled with the item's name. Remove the item from the Ready list in the same PR.
  6. Wait for CI. If CI fails, fix it. If GitHub allows the merge, merge it. If the PR waits on
     Peter, leave it open.
  7. Before ending: put any bug found along the way into `docs/backlog.md` (not in the Ready list),
     and write anything non-obvious it learned into `docs/solutions/`.
- The script stops when the agent prints `NO_READY_ITEMS`, after a set number of passes, or when
  a file `~/STOP-LOOP` exists (Peter can create it to stop the loop after the current pass).
- One loop at a time to start. A second only after a day of the first one's PRs looks right.

## UI changes wait for Peter

- Add to `.github/CODEOWNERS`: `apps/web/src/pages/`, `apps/web/src/components/`,
  `apps/web/src/styles/`, `apps/web/src/index.css`. GitHub then blocks any PR changing a screen
  until Peter approves it. Frontend code that doesn't draw screens (`api/`, `lib/`, `context/`)
  is not on the list.
- A UI PR includes screenshots of every changed screen, taken on the mini against the local
  backend and demo data, checked against the screen-layout rules in `CLAUDE.md`. The images go on
  a separate `pr-screenshots` branch, so they never land on main, and the PR description links
  to them.
- Each PR also gets a Netlify preview site (the `deploy-preview` check). It runs against the
  production backend, so a PR that changes both a screen and the backend shows the new screen
  with the old backend until it merges.

## Clinical changes wait for Peter

Clinical logic is spread across ordinary files, so CODEOWNERS can't catch it. `CLAUDE.md` tells
the agent: if a PR changes clinical logic (what counts as avoidance, safety or escape behaviour,
accommodation or fear-rating rules, plan-commit behaviour) or who can see what, request Peter's
review (`gh pr edit --add-reviewer peteodeasf`) and do not merge. GitHub does not enforce this.

## The Ready list

A new "Ready for agents" section at the top of `docs/backlog.md`. Peter moves items into it. Each
item needs enough detail to build without asking: what to change, where, and how to tell it
worked. Clinical questions and paperwork never go in it.

## Before the first run

1. **Node on the mini** (Peter, as admin): `brew install node@22`, the version CI uses. Then
   `npm ci` in `~/code/float` as `agent`.
2. **Local frontend points at the local backend.** With no `apps/web/.env.local`, the web app
   uses `http://127.0.0.1:8000`. The mini has none, and `CLAUDE.md` tells agents not to create
   one. (Peter's laptop has one pointing at production.)
3. **Demo data** in `float_dev` from `backend/seed_demo.py`, so screenshots have patients in them.
4. CODEOWNERS additions above, plus `/scripts/agent-loop*` so the loop's own prompt and script
   need Peter's approval to change.
5. `CLAUDE.md` additions: one task per session; record learnings; bugs go to the backlog, not
   the current PR; clinical-change rule; screenshots with UI changes.
6. The Ready list, with two or three small items to start.
7. `scripts/agent-loop.sh` and `scripts/agent-loop-prompt.md`.

## Running it

- **First runs:** by hand, in tmux, with a limit of 3 passes. Peter reads every PR.
- **Then scheduled:** a crontab entry for the `agent` user starting the script at a set time,
  e.g. 9pm, with a pass limit. `crontab` needs no admin rights. cron does not read `~/.zshrc`,
  so the script sets `PATH` and `DATABASE_URL` itself. Each session's output goes to a log file
  in `~/loop-logs/`.

## Risks

- Every merged backend change goes to production with no staging step. Acceptable while there
  are no users. Revisit before launch.
- The agent decides whether a change is clinical. It can get that wrong, and nothing on GitHub
  catches it.
- The loop uses Claude usage on every pass, including passes that fail. The pass limit is what
  caps it.
- Two loops at once could edit the same files. Run one until that has been tested.

## Verification

- A backend-only Ready item merges without Peter.
- A UI Ready item opens a PR with screenshots and is blocked until Peter approves.
- With the Ready list empty, the loop stops after one pass.
- Creating `~/STOP-LOOP` stops it after the current pass.
