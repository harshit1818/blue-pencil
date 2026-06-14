# Writing Desk

A personal macOS writing assistant — a single writing surface with a floating
assistant that opens on click, anchored to the text box. On-demand proofreading,
rewriting, tone adjustment, and summarization, powered by an LLM you supply the
key for.

This is the **Phase 1** scaffold per [`DESIGN.md`](./DESIGN.md): an Electron shell
wrapping the renderer prototype, with the API key held in the macOS Keychain and
real model calls made in the main process over IPC.

## Architecture

```
renderer (React)         the prototype UI: surface + floating popover
   │  IPC: "transform"({ text, action, tone }) → result
   ▼
main process             owns the API key; makes the model call
   │  reads key from the macOS Keychain (never plaintext, never in renderer)
   ▼
provider adapter         the single seam — ask(prompt) → string
                         default: Anthropic (claude-opus-4-8)
```

- **`src/main/keychain.js`** — key stored in the macOS Keychain via `keytar`.
- **`src/main/provider.js`** — the single seam. Swap providers here only.
- **`src/main/transform.js`** — provider-agnostic prompt construction.
- **`src/main/index.js`** — window + IPC handlers (`transform`, `key:has`, `key:set`).
- **`src/preload/index.js`** — the only renderer↔main bridge (`window.api`).
- **`src/renderer/`** — React UI adapted from `writing-desk-floating.jsx`.

The renderer never sees the key, the provider, or the network — it sends a
semantic action over IPC and renders the result.

## Develop

```bash
npm install        # native deps (keytar) are rebuilt for Electron via postinstall
npm run dev        # launches the app with hot reload
```

Provide your key either by pasting it into the in-app banner on first launch, or
by setting `ANTHROPIC_API_KEY` (see `.env.example`) — it's moved into the
Keychain on first run and never written to disk.

To change the model or provider, edit `src/main/provider.js` only.

## Build a macOS app

```bash
npm run dist       # produces a .dmg in dist/
```

Code signing and notarization require an Apple Developer certificate; they are
configured in `package.json` → `build.mac` but are part of **Phase 2** along with
the settings pane, local-spellcheck-first pass, diff view, global hotkey, and
auto-update.
