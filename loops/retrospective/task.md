# Loop: retrospective (fold recurring learnings into instructions; keep PROGRESS.md small)

**Created**: 2026-07-19
**Owner**: Harshit (loop operator)
**Status**: Active (trial phase)
**Issue**: #97

You are one run of the retrospective loop with a FRESH context. All memory lives on disk
and on GitHub — read it, don't assume it. This loop reads what the build loop *learned*,
turns lessons that recurred ≥3 times into *proposed* edits to the loop's own instructions,
and compacts `PROGRESS.md` so it stays free context. It proposes; it never merges, and it
never edits anything but markdown. Judgment rules are in [criteria.md](criteria.md) — read
it in full before acting.

## How to run

Manual / interactive during the trial phase: "run the retrospective loop" or `/loop` once.
No scheduler yet (that's a separate adoption step — issue TBD). Read both this file and
`criteria.md` in full each run; they are the whole instruction set.

## Tick procedure

### 0. Sync main (mandatory first step)

Before anything else, force the checkout's `main` current with the remote, then branch —
stale instructions fork behaviour across runs:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
```

Never work on `main`. Create the run's branch:

```bash
git checkout -b "loop/retro-$(date -u +%Y%m%d)"
```

### 1. Read state and gate cheaply

Read `loops/retrospective/state.json` (`last_run`, `progress_lines`). Count current
`PROGRESS.md` lines. If it grew **<30 lines** since `progress_lines` **and** a quick scan of
the new lines shows no obviously-repeated lesson → likely a no-op; still do step 2's grouping
before concluding, but expect to exit at step 6 without a PR (criteria §7). Do not read logs/PRs
until step 2 says there's something to analyse — a quiet run must stay cheap.

### 2. Collect and group the evidence (criteria §1, §2)

Gather, restricted to what changed since `last_run`:

- `PROGRESS.md` learning lines.
- `.loop/loop.log` stop reasons (`grep -E '=== ralph: .* (stall|block|fail|dirty|limit)' .loop/loop.log`).
- Loop PRs since `last_run`, cap 10: `gh pr list --state all --limit 10 --search "loop/ updated:>=<last_run>"`,
  then their review comments. Skip if `gh` is unavailable and note it.

**Group by root cause, not wording.** Count occurrences per group. A group with **≥3** is a
pattern to propose (step 3); **<3** is compressed into one open line (step 4, compact).

### 3. For each pattern at the bar — draft one proposal (criteria §3, §4)

Pick the smallest durable surface (criteria §3 table):

- **Instruction lesson** → edit `PROMPT_build.md` / `AGENTS.md` / `PROMPT_review.md`. One commit
  per pattern, Conventional Commits (`docs(loop): <what changed>`). Add the minimum words that
  change behaviour.
- **Code/script lesson** → do NOT diff. File an issue and record its URL for the PR body:

  ```bash
  gh issue create --title "L<n> — <fix>" --label "epic:L,severity:<s>,verify:<auto|human>" --body "<why + ≥3 evidence>"
  ```

Every proposal names its ≥3 pieces of evidence (quote the PROGRESS lines / log excerpts / PR links).

### 4. Compact PROGRESS.md (criteria §5)

Sort every learning line older than `last_run` into delete / promote / compress, and delete
telemetry lines whose commit is merged to `main`. Keep the preamble and `<!-- entries below -->`.
Track counts per bucket for the PR body. A lesson you promoted in step 3 → delete its PROGRESS line.

### 5. Update state and self-verify

- Write `loops/retrospective/state.json`: `last_run` = now (ISO date), `progress_lines` = the new
  post-compact line count.
- Run `npm run verify` — must be green (docs-only should never trip it; if it does, abort, leave the
  branch unpushed, report).
- Walk the criteria §6 checklist. Do not report success on a failed write.

### 6. Open the PR (only if there is something to surface)

If step 3 produced proposals **or** step 4 removed lines:

```bash
git add PROGRESS.md AGENTS.md PROMPT_build.md PROMPT_review.md loops/retrospective/state.json
git commit -m "docs(loop): retrospective <date> — <n> proposal(s), compact <removed> lines"
git push -u origin "loop/retro-$(date -u +%Y%m%d)"
gh pr create --base main --title "loop: retrospective <date>" --body-file <PR body>
```

PR body must contain: each proposal with its evidence; each filed issue URL; and the compact
accounting (removed lines by bucket + count). Put `Closes #97` **only** on the scaffold PR, not
recurring runs.

Then notify — **only because a human must review/merge** (criteria §6):

```bash
scripts/notify.sh "🔁 retrospective <date>: <n> proposal(s) + compact — review: <PR url>"
```

If step 3 and step 4 both produced nothing → **no branch left behind, no PR, no notify** (criteria §7).
Delete the empty branch (`git checkout main && git branch -D loop/retro-<date>`) and stop silently.

## Related

- Judgment rules & boundary: [criteria.md](criteria.md)
- Why this exists / gap analysis: issue #97
- Reference design: rimo-develop `loops/issue-triage/{retrospective,compact}/`
- Inputs it reads: `PROGRESS.md`, `.loop/loop.log`, loop PRs · Never edits: `IMPLEMENTATION_PLAN.md`, any code
