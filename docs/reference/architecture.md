# Architecture

> Status: current · Updated: 2026-07-18

## Stack

Electron (main + preload + React renderer), plain JavaScript with JSDoc-based
typechecking (`tsc -p tsconfig.json`, no `.ts` files) — chosen for fastest path
given existing Electron experience over introducing a TypeScript build step
for a single-developer tool. See `docs/decisions/` for the ADR once commit 3
lands it.

## Process & data flow

```
renderer (React)         surface + floating popover + provider picker
   │  IPC: "transform"({ text, action, tone }) → { ok, result } | { ok:false, code, message }
   ▼
main process             resolves the active provider/model from settings,
   │                     reads that provider's key from the macOS Keychain
   ▼
provider registry        ask({ provider, model, prompt }) → string
                         Anthropic (native SDK) · OpenAI · Groq · Gemini
                         (the last three via the OpenAI-compatible API)
```

The renderer never sees the key, the provider client, or the network — it
sends a semantic action over IPC and renders the result. Two renderers exist:
the main window (`src/renderer/`) and the hotkey overlay (a separate
`BrowserWindow` + renderer, same preload) — see [Window & tray
lifecycle](#window--tray-lifecycle) and
[`hotkey-behavior.md`](./hotkey-behavior.md) for why the overlay is a second
renderer and how the two stay in sync on provider/model selection.

## Key modules

- `src/main/keychain.js` — one Keychain account per provider, all under the
  `BluePencil` service.
- `src/main/providers.js` — the provider registry + active-selection
  resolvers. Add a provider here; nothing else changes.
- `src/main/settings.js` — non-secret selection store (active provider +
  per-provider model) under `userData`.
- `src/main/transform.js` — prompt construction; resolves the active
  provider/model itself.
- `src/main/index.js` — window + tray creation, all IPC handler registration.
- `src/main/hotkey.js` — registers the global shortcut, grabs the selection,
  shows the overlay.
- `src/main/overlay.js` — the hotkey popover's `BrowserWindow` (frameless,
  transparent, always-on-top, visible on fullscreen Spaces).
- `src/main/automation.js` — paste-back, clipboard writes, Accessibility
  permission requests/checks, app relaunch.
- `src/main/navigation-guard.js` / `src/main/ipc-guard.js` — classify
  "our own page" once and use it to block cross-origin navigation and to gate
  the destructive IPC endpoints to trusted senders only.
- `src/preload/index.js` — the only renderer↔main bridge (`window.api`).
- `src/shared/tokens.js` — design tokens shared by main and renderer.
- `src/renderer/` — React UI adapted from `prototypes/writing-desk-floating.jsx`.

## IPC channels

Complete list, read from `src/main/index.js`, `src/main/ipc-guard.js`, and
`src/preload/index.js` (renderer-facing names in `window.api`) — the old
README's list was partial.

| Channel | Kind | Direction | Handler | Notes |
|---|---|---|---|---|
| `transform` | `invoke` | renderer → main | `index.js` | Runs the prompt, returns `{ ok, result }` or `{ ok:false, code, message }`. |
| `providers:list` | `invoke` | renderer → main | `index.js` | Registered providers. |
| `key:has` | `invoke` | renderer → main | `index.js` | Whether a key is stored for a provider. |
| `key:set` | `invoke` | renderer → main | `ipc-guard.js` | Guarded: trusted top frame only. |
| `settings:get` | `invoke` | renderer → main | `index.js` | Current provider/model settings. |
| `settings:setProvider` | `invoke` | renderer → main | `index.js` | Broadcasts `settings:changed` on success. |
| `settings:setModel` | `invoke` | renderer → main | `index.js` | Broadcasts `settings:changed` on success. |
| `settings:changed` | `send` | main → renderer | — | Pushed to every window after a settings write. |
| `popover:ready` | `send` (`on`) | renderer → main | `index.js` | Overlay renderer signals its listeners are attached. |
| `popover:show` | `send` | main → renderer | — | Delivers a fresh capture (`text`, `accessibility`, `markdown`) to the overlay. |
| `popover:resize` | `send` (`on`) | renderer → main | `index.js` | Overlay reports its content size so the window can hug it. |
| `popover:dismiss` | `send` (`on`) | renderer → main | `index.js` | Overlay asks to be hidden. |
| `clipboard:write` | `invoke` | renderer → main | `index.js` | Raw clipboard write. |
| `clipboard:writeResult` | `invoke` | renderer → main | `index.js` | Rich (Markdown + plain) clipboard write for copy-mode delivery. |
| `hotkey:pasteBack` | `invoke` | renderer → main | `ipc-guard.js` | Guarded: trusted frame + overlay must be visible. Pastes into the source app, then hides the overlay. |
| `accessibility:request` | `invoke` | renderer → main | `index.js` | Requests the Accessibility permission prompt. |
| `accessibility:openSettings` | `send` (`on`) | renderer → main | `index.js` | Opens System Settings' Accessibility pane; suppresses overlay blur-dismiss while it's open. |
| `accessibility:relaunch` | `send` (`on`) | renderer → main | `ipc-guard.js` | Guarded: trusted frame only. Relaunches the app so a newly-granted permission takes effect. |

## Window & tray lifecycle

Blue Pencil is a **menu-bar (accessory) app** — `LSUIElement: true` in the
packaged build's `package.json` config, plus `app.dock?.hide()` at runtime for
the dev binary. This is deliberate: a *regular* app forces macOS to switch
Spaces when its window shows/focuses, which kicks the user out of a
fullscreen Space. An accessory app owns no Space, so the hotkey overlay can
appear over a fullscreen app without a Space-flip. See
[`docs/phase2/menu-bar-app.md`](../phase2/menu-bar-app.md) for the full
before/after reasoning (kept for context; not deleted by this restructure).

- **On launch:** no window shown, tray icon (`✎`) created. Exception: first
  run with no key stored for any provider opens the window so key entry
  works (`index.js`, `app.whenReady`).
- **Closing the window hides it**, it does not quit — `mainWindow.on('close', ...)`
  calls `e.preventDefault()` + `hide()` unless `app.isQuitting` is set. Window
  bounds are saved to `userData/window-bounds.json` first.
- **Quit** happens only via the tray's "Quit Blue Pencil" item, which sets
  `app.isQuitting = true` then `app.quit()`. `app.on('before-quit')` also sets
  the flag, so every quit path (tray, relaunch/Restart, macOS logout/shutdown)
  lifts the hide-on-close veto, not just the tray item.
- **`window-all-closed` is a no-op on macOS** — the app is meant to outlive
  its windows as a menu-bar resident.
- **The hotkey overlay** (`overlay.js`) is a second `BrowserWindow`: frameless,
  transparent, `alwaysOnTop(true, 'screen-saver')`,
  `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`. It's
  created lazily and hidden (not destroyed) between summons so renderer state
  persists; a `did-start-loading` / `render-process-gone` listener resets a
  `rendererReady` flag so a summon never flushes into a dead renderer.
- **The hotkey** (`hotkey.js`) toggles the overlay: a second press while it's
  visible dismisses it. Firing while a Blue Pencil window is itself focused is
  a deliberate no-op (don't summon over our own UI).
