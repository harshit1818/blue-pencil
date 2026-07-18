#!/usr/bin/env bash
# Ralph Wiggum loop for Blue Pencil. Feeds a fixed prompt to a fresh agent each
# iteration; progress lives in git + IMPLEMENTATION_PLAN.md, not in context.
#
# Usage:
#   ./loop.sh [MAX_ITERS]        # build mode (default 10 iterations)
#   ./loop.sh plan [MAX_ITERS]   # planning mode: (re)write the plan, no code
#
# Three independent stops guard against circles and token waste:
#   1. MAX_ITERS      - hard cap, always terminates.
#   2. stall detector - if HEAD doesn't move for STALL_LIMIT runs, the agent is
#                       spinning; bail instead of burning tokens.
#   3. .loop/DONE     - the agent writes this when the plan is empty (clean exit).
set -euo pipefail
cd "$(dirname "$0")"

MODE=build
if [ "${1:-}" = "plan" ]; then MODE=plan; shift; fi
MAX_ITERS="${1:-10}"
STALL_LIMIT="${STALL_LIMIT:-2}"
MODEL="${MODEL:-sonnet}"          # sonnet for speed; set MODEL=opus for hard work
PROMPT_FILE="loop/PROMPT_$MODE.md"

case "$MAX_ITERS" in
  *[!0-9]*|'') echo "ralph: MAX_ITERS must be a number, got '$MAX_ITERS'" >&2; exit 2 ;;
esac

# Branch guard: the loop must never run on main (a rogue iteration would push
# unreviewed commits straight to the default branch) and must stay on the branch
# it started on, whatever the iteration agents do to the checkout.
BRANCH="$(git branch --show-current)"
if [ -z "$BRANCH" ] || [ "$BRANCH" = main ] || [ "$BRANCH" = master ]; then
  echo "ralph: refusing to loop on '${BRANCH:-detached HEAD}' — create a work branch first." >&2
  exit 2
fi

# The auto-worktree plugin bounces headless agents into scratch worktrees,
# which is what caused the cycle-2/3 branch chaos. It honors a per-repo skip
# list — opt this repo out for the iteration agents only (interactive sessions
# elsewhere keep the plugin).
export CLAUDE_PLUGIN_OPTION_SKIP_DIRECTORIES="$(pwd)${CLAUDE_PLUGIN_OPTION_SKIP_DIRECTORIES:+,$CLAUDE_PLUGIN_OPTION_SKIP_DIRECTORIES}"

mkdir -p .loop
rm -f .loop/DONE
stall=0

for i in $(seq 1 "$MAX_ITERS"); do
  # Deterministic end: in build mode, stop the moment no actionable cards remain.
  # v:human cards stay on the board forever, so "board clear" means no [ ] v:auto
  # cards — not an empty board. This guarantees the loop terminates.
  if [ "$MODE" = build ]; then
    todo=$(grep -cE '^- \[ \].*v:auto' IMPLEMENTATION_PLAN.md || true)
    if [ "${todo:-0}" -eq 0 ]; then
      echo "=== ralph: no [ ] v:auto cards left — board clear, stopping. ===" | tee -a .loop/loop.log
      exit 0
    fi
  fi

  before="$(git rev-parse HEAD)"
  echo "=== ralph $MODE iteration $i/$MAX_ITERS (${todo:-?} v:auto todo, model=$MODEL, stall=$stall) ===" | tee -a .loop/loop.log

  cat "$PROMPT_FILE" | claude -p --dangerously-skip-permissions --model "$MODEL" 2>&1 \
    | tee -a .loop/loop.log

  if [ -f .loop/DONE ]; then
    echo "=== ralph: DONE sentinel found — plan complete, stopping. ===" | tee -a .loop/loop.log
    exit 0
  fi

  # An iteration agent (or a session hook) may have switched the checkout —
  # never push from, or keep looping on, a branch we didn't start on.
  now="$(git branch --show-current)"
  if [ "$now" != "$BRANCH" ]; then
    echo "=== ralph: checkout moved from '$BRANCH' to '${now:-detached}' — aborting. ===" | tee -a .loop/loop.log
    exit 1
  fi

  after="$(git rev-parse HEAD)"
  if [ "$before" = "$after" ]; then
    stall=$((stall + 1))
    echo "=== ralph: no new commit ($stall/$STALL_LIMIT) ===" | tee -a .loop/loop.log
    if [ "$stall" -ge "$STALL_LIMIT" ]; then
      echo "=== ralph: stalled $STALL_LIMIT iterations — stopping to save tokens. ===" | tee -a .loop/loop.log
      exit 1
    fi
  else
    stall=0
    git push origin "$BRANCH" 2>&1 | tee -a .loop/loop.log || echo "=== ralph: push failed (continuing) ===" | tee -a .loop/loop.log
  fi
done

echo "=== ralph: reached MAX_ITERS=$MAX_ITERS — stopping. ===" | tee -a .loop/loop.log
