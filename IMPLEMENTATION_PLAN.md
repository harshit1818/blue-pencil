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
- [ ] v:auto — `test/transform.test.mjs`: empty input throws; each action routes
      to the right prompt shape (mock `ask`).
- [ ] v:auto — `test/providers.test.mjs`: `noKey` sets `code:'NO_KEY'`; SDK errors
      map to user-facing messages.

<!-- GH:BEGIN — everything below is regenerated from GitHub; edit labels, not lines -->

## A — Window & overlay state (#6)

- [ ] #10 A4  OS quit & Restart blocked by close handler        · sev:critical · v:human
- [ ] #7  A1  overlay grows off the bottom when a result loads   · sev:high     · v:human
- [ ] #9  A3  auto-paste Restart affordance never seen           · sev:high     · v:human
- [ ] #8  A2  overlay positioned using previous summon's size    · sev:medium   · v:human
- [ ] #11 A5  saved bounds restored onto a missing display       · sev:medium   · v:auto
- [ ] #12 A6  popover reload leaves rendererReady stale in main  · sev:low      · v:human
- [ ] #13 A7  hotkey registration failure is silent to the user  · sev:low      · v:human

## B — Renderer state & architecture (#14)

- [ ] #15 B1  ~130 lines duplicated between App & HotkeyPopover  · sev:medium   · v:human
- [ ] #17 B3  demo lorem seed; user text lost on restart         · sev:medium   · v:auto
- [ ] #18 B4  overlay Enter double-fires against focused buttons · sev:medium   · v:human
- [ ] #16 B2  reTone drops the result markdown flag              · sev:low      · v:auto
- [ ] #19 B5  stale shortcut comment + undiscoverable number keys· sev:low      · v:human
- [ ] #20 B6  model-input echo clobbers fast typing              · sev:low      · v:human
- [ ] #21 B7  overlay result not invalidated on provider change  · sev:low      · v:auto
- [ ] #22 B8  refactor: shared useTransform hook + constants     · sev:—        · v:human

## C — Accessibility & user feedback (#23)

- [ ] #24 C1  loading spinner never spins                        · sev:high     · v:human
- [ ] #29 C6  dark theme contrast 2.60:1 fails WCAG AA           · sev:high     · v:auto
- [ ] #25 C2  disabled buttons don't look disabled               · sev:medium   · v:human
- [ ] #26 C3  no aria-live on result/error; no aria-busy         · sev:medium   · v:auto
- [ ] #27 C4  unlabeled inputs (key, model, textarea)            · sev:medium   · v:auto
- [ ] #28 C5  no focus management when the overlay appears       · sev:medium   · v:human
- [ ] #30 C7  reduced-motion strips all transitions, no fallback · sev:low      · v:human

## D — Theming & styling (#31)

- [ ] #32 D1  pill()/sectionLabel factories duplicated          · sev:medium   · v:human
- [ ] #33 D2  transition:'all .12s' on every pill               · sev:low      · v:human
- [ ] #34 D3  hover/focus CSS as per-component style strings     · sev:low      · v:human
- [ ] #35 D4  hardcoded '#fff' / off-scale values vs tokens     · sev:low      · v:auto

## E — Security hardening (#36)

- [ ] #37 E1  no will-navigate / window-open guard on overlay   · sev:high     · v:auto
- [ ] #38 E2  sandbox:false on both BrowserWindows              · sev:medium   · v:human
- [ ] #39 E3  IPC endpoints lack sender/gesture validation      · sev:low      · v:auto
- [ ] #40 E4  osascript escaping misses backslashes             · sev:low      · v:auto

## Ungrouped

- [ ] #4  Format loses blank lines / paragraph breaks           · bug          · v:auto
- [ ] #3  Format flattens bullet lists into prose               · bug          · v:auto
- [ ] #2  Format shreds bare multi-line code into inline frags  · bug          · v:auto
- [ ] #5  Format: deliberate auto-inline-code & Slack headers   · enhancement  · v:auto
- [ ] #1  Overlay cursor-anchored, clipped near screen edges    · —            · v:human

<!-- GH:END -->
