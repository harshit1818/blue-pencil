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

## A — Window & overlay state (#6)

- [ ] #10 A4  OS quit & Restart blocked by close handler        · sev:critical · v:human
- [ ] #7  A1  overlay grows off the bottom when a result loads   · sev:high     · v:human
- [ ] #9  A3  auto-paste Restart affordance never seen           · sev:high     · v:human
- [ ] #8  A2  overlay positioned using previous summon's size    · sev:medium   · v:human
- [x] #11 A5  saved bounds restored onto a missing display       · sev:medium   · v:auto
- [ ] #12 A6  popover reload leaves rendererReady stale in main  · sev:low      · v:human
- [ ] #13 A7  hotkey registration failure is silent to the user  · sev:low      · v:human
- [ ] #46 A8  re-press of hotkey w/ selection shows empty state   · sev:medium   · v:human
- [ ] #47 A9  draggable overlay via header grab strip             · sev:low      · v:human

## B — Renderer state & architecture (#14)

- [ ] #15 B1  ~130 lines duplicated between App & HotkeyPopover  · sev:medium   · v:human
- [x] #17 B3  demo lorem seed; user text lost on restart         · sev:medium   · v:auto
- [ ] #18 B4  overlay Enter double-fires against focused buttons · sev:medium   · v:human
- [x] #16 B2  reTone drops the result markdown flag              · sev:low      · v:auto
- [ ] #19 B5  stale shortcut comment + undiscoverable number keys· sev:low      · v:human
- [ ] #20 B6  model-input echo clobbers fast typing              · sev:low      · v:human
- [x] #21 B7  overlay result not invalidated on provider change  · sev:low      · v:auto
- [ ] #22 B8  refactor: shared useTransform hook + constants     · sev:—        · v:human
- [x] #42 B9  in-flight result lands after provider switch       · sev:low      · v:auto
- [x] #43 B10 in-flight result lands after fresh hotkey summon   · sev:low      · v:auto
- [ ] #45 B11 action pill highlight stuck on Proofread            · sev:low      · v:human

## C — Accessibility & user feedback (#23)

- [ ] #24 C1  loading spinner never spins                        · sev:high     · v:human
- [x] #29 C6  dark theme contrast 2.60:1 fails WCAG AA           · sev:high     · v:auto
      (per-theme `onPencil` token replaces all '#fff' literals; also fixed the
      badge open state — white on dark-mode ink was 1.15:1, now paper on ink.
      test/tokens-contrast.test.mjs guards ratios + bans '#fff' in renderer.)
- [ ] #25 C2  disabled buttons don't look disabled               · sev:medium   · v:human
- [x] #26 C3  no aria-live on result/error; no aria-busy         · sev:medium   · v:auto
      (all in shared ActionPanel so both hosts get it: role="alert" on the error
      row, role="status"+aria-live="polite" on the result container, aria-busy
      on the controls block. test/aria-live.test.mjs guards statically.)
- [x] #27 C4  unlabeled inputs (key, model, textarea)            · sev:medium   · v:auto
      (aria-label on key input + textarea; Model span became <label htmlFor>.
      test/input-labels.test.mjs guards statically.)
- [ ] #28 C5  no focus management when the overlay appears       · sev:medium   · v:human
- [ ] #30 C7  reduced-motion strips all transitions, no fallback · sev:low      · v:human

## D — Theming & styling (#31)

- [ ] #32 D1  pill()/sectionLabel factories duplicated          · sev:medium   · v:human
- [ ] #33 D2  transition:'all .12s' on every pill               · sev:low      · v:human
- [ ] #34 D3  hover/focus CSS as per-component style strings     · sev:low      · v:human
- [x] #35 D4  hardcoded '#fff' / off-scale values vs tokens     · sev:low      · v:auto
      (color half was fixed by C6's onPencil token — repro grep returns nothing.
      Widened test/tokens-contrast.test.mjs from banning '#fff' to banning ANY
      hex/rgb() literal in renderer, locking in the tokens contract. Off-scale
      paddings left alone per the issue's own direction — D1/D3 cover styling.)

## E — Security hardening (#36)

- [x] #37 E1  no will-navigate / window-open guard on overlay   · sev:high     · v:auto
      (app-wide `web-contents-created` hook in src/main/navigation-guard.js:
      will-navigate allowed only to the dev origin / file: under appRoot,
      http(s) routed to shell.openExternal, all else denied; window.open denied
      everywhere. Replaces the main-window-only handler. Pure classify fn +
      fake-electron wiring test in test/navigation-guard.test.mjs.)
- [ ] #38 E2  sandbox:false on both BrowserWindows              · sev:medium   · v:human
- [x] #39 E3  IPC endpoints lack sender/gesture validation      · sev:low      · v:auto
      (src/main/ipc-guard.js: key:set / hotkey:pasteBack / accessibility:relaunch
      honoured only for a top frame whose URL classifies 'allow' via the #37
      navigation classifier — one definition of "our own page"; pasteBack also
      requires the overlay to be visible. Pure fn + fake-ipcMain wiring test in
      test/ipc-guard.test.mjs.)
- [x] #40 E4  osascript escaping misses backslashes             · sev:low      · v:auto
      (pure `escapeOsaString` in src/main/osa-escape.js escapes `\` before `"`;
      automation.js pasteBack uses it. test/osa-escape.test.mjs proves the
      trailing-backslash breakout repro from the issue.)

## Ungrouped

- [x] #4  Format loses blank lines / paragraph breaks           · bug          · v:auto
      (Slack collapses adjacent <p> blocks to one newline on paste. New
      mdToClipboardHtml merges p→p boundaries into explicit <br><br> at the
      deliver seam only; automation.js writeResult uses it. Tests in
      test/markdown.test.mjs. Suspect 1 — model omitting the blank line —
      needs live eyeballs: follow-up #44, v:human.)
- [ ] #44 Confirm Format fixes live: paragraph gaps + bullet lists · bug      · v:human
- [x] #3  Format flattens bullet lists into prose               · bug          · v:auto
      (Prompt-level per the issue: FORMAT_INSTRUCTION now treats any existing
      list marker (-, *, •, numbered) as a genuine enumeration — never collapse
      into prose; the "genuine enumeration" judgment applies only to creating
      NEW lists. Prompt-shape test in test/transform.test.mjs. Live Slack
      confirmation rides on #44, v:human.)
- [x] #2  Format shreds bare multi-line code into inline frags  · bug          · v:auto
      (Prompt-level like #3: FORMAT_INSTRUCTION gains a bare-block rule — detect
      an unfenced multi-line code / traceback / log run and wrap the WHOLE run in
      one fence, verbatim, leading indentation intact — placed before the
      inline-code rule, which now applies to prose only and never splits block
      lines into inline fragments. Prompt-shape test in test/transform.test.mjs.
      Live confirmation rides on #44, v:human. Side fix: eslint now ignores
      .claude/** so stale session worktrees can't fail verify.)
- [ ] #5  Format: deliberate auto-inline-code & Slack headers   · enhancement  · v:auto
- [ ] #1  Overlay cursor-anchored, clipped near screen edges    · —            · v:human

<!-- GH:END -->
