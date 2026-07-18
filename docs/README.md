# Blue Pencil — docs

> Status: current · Updated: 2026-07-19

Docs are grouped by type ([Diátaxis](https://diataxis.fr)): how-to guides for
doing a task, reference for looking something up, explanation for the why,
decisions for locked calls with a rationale. No tutorials — this is a
single-user personal tool, not a product onboarding new users.

This table is also the staleness dashboard: if a doc's `Status` line goes
stale, fix the doc, not this row.

## How-to

| Doc | Status | Purpose |
|---|---|---|
| [`how-to/develop.md`](./how-to/develop.md) | current | Run the app locally, the `verify` gate. |
| [`how-to/build-and-install.md`](./how-to/build-and-install.md) | current | Build the unsigned `.dmg` and install it locally. |
| [`how-to/use-the-hotkey.md`](./how-to/use-the-hotkey.md) | current | Use the global hotkey from any app. |

## Reference

| Doc | Status | Purpose |
|---|---|---|
| [`reference/architecture.md`](./reference/architecture.md) | current | Process model, complete IPC channel list, window/tray lifecycle. |
| [`reference/providers.md`](./reference/providers.md) | current | Provider registry, key storage, adding a provider. |
| [`reference/hotkey-behavior.md`](./reference/hotkey-behavior.md) | current | The locked hotkey-popover interaction contract. |

## Explanation

| Doc | Status | Purpose |
|---|---|---|
| [`explanation/product.md`](./explanation/product.md) | current | What Blue Pencil is, who it's for, current scope vs. roadmap. |
| [`explanation/design-language.md`](./explanation/design-language.md) | current | Design rationale, anti-drift guardrails, microcopy, a11y floor. |

## Decisions

| ADR | Status | Title |
|---|---|---|
| [`decisions/0001-electron-plainjs-stack.md`](./decisions/0001-electron-plainjs-stack.md) | Accepted | Electron + plain JavaScript with JSDoc typechecking |
| [`decisions/0002-menu-bar-accessory-overlay.md`](./decisions/0002-menu-bar-accessory-overlay.md) | Accepted | Menu-bar accessory app so the overlay works over fullscreen |
| [`decisions/0003-global-hotkey-grab-osascript.md`](./decisions/0003-global-hotkey-grab-osascript.md) | Accepted | Staged global-hotkey grab; keystroke synthesis via osascript |
| [`decisions/0004-settings-in-main-process-store.md`](./decisions/0004-settings-in-main-process-store.md) | Accepted | Provider/model selection lives in a main-process settings store |
| [`decisions/0005-markdown-interchange-universal-dual-write.md`](./decisions/0005-markdown-interchange-universal-dual-write.md) | Accepted | Markdown as interchange format; universal dual-write on delivery |
| [`decisions/0006-provider-registry-openai-compatible.md`](./decisions/0006-provider-registry-openai-compatible.md) | Accepted | Provider registry: native Anthropic SDK + shared OpenAI-compatible client |
| [`decisions/0007-dependency-free-secret-scan.md`](./decisions/0007-dependency-free-secret-scan.md) | Accepted | Dependency-free secret scan inside `npm run verify` |

## Retired

The old `docs/phase2/*` build specs (phase build notes, not user-facing docs)
are gone. Their locked decisions are now the ADRs above; their still-relevant
mechanics live in `reference/` (architecture, providers, hotkey behavior) and
`explanation/` (product scope). `hotkey-interaction.md` was moved to
[`reference/hotkey-behavior.md`](./reference/hotkey-behavior.md) before the
rest were retired.
