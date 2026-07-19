#!/usr/bin/env bash
# Keep one parked loop/issue-N PR mergeable as $BASE advances: merge $BASE in and
# auto-resolve ONLY the loop's own bookkeeping conflicts — the board is a
# regenerable projection of GitHub labels, and PROGRESS.md is an append-only log.
# Those two files are the sole thing two loop branches structurally collide on
# (they bit parked PRs #84/#86). A conflict in any real file is a human's call:
# the merge is aborted and the branch is left exactly as it was. See ADR 0008.
#
#   scripts/resync-pr.sh <branch>          # e.g. scripts/resync-pr.sh loop/issue-56
#   BASE=main scripts/resync-pr.sh <branch>
#
# Exit: 0 resynced (or already current); 3 real conflict, left for a human.
set -euo pipefail
cd "$(dirname "$0")/.."

BASE="${BASE:-main}"
branch="${1:?usage: resync-pr.sh <branch>}"

# The only paths this script may resolve itself. Everything else stops it.
BOOKKEEPING="IMPLEMENTATION_PLAN.md PROGRESS.md"
EXIT_CONFLICT=3

has() { printf '%s\n' $1 | grep -qxF "$2"; }

git fetch -q origin
git checkout -q -B "$branch" "origin/$branch"

# Clean merge / already up to date: push only if HEAD actually moved.
if git merge --no-edit "origin/$BASE" >/dev/null 2>&1; then
  if [ -n "$(git rev-list "origin/$branch..HEAD")" ]; then
    git push -q origin "$branch"
    echo "resync: $branch merged $BASE cleanly"
  else
    echo "resync: $branch already up to date with $BASE"
  fi
  exit 0
fi

# Conflicted. Refuse unless every conflicted path is loop bookkeeping.
conflicts="$(git diff --name-only --diff-filter=U)"
for f in $conflicts; do
  if ! has "$BOOKKEEPING" "$f"; then
    git merge --abort
    echo "resync: $branch has a real conflict in $f — left for a human"
    exit "$EXIT_CONFLICT"
  fi
done

# PROGRESS.md — append-only log: union both sides' lines (order is irrelevant).
if has "$conflicts" PROGRESS.md; then
  o="$(mktemp)"; b="$(mktemp)"; t="$(mktemp)"
  git show :2:PROGRESS.md > "$o" 2>/dev/null || : > "$o"
  git show :1:PROGRESS.md > "$b" 2>/dev/null || : > "$b"
  git show :3:PROGRESS.md > "$t" 2>/dev/null || : > "$t"
  git merge-file --union -p "$o" "$b" "$t" > PROGRESS.md
  rm -f "$o" "$b" "$t"
  git add PROGRESS.md
fi

# Board — keep this branch's version (carries its own [x]/[!] flip), then re-project
# it from live labels so it reconciles with cards that closed on $BASE meanwhile.
if has "$conflicts" IMPLEMENTATION_PLAN.md; then
  git checkout --ours IMPLEMENTATION_PLAN.md
  node scripts/regen-board.mjs >/dev/null 2>&1 || true
  git add IMPLEMENTATION_PLAN.md
fi

git commit -q --no-edit
git push -q origin "$branch"
echo "resync: $branch resynced (auto-resolved bookkeeping)"
