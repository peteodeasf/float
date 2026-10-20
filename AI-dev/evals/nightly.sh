#!/bin/bash
# The overnight schedule for the AI tests. cron runs this. The work is in nightly.py beside it;
# the plan is docs/plans/ai-quality-testing.md, "The schedule".
#
#   AI-dev/evals/nightly.sh <generate|run|score-prs|report|all> [--dry-run] [--update]
#
# --update first moves this checkout to the latest main, so the night tests what is live. It is
# skipped if the checkout has edits of its own. Meant for a checkout kept for the AI tests alone
# (~/code/float-nightly), not one anybody works in.
#
# Setting it up (once, as agent on the Mac mini):
#   git -C ~/code/float worktree add --detach ~/code/float-nightly origin/main
#   ~/.float-eval-env holding `export ANTHROPIC_API_KEY=...`, then chmod 600 it
#   crontab -e, and add:
#     0 1 * * 0  ~/code/float-nightly/AI-dev/evals/nightly.sh generate --update >> ~/eval-reports/cron.log 2>&1
#     0 2 * * *  ~/code/float-nightly/AI-dev/evals/nightly.sh run --update >> ~/eval-reports/cron.log 2>&1
#     0 4 * * *  ~/code/float-nightly/AI-dev/evals/nightly.sh score-prs --update >> ~/eval-reports/cron.log 2>&1
#     0 6 * * *  ~/code/float-nightly/AI-dev/evals/nightly.sh report >> ~/eval-reports/cron.log 2>&1
# The night's spending limit is $10 unless FLOAT_EVAL_NIGHTLY_LIMIT says otherwise.
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"

# cron does not read ~/.zshrc, so set what the jobs need here.
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"
# Local test database only. None of the jobs uses a database; nightly.py refuses any other.
export DATABASE_URL="postgresql+asyncpg://float:float@localhost:5432/float_test"
# The API key, for cron. One line, `export ANTHROPIC_API_KEY=...`, in a file only you can read.
# Without it every job says the key is missing and spends nothing.
if [ -f "$HOME/.float-eval-env" ]; then
  . "$HOME/.float-eval-env"
fi
PY="${FLOAT_EVAL_PYTHON:-$HOME/code/float/backend/.venv/bin/python}"

args=()
for a in "$@"; do
  if [ "$a" = "--update" ]; then
    if [ -n "$(git -C "$ROOT" status --porcelain --untracked-files=no)" ]; then
      echo "This checkout has edits, so it was not moved to the latest main." >&2
    elif ! { git -C "$ROOT" fetch -q origin main && git -C "$ROOT" checkout -q --detach origin/main; }; then
      echo "Could not move to the latest main. Testing $(git -C "$ROOT" rev-parse --short HEAD)." >&2
    fi
  else
    args+=("$a")
  fi
done

exec "$PY" "$HERE/nightly.py" ${args[@]+"${args[@]}"}
