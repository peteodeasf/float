#!/usr/bin/env bash
# Read-only inputs for the fortnightly refactoring review (docs/plans/refactoring-review.md).
#
# Why this exists: the scheduled review runs headless, with no one to approve permission prompts.
# When the review agent composed these tool calls itself (subshells, pipes, xargs), the permission
# matcher could not verify them and the run hung. This bundles them into ONE allowlisted command so
# the scheduled run never prompts. It only reads code — no server, no database, no network except
# the one-off vulture install.
#
# Prints clearly delimited sections the review reads. Never fails the run: each tool's non-zero
# exit (knip exits 1 when it finds unused code) is swallowed so later sections still print.

repo="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo" || exit 1

echo "===== KNIP — web app unused files/exports ====="
( cd apps/web && npx --yes knip@5 --no-progress --reporter compact 2>&1 | head -200 ) || true

echo
echo "===== VULTURE — backend unused code (min-confidence 60, migrations excluded) ====="
(
  cd backend || exit 0
  ./.venv/bin/vulture --version >/dev/null 2>&1 || ./.venv/bin/pip install -q vulture >/dev/null 2>&1 || true
  ./.venv/bin/vulture app --min-confidence 60 2>&1 | grep -v "migrations/" | head -300
) || true

echo
echo "===== LARGE FILES — over 700 lines ====="
find backend/app apps/web/src -type f \( -name '*.py' -o -name '*.ts' -o -name '*.tsx' \) \
  -not -path '*/node_modules/*' -not -path '*/__pycache__/*' -print0 2>/dev/null \
  | xargs -0 wc -l 2>/dev/null | sort -rn | awk '$1 > 700' | head -60

echo
echo "===== SCAN COMPLETE ====="
