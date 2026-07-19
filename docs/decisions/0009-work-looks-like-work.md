# Work looks like work — task-named PRs, human branch names, skills extraction

**Date**: 2026-07-19
**Status**: Approved (brainstormed 2026-07-19)
**Scope decision**: one design, three phased PRs — each phase independently mergeable.

## Problem

Loop-delivered work is presented as loop mechanics, not as engineering work:

- PR titles read `loop: loop/issue-53` (`loop.sh` `ensure_pr`, `--title "loop: $BRANCH"`).
- PR bodies open with "Automated **draft** from loop.sh — loop.sh never merges…" and bury
  the actual change in a `Cards this run:` footnote.
- Merge commits read `merge: loop/issue-53 (Closes #53)` — git history is loop bookkeeping.
- Branch names are `loop/issue-N`.

The raw material for real descriptions already exists (Conventional-Commit subjects, issue
acceptance criteria); it just isn't surfaced. Separately, `loop.sh` inlines its judgment
content (PR heredoc, review prompt assembly), which makes both the script hectic and the
content hard to tune — the retrospective loop can only propose edits to two monolithic
prompt files.

**Decision (owner)**: PRs read as normal engineering work with **no automation disclosure**
in reader-facing text. Provenance is not fabricated (`.loop/` logs remain); it is simply not
the headline. Infra PRs whose actual subject *is* the loop (e.g. retrospective runs) are out
of scope — they stay loop-titled.

---

## Phase 1 — task-named PR titles and bodies (C with A fallback)

**Approach chosen**: the build agent authors the PR text (it has the most context), with a
deterministic assembly fallback so a non-compliant iteration still yields a clean PR.

### 1.1 Contract: `.loop/pr-body.md`

Transient, gitignored (`.loop/` already is). Git-style format: **line 1 = PR title**, blank
line, markdown body. Written by the build agent only for a completed `[x]` card; a blocked
`[!]` card writes nothing.

```
feat(phase3): AX probe CLI + per-app truth table (M0)

## What
Adds a standalone AX probe that dumps a target app's accessibility tree as NDJSON…

## Why
Closes #53. Groundwork for field-anchoring (epic F).

## Testing
`test/ax-probe.test.mjs` asserts the NDJSON contract; automated checks pass.
```

### 1.2 `PROMPT_build.md` — new final step

After the commit step: write `.loop/pr-body.md` for the card just completed — a
Conventional-Commits-style title describing *the change*, then `## What`, `## Why`
(contains `Closes #N`), `## Testing`. Explicit rule: no mention of loops, Ralph,
iterations, or automation anywhere in the text.

### 1.3 `loop.sh` `ensure_pr` — consume or fall back

- `.loop/pr-body.md` exists and non-empty → title = line 1, body = rest (**C path**).
- Else (**A fallback**): title = primary card's commit subject
  (`git log origin/$BASE..HEAD --grep='Closes #' --pretty=%s | head -1`), or the issue
  title when `ONLY` is set and no such commit exists; body = `## Changes` (commit-subject
  list) + `## Testing` (plain wording — no `v:auto`/`v:human` jargon, no ADR references).
- Keep `--draft` (draft→ready is normal practice; `loop-issues.sh` already calls
  `gh pr ready`).
- Add `.loop/pr-body.md` to the start-of-run cleanup (`rm -f` line) so a stale body can
  never decorate the next run's PR.

### 1.4 `loop-issues.sh` — merge subject

Replace `--subject "merge: $branch (Closes #$issue)"` with the PR's own title + ` (#$issue)`
via `gh pr view "$branch" --json title -q .title` (fallback to the old subject if the lookup
fails). Branch commits still carry `Closes #N`, so issue auto-close is unaffected.

### 1.5 Tests (Phase 1)

- `claude` stub gains an action that writes `.loop/pr-body.md` + commits → assert PR title
  comes from line 1; assert `gh-calls.log` contains neither `loop:` titles nor
  "Automated draft".
- No-pr-body run → assert fallback title equals the commit subject.
- `gh` stub: honor `pr view --json title` (returns recorded title) for the merge-subject
  test; update `test/loop-issues.test.mjs` merge-subject assertion.
- Existing `pr create --draft` assertions unchanged.

---

## Phase 2 — human branch names (`N-slug`)

**Scheme**: GitLab-style `<issue>-<kebab-slug>` from the issue title, truncated ~40 chars —
e.g. `53-ax-probe-cli-per-app-truth-table`. Deterministic: same issue → same branch,
preserving resume/skip semantics.

The branch-name contract is exactly two functions, both in `loop-issues.sh`:

1. **Ownership test** — was `^loop\/issue-\d+$` → becomes `^\d+-[a-z0-9-]+$`
   (`open_loop_branches`).
2. **Number extraction** — was `sed 's#.*/issue-##'` → becomes `${branch%%-*}`.

Changes: those two lines; `branch="loop/issue-$issue"` → `branch="$issue-$(slug)"` where
`slug` derives from `gh issue view $issue --json title` (kebab-case, `[a-z0-9-]` only,
collapse repeats, trim to 40); the stale-remote-branch delete line uses the same derived
name; docs/comments in `resync-pr.sh` (name-agnostic otherwise); test fixtures in
`test/loop-issues.test.mjs` + `test/resync-pr.test.mjs`.

**Documented rule (AGENTS.md)**: digit-first branch names (`^\d+-`) belong to the driver.
A human branch matching the pattern while its issue is an open `v:auto` card would be
treated as parked — the issue skipped (desirable) and the branch resynced, i.e. pushed to
(not desirable). Owner accepts this: human branches here are `feat/...`-style.

**Transition**: existing open `loop/issue-N` PRs (if any) at rollout keep working only if
the old regex is also honored during a deprecation window — instead, simpler: merge/close
open loop PRs before merging Phase 2 (owner action, currently ≤2 open).

---

## Phase 3 — skills extraction (thin control plane, referenced judgment)

**Boundary (hard rule)**: `loop.sh` / `loop-issues.sh` keep the entire control plane in
bash — locks, stall, retries, 429 handling, exit codes, push discipline, branch guards.
Only *judgment/content* moves out.

```
.claude/skills/
  build-card/
    SKILL.md              ← PROMPT_build.md, restructured
    references/
      board-conventions.md   (markers, v:auto/v:human, one-card scope)
      blocking-protocol.md   (ask-human → [!] flip → commit the block)
      pr-writing.md          (the Phase-1 contract + examples)
  review-diff/
    SKILL.md              ← PROMPT_review.md, restructured
    references/
      finding-rubric.md      (objective vs product findings, real examples)
```

- `loop.sh` pipes a short pointer prompt ("run one build-card tick per its SKILL.md")
  instead of the whole prompt text; `run_one_review` likewise for review-diff.
- `PROMPT_build.md` / `PROMPT_review.md` become thin pointers or are removed once the
  sandbox tests are repointed (they `cpSync` both files today — update
  `test/helpers/loop-sandbox.mjs` paths in the same PR).
- **Why**: progressive disclosure (agent reads the 1–2 references relevant to its card,
  not one monolith) and a finer-grained target for the retrospective loop — proposals can
  edit the specific reference that failed instead of a 200-line prompt.
- **No behavior change intended**; the PR is moves + pointer rewiring + test paths. Any
  wording change rides Phases 1–2, not this one.

---

## Out of scope (deliberate)

- Retrospective/infra PR titles (their subject *is* the loop).
- The independent review comment's content/format (normal code-review content already).
- Draft PR status (normal practice).
- Any fabricated authorship (e.g. fake human co-authors) — omission of tooling detail
  only, consistent with the repo's no-Claude-co-author commit rule.

## Rollout order & verification

1. Phase 1 PR → merge → next `loop-issues.sh` run produces a task-named PR; eyeball it.
2. Phase 2 PR (after open loop PRs are cleared) → next run cuts an `N-slug` branch.
3. Phase 3 PR → diff of `.loop/claude-stdin.log` before/after confirms the agent still
   receives equivalent instructions; `npm run verify` green throughout.

Each phase's tests extend `test/loop.test.mjs` / `test/loop-issues.test.mjs` via the
existing sandbox stubs — no new test infrastructure.
