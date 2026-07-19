# 0008 — Per-issue merge loop

**Status:** accepted · 2026-07-19

## Context

`loop.sh` batches every `v:auto` issue onto one long-lived branch with one growing
draft PR, and never merges. Issue B stacks on issue A's unreviewed commits, a flaw in
A contaminates everything after it, and an overnight run merges nothing until a human
catches up. Prior art converges on the alternative: small single-purpose PRs merged
bottom-up, each layer building on verified code (Wiggum agent mode, loop-engineering
guides, stacked-PR practice).

## Decision

Add `loop-issues.sh`, an outer driver: pick the top `v:auto` card → branch
`loop/issue-N` from fresh `origin/main` → `ONLY=N loop.sh` (draft PR, independent
review, bounded remediation — unchanged) → merge (merge commit, `Closes #N`) only when
the FINAL review is `LGTM` with zero objective findings → pull main, next issue.
Attempted issues are skipped for the rest of the run, merged or not, so one stuck card
can't wedge the queue. Product findings never block a merge; they stay a PR checklist
and the reviewer's `NEEDS-WORK` verdict is the blocking lever.

## Consequences

- Main now receives code no human read. Accepted for `v:auto`-class work because the
  gate is machine-checkable (verify green per commit + independent LGTM + zero
  objective findings) and merges are server-side (`gh`), so branch protection and
  required CI checks — if configured — remain a second gate the loop cannot bypass.
  `AUTO_MERGE=0` restores surface-only behaviour.
- `loop.sh` itself still never merges; merge policy lives in the driver.
- Sequential issues from fresh main: no cross-branch conflicts by construction.
- A parked PR (gate failed, left open) rots as later PRs merge — but only on the
  loop's own bookkeeping: the board (a regenerable label projection) and PROGRESS.md
  (append-only). After every merge the driver runs `scripts/resync-pr.sh` on each
  open parked PR, merging the new base in and auto-resolving exactly those two files;
  a conflict in any real file aborts and is left for a human. This keeps parked PRs
  green without stacking them (which would couple the queue and rebuild on
  gate-rejected code). Telemetry was moved off-branch (to a PR comment) for the same
  reason — it was the other half of the structural conflict set.
