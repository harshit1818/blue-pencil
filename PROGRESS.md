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
- The per-issue driver can dispatch a card whose "Blocked by" dependency is only merged on another open loop PR (not main) — check the issue body's Blocked-by against merged state before building (#57 vs PR #86).
- [2026-07-18T22:11:26Z] iter 1/10 → c9c04f6  cost=$1.3546060000000002 duration=87580ms
- learning: the per-issue driver (loop-issues.sh) exports its control vars (ONLY, BASE, …) into the agent env, and the loop sandbox tests inherited process.env — so EVERY driver iteration ran verify with 17 loop tests red (sandbox loop.sh targeted the outer ONLY issue, absent from the sandbox board). Fixed by stripping loop control vars in test/helpers/loop-sandbox.mjs; if loop.sh grows a new env knob, add it to LOOP_VARS there.
- [2026-07-18T22:24:59Z] iter 1/10 → 1399735  cost=$4.6109729999999995 duration=657059ms
