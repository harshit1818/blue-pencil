# Ralph loop progress

Per-iteration telemetry, appended and committed by `loop.sh` (one line per iteration
that produced a commit). Durable across fresh contexts — this is the loop's memory of
what it did. Agents add a one-line **learning** under an entry when they discover
something future iterations need (a wrong assumption, a command that took tries).

Format: `- [UTC] iter N/M → <short-sha>  cost=$X duration=Yms`

<!-- entries below -->
- [2026-07-18T19:15:02Z] iter 1/10 → 8263fbd  cost=$0.912548 duration=201828ms
- [2026-07-18T19:17:03Z] iter 2/10 → 7aba921  cost=$0.8717845000000001 duration=116040ms
- learning: #54 was "blocked by #53" but its v:auto essence (NDJSON parser + lifecycle state machine) is protocol-agnostic and buildable now — split the electron spawn wiring (R12/R13, needs the real binary) into v:human #78 rather than stubbing a spawn against a nonexistent helper.
- [2026-07-18T19:22:59Z] iter 3/10 → 7d4c539  cost=$1.6366494999999996 duration=350934ms
- learning: bare `node --test` globs recursively into gitignored `.claude/worktrees/`, running a sibling branch's stale tests and reddening verify for reasons unrelated to your card. Scoped the test script to `test/` (fixed in package.json). If verify fails on tests you never touched, check for a polluting worktree first.
- [2026-07-18T19:37:29Z] iter 4/10 → cae04dd  cost=$2.7723535000000004 duration=865090ms
- learning: loop-sandbox tests inherited the OUTER loop's env — a targeted run (ONLY=53) leaked ONLY/BASE/MODEL into the sandboxed loop.sh, which then exited "nothing to do" and reddened 17 tests that pass in a clean shell. Sandbox now strips all loop-control vars; if harness tests fail only under the loop, suspect env leakage next.
