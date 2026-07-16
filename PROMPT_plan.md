# Ralph plan loop — regenerate the board from GitHub, do NOT write code

You are one planning iteration with a FRESH context. Your only job is to rebuild
the GitHub block of `IMPLEMENTATION_PLAN.md` from the live issues. Do NOT implement
anything. Do NOT touch source files.

## The board is generated from GitHub labels

Classification is canonical on GitHub, not in the file:
- `epic:A`..`epic:E` — which section a card belongs to (parents #6/#14/#23/#31/#36
  are the section headers, not cards).
- `verify:auto` — loop-eligible. `verify:human` — manual queue (kept visible).
- `severity:*` — sort order within a section (critical → high → medium → low → none).

## Do this

1. Read `AGENTS.md` and the current `IMPLEMENTATION_PLAN.md`.
2. Pull open issues: `gh issue list --state open --limit 100 --json number,title,labels`.
3. For each non-parent issue build one card line, preserving the existing marker if
   the card is already `[x]`/`[!]` (don't un-finish completed work):
   `- [ ] #N  <title>   · sev:<level> · v:auto|v:human`
   An issue with no `epic:*` goes under `## Ungrouped`. An issue missing a
   `verify:*` label is a classification gap — list it under Ungrouped as `v:human`
   and note it (a human must tag it; never guess `v:auto`).
4. Order cards within each section by severity, then by number.
5. Replace ONLY the text between `<!-- GH:BEGIN ... -->` and `<!-- GH:END -->`.
   Leave the header and the "Loop infrastructure" section untouched.
6. You MAY commit just `IMPLEMENTATION_PLAN.md` (a `docs:` commit) or leave it for
   review. Do not commit anything else.

## Guardrails

- Scope lives on GitHub labels, set at planning time — never rely on the build loop
  to filter cards at runtime.
- Default unknown classification to `v:human`. It is safe to skip a fixable card;
  it is not safe to auto-"fix" a visual one.
- Don't invent cards that have no GitHub issue (except the fixed Loop-infrastructure
  section, which is local and hand-maintained).
