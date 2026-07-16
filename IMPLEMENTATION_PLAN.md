# Implementation plan

The loop reads this every build iteration, does the top unchecked task, checks it
off, and commits. Keep it accurate and ordered by priority. When empty, the loop
stops (the agent writes `.loop/DONE`).

## Backpressure hardening (do first — makes the loop safer)

- [x] Add ESLint flat config (`eslint.config.js`) + `lint` script, then fold
      `npm run lint` into `verify`. Start with `eslint:recommended` + react-hooks;
      fix or `// eslint-disable` real hits until `eslint .` is green. Why: catches
      undefined vars / unused / bad hook deps that typecheck misses.
      Done: `eslint.config.mjs` (recommended + react-hooks recommended-latest on
      renderer, plus `eslint-plugin-react`'s `jsx-uses-vars` so JSX-only imports
      aren't flagged unused). Removed a genuinely unused `React` import in
      App.jsx; two intentional patterns (effect-driven UI reset on provider
      change, ref reassigned every render for a stable keydown listener) got
      targeted `eslint-disable-next-line` with a reason. `lint` now runs before
      `test`/`build` in `verify`.
- [ ] Enable the gitleaks pre-commit hook in a way the loop can't bypass, or add
      a `verify`-time secret scan. Why: `--dangerously-skip-permissions` runs
      unattended; a leaked key must be blocked, not just discouraged.

## Test coverage (raise the floor so regressions are caught)

- [ ] Add `test/transform.test.mjs` covering `transform()` payload handling: empty
      input throws, each action routes to the right prompt shape (mock `ask`).
      Why: transform is core logic with zero tests today.
- [ ] Add tests for `providers.js` error mapping (`noKey` sets `code: 'NO_KEY'`;
      SDK errors become user-facing messages). Why: error paths are user-visible.

## Notes

- UI behaviour (overlay over fullscreen, hotkey capture, paste-back) is NOT
  machine-verifiable here — do not add loop tasks that depend on it. Flag such
  work for human review instead.
