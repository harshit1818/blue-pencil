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
PROMPT_FILE="PROMPT_$MODE.md"

mkdir -p .loop
rm -f .loop/DONE
stall=0

for i in $(seq 1 "$MAX_ITERS"); do
  before="$(git rev-parse HEAD)"
  echo "=== ralph $MODE iteration $i/$MAX_ITERS (model=$MODEL, stall=$stall) ===" | tee -a .loop/loop.log

  cat "$PROMPT_FILE" | claude -p --dangerously-skip-permissions --model "$MODEL" 2>&1 \
    | tee -a .loop/loop.log

  if [ -f .loop/DONE ]; then
    echo "=== ralph: DONE sentinel found — plan complete, stopping. ===" | tee -a .loop/loop.log
    exit 0
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
    git push 2>&1 | tee -a .loop/loop.log || echo "=== ralph: push failed (continuing) ===" | tee -a .loop/loop.log
  fi
done

echo "=== ralph: reached MAX_ITERS=$MAX_ITERS — stopping. ===" | tee -a .loop/loop.log
