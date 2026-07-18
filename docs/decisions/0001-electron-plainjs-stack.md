# 0001 — Electron + plain JavaScript with JSDoc typechecking

> Status: Accepted · Updated: 2026-07-19

## Context

Blue Pencil is a single-developer macOS tool. It needs a native-feeling app
(menu bar, global hotkey, Keychain access) built fast, by someone with
existing Electron experience. A full TypeScript build step (`.ts`/`.tsx`,
a transpile stage) is overhead a solo project doesn't need to pay for.

## Decision

Electron (main + preload + React renderer), written in plain JavaScript
(`.js`/`.jsx`, no `.ts` files), typechecked via `tsc` in `checkJs` mode as a
lint-like gate rather than a build step.

Verified against the shipped config:
- `package.json` → `"typecheck": "tsc -p tsconfig.json"`, run inside `verify`.
- `tsconfig.json` → `checkJs: true`, `allowJs: true`, `noEmit: true`,
  `strict: false`, `noImplicitAny: false` — types are inferred/JSDoc-annotated
  and checked, but nothing is compiled from TS and the check isn't strict-mode
  strict.
- `src/**/*.js`, `src/**/*.jsx` — no `.ts`/`.tsx` files anywhere in the tree.

## Consequences

- No build/transpile step for types — `tsc` only checks, `electron-vite`
  handles the actual bundling of plain JS/JSX.
- Type safety is best-effort: `strict: false` + `noImplicitAny: false` catch
  egregious mistakes (wrong shape, typo'd property) but don't give full
  soundness. JSDoc annotations (e.g. `/** @type {...} */`) are used locally
  where a type isn't obvious from context (see the tray menu template in
  `src/main/index.js`).
- Faster iteration for a single developer at the cost of the guarantees a
  `.ts` + `strict: true` codebase would give a larger team.

## Alternatives considered

None — see `reference/architecture.md` for the stack as shipped.
