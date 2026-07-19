# Criteria: retrospective loop

**Created**: 2026-07-19
**Owner**: Harshit (loop operator)
**Status**: Active (trial phase — tune through §8)
**Issue**: #97

Judgment rules for the retrospective loop: what counts as a pattern, when a pattern
earns an instruction change, what this loop may and may not touch, and how it reports.
The procedure is in [task.md](task.md). This loop is itself retro-able — record its own
tuning in §8.

The one idea behind all of it: **the loop records learnings but never acts on them.**
`PROGRESS.md` is write-only memory. This loop turns repeated learnings into *proposed*
instruction changes and keeps `PROGRESS.md` small — without ever changing what the build
loop decides or editing anything but markdown.

---

## 1. Inputs (the evidence pool)

Read only what grew since `state.json.last_run`:

- **`PROGRESS.md`** — the `- learning:` / free-form lines under telemetry entries. Primary source.
- **`.loop/loop.log`** — `=== ralph: ... ===` lines, especially stop reasons (stall, block,
  push failure, dirty tree, iter failed). One recurring stop cause is a pattern.
- **Loop PRs** since `last_run` (`gh pr list --state all --search "loop/"`, cap 10) — their
  independent-review comments and remediation rounds. A finding raised on 3 different PRs is a pattern.

If `gh` is unavailable, work from `PROGRESS.md` + `.loop/loop.log` alone and say so in the report.

## 2. What counts as a pattern

A **pattern** is one underlying lesson that recurs. Group by *root cause*, not by wording —
three differently-phrased lines about the same thing are three pieces of evidence for one pattern.

- **Evidence bar: ≥3 occurrences** across the inputs (§1) before it may be proposed as an
  instruction change. This is the same discipline rimo-develop's retrospective runs on: one-offs
  are noise; three is a trend worth paying to fix once.
- Occurrences may span sources — 2 PROGRESS lines + 1 log stop reason = 3.
- **<3 occurrences**: record as ONE compressed, dated open line in `PROGRESS.md` (§5 compact),
  do **not** propose. The next run re-counts from there, so a slow-building pattern still crosses
  the bar eventually.

## 3. What a crossed-bar pattern produces

One entry in the proposal PR (§5), one commit, targeting the smallest durable surface:

| The lesson is about… | Propose editing… |
|---|---|
| A per-iteration behaviour rule (how the build agent should act each card) | `PROMPT_build.md` |
| A durable operational fact (a command, a layout truth, a gotcha that outlives one card) | `AGENTS.md` |
| The review agent's behaviour | `PROMPT_review.md` |
| A **code or script** change (`loop.sh`, `scripts/*`, `test/*`, product code) | **a new GitHub issue**, NOT a diff — see §4 rule 3 |

Each entry cites its ≥3 pieces of evidence (PROGRESS line quotes, log excerpts, or PR links).
Prefer the fewest words that change behaviour — this loop fights bloat, it must not add it.

## 4. Hard rules (the boundary that keeps this loop safe)

1. **Proposal-only — never merges its own PR.** Retro PRs change the loop's own instructions;
   a human always merges them. (`loop-issues.sh` auto-merge does not apply here.)
2. **Markdown-only diffs.** The run may edit ONLY: `PROGRESS.md`, `AGENTS.md`, `PROMPT_build.md`,
   `PROMPT_review.md`, `loops/retrospective/*`. Touching anything else is a bug.
3. **Code changes leave as issues, not diffs.** A lesson that needs a script/test/product change
   is filed as a new issue (`epic:L` for loop infra) with proper `severity:`/`verify:` labels, so
   the *build* loop implements it. Three separated powers: retro proposes, build implements,
   human merges.
4. **Never edit the board.** `IMPLEMENTATION_PLAN.md` is regen-board's; classification lives on
   GitHub labels.
5. **Never commit to `main`.** All work on a fresh `loop/retro-<date>` branch, surfaced as a PR.
6. **Never fake success.** `gh`/Slack/verify failures are reported honestly; a run that couldn't
   push says so.

## 5. Compact duty (same tick)

Keep `PROGRESS.md` small enough to stay free context — every fresh iteration reads it in full,
so bloat is a permanent tax, not a one-time cost.

Sort every learning line older than `last_run` into exactly one bucket:

- **Delete** — resolved, one-off, or superseded by a promoted rule. (A lesson promoted to
  `AGENTS.md`/`PROMPT_build.md` this run is now durable there → delete the PROGRESS line.)
- **Promote** — durable and not yet captured → it becomes a §3 proposal, then the line is deleted.
- **Compress** — still-open, <3 evidence → one dated line kept for the next run to re-count.

Also delete **telemetry lines** (`- [UTC] iter N/M → sha …`) whose commit is already merged to
`main` — the PR comment `post_telemetry` leaves is the durable record (loop.sh's own design). Keep
the `<!-- entries below -->` header and file preamble.

The PR body must account for every removed line **by bucket and count** — nothing silently dropped.

## 6. Self-verification (before the run is "done")

- [ ] Every proposed change cites ≥3 real, quotable pieces of evidence; nothing proposed on <3.
- [ ] The diff touches only the §4 rule-2 allowlist of files.
- [ ] Every code/script lesson became a filed issue (with URL), not a diff.
- [ ] `npm run verify` is green on the branch (docs-only should never trip it; if it does, abort).
- [ ] The PR body's compact accounting sums to the actual lines removed from `PROGRESS.md`.
- [ ] `state.json` updated (new `last_run`, new `progress_lines`) and committed in the same PR.
- [ ] Notified only if a PR was opened; the notification links the PR and needs no reply to understand.

## 7. When to do nothing (the healthy quiet case)

- Zero patterns at the bar **and** `PROGRESS.md` grew <30 lines since `state.json.progress_lines`
  → no branch, no PR, no notification. Update nothing. Silent exit is success.
- Growth ≥30 lines but zero patterns → compact-only PR (no §3 proposals).

## 8. Trial notes (append after each run)

- Open question (2026-07-19): loop-PR review-finding window — proposal is "since last_run, cap 10".
  Revisit once a run actually has >10 PRs in range.
- Open question (2026-07-19): should promoted rules also flow to `.claude/` agent config?
  Deferred until one concretely needs it.
