# Phase 2 — Menu-bar App (the fullscreen fix)

Make the hotkey overlay appear over **fullscreen** apps. The fix and "make it a
menu-bar app" are the *same change*, because the reason fullscreen fails today is
the app's activation policy, not the overlay's window flags.

## Why fullscreen fails now
A native-fullscreen app lives in its own macOS Space. The overlay already sets
`setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` — that part is
correct. But Blue Pencil is still a **regular** app (Dock icon,
`NSApplicationActivationPolicyRegular`). When a regular app shows/focuses a window,
macOS brings *that app's* Space forward — which kicks you out of the fullscreen
Space to the desktop. That Space-switch is what you're seeing.

The fix: become an **accessory (agent) app** with no Space of its own. Then the
overlay floats over whatever Space is active — including a fullscreen one — and can
take key focus without a switch. Accessory apps have no Dock icon, so they live in
the menu bar. Hence: one change, two wins.

---

## Change 1 — activation policy → accessory
- Packaged: `mac.extendInfo` → `{ "LSUIElement": true }` in `package.json` build config
  (declares an agent app; no Dock icon, no app-switcher entry, no launch flash).
- Runtime/dev belt-and-suspenders: `app.dock.hide()` early in `whenReady`.
- This alone is what stops the Space-flip.

## Change 2 — raise the overlay's level
In `overlay.js`, alongside the existing visible-on-fullscreen call:
```js
win.setAlwaysOnTop(true, 'screen-saver')   // sit above fullscreen content
win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })  // already present
```
Showing: if focusing the overlay ever still nudges the Space, try `win.showInactive()`
then `win.focus()` instead of `win.show()`. Verify on the machine (below).

## Change 3 — a menu-bar (Tray) entry point
With no Dock icon, the tray becomes how you reach everything that isn't the hotkey.
- Add a `Tray` with a **template** icon (monochrome pencil mark, `…Template.png`
  16/22px @1x/@2x so it adapts to light/dark menu bars) — a small asset to add under `build/`.
- Context menu: **Open Writing Desk** · **Settings / Keys** (opens the window) ·
  a disabled label showing the hotkey (`⌘⇧'`) for discoverability · **Quit Blue Pencil**.
- Left-click the tray icon → toggle the writing window.

## Change 4 — writing-window lifecycle
The app now stays resident in the menu bar; the window is summoned, not the app's reason to live.
- **Don't auto-show on launch.** Exception: **first run** (no key stored for any
  provider) → open the window so onboarding/key entry still works.
- **Close hides, not quits:** `win.on('close', e => { if (!app.isQuitting) { e.preventDefault(); win.hide() } })`.
- **Quit only via tray:** the Quit item sets `app.isQuitting = true` then `app.quit()`.
- `window-all-closed` must **not** quit (already a no-op on macOS — keep it; the app
  is meant to outlive its windows now). The old `app.on('activate')` Dock-reopen path
  is irrelevant; the tray replaces it.

---

## Verify on the machine (Electron-over-fullscreen is finicky)
The accessory-policy + `screen-saver` level + `fullScreenAuxiliary` recipe is the
standard one and works for most menu-bar Electron utilities — but a `BrowserWindow`
isn't a true `NSPanel`, so confirm directly:
- In a fullscreen app, select text → `⌘⇧'` → the overlay appears **over the
  fullscreen app, no flip to desktop**, and takes key focus (Escape works).
- Pick an action → result **pastes back into the fullscreen app**.

If a plain `BrowserWindow` still misbehaves over fullscreen after Changes 1–2, the
heavier fallback is a native non-activating `NSPanel` for the overlay — but try the
simple recipe first; don't reach for the addon pre-emptively.

---

## Acceptance
- App launches into the menu bar (no Dock icon); first run still opens the window for key setup.
- Tray menu opens the writing window, shows the hotkey, and quits cleanly.
- Closing the window hides it; the hotkey still works afterward.
- The hotkey overlay appears over a fullscreen app and pastes back into it — the actual goal.

## Out of scope
Code-signing/notarization (separate; unsigned local build is fine), the Phase 3
corner badge, configurable hotkey.
