# Phase 2 — Hotkey v1 (auto-grab + auto-paste)

> **Implementation note:** shipped via the **osascript / System Events** path
> (user's call — runs without a native compile step), not the native addon in the
> "Native substrate" section below. That section stands as the documented upgrade;
> the grab/deliver seams are unchanged, so swapping to native stays localized.
> Trade-off accepted: a possible one-time macOS *Automation* prompt on top of
> Accessibility.

Remove both manual steps. With Accessibility granted:

> select text in any app → press ⌘⇧' → it copies the selection for you → pick an
> action → it pastes the result back into the app → popover dismisses.

v1 is **two function-body swaps plus a permission-aware UI delta** — nothing about
the window, the pipeline, or the layout changes. The seams were built single-call-site
for exactly this:
- **grab** — `clipboard.readText()` in `hotkey.js`.
- **deliver** — `deliver()` in `HotkeyPopover.jsx`.

---

## The permission model (the spine of v1)

Two runtime modes, chosen each time by whether Accessibility is granted:

- **Granted** → auto-grab (synth ⌘C) + auto-paste (synth ⌘V). The real experience.
- **Not granted** → today's v0 behavior unchanged: copy-first, primary button is
  **Copy**, no auto-paste. **Never a dead end.**

Detect/prompt with Electron — no native code needed for this part:
`systemPreferences.isTrustedAccessibilityClient(false)` to check silently,
`(true)` to trigger the system prompt. The popover is told the current status each
summon so it renders the right primary button and the right empty-state copy.

**macOS reality to surface in the UI:** after the user grants Accessibility, TCC
usually requires the app to **relaunch** before it takes effect. Don't pretend it's
live immediately — show "Granted — restart Blue Pencil to enable" (offer
`app.relaunch()` + `app.quit()`).

---

## Native substrate (small addon)

CGEvent + NSWorkspace need native; the permission check does not. Keep the addon
tiny and let Electron do everything else (clipboard, permission gate).

`src/native/` N-API addon exposing:
```
frontmostApp()            // → opaque token (bundle id / pid) of the app to paste back into
activate(token)           // bring that app forward before ⌘V
keyCmd('c' | 'v')         // post a CGEvent ⌘+key
pasteboardChangeCount()   // NSPasteboard.changeCount — deterministic copy detection
```
Build notes (you know this from keytar): rebuild for Electron via the existing
`electron-rebuild`/`postinstall`; under the hardened runtime it'll likely need
`com.apple.security.cs.disable-library-validation` in the entitlements to load.

> **Why not osascript?** `osascript … System Events keystroke` triggers a *second*
> TCC prompt (Automation, on top of Accessibility) and reading the frontmost app
> via System Events hits the same Automation gate — two confusing prompts that
> undercut the whole "frictionless" point of v1. The addon is one Accessibility
> prompt and is more reliable. *Optional:* an osascript spike is a fine afternoon
> way to feel the end-to-end flow before committing to the addon — just don't ship it.

---

## Grab flow — replaces `clipboard.readText()` in `hotkey.js`

```
if (!isTrustedAccessibilityClient(false))       → return clipboard.readText()   // v0 fallback
savedClipboard = clipboard.readText()           // to restore later
frontToken     = native.frontmostApp()          // who to paste back into
const before   = native.pasteboardChangeCount()
native.keyCmd('c')                              // synth ⌘C
poll pasteboardChangeCount() until > before     // ~10ms interval, ~400ms cap — deterministic, no sleep-guessing
selection = changed ? clipboard.readText() : '' // no change within cap = nothing was selected
stash { savedClipboard, frontToken } for deliver
return selection
```
Empty selection → the overlay's empty state (now the v1 wording: "Select text, then
press ⌘⇧'", reconciling the v0 copy-first note).

---

## Deliver flow — replaces `deliver()` in `HotkeyPopover.jsx`

The renderer can't post keystrokes; route delivery through a new main handler
`hotkey:pasteBack`. When **granted**:
```
main: clipboard.writeText(result)
      native.activate(frontToken)
      await activation settle (small delay or activation callback)
      native.keyCmd('v')                       // synth ⌘V into the source app
      await paste to consume the clipboard      // small delay
      clipboard.writeText(savedClipboard)       // restore the user's clipboard
      hideOverlay()                             // job done → dismiss
```
When **not granted**, `deliver()` keeps its v0 body exactly: `clipboardWrite(result)`
+ "press ⌘V" hint, stays open. So the function branches on the status the popover
already received.

Also restore `savedClipboard` if the user **dismisses without delivering** (Escape/
blur/toggle) so a cancelled grab doesn't leave their selection on the clipboard.

---

## UI / IPC delta (intentionally small)

- `popover:show` payload gains `accessibility: boolean` (recomputed each summon).
- `HotkeyPopover` primary button is status-driven (the interaction spec already
  locked this): granted → **Paste back** (CornerDownLeft); not granted → **Copy**.
- Not-granted notice (per locked spec): an inline line + **Open Accessibility
  Settings** button → new channel `accessibility:openSettings` →
  `shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility')`.
  After a paste-back attempt without permission, show this instead of failing.
- New channel `hotkey:pasteBack` (overlay → main) for the granted deliver path.

That's the whole UI surface — no layout change.

---

## Folded in (tracked from v0)

- **Keyboard-first** (was deferred): on open, focus the first action so **Enter**
  runs it; **1–4** trigger the four actions. Add to the overlay's open path.
- **Theme cleanup:** lift `useThemeColors` into one shared hook (App, ActionPanel,
  HotkeyPopover import it) before it drifts further.

---

## macOS realities to handle, not discover later
- **Relaunch after grant** — TCC won't apply mid-session; prompt to restart.
- **Activation→paste sequencing** — ⌘V must land *after* the source app is frontmost;
  wait for activation, don't fire blind.
- **Clipboard restore timing** — restore only after the paste has consumed the clipboard.
- **Secure fields** (passwords) block synth ⌘C/⌘V — selection comes back empty / paste
  no-ops; accept it.

---

## Acceptance
- Granted: select in Slack/Chrome → ⌘⇧' (no ⌘C) → preview shows the selection →
  run an action → result pastes back into the app → popover dismisses → your prior
  clipboard is intact.
- Not granted: behaves exactly like today (copy-first, Copy primary) + an unobtrusive
  "enable auto-grab" path to Settings.
- Granting then relaunching flips it to the auto path.
- Nothing selected (granted) → "Select text…" empty state.
- Enter runs the first action; 1–4 run the others.

## Out of scope
Overlaying **fullscreen** apps (that's the menu-bar/accessory-app change — separate),
configurable hotkey, the persistent corner badge (Phase 3 / AX). v1 is the two seams,
the addon, and the permission-aware delta — nothing more.
