# AGENTS.md — operational guide for the loop

Blue Pencil is an Electron (main + preload + React renderer) macOS writing
assistant. Plain JS with JSDoc-based typechecking. Keep this file short — it is
loaded every iteration.

## Commands (the backpressure gate)

- `npm run verify` — typecheck + lint + secret-scan + tests + build. **Enforced by a
  pre-commit hook** (`scripts/githooks/pre-commit`, wired via `npm install`), so a red
  gate blocks the commit itself. Humans bypass with `git commit -n`; the loop bypasses
  it only for its own docs-only PROGRESS.md telemetry commit, never for a card fix.
- `npm run typecheck` — `tsc -p tsconfig.json` (checkJs mode; fast, use while iterating).
- `npm run lint` — `eslint .`.
- `npm test` — `node --test` unit tests.
- `npm run build` — `electron-vite build`.

No e2e — Electron UI behaviour (overlay on a fullscreen Space, paste-back) is NOT
machine-verifiable here. Do not claim UI behaviour works from a green `verify`; only
claim what the gate actually checks. That is what `v:auto` vs `v:human` encodes: a
`v:auto` card needs a test that FAILS when the behaviour is wrong — a prompt-string
assertion that can't fail on bad output is not enough (see the v:auto policy below).

## Layout

- `src/main/` — Electron main process (tray, windows, IPC handlers, transform).
- `src/preload/index.js` — the ONLY renderer↔main bridge (`window.api`). If you
  change it, update `types/globals.d.ts` to match or typecheck breaks.
- `src/renderer/src/` — React UI (App, HotkeyPopover, ActionPanel, Markdown).
- `src/shared/tokens.js` — design tokens, imported as `@tokens`.
- `test/*.test.mjs` — unit tests.

## Rules

- Semicolon-free style (ASI). Match surrounding code.
- No new dependencies without a clear need — a few lines beats a package.
- Comments only where intent isn't obvious; this repo is comment-light.
- Record durable operational learnings here; never progress notes (those go in
  IMPLEMENTATION_PLAN.md).

## Loop harness

- Adding a loop-control env var to `loop.sh` / `loop-issues.sh` (e.g. `ONLY`, `MODEL`,
  `BASE`)? Also add it to `LOOP_VARS` in `test/helpers/loop-sandbox.mjs` — the sandbox
  must strip it, or the harness tests inherit the outer loop's env and go red *only*
  under a targeted (`ONLY=N`) run, passing in a clean shell. (Re-learned 3× on
  2026-07-18 before being captured here.)

## v:auto policy

`verify:auto` means **a test can fail when the behaviour is wrong** — not merely that
a test can be written. A pure function, a state machine, a parser, or a static
*contract* grep (e.g. "no `transition: all` literal", "no hex colour in the renderer")
all qualify: break the behaviour and the test goes red.

What does NOT qualify, and must be `verify:human`: a test that asserts the *shape of a
prompt string* ("the FORMAT instruction contains these words"). It stays green whether
or not the model's output actually changed — it can't fail on bad behaviour, so it
proves nothing. Closed #2/#3/#5 were tagged `v:auto` on exactly this kind of
tautological test; their real verification was deferred to a `v:human` card (#44).
Prompt-wording changes are `v:human` unless you can pin a real behavioural fixture
(e.g. an LLM-judge assertion), and classification is set at label time on GitHub —
`scripts/regen-board.mjs` only projects it.
