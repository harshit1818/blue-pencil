# Blue Pencil

A personal macOS writing assistant — a single writing surface with a floating
assistant that opens on click, anchored to the text box. On-demand
proofreading, rewriting, tone adjustment, and summarization, powered by an
LLM you supply the key for. A global hotkey (`⌘⇧'`) brings the same assistant
to any app, including fullscreen ones.

Electron (main + preload + React renderer), plain JavaScript with JSDoc-based
typechecking. The API key lives in the macOS Keychain; model calls happen in
the main process over IPC — the renderer never sees the key, the provider
client, or the network.

## Quickstart

```bash
npm install        # native deps (keytar) rebuilt for Electron via postinstall
npm run dev         # run it, with hot reload
npm run dist        # build an unsigned Blue Pencil.dmg in dist/
```

## Documentation

Docs are grouped by type under [`docs/`](./docs/README.md) — the linked index
is also the staleness dashboard.

- **How-to** — [develop](./docs/how-to/develop.md) ·
  [build & install](./docs/how-to/build-and-install.md) ·
  [use the hotkey](./docs/how-to/use-the-hotkey.md)
- **Reference** — [architecture](./docs/reference/architecture.md) ·
  [providers](./docs/reference/providers.md) ·
  [hotkey behavior](./docs/reference/hotkey-behavior.md)
- **Explanation** — [product](./docs/explanation/product.md) ·
  [design language](./docs/explanation/design-language.md)
- **Decisions** — [`docs/decisions/`](./docs/decisions/) (ADRs)

## Contributing

This is a personal, single-user tool, not open for outside contribution — but
if you're the future maintainer (human or loop agent) picking this back up:

- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`, …); see
  [`AGENTS.md`](./AGENTS.md) for the loop's operational rules.
- `npm run verify` (typecheck → lint → secret scan → tests → build) **must
  pass before every commit**. The secret scan covers tracked *and*
  untracked-not-ignored files, not only tracked ones.
- Semicolon-free style (ASI); match surrounding code. Comments only where
  intent isn't obvious.

## License

Private, all rights reserved — see [`LICENSE`](./LICENSE).
