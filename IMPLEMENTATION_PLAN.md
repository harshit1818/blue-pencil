# Blue Pencil — work board

Markers: `[ ]` todo · `[~]` doing · `[x]` done · `[!]` blocked
Tags: `v:auto` = machine-verifiable (loop-eligible) · `v:human` = needs eyeballs (loop SKIPS)

**Loop rule:** each build iteration picks the top `[ ]` card tagged `v:auto`, fixes
it, adds the test that makes it verifiable, runs `npm run verify`, commits with
`Closes #N`, and flips the marker to `[x]`. It NEVER touches `v:human` cards —
those stay here as a visible manual queue.

**The circle ends** when no `[ ]` `v:auto` cards remain (loop.sh checks this
deterministically before every iteration and exits). `v:human` cards left over is
the expected finish state, not a failure.

Classification lives on GitHub labels; commits close issues via `Closes #N`.
Regenerate the GH block below: `bash loop.sh plan` (see PROMPT_plan.md).

## Loop infrastructure (local — not GitHub issues)

- [x] v:auto — Add a `verify`-time secret scan so an unattended
      `--dangerously-skip-permissions` run can't commit a leaked key.
      (Shipped as dependency-free `scripts/secret-scan.mjs` instead of gitleaks —
      no brew dep, verify stays hermetic; swap in gitleaks if patterns fall short.)
- [x] v:auto — `test/transform.test.mjs`: empty input throws; each action routes
      to the right prompt shape (mock `ask`).
      (transform() now takes an optional injected `call`; providers.js is loaded
      lazily so tests never touch electron/keytar.)
- [x] v:auto — `test/providers.test.mjs`: `noKey` sets `code:'NO_KEY'`; SDK errors
      map to user-facing messages.
      (Pure helpers extracted to `src/main/provider-errors.js` so the test loads
      without electron/keytar — same lazy pattern as transform.js.)

<!-- GH:BEGIN — everything below is regenerated from GitHub; edit labels, not lines -->

## A — Window & overlay state management (#6)

- [ ] #7  A1  Overlay grows off the bottom of the screen when a result loads  · sev:high · v:human
- [ ] #8  A2  Overlay positioned using the previous summon's stale size  · sev:medium · v:human
- [ ] #46  A8  Re-pressing the hotkey with text selected sometimes shows the empty-state hint  · sev:medium · v:human
- [ ] #51  A10  Extract overlay clamp geometry as a pure tested helper (groundwork for #7/#1/#8)  · sev:medium · v:auto
- [ ] #47  A9  Make the hotkey overlay draggable via a header grab strip  · sev:low · v:human

## B — Renderer state & component architecture (#14)

- [ ] #15  B1  ~130 lines of hand-synced duplication between App.jsx and HotkeyPopover.jsx  · sev:medium · v:human
- [ ] #18  B4  Overlay global Enter handler double-fires against focused buttons  · sev:medium · v:human
- [ ] #19  B5  Stale shortcut comment ("1-4") and undiscoverable 1–9 number keys  · sev:low · v:human
- [ ] #20  B6  Model-input write-through echo can clobber fast typing  · sev:low · v:human
- [ ] #45  B11  Action pill highlight stuck on Proofread after running a different action  · sev:low · v:human
- [ ] #22  B8  Refactor: shared useTransform hook + shared actions/constants module  · sev:— · v:human

## C — Accessibility & user feedback (#23)

- [ ] #24  C1  The loading spinner never spins  · sev:high · v:human
- [ ] #25  C2  Disabled buttons don't look disabled  · sev:medium · v:human
- [ ] #28  C5  No focus management when the overlay appears  · sev:medium · v:human
- [ ] #30  C7  Blanket reduced-motion rule removes all transitions with no fallback feedback  · sev:low · v:human

## D — Theming & styling (#31)

- [ ] #32  D1  pill()/sectionLabel style factories duplicated across App and ActionPanel  · sev:medium · v:human
- [ ] #33  D2  transition: 'all .12s' on every pill  · sev:low · v:auto
- [ ] #34  D3  Hover/focus CSS injected as per-component style strings with cross-file coupling  · sev:low · v:human

## E — Security hardening (#36)

- [ ] #38  E2  sandbox: false on both BrowserWindows  · sev:medium · v:human

## F — Persistent field-anchored icon (Phase 3) (#52)

- [ ] #53  F1  AX probe CLI + per-app truth table (M0)  · sev:high · v:human
- [ ] #54  F2  Helper lifecycle in Electron: spawn/respawn, heartbeat, NDJSON parser  · sev:high · v:auto
- [ ] #55  F3  Field qualification as a pure function + denylist storage  · sev:high · v:auto
- [ ] #56  F4  Ghost icon: window follows the focused field  · sev:high · v:human
- [ ] #57  F5  Icon unfolds the action panel (selection path)  · sev:high · v:human
- [ ] #59  F7  Whole-field read + verified apply (the core dream)  · sev:high · v:human
- [ ] #58  F6  Field-anchor the hotkey overlay (closes #1's core complaint)  · sev:medium · v:human
- [ ] #60  F8  Denylist editing UI in settings  · sev:low · v:human

## Ungrouped

- [ ] #1  Overlay window positioning is cursor-anchored and gets clipped near screen edges  · sev:— · v:human
- [ ] #44  Confirm Format paragraph gaps survive a live Slack paste (post-#4 spacer fix)  · sev:low · v:human

<!-- GH:END -->
