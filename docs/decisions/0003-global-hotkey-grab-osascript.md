> Status: Accepted · Updated: 2026-07-19

# 0003 — Staged global-hotkey grab; keystroke synthesis via osascript

## Context

The global hotkey needed a path from "select text anywhere" to "result lands
back in that app" without the Phase 3 Accessibility (AX) read/write work.
Two versions were staged: v0 ships with **zero permissions** (user copies
first, hotkey shows a popover, user pastes the result); v1 removes both
manual steps by synthesizing ⌘C/⌘V and reactivating the source app, which
needs the macOS **Accessibility** permission and a way to post synthetic
keystrokes.

## Decision

Ship both stages, and implement v1's keystroke synthesis with
**`osascript`/System Events** rather than a native addon.

Verified against shipped code:
- `src/main/hotkey.js` → `onFire()` branches on `isAccessibilityGranted()`:
  granted calls `grabSelection()` (v1, synthesizes ⌘C); not granted calls
  `readClipboardSelection()` (v0 fallback, reads whatever's already on the
  clipboard). Not-granted is a graceful fallback, never an error state.
- `src/main/automation.js` → `frontmostApp()`, `keyCmd()`, and the
  reactivate-then-paste sequence in `pasteBack()` all shell out via
  `execFile('osascript', ...)` to System Events. No native module is loaded.

## Consequences

- An extra one-time macOS **Automation** TCC prompt (System Events control)
  appears on top of Accessibility — a real UX cost, called out at the top of
  `automation.js`.
- No native compile/rebuild step for the hotkey path (unlike `keytar`, which
  already needs `electron-rebuild`) — ships without touching the build's
  native-module surface.
- The grab/deliver call sites are isolated single-call-site seams
  (`grabSelection()` / `pasteBack()`), so swapping the implementation later
  doesn't touch the UI or the IPC contract.

## Alternatives considered

A native N-API addon (`src/native/`) exposing `frontmostApp()` / `activate()`
/ `keyCmd()` / `pasteboardChangeCount()` over CGEvent + NSWorkspace — specced
in the interaction plan as the "more reliable, one-prompt-only" option
(avoids the second Automation prompt that `osascript` triggers). **It was not
built**: `src/native/` does not exist in this repo. The osascript path
shipped instead because it needed no compile step, worked end-to-end
immediately, and the addon was always documented as an optional reliability
upgrade rather than a prerequisite. Code is ground truth here: `automation.js`
is the only grab/deliver implementation that exists.
