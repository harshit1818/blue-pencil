# Blue Pencil

A personal macOS writing assistant — a single writing surface with a floating
assistant that opens on click, anchored to the text box. On-demand proofreading,
rewriting, tone adjustment, and summarization, powered by an LLM you supply the
key for. 

This is the **Phase 1** scaffold per [`DESIGN.md`](./docs/DESIGN.md): an Electron shell
wrapping the renderer prototype, with the API key held in the macOS Keychain and
real model calls made in the main process over IPC.

## Architecture

```
renderer (React)         surface + floating popover + provider picker
   │  IPC: "transform"({ text, action, tone }) → result
   ▼
main process             resolves the active provider/model from settings,
   │                     reads that provider's key from the macOS Keychain
   ▼
provider registry        ask({ provider, model, prompt }) → string
                         Anthropic (native SDK) · OpenAI · Groq · Gemini
                         (the last three via the OpenAI-compatible API)
```

- **`src/main/keychain.js`** — one Keychain account per provider, all under the `BluePencil` service.
- **`src/main/providers.js`** — the provider registry + active-selection resolvers. Add a provider here; nothing else changes.
- **`src/main/settings.js`** — non-secret selection store (active provider + per-provider model) under `userData`.
- **`src/main/transform.js`** — prompt construction; resolves the active provider/model itself.
- **`src/main/index.js`** — window + IPC handlers (`transform`, `providers:list`, `key:*`, `settings:*`).
- **`src/preload/index.js`** — the only renderer↔main bridge (`window.api`).
- **`src/shared/tokens.js`** — design tokens shared by main and renderer.
- **`src/renderer/`** — React UI adapted from `prototypes/writing-desk-floating.jsx`.

The renderer never sees the key, the provider client, or the network — it sends a
semantic action over IPC and renders the result.

## Layout

```
docs/            DESIGN.md, design-notes.md, phase2/ specs
prototypes/      original web + floating UI prototypes (reference only)
build/           macOS entitlements
src/
  shared/        tokens.js — design tokens (main + renderer)
  main/          Electron main: window, IPC, providers, settings, keychain
  preload/       contextBridge → window.api
  renderer/      React UI (index.html + src/)
```

## Develop

```bash
npm install        # native deps (keytar) are rebuilt for Electron via postinstall
npm run dev        # launches the app with hot reload
```

Blue Pencil is a **menu-bar app**: on launch it shows a **✎** in the menu bar and
**no window** (except first run, when no key is stored yet — then it opens for key
entry). Open the writing window from the tray menu or with the hotkey; closing the
window hides it (Quit is in the tray).

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

## Global hotkey

Press **⌘⇧'** to use Blue Pencil in any app without switching windows.

- **With macOS Accessibility granted:** select text → ⌘⇧' → it copies the
  selection for you → pick an action → the result is pasted back into the app.
- **Without it (default):** copy text (⌘C) → ⌘⇧' → pick an action → the result is
  copied to your clipboard → paste it back (⌘V). An **Enable** link in the popover
  turns on the auto path (grant Accessibility in System Settings, then restart).

Uses whatever provider/key you've set in the app. As a menu-bar (accessory) app it
floats over other apps **including fullscreen** ones. See [`docs/phase2/`](./docs/phase2/)
for the specs.

## Build & install (local, unsigned)

```bash
npm run dist       # builds an unsigned Blue Pencil.dmg in dist/
```

Open the `.dmg`, drag **Blue Pencil** into Applications, and launch it. It's an
unsigned build — fine for your own machine:

- **First launch may be blocked.** Right-click the app → **Open** → **Open**
  (once). If macOS calls it "damaged," clear the quarantine flag:
  `xattr -dr com.apple.quarantine "/Applications/Blue Pencil.app"`.
- **Permissions re-prompt.** The packaged app is a different binary than the dev
  build, so macOS asks for **Accessibility** (and the **Automation** prompt on the
  first auto-grab) again. Grant Accessibility in System Settings, then relaunch.
- **Launch at login** is a checkbox in the menu-bar (✎) menu — tick it so the
  hotkey is always available.

Handing the app to *other* people additionally needs an Apple Developer ID
(code-signing + notarization) and `hardenedRuntime` flipped back on in
`package.json` → `build.mac`. For your own use the unsigned build above is enough.
