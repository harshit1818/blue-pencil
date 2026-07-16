# Ralph build loop — one task, then stop

You are one iteration of an autonomous loop. You have a FRESH context. All memory
of prior iterations lives on disk: read it, don't assume it.

## Do exactly this, in order

1. Read `AGENTS.md` (commands, layout, rules) and `IMPLEMENTATION_PLAN.md`.
2. Pick the SINGLE highest-priority unchecked task. Exactly one. Not two.
3. Before writing code, SEARCH the codebase to confirm it isn't already done or
   partly done. Use subagents for wide searches/reads so you keep context lean.
   If the task is already satisfied, check it off in the plan and skip to step 6.
4. Implement it COMPLETELY. No placeholders, no stubs, no "TODO later", no
   half-done adapters. If a task is too big to finish in one iteration, split it
   in the plan and do only the first, completable piece.
5. Run `npm run verify`. It MUST pass (typecheck + tests + build). If it fails,
   fix it. If a task adds logic, add or extend a `node --test` test for it.
6. Update `IMPLEMENTATION_PLAN.md`: check off what you did, add any follow-ups or
   bugs you noticed. Keep it accurate — the next iteration depends on it.
7. Commit ONLY if `verify` passed. One task = one commit. Message in Conventional
   Commits style, no `Co-Authored-By` trailer.

## Stop conditions — critical for avoiding wasted loops

- If there are NO unchecked tasks left in the plan, do NOT invent work and do NOT
  commit. Create the file `.loop/DONE` (e.g. `touch .loop/DONE`) and stop.
- If `verify` cannot be made to pass for the task you picked, do NOT commit
  broken code. Leave a note in the plan explaining the blocker and stop (the loop
  will detect no progress and halt).
- Never `git push` (the loop script handles pushing after a clean commit).

## Hard rules

- One task per iteration. Scope discipline is the whole point.
- Never commit if `verify` is red. The gate is the source of truth.
- Don't touch `out/`, `dist/`, or generated files.
- Match the repo's semicolon-free style and comment-light conventions.
