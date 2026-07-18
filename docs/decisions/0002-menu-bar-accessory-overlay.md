> Status: Accepted · Updated: 2026-07-19

# 0002 — Menu-bar accessory app so the overlay works over fullscreen

## Context

The hotkey overlay needs to appear over **any** app, including one running in
native fullscreen (its own macOS Space). A *regular* app (Dock icon,
`NSApplicationActivationPolicyRegular`) forces macOS to switch Spaces when its
window shows or takes focus — which kicks the user out of the fullscreen
Space the moment the overlay tries to appear. The overlay's own window flags
(`visibleOnFullScreen`) aren't enough on their own to prevent that Space-flip.

## Decision

Make Blue Pencil an **accessory (agent) app** with no Dock icon and no Space
of its own, so showing/focusing its windows never forces a Space switch. The
menu bar (tray) becomes the app's visible presence and its non-hotkey entry
point.

Verified against shipped code:
- `package.json` → `build.mac.extendInfo.LSUIElement: true` (packaged build).
- `src/main/index.js` → `app.dock?.hide()` at `whenReady` (dev-binary
  belt-and-suspenders for the same policy).
- `src/main/overlay.js` → `win.setAlwaysOnTop(true, 'screen-saver')` +
  `win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`, and
  `showInactive()` + `focus()` instead of `show()` on summon (avoids pulling
  the active Space to another display).
- `src/main/index.js` → `createTray()` (Open Blue Pencil / hotkey label /
  Quit), close-hides-not-quits on the main window, quit only via the tray
  item or `before-quit` setting `app.isQuitting`.

## Consequences

- No Dock icon means no app-switcher entry either — discoverability relies on
  the tray and on first-run auto-opening the window when no provider key is
  stored yet (`index.js`, `whenReady`).
- `window-all-closed` is a deliberate no-op on macOS: the app is meant to
  outlive its windows as a menu-bar resident.
- The overlay (a `BrowserWindow`, not a true `NSPanel`) needed the
  `showInactive()` + `focus()` sequencing to avoid its own Space-pull bug;
  documented in `overlay.js` and `reference/architecture.md`.

## Alternatives considered

None recorded — the accessory-app fix and the fullscreen fix were the same
change (see `reference/architecture.md` § Window & tray lifecycle for the
full reasoning).
