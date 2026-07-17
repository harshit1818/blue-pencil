# AGENTS.md — operational guide for the loop

Blue Pencil is an Electron (main + preload + React renderer) macOS writing
assistant. Plain JS with JSDoc-based typechecking. Keep this file short — it is
loaded every iteration.

## Commands (the backpressure gate)

- `npm run verify` — typecheck + tests + build. **Must pass before every commit.**
- `npm run typecheck` — `tsc --checkJs` only (fast; use while iterating).
- `npm test` — `node --test` unit tests.
- `npm run build` — `electron-vite build`.

There is no lint step yet and no e2e — Electron UI behaviour (overlay on a
fullscreen Space, paste-back) is NOT machine-verifiable here. Do not claim UI
behaviour works from a green `verify`; only claim what the gate actually checks.

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
