# Blue Pencil

A personal macOS writing assistant — a single writing surface with a floating
assistant that opens on click, anchored to the text box. On-demand proofreading,
rewriting, tone adjustment, and summarization, powered by an LLM you supply the
key for.

This is the **Phase 1** scaffold per [`DESIGN.md`](./DESIGN.md): an Electron shell
wrapping the renderer prototype, with the API key held in the macOS Keychain and
real model calls made in the main process over IPC.

## Architecture

```
renderer (React)         surface + floating popover + provider picker
   │  IPC: "transform"({ text, action, tone, provider, model }) → result
   ▼
main process             owns the API keys; makes the model call
   │  reads the active provider's key from the macOS Keychain
   ▼
provider registry        ask({ provider, model, prompt }) → string
                         Anthropic (native SDK) · OpenAI · Groq · Gemini
                         (the last three via the OpenAI-compatible API)
```

- **`src/main/keychain.js`** — one Keychain account per provider, all under the `BluePencil` service.
- **`src/main/providers.js`** — the provider registry. Add a provider here; nothing else changes.
- **`src/main/transform.js`** — provider-agnostic prompt construction.
- **`src/main/index.js`** — window + IPC handlers (`transform`, `providers:list`, `key:has`, `key:set`).
- **`src/preload/index.js`** — the only renderer↔main bridge (`window.api`).
- **`src/renderer/`** — React UI adapted from `writing-desk-floating.jsx`.

The renderer never sees the key, the provider, or the network — it sends a
semantic action over IPC and renders the result.

## Develop

```bash
npm install        # native deps (keytar) are rebuilt for Electron via postinstall
npm run dev        # launches the app with hot reload
```

Pick a provider from the dropdown in the top bar, then paste that provider's key
into the panel (toggled by the key button). Keys go straight into the Keychain.
You can also seed keys from the environment on first run —
`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `GEMINI_API_KEY` (see
`.env.example`); they're moved into the Keychain and never written to disk.

Default model ids per provider live in `src/main/providers.js` and are
overridable from the picker — confirm the current ids for OpenAI/Groq/Gemini,
since those move fast. To add a provider, add one entry to that file.

A gitleaks pre-commit hook guards against committing secrets — enable it with
`pip install pre-commit && pre-commit install`. Keys belong in the Keychain (via
the picker) or a gitignored `.env`, never in tracked files.

## Build a macOS app

```bash
npm run dist       # produces a .dmg in dist/
```

Code signing and notarization require an Apple Developer certificate; they are
configured in `package.json` → `build.mac` but are part of **Phase 2** along with
the settings pane, local-spellcheck-first pass, diff view, global hotkey, and
auto-update.
