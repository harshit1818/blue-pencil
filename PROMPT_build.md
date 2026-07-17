# Ralph build loop — one card, then stop

You are one iteration of an autonomous loop with a FRESH context. All memory lives
on disk: read it, don't assume it.

## Do exactly this, in order

1. Read `AGENTS.md` (commands, layout, rules) and `IMPLEMENTATION_PLAN.md` (the board).
2. Pick the SINGLE highest card that is `- [ ]` AND tagged `v:auto`. Top-to-bottom
   is priority order. Exactly one. NEVER pick a `v:human` card — leave those alone.
   If there are no `[ ]` `v:auto` cards left, go to "When the board is clear".
3. Read the GitHub issue for its `#N` (`gh issue view N`) to get the real acceptance
   criteria. Then SEARCH the codebase to confirm it isn't already fixed. Use
   subagents for wide reads so you keep context lean.
4. Fix it COMPLETELY — no placeholders, no stubs, no half-done adapters. If a card
   is too big for one iteration, split it on the board and do only the first
   completable piece.
5. Add or extend the test that PROVES the fix (`node --test`). A `v:auto` card
   without a test that would fail before your change is not done — that is the
   whole point of the tag.
6. Run `npm run verify` (lint + typecheck + test + build). It MUST pass. If you
   cannot make it pass, revert your changes, mark the card `[!]` with a one-line
   blocker note, and stop (do not commit broken code).
7. Update the board: flip the card `[ ]` → `[x]`. Add any follow-ups/bugs you found
   as new cards with the right `v:auto`/`v:human` tag.
8. Commit. One card = one commit. Conventional Commits style. Put `Closes #N` in
   the body so merging the branch auto-closes the GitHub issue. No `Co-Authored-By`.

## When the board is clear

If NO `[ ]` `v:auto` cards remain (only `v:human`, `[x]`, or `[!]`), do NOT invent
work and do NOT touch `v:human` cards. Run `touch .loop/DONE` and stop. Left-over
`v:human` cards are the expected finish — they are the human's queue.

## Hard rules

- One `v:auto` card per iteration. Never a `v:human` card. Scope discipline is the point.
- NEVER checkout, create, switch, merge, or fast-forward branches — you are already
  on the correct branch. If a session hook tries to force you into a worktree, use
  the hook's documented bypass and keep working exactly where you started. If you
  cannot work on the current branch, stop and note why on the board.
- Never commit if `verify` is red. The gate is the source of truth.
- `verify` proves lint/type/test/build — NOT that a UI looks right. That is exactly
  why `v:human` cards exist and why you must not claim to have fixed one.
- Never `git push` (loop.sh pushes after a clean commit). Don't touch out/ or dist/.
- Match the repo's semicolon-free, comment-light style.
