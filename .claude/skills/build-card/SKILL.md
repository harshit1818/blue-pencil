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
6. Run `npm run verify` (typecheck + lint + secret-scan + test + build). It MUST
   pass. If you CANNOT make it pass, you are about to block — first ask the human,
   ONCE, since they may redirect you from their phone. Ask ONLY here, at a real
   block (never for routine choices you can make yourself):
   ```
   ans="$(scripts/ask-human.sh "Blocked on #N: <one-line reason>." "<approach A you'd try next>" "<approach B>" "block it for now")"
   ```
   It posts to Slack and waits (up to ~15m) for a reply.
   - If `$ans` is a direction (non-empty and not "block it for now"), follow it and
     re-run verify. If verify now passes, proceed to step 7 as normal.
   - If `$ans` is "block it for now", or the command exits non-zero (no answer, timed
     out, or Slack not configured), then BLOCK: revert your CODE changes, flip the
     card `[ ]` → `[!]` with a one-line blocker note, and commit ONLY that board edit
     (`docs(board): block #N — <reason>`). Committing the block (not leaving it in the
     working tree) keeps the blocker in git, leaves a clean tree for the next
     iteration, and moves HEAD so the loop advances instead of counting a stall.
   Never commit broken code, and never loop the ask — one question, then act.
7. Update the board: flip the card `[ ]` → `[x]`. Add any follow-ups/bugs you found
   as new cards with the right `v:auto`/`v:human` tag.
8. Commit. One card = one commit. Conventional Commits style. Put `Closes #N` in
   the body so merging the branch auto-closes the GitHub issue. No `Co-Authored-By`.
9. Write `.loop/pr-body.md` so the pull request reads as ordinary engineering work —
   follow the **PR writing** reference appended below for the exact format. Write it
   ONLY for a card you completed (step 7 flipped to `[x]`); a blocked `[!]` card writes
   none.
10. If you learned something durable this iteration (a wrong assumption you had to
   correct, a command that needed fixing, a non-obvious gotcha), append ONE line to
   `PROGRESS.md` so the next fresh context inherits it. `loop.sh` records the
   telemetry line itself — you add only the learning. Durable *operational* rules
   (build/test commands) still go in `AGENTS.md`, not here.

## When the board is clear

If NO `[ ]` `v:auto` cards remain (only `v:human`, `[x]`, or `[!]`), do NOT invent
work and do NOT touch `v:human` cards. Run `touch .loop/DONE` and stop. Left-over
`v:human` cards are the expected finish — they are the human's queue.

## Hard rules

- One `v:auto` card per iteration. Never a `v:human` card. Scope discipline is the point.
- NEVER checkout, create, switch, merge, or fast-forward branches — you are already on
  the correct branch (loop.sh guards this and aborts if the checkout moves). If you
  cannot work on the current branch, stop and note why on the board.
- Never commit if `verify` is red. The pre-commit hook enforces this — it is the gate,
  not this instruction.
- `verify` proves lint/type/test/build — NOT that a UI looks right. That is exactly
  why `v:human` cards exist and why you must not claim to have fixed one.
- Never `git push` (loop.sh pushes after a clean commit). Don't touch out/ or dist/.
- Match the repo's semicolon-free, comment-light style.
