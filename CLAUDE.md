# CLAUDE.md

@AGENTS.md is the single source of truth for build/verify commands, layout, and
the v:auto policy. Do not duplicate its rules here — this file only adds
Claude-specific working style.

## Working style in this repo

- **TDD.** For any `v:auto` card, write the failing test FIRST
  (`superpowers:test-driven-development`). A test that can't go red on wrong
  behaviour doesn't count — see the v:auto policy in AGENTS.md.
- **Before a feature or behaviour change:** `superpowers:brainstorming`.
- **On any bug or failing test:** `superpowers:systematic-debugging` — root
  cause, not symptom.
- **Before claiming done or committing:** run `npm run verify` and only claim
  what the gate actually checks (`superpowers:verification-before-completion`).
  UI behaviour on a fullscreen Space is not machine-verifiable — that is
  `v:human`, never claimed green from `verify`.
- **Laziest solution that works** (`ponytail:ponytail`, active by default):
  stdlib and a few lines beat a new dependency. No new deps without clear need.

## Style

- Semicolon-free (ASI); match surrounding code. Comment only where intent isn't
  obvious.
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, …).
