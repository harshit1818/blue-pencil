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
