# Ralph loop progress

Per-iteration telemetry, appended and committed by `loop.sh` (one line per iteration
that produced a commit). Durable across fresh contexts — this is the loop's memory of
what it did. Agents add a one-line **learning** under an entry when they discover
something future iterations need (a wrong assumption, a command that took tries).

Format: `- [UTC] iter N/M → <short-sha>  cost=$X duration=Yms`

<!-- entries below -->
- [2026-07-18T19:15:02Z] iter 1/10 → 8263fbd  cost=$0.912548 duration=201828ms
- [2026-07-18T19:17:03Z] iter 2/10 → 7aba921  cost=$0.8717845000000001 duration=116040ms
- [2026-07-18T19:22:59Z] iter 3/10 → 7d4c539  cost=$1.6366494999999996 duration=350934ms
- [2026-07-18T19:37:29Z] iter 4/10 → cae04dd  cost=$2.7723535000000004 duration=865090ms
- open [2026-07-19] blocked-by resolution (2×): a card's "Blocked by #N" can be satisfied only on another OPEN loop PR, not main — check blocked-by against merged state before building; and a blocked card's v:auto essence is often buildable now if the truly-blocked part is split into a v:human card (#54→#78; #57 vs PR #86). Propose a loop-issues.sh check if seen a 3rd time.
- open [2026-07-19] worktree test pollution (1×): `node --test` globs into gitignored `.claude/worktrees/`, running a sibling branch's stale tests — if verify reddens on tests you never touched, suspect a polluting worktree first (test script now scoped to `test/`).
- checkJs infers a DI param's type from its destructured default (e.g. `timers = { setInterval, clearInterval }` demands the real Node signatures), so test fakes fail typecheck — give injected-deps factories a loose JSDoc @param up front (see helper-supervisor.js).
