#!/usr/bin/env bash
# Ralph Wiggum loop for Blue Pencil. Feeds a fixed prompt to a fresh agent each
# iteration; progress lives in git + IMPLEMENTATION_PLAN.md, not in context.
#
# Usage:
#   ./loop.sh [MAX_ITERS]        # default 10 iterations
#
# The board (IMPLEMENTATION_PLAN.md) is a projection of GitHub labels, regenerated
# deterministically by scripts/regen-board.mjs at the top of every run. There is no
# separate plan mode — a script does that job for free instead of a plan-mode agent.
#
# Three independent stops guard against circles and token waste:
#   1. MAX_ITERS      - hard cap, always terminates.
#   2. stall detector - if HEAD doesn't move for STALL_LIMIT runs, the agent is
#                       spinning; bail instead of burning tokens.
#   3. .loop/DONE     - the agent writes this when the plan is empty (clean exit).
set -euo pipefail
cd "$(dirname "$0")"

# Exit codes — distinct so automation/alerting can tell the states apart. The old
# loop conflated "converged", "spinning", and "ran out of runway" into 0/1.
EXIT_OK=0             # board clear or DONE sentinel — nothing left to do
EXIT_STALL=1         # no commit for STALL_LIMIT iterations — the agent is spinning
EXIT_BADARGS=2       # bad invocation
EXIT_BRANCH_MOVED=3  # checkout switched off the branch we started on
EXIT_DIRTY=4         # working tree dirty at iteration start — inherited state
EXIT_INPROGRESS=5    # a [~] v:auto card is on the board — half-done work
EXIT_MAXITERS=6      # ran out of iterations with v:auto work still on the board
EXIT_PUSH=7          # too many consecutive push failures
EXIT_ITER_FAILED=8   # the claude invocation failed past its retries

MAX_ITERS="${1:-10}"
STALL_LIMIT="${STALL_LIMIT:-2}"
PUSH_FAIL_LIMIT="${PUSH_FAIL_LIMIT:-3}"
MODEL="${MODEL:-sonnet}"          # sonnet for speed; set MODEL=opus for hard work
PROMPT_FILE="PROMPT_build.md"

case "$MAX_ITERS" in
  *[!0-9]*|'') echo "ralph: MAX_ITERS must be a number, got '$MAX_ITERS'" >&2; exit "$EXIT_BADARGS" ;;
esac

# Branch guard: the loop must never run on main (a rogue iteration would push
# unreviewed commits straight to the default branch) and must stay on the branch
# it started on, whatever the iteration agents do to the checkout.
BRANCH="$(git branch --show-current)"
if [ -z "$BRANCH" ] || [ "$BRANCH" = main ] || [ "$BRANCH" = master ]; then
  echo "ralph: refusing to loop on '${BRANCH:-detached HEAD}' — create a work branch first." >&2
  exit "$EXIT_BADARGS"
fi

# The auto-worktree plugin bounces headless agents into scratch worktrees,
# which is what caused the cycle-2/3 branch chaos. It honors a per-repo skip
# list — opt this repo out for the iteration agents only (interactive sessions
# elsewhere keep the plugin).
export CLAUDE_PLUGIN_OPTION_SKIP_DIRECTORIES="$(pwd)${CLAUDE_PLUGIN_OPTION_SKIP_DIRECTORIES:+,$CLAUDE_PLUGIN_OPTION_SKIP_DIRECTORIES}"

mkdir -p .loop
rm -f .loop/DONE
stall=0
pushfail=0

# A crashed or killed iteration can leave partial edits behind; a fresh agent must
# never inherit them (loop memory lives in git, nowhere else). Refuse to start on a
# dirty tree and let a human decide what that partial state was worth — do NOT
# auto-reset. (.loop/ is gitignored, so the loop's own transient writes don't count.)
if [ -n "$(git status --porcelain)" ]; then
  echo "=== ralph: working tree is dirty — inspect and commit/reset before looping. ===" | tee -a .loop/loop.log
  git status --short | tee -a .loop/loop.log
  exit "$EXIT_DIRTY"
fi

# Regenerate the board from GitHub labels before working it. Idempotent: commits
# (and pushes) only when GitHub has actually moved since the last run — otherwise a
# no-op. This is what plan mode used to do, minus the agent and the format drift.
node scripts/regen-board.mjs 2>&1 | tee -a .loop/loop.log
if ! git diff --quiet -- IMPLEMENTATION_PLAN.md; then
  git commit -q -m "docs(plan): regenerate board from GitHub labels" -- IMPLEMENTATION_PLAN.md
  git push origin "$BRANCH" 2>&1 | tee -a .loop/loop.log || echo "=== ralph: board push failed (continuing) ===" | tee -a .loop/loop.log
fi

for i in $(seq 1 "$MAX_ITERS"); do
  # Deterministic end: stop the moment no actionable cards remain. v:human cards stay
  # on the board forever, so "board clear" means no [ ] v:auto cards — not an empty
  # board. This guarantees the loop terminates.
  todo=$(grep -cE '^- \[ \].*v:auto' IMPLEMENTATION_PLAN.md || true)
  if [ "${todo:-0}" -eq 0 ]; then
    echo "=== ralph: no [ ] v:auto cards left — board clear, stopping. ===" | tee -a .loop/loop.log
    exit 0
  fi

  before="$(git rev-parse HEAD)"
  echo "=== ralph iteration $i/$MAX_ITERS (${todo:-?} v:auto todo, model=$MODEL, stall=$stall) ===" | tee -a .loop/loop.log

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
    exit "$EXIT_BRANCH_MOVED"
  fi

  after="$(git rev-parse HEAD)"
  if [ "$before" = "$after" ]; then
    # No commit. A blocked card now commits its own [!] board flip (see PROMPT_build.md),
    # so a true stall here means the agent is spinning — not that it hit a blocker.
    stall=$((stall + 1))
    echo "=== ralph: no new commit ($stall/$STALL_LIMIT) ===" | tee -a .loop/loop.log
    if [ "$stall" -ge "$STALL_LIMIT" ]; then
      echo "=== ralph: stalled $STALL_LIMIT iterations — the agent is spinning, stopping. ===" | tee -a .loop/loop.log
      exit "$EXIT_STALL"
    fi
  else
    stall=0
    if git push origin "$BRANCH" 2>&1 | tee -a .loop/loop.log; then
      pushfail=0
    else
      pushfail=$((pushfail + 1))
      echo "=== ralph: push failed ($pushfail/$PUSH_FAIL_LIMIT) ===" | tee -a .loop/loop.log
      if [ "$pushfail" -ge "$PUSH_FAIL_LIMIT" ]; then
        echo "=== ralph: $PUSH_FAIL_LIMIT consecutive push failures — remote is unreachable, stopping. ===" | tee -a .loop/loop.log
        exit "$EXIT_PUSH"
      fi
    fi
  fi
done

# Ran out of iterations. Whether that's success or a warning depends on the board:
# work still queued means we stopped short, not that we finished.
if [ "$(grep -cE '^- \[ \].*v:auto' IMPLEMENTATION_PLAN.md || true)" -gt 0 ]; then
  echo "=== ralph: reached MAX_ITERS=$MAX_ITERS with v:auto work still queued. ===" | tee -a .loop/loop.log
  exit "$EXIT_MAXITERS"
fi
echo "=== ralph: reached MAX_ITERS=$MAX_ITERS — board clear. ===" | tee -a .loop/loop.log
exit "$EXIT_OK"
