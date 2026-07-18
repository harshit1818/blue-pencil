# Blue Pencil — docs

> Status: current · Updated: 2026-07-18

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

Populated in the ADR pass (commit 3 of this restructure). Will index locked
architectural decisions (e.g. Electron + plain JS/JSDoc, menu-bar/accessory
app, provider abstraction) as one ADR per decision under `decisions/`.

## Not migrated here

`docs/phase2/*` (except `hotkey-interaction.md`, moved to
`reference/hotkey-behavior.md`) are phase build specs, not user-facing docs —
commit 3 converts the still-relevant ones to ADRs and retires the rest.
