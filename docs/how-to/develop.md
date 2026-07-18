# Develop

> Status: current · Updated: 2026-07-18

```bash
npm install        # native deps (keytar) are rebuilt for Electron via postinstall
npm run dev        # launches the app with hot reload
```

Blue Pencil is a **menu-bar app**: on launch it shows a **✎** in the menu bar
and **no window** (except first run, when no key is stored yet — then it
opens for key entry). Open the writing window from the tray menu or with the
hotkey; closing the window hides it (Quit is in the tray). See
[`reference/architecture.md`](../reference/architecture.md#window--tray-lifecycle)
for why.

Pick a provider from the dropdown in the top bar, then paste that provider's
key into the panel (toggled by the key button). Keys go straight into the
Keychain. You can also seed keys from the environment on first run —
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY` (see
`.env.example`); they're moved into the Keychain and never written to disk.
Details: [`reference/providers.md`](../reference/providers.md).

## The `verify` gate

```bash
npm run verify     # typecheck → lint → secret scan → tests → build, in that order
npm run typecheck  # tsc -p tsconfig.json only (fast; use while iterating)
npm test           # node --test unit tests
```

`npm run verify` **must pass before every commit**. The secret scan
(`scripts/secret-scan.mjs`) runs as part of it and fails the gate if it finds
a likely secret — it scans everything a `git add -A` would commit: **tracked
files plus untracked-but-not-ignored files**, not only tracked ones. Keys
belong in the Keychain (via the picker) or a gitignored `.env`, never in
tracked files.

There is no e2e step — Electron UI behavior (overlay on a fullscreen Space,
paste-back) is not machine-verifiable here. A green `verify` proves
lint/type/test/build, not that the UI looks or behaves right.

## Layout

```
docs/            type-based docs tree (see docs/README.md)
prototypes/      original web + floating UI prototypes (reference only)
build/           macOS entitlements + icon
src/
  shared/        tokens.js — design tokens (main + renderer)
  main/          Electron main: window, tray, IPC, providers, settings, keychain
  preload/       contextBridge → window.api
  renderer/      React UI (index.html + src/)
```
