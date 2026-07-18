#!/usr/bin/env bash
# Ralph Wiggum loop for Blue Pencil. Feeds a fixed prompt to a fresh agent each
# iteration; progress lives in git + IMPLEMENTATION_PLAN.md, not in context.
#
# Usage:
#   ./loop.sh [MAX_ITERS]        # default 10 iterations; works the whole v:auto queue
#   ONLY=51 ./loop.sh [MAX_ITERS] # target one issue: restrict the run to card #51
#
# ONLY narrows the loop to a single issue — the board-clear check keys off that card
# (so the run stops once #N is done) and the agent prompt gets a "work only on #N"
# line. Without ONLY the agent picks the top v:auto card itself, as before.
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
# NOTE: test/loop.test.mjs mirrors this table (bash and node can't share the values);
# change both together.
EXIT_OK=0             # board clear or DONE sentinel — nothing left to do
EXIT_STALL=1         # no commit for STALL_LIMIT iterations — the agent is spinning
EXIT_BADARGS=2       # bad invocation
EXIT_BRANCH_MOVED=3  # checkout switched off the branch we started on
EXIT_DIRTY=4         # working tree dirty at iteration start — inherited state
EXIT_INPROGRESS=5    # a [~] v:auto card is on the board — half-done work
EXIT_MAXITERS=6      # ran out of iterations with v:auto work still on the board
EXIT_PUSH=7          # too many consecutive push failures
EXIT_ITER_FAILED=8   # the claude invocation failed past its retries
EXIT_LOCKED=9        # another loop is already running against this checkout

MAX_ITERS="${1:-10}"
STALL_LIMIT="${STALL_LIMIT:-2}"
PUSH_FAIL_LIMIT="${PUSH_FAIL_LIMIT:-3}"
ITER_TIMEOUT="${ITER_TIMEOUT:-1800}"  # seconds; kill a hung iteration (30m default)
RETRIES="${RETRIES:-2}"               # extra attempts after a failed/timed-out call
BACKOFF="${BACKOFF:-10}"              # seconds per attempt between retries
MAX_TURNS="${MAX_TURNS:-}"           # optional per-iteration turn cap (empty = unset)
MODEL="${MODEL:-sonnet}"             # sonnet for speed; set MODEL=opus for hard work
ONLY="${ONLY:-}"                     # optional: restrict the run to one issue number
PROMPT_FILE="PROMPT_build.md"

case "$MAX_ITERS" in
  *[!0-9]*|'') echo "ralph: MAX_ITERS must be a number, got '$MAX_ITERS'" >&2; exit "$EXIT_BADARGS" ;;
esac
if [ -n "$ONLY" ]; then
  case "$ONLY" in
    *[!0-9]*|'') echo "ralph: ONLY must be an issue number, got '$ONLY'" >&2; exit "$EXIT_BADARGS" ;;
  esac
fi

# What counts as an actionable / in-progress card. Without ONLY: any v:auto card.
# With ONLY: only that issue, so a targeted run stops once #ONLY is done and ignores
# the rest of the board. [^0-9] after the number so #5 never matches #51.
if [ -n "$ONLY" ]; then
  TODO_RE="^- \[ \] #$ONLY[^0-9].*v:auto"
  INPROGRESS_RE="^- \[~\] #$ONLY[^0-9].*v:auto"
else
  TODO_RE='^- \[ \].*v:auto'
  INPROGRESS_RE='^- \[~\].*v:auto'
fi

# Timestamped log line, mirrored to console and .loop/loop.log (created below).
log() { echo "[$(date -u +%FT%TZ)] $*" | tee -a .loop/loop.log; }

count_todo() { grep -cE "$TODO_RE" IMPLEMENTATION_PLAN.md || true; }

# Portable timeout — macOS ships no coreutils `timeout`. Runs a command in the
# background and TERMs it if it outlives $1 seconds. Returns 124 on timeout.
run_with_timeout() {
  local secs="$1"; shift
  local flag; flag="$(mktemp)"; rm -f "$flag"
  "$@" &
  local pid=$!
  # Watcher fds go to /dev/null so its sleep can't hold our stdout pipe open (that
  # would deadlock a caller capturing our output). Kill the sleep child promptly.
  ( sleep "$secs"; kill -0 "$pid" 2>/dev/null && { : >"$flag"; pkill -P "$pid" 2>/dev/null; kill -TERM "$pid" 2>/dev/null; }; ) >/dev/null 2>&1 &
  local watcher=$!
  local rc=0
  wait "$pid" 2>/dev/null || rc=$?
  pkill -P "$watcher" 2>/dev/null || true
  kill "$watcher" 2>/dev/null || true
  wait "$watcher" 2>/dev/null || true
  if [ -f "$flag" ]; then rm -f "$flag"; return 124; fi
  return "$rc"
}

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

# Single-writer lock: two loops against one checkout would race on HEAD and the
# board. mkdir is atomic, so it doubles as a lock; the EXIT trap releases it on
# every path (clean end or any exit code above).
if ! mkdir .loop/lock 2>/dev/null; then
  echo "ralph: another loop holds .loop/lock — refusing to run concurrently (remove it if stale)." >&2
  exit "$EXIT_LOCKED"
fi
trap 'rmdir .loop/lock 2>/dev/null || true' EXIT

rm -f .loop/DONE
stall=0
pushfail=0

# A crashed or killed iteration can leave partial edits behind; a fresh agent must
# never inherit them (loop memory lives in git, nowhere else). Refuse to start on a
# dirty tree and let a human decide what that partial state was worth — do NOT
# auto-reset. (.loop/ is gitignored, so the loop's own transient writes don't count.)
if [ -n "$(git status --porcelain)" ]; then
  log "=== ralph: working tree is dirty — inspect and commit/reset before looping. ==="
  git status --short | tee -a .loop/loop.log
  exit "$EXIT_DIRTY"
fi

# Regenerate the board from GitHub labels before working it. Idempotent: commits
# (and pushes) only when GitHub has actually moved since the last run — otherwise a
# no-op. This is what plan mode used to do, minus the agent and the format drift.
node scripts/regen-board.mjs 2>&1 | tee -a .loop/loop.log
if ! git diff --quiet -- IMPLEMENTATION_PLAN.md; then
  git commit -q -m "docs(plan): regenerate board from GitHub labels" -- IMPLEMENTATION_PLAN.md
  git push origin "$BRANCH" 2>&1 | tee -a .loop/loop.log || log "=== ralph: board push failed (continuing) ==="
fi

for i in $(seq 1 "$MAX_ITERS"); do
  # A [~] v:auto card means a previous iteration started work and died mid-flight.
  # That is NOT a clear board — treating it as one would be a false success. Stop and
  # let a human inspect/reset the half-done card.
  if grep -qE "$INPROGRESS_RE" IMPLEMENTATION_PLAN.md; then
    log "=== ralph: in-progress [~] v:auto card found — half-done work, inspect and reset. ==="
    exit "$EXIT_INPROGRESS"
  fi

  # Deterministic end: stop the moment no actionable cards remain. v:human cards stay
  # on the board forever, so "board clear" means no [ ] v:auto cards — not an empty
  # board (or, with ONLY, no open #ONLY card). This guarantees the loop terminates.
  todo=$(count_todo)
  if [ "${todo:-0}" -eq 0 ]; then
    if [ -n "$ONLY" ]; then
      log "=== ralph: issue #$ONLY is not an open [ ] v:auto card — nothing to do, stopping. ==="
    else
      log "=== ralph: no [ ] v:auto cards left — board clear, stopping. ==="
    fi
    exit 0
  fi

  before="$(git rev-parse HEAD)"
  log "=== ralph iteration $i/$MAX_ITERS (${ONLY:+target=#$ONLY }${todo:-?} v:auto todo, model=$MODEL, stall=$stall) ==="

  # The agent's result JSON is captured per iteration (cost/duration/session live here);
  # its stderr streams to the log. Bounded by a timeout and retried with backoff so a
  # hung network call can't wedge the loop and a transient API blip can't kill it.
  # The base prompt is piped on stdin; with ONLY, a target line is appended via printf
  # (data, not shell args — a quoted issue number can't break parsing, cf. #748).
  iter_out=".loop/iter-$i.json"
  run_claude() {
    { cat "$PROMPT_FILE"
      if [ -n "$ONLY" ]; then
        printf '\n\n## This run\nWork ONLY on GitHub issue #%s this iteration; ignore every other card. If #%s is not an open `[ ]` `v:auto` card on the board, do nothing and stop.\n' "$ONLY" "$ONLY"
      fi
    } | claude -p --dangerously-skip-permissions --model "$MODEL" --output-format json \
      ${MAX_TURNS:+--max-turns "$MAX_TURNS"} > "$iter_out" 2>>.loop/loop.log
  }
  rc=1
  for attempt in $(seq 0 "$RETRIES"); do
    [ "$attempt" -gt 0 ] && { log "=== ralph: retry $attempt/$RETRIES (previous rc=$rc) ==="; sleep "$((attempt * BACKOFF))"; }
    if run_with_timeout "$ITER_TIMEOUT" run_claude; then rc=0; break; else rc=$?; fi
  done
  if [ "$rc" -ne 0 ]; then
    log "=== ralph: iteration $i failed after $RETRIES retries (rc=$rc; 124=timeout) — stopping. ==="
    exit "$EXIT_ITER_FAILED"
  fi

  # Telemetry from the captured result JSON (missing/none -> "?").
  read -r cost dur sess < <(node -e '
    try { const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))
      process.stdout.write([d.total_cost_usd ?? "?", d.duration_ms ?? "?", d.session_id ?? "?"].join(" ")) }
    catch { process.stdout.write("? ? ?") }' "$iter_out" 2>/dev/null || echo "? ? ?") || true
  log "=== ralph: iteration $i done — cost=\$$cost duration=${dur}ms session=$sess ==="

  if [ -f .loop/DONE ]; then
    log "=== ralph: DONE sentinel found — plan complete, stopping. ==="
    exit 0
  fi

  # An iteration agent (or a session hook) may have switched the checkout —
  # never push from, or keep looping on, a branch we didn't start on.
  now="$(git branch --show-current)"
  if [ "$now" != "$BRANCH" ]; then
    log "=== ralph: checkout moved from '$BRANCH' to '${now:-detached}' — aborting. ==="
    exit "$EXIT_BRANCH_MOVED"
  fi

  after="$(git rev-parse HEAD)"
  if [ "$before" = "$after" ]; then
    # No commit. A blocked card now commits its own [!] board flip (see PROMPT_build.md),
    # so a true stall here means the agent is spinning — not that it hit a blocker.
    stall=$((stall + 1))
    log "=== ralph: no new commit ($stall/$STALL_LIMIT) ==="
    if [ "$stall" -ge "$STALL_LIMIT" ]; then
      log "=== ralph: stalled $STALL_LIMIT iterations — the agent is spinning, stopping. ==="
      exit "$EXIT_STALL"
    fi
  else
    stall=0
    # Durable per-iteration record that survives fresh contexts — committed, not just
    # logged (loop.log/.loop are transient). Learnings the agent adds ride in its card
    # commit; this line is the machine telemetry. Committed with -n: it is loop
    # bookkeeping (docs-only), not agent work, so it skips the verify gate.
    printf -- '- [%s] iter %s/%s → %s  cost=$%s duration=%sms\n' \
      "$(date -u +%FT%TZ)" "$i" "$MAX_ITERS" "$(git rev-parse --short HEAD)" "$cost" "$dur" >> PROGRESS.md
    git add PROGRESS.md
    git commit -n -q -m "chore(progress): iteration $i telemetry" || true
    if git push origin "$BRANCH" 2>&1 | tee -a .loop/loop.log; then
      pushfail=0
    else
      pushfail=$((pushfail + 1))
      log "=== ralph: push failed ($pushfail/$PUSH_FAIL_LIMIT) ==="
      if [ "$pushfail" -ge "$PUSH_FAIL_LIMIT" ]; then
        log "=== ralph: $PUSH_FAIL_LIMIT consecutive push failures — remote is unreachable, stopping. ==="
        exit "$EXIT_PUSH"
      fi
    fi
  fi
done

# Ran out of iterations. Whether that's success or a warning depends on the board:
# work still queued means we stopped short, not that we finished.
if [ "$(count_todo)" -gt 0 ]; then
  log "=== ralph: reached MAX_ITERS=$MAX_ITERS with v:auto work still queued. ==="
  exit "$EXIT_MAXITERS"
fi
log "=== ralph: reached MAX_ITERS=$MAX_ITERS — board clear. ==="
exit "$EXIT_OK"
