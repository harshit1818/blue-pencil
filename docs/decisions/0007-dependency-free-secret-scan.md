# 0007 — Dependency-free secret scan inside `npm run verify`

> Status: Accepted · Updated: 2026-07-19

## Context

`verify` can run unattended (e.g. a `--dangerously-skip-permissions` loop
iteration) and needs a gate that stops a commit from shipping a leaked
provider API key, without adding an external tool dependency that a fresh,
sandboxed checkout might not have available (no brew/pip install step).

## Decision

`scripts/secret-scan.mjs` — a pure Node, dependency-free regex scan over
everything a `git add -A` would commit (tracked + untracked-not-ignored, via
`git ls-files -z --cached --others --exclude-standard`), wired into
`npm run verify` after `typecheck`/`lint` and before `test`/`build`.

Verified against shipped code:
- `package.json` → `"verify": "npm run typecheck && npm run lint && node
  scripts/secret-scan.mjs && npm test && npm run build"`.
- `scripts/secret-scan.mjs` → six patterns (`sk-...`, AWS `AKIA...`, GitHub
  `gh[pousr]_...`, Google `AIza...`, Slack `xox[baprs]-...`, PEM private-key
  blocks); exits non-zero and prints `file:line — possible <name>` on any hit.
- Explicitly marked in-code as a deliberate simplification: `// ponytail:
  regex scan of would-be-committed files, swap in gitleaks if patterns fall
  short.`

## Consequences

- `verify` stays hermetic — it only needs `node` and `git`, both already
  required to run the rest of the gate, so it works the same in a fresh
  unattended checkout as it does locally.
- The pattern list is fixed, not exhaustive: a secret shape that doesn't
  match one of the six patterns is not caught. The upgrade path is named in
  the code comment (swap in gitleaks) rather than built pre-emptively.

## Alternatives considered

`gitleaks` + a pre-commit hook — rejected to keep `verify` hermetic: gitleaks
is a separate binary (brew/direct-download install), which an unattended
sandboxed loop run may not have and shouldn't need just to run `npm run
verify`; a git pre-commit hook also wouldn't cover a scan invoked directly via
`npm run verify` outside a commit. `IMPLEMENTATION_PLAN.md`'s own loop-
infrastructure note records this exact tradeoff: "Shipped as dependency-free
`scripts/secret-scan.mjs` instead of gitleaks — no brew dep, verify stays
hermetic; swap in gitleaks if patterns fall short."
