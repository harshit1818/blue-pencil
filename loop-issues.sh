#!/usr/bin/env bash
# Per-issue driver on top of loop.sh: one issue = one branch = one PR = one merge.
# Picks the top v:auto card, cuts loop/issue-N from origin/$BASE, runs a targeted
# ONLY=N loop.sh (draft PR + independent review + remediation happen in there), and
# merges ONLY when the final review gate passes: verdict LGTM and zero objective
# findings (scripts/review-triage.mjs mergeable). Product findings never block — they
# ride the PR as the human checklist. Attempted issues are skipped, merged or not, so
# one stuck card can't wedge the queue; a fresh driver run retries what's still open.
# Invariants: never commits to $BASE (it moves only by --ff-only pull); merges are
# server-side via gh, so branch protection stays a second gate. See
# docs/decisions/0008-per-issue-merge-loop.md.
#
# Usage:
#   ./loop-issues.sh [MAX_ISSUES]   # default 5 issues this run
#   AUTO_MERGE=0 ./loop-issues.sh   # deliver + review but never merge
set -euo pipefail
cd "$(dirname "$0")"

# NOTE: test/loop-issues.test.mjs mirrors this table — change both together.
EXIT_OK=0
EXIT_BADARGS=2
EXIT_DIRTY=4
EXIT_LOCKED=9
EXIT_INNER=10   # loop.sh failed — its exit code is in the log
EXIT_MERGE=11   # gh pr merge failed — merge state needs a human

MAX_ISSUES="${1:-5}"
ITERS_PER_ISSUE="${ITERS_PER_ISSUE:-10}"
BASE="${BASE:-main}"
AUTO_MERGE="${AUTO_MERGE:-1}"

case "$MAX_ISSUES" in
  *[!0-9]*|'') echo "issues: MAX_ISSUES must be a number, got '$MAX_ISSUES'" >&2; exit "$EXIT_BADARGS" ;;
esac

mkdir -p .loop
log() { echo "[$(date -u +%FT%TZ)] $*" | tee -a .loop/issues.log; }

# Open loop/issue-N PR head branches, one per line. gh's --jq is ignored by the
# test stub, so parse the raw JSON in node (same reason the skip list does below).
open_loop_branches() {
  gh pr list --state open --limit 100 --json headRefName 2>/dev/null \
    | node -e 'let a=[];try{a=JSON.parse(require("fs").readFileSync(0,"utf8"))}catch{}
        process.stdout.write(a.map((p)=>p.headRefName).filter((h)=>/^loop\/issue-\d+$/.test(h)).join("\n"))' \
    || true
}

# After $BASE advances, keep every still-open parked PR mergeable so it can't rot
# into conflicts (what bit #84/#86 last run). resync-pr.sh auto-resolves the loop's
# bookkeeping-only conflicts and leaves any real conflict for a human.
resync_parked() {
  local b
  for b in $(open_loop_branches); do
    BASE="$BASE" bash scripts/resync-pr.sh "$b" 2>&1 | tee -a .loop/issues.log \
      || log "=== issues: resync of $b needs a human (real conflict) ==="
  done
}

# Same single-writer mkdir pattern as loop.sh, separate lock: the driver owns the
# checkout BETWEEN inner runs too (branch switches, pulls).
if ! mkdir .loop/issues-lock 2>/dev/null; then
  echo "issues: another driver holds .loop/issues-lock — remove it if stale." >&2
  exit "$EXIT_LOCKED"
fi
trap 'rmdir .loop/issues-lock 2>/dev/null || true' EXIT

if [ -n "$(git status --porcelain)" ]; then
  log "=== issues: working tree dirty — inspect before driving. ==="
  exit "$EXIT_DIRTY"
fi

git checkout -q "$BASE"
git pull -q --ff-only origin "$BASE"

# Resume-safety: an issue whose loop/issue-N PR is already open is parked with a
# human (a previous run's gate failed, or the run died before merging). Re-picking
# it would rebuild from scratch and then fail pushing to the existing branch —
# so seed the skip list from GitHub. Merging or closing the PR un-parks the issue.
skip="$(open_loop_branches | sed 's#.*/issue-##' | paste -sd , -)"
[ -n "$skip" ] && log "=== issues: skipping issue(s) with open PRs: $skip ==="
merged=0
for n in $(seq 1 "$MAX_ISSUES"); do
  issue="$(node scripts/regen-board.mjs next ${skip:+--skip "$skip"})"
  if [ -z "$issue" ]; then
    log "=== issues: queue clear after $((n - 1)) issue(s) — stopping. ==="
    break
  fi
  branch="loop/issue-$issue"
  log "=== issues: #$issue ($n/$MAX_ISSUES) on $branch ==="

  git fetch -q origin "$BASE"
  git checkout -q -B "$branch" "origin/$BASE"

  rm -f .loop/review.json   # a stale verdict must never gate this issue
  rc=0
  ONLY="$issue" BASE="$BASE" bash loop.sh "$ITERS_PER_ISSUE" || rc=$?
  if [ "$rc" -ne 0 ]; then
    log "=== issues: loop.sh exited rc=$rc on #$issue — stopping for a human. ==="
    exit "$EXIT_INNER"
  fi
  skip="${skip:+$skip,}$issue"

  if [ "$AUTO_MERGE" = 1 ] && gh pr view "$branch" >/dev/null 2>&1 \
     && node scripts/review-triage.mjs mergeable .loop/review.json >>.loop/issues.log 2>&1; then
    log "=== issues: gate passed — merging #$issue ==="
    if ! { gh pr ready "$branch" \
           && gh pr merge "$branch" --merge --delete-branch --subject "merge: $branch (Closes #$issue)"; } \
         2>&1 | tee -a .loop/issues.log; then
      log "=== issues: merge failed for #$issue — stopping for a human. ==="
      exit "$EXIT_MERGE"
    fi
    merged=$((merged + 1))
    git fetch -q origin "$BASE"   # so resync sees the just-merged $BASE
    resync_parked
  else
    log "=== issues: not merging #$issue (gate failed, no PR, or AUTO_MERGE=0) — PR left for a human. ==="
  fi

  # gh --delete-branch may or may not have moved the checkout; make the end state
  # unconditional: on $BASE, fast-forwarded, issue branch gone.
  git checkout -q "$BASE"
  git pull -q --ff-only origin "$BASE"
  git branch -q -D "$branch" 2>/dev/null || true
done

log "=== issues: done — $merged merged. ==="
exit "$EXIT_OK"
