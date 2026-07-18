# 0004 — Provider/model selection lives in a main-process settings store

> Status: Accepted · Updated: 2026-07-19

## Context

The hotkey overlay is a second `BrowserWindow` with its own renderer.
`localStorage` is per-renderer, so a provider/model choice made in the main
window was invisible to the overlay — a whole class of desync bugs, and a
blocker for the overlay ever agreeing with the main window on what "the
active provider" means.

## Decision

Move the active provider id and per-provider model strings out of renderer
`localStorage` into a main-process JSON store, exposed over IPC and broadcast
to every window on change.

Verified against shipped code:
- `src/main/settings.js` — dumb persistence only (`getSettings`,
  `setProviderId`, `setModelId`), atomic write via temp-file-then-rename,
  under `userData`. No defaults, no validation — and no secrets: the file
  holds only the provider id and model strings, never API keys (comment at
  the top of the file states this explicitly; keys stay in the Keychain).
- `src/main/providers.js` — owns the registry and therefore the defaults/
  validation: `resolveActive()` and `effectiveSettings()` reconcile stored
  values against `REGISTRY`, falling back to the first provider / that
  provider's `defaultModel` when a stored value is missing or stale.
- `src/main/index.js` — `settings:get` / `settings:setProvider` /
  `settings:setModel` IPC handlers, plus `broadcastSettings()` pushing
  `settings:changed` to every `BrowserWindow` after a write.
- `src/main/transform.js`'s payload no longer carries `provider`/`model` —
  `transform` resolves them itself via `resolveActive()`.

## Consequences

- Both windows (main + overlay) read the same source of truth and stay live
  in sync via the broadcast — no polling, no per-window copy to reconcile.
- A stale or hand-edited `settings.json` (unknown provider id) degrades to
  the first registry provider rather than erroring.
- One more IPC round-trip on every provider/model change, in exchange for
  removing the desync bug class entirely.

## Alternatives considered

Renderer `localStorage` — the pre-refactor state. Rejected because it is
strictly per-`BrowserWindow`: there is no way for the overlay's renderer to
read a value set in the main window's `localStorage` without either a second
copy (re-introducing desync) or a sync channel — at which point it's simpler
to make main the single source of truth from the start, which is what
shipped.
