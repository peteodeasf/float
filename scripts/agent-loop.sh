#!/bin/bash
# Runs agent sessions on the Mac mini one after another. Each session takes one item from the
# "Ready for agents" section of docs/backlog.md, builds it, and opens a PR.
# See docs/plans/agent-loop.md.
#
#   scripts/agent-loop.sh [passes]        passes defaults to 3
#
# Stops after that many passes, when the Ready list is empty, or when ~/STOP-LOOP exists
# (checked between passes, so the current session finishes first).
set -u

PASSES="${1:-3}"
REPO="$HOME/code/float"
LOG_DIR="$HOME/loop-logs"

# cron does not read ~/.zshrc, so set what the sessions need here.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/opt/homebrew/opt/postgresql@18/bin:/opt/homebrew/opt/node@22/bin:$PATH"
export DATABASE_URL="postgresql+asyncpg://float:float@localhost:5432/float_dev"

mkdir -p "$LOG_DIR"
cd "$REPO" || exit 1

for pass in $(seq 1 "$PASSES"); do
  if [ -e "$HOME/STOP-LOOP" ]; then
    echo "Found ~/STOP-LOOP. Stopping."
    break
  fi
  if ! git checkout -q main || ! git pull -q --ff-only; then
    echo "Could not bring main up to date. Stopping."
    break
  fi

  name="loop-$(date +%Y%m%d-%H%M%S)"
  log="$LOG_DIR/$name.log"
  echo "$(date '+%H:%M') pass $pass of $PASSES: $name, log in $log"
  claude -p --permission-mode auto --worktree "$name" < scripts/agent-loop-prompt.md > "$log" 2>&1

  if grep -q "NO_READY_ITEMS" "$log"; then
    echo "The Ready list is empty. Stopping."
    break
  fi
done
